const { Resend } = require("resend");

function getFrom() {
  return (
    process.env.FROM_EMAIL || "JOSEBIS GLOBAL VENTURES LLC <onboarding@resend.dev>"
  );
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured. Add it in Vercel environment variables.");
  }
  return new Resend(key);
}

function siteBase(req) {
  if (process.env.SITE_URL) {
    return String(process.env.SITE_URL).replace(/\/$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

function formLink(req, token, packageId) {
  const base = siteBase(req);
  const path = packageId === "itin" ? "/get-itin.html" : "/get-itin.html";
  return `${base}${path}?token=${encodeURIComponent(token)}#apply`;
}

/**
 * After successful payment: email the customer a secure link to complete the intake form.
 */
async function sendFormLinkToCustomer({ req, to, packageTitle, token, packageId }) {
  if (!to) {
    return { ok: false, skipped: true, message: "No customer email on the Stripe session." };
  }

  const link = formLink(req, token, packageId);
  const resend = getResend();
  const text = `Thank you for your payment — ${packageTitle}

Your payment was confirmed. Please complete your application using this secure link:

${link}

This link expires when your payment session expires (usually within 48 hours).
If you have questions, reply to this email or contact JOSEBIS GLOBAL VENTURES LLC.

https://www.josebisglobalventures.com/
`;

  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: `Complete your ${packageTitle} application`,
    text,
  });

  if (error) {
    console.error("Resend form-link error", error);
    return { ok: false, message: error.message || "Could not send form link email." };
  }

  return { ok: true, link };
}

module.exports = {
  getFrom,
  getResend,
  siteBase,
  formLink,
  sendFormLinkToCustomer,
};
