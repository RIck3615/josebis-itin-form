const Stripe = require("stripe");
const { getPackage } = require("../lib/packages");
const { issuePaidToken } = require("../lib/token");
const { sendFormLinkToCustomer, formLink } = require("../lib/mail");

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function respondWithFormLink(req, res, { packageId, pkg, issued, email, mode }) {
  const needsForm = Boolean(pkg.requiresForm) || packageId === "itin" || packageId === "llc_ein_address";
  const link = formLink(req, issued.token, packageId);
  let formEmail = { ok: false, skipped: true };

  if (needsForm) {
    try {
      formEmail = await sendFormLinkToCustomer({
        req,
        to: email,
        packageTitle: pkg.title,
        token: issued.token,
        packageId,
      });
    } catch (err) {
      console.error("form-link email failed", err);
      formEmail = { ok: false, message: err.message || "Could not send form link email." };
    }
  }

  res.statusCode = 200;
  return res.end(
    JSON.stringify({
      ok: true,
      package_id: packageId,
      package_title: pkg.title,
      payment_token: issued.token,
      expires_at: issued.payload.exp,
      email: email || null,
      form_link: needsForm ? link : null,
      form_email_sent: Boolean(formEmail.ok),
      form_email_message: formEmail.message || null,
      mode,
    })
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
  }

  try {
    const body = await readJson(req);
    const packageId = String(body.package_id || body.pkg || "").trim();
    const sessionId = String(body.session_id || "").trim();
    const test = Boolean(body.test);

    const pkg = getPackage(packageId);
    if (!pkg) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Invalid package." }));
    }

    if (test) {
      if (process.env.ALLOW_TEST_PAYMENT !== "true") {
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok: false, message: "Test payment is disabled." }));
      }
      const testEmail = body.email || process.env.TEST_CUSTOMER_EMAIL || null;
      const issued = issuePaidToken({
        packageId,
        sessionId: "test_" + Date.now(),
        email: testEmail,
      });
      return respondWithFormLink(req, res, {
        packageId,
        pkg,
        issued,
        email: testEmail,
        mode: "test",
      });
    }

    if (!sessionId) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          ok: false,
          message: "Missing Stripe session_id. Complete checkout, then return to this site.",
        })
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          message: "STRIPE_SECRET_KEY is not configured on the server.",
        })
      );
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== "paid") {
      res.statusCode = 402;
      return res.end(
        JSON.stringify({
          ok: false,
          message: "Payment is not completed yet.",
        })
      );
    }

    const ref = String(session.client_reference_id || "").trim();
    if (ref && ref !== packageId) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          ok: false,
          message: "Paid package does not match the selected package.",
        })
      );
    }

    const email = session.customer_details?.email || session.customer_email || null;
    const issued = issuePaidToken({
      packageId,
      sessionId: session.id,
      email,
    });

    return respondWithFormLink(req, res, {
      packageId,
      pkg,
      issued,
      email,
      mode: "live",
    });
  } catch (err) {
    console.error("verify-payment error", err);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        ok: false,
        message: err.message || "Could not verify payment.",
      })
    );
  }
};
