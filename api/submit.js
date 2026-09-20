const { getPackage } = require("../lib/packages");
const { verifyToken } = require("../lib/token");
const { getFrom, getResend } = require("../lib/mail");

const MAX_FILE_BYTES = 4.5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) {
        reject(new Error("Payload too large."));
      }
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

function clean(value) {
  return String(value || "").trim();
}

function decodeAttachment(file, label) {
  if (!file || !file.data) return null;
  const name = clean(file.name) || label;
  const type = clean(file.type) || "application/octet-stream";
  if (!ALLOWED_MIME.has(type)) {
    throw new Error(`Invalid file type for ${label}. Use PDF, JPG, PNG, or WEBP.`);
  }
  const buf = Buffer.from(String(file.data).replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buf.length) {
    throw new Error(`Could not read ${label}.`);
  }
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`${label} is too large (max ~4.5 MB on this host).`);
  }
  return { filename: name, content: buf, contentType: type };
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
    const tokenCheck = verifyToken(body.payment_token);
    if (!tokenCheck.ok) {
      res.statusCode = 402;
      return res.end(JSON.stringify({ ok: false, message: tokenCheck.message }));
    }

    const packageId = tokenCheck.payload.packageId;
    const pkg = getPackage(packageId);
    if (!pkg) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Unknown package on payment token." }));
    }

    const firstName = clean(body.first_name);
    const middleName = clean(body.middle_name);
    const lastName = clean(body.last_name);
    const phone = clean(body.phone);
    const birthName = clean(body.birth_name);
    const email = clean(body.email);
    const street = clean(body.street);
    const city = clean(body.city);
    const state = clean(body.state);
    const country = clean(body.country);
    const postal = clean(body.postal);
    const hasLlc = clean(body.has_llc);
    const ownership = clean(body.ownership);

    if (!firstName || !lastName || !phone || !birthName || !email || !street || !country) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please fill in all required fields." }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please provide a valid email address." }));
    }
    if (hasLlc !== "Yes" && hasLlc !== "No") {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({ ok: false, message: "Please indicate whether you have a U.S. LLC and EIN#." })
      );
    }

    const files = body.files || {};
    const attachments = [];
    const passport = decodeAttachment(files.passport, "passport");
    if (pkg.requiresPassport && !passport) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Passport scan is required for this package." }));
    }
    if (passport) attachments.push(passport);
    const llcDocs = decodeAttachment(files.llc_docs, "llc_docs");
    if (llcDocs) attachments.push(llcDocs);
    const einDoc = decodeAttachment(files.ein_doc, "ein_doc");
    if (einDoc) attachments.push(einDoc);

    const to = process.env.RECIPIENT_EMAIL || "fjosebis@gmail.com";
    const from = getFrom();
    let resend;
    try {
      resend = getResend();
    } catch (err) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          message: err.message || "RESEND_API_KEY is not configured.",
        })
      );
    }

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const submittedAt = new Date().toISOString();
    const text = `New application: ${pkg.title}
==============================

Submitted: ${submittedAt}
Stripe session: ${tokenCheck.payload.sessionId || "n/a"}

PERSONAL
--------
Name: ${fullName}
Phone: ${phone}
Email: ${email}
Birth name confirmation: ${birthName}

ADDRESS
-------
${street}
${city} ${state} ${postal}
${country}

BUSINESS
--------
Has U.S. LLC and EIN#: ${hasLlc}
Ownership %: ${ownership || "n/a"}

ATTACHMENTS
-----------
${attachments.map((a) => `- ${a.filename} (${a.contentType})`).join("\n") || "(none)"}

JOSEBIS GLOBAL VENTURES LLC
https://www.josebisglobalventures.com/
`;

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `${pkg.title}: ${fullName}`,
      text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    if (error) {
      console.error("Resend error", error);
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          message: error.message || "Could not send email. Check Resend configuration.",
        })
      );
    }

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        message: `Thank you, ${firstName}. Your information was sent successfully. Our team will contact you shortly.`,
      })
    );
  } catch (err) {
    console.error("submit error", err);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        ok: false,
        message: err.message || "Submission failed.",
      })
    );
  }
};
