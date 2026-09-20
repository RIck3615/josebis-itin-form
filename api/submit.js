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

const LLC_STATES = new Set(["Wyoming", "Delaware", "Texas", "New Mexico"]);

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

function buildItinEmail(body, pkg, sessionId) {
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
    return { error: "Please fill in all required fields.", status: 400 };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please provide a valid email address.", status: 400 };
  }
  if (hasLlc !== "Yes" && hasLlc !== "No") {
    return { error: "Please indicate whether you have a U.S. LLC and EIN#.", status: 400 };
  }

  const files = body.files || {};
  const attachments = [];
  const passport = decodeAttachment(files.passport, "passport");
  if (pkg.requiresPassport && !passport) {
    return { error: "Passport scan is required for this package.", status: 400 };
  }
  if (passport) attachments.push(passport);
  const llcDocs = decodeAttachment(files.llc_docs, "llc_docs");
  if (llcDocs) attachments.push(llcDocs);
  const einDoc = decodeAttachment(files.ein_doc, "ein_doc");
  if (einDoc) attachments.push(einDoc);

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const submittedAt = new Date().toISOString();
  const text = `New application: ${pkg.title}
==============================

Submitted: ${submittedAt}
Stripe session: ${sessionId || "n/a"}

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

  return {
    email,
    firstName,
    fullName,
    subject: `${pkg.title}: ${fullName}`,
    text,
    attachments,
  };
}

function buildLlcEmail(body, pkg, sessionId) {
  const businessName = clean(body.business_name);
  const registryState = clean(body.registry_state);
  const firstName = clean(body.first_name);
  const middleName = clean(body.middle_name);
  const lastName = clean(body.last_name);
  const phone = clean(body.phone);
  const email = clean(body.email);

  if (!businessName || !registryState || !firstName || !lastName || !phone || !email) {
    return { error: "Please fill in all required fields.", status: 400 };
  }
  if (!LLC_STATES.has(registryState)) {
    return {
      error:
        "Please select Wyoming, Delaware, Texas, or New Mexico. For other states, email your request.",
      status: 400,
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please provide a valid email address.", status: 400 };
  }

  const files = body.files || {};
  const attachments = [];
  const passport = decodeAttachment(files.passport, "passport");
  if (!passport) {
    return { error: "Passport is required.", status: 400 };
  }
  attachments.push(passport);
  const itinOrSsn = decodeAttachment(files.itin_or_ssn, "itin_or_ssn");
  if (!itinOrSsn) {
    return { error: "ITIN or SSN document is required.", status: 400 };
  }
  attachments.push(itinOrSsn);

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const submittedAt = new Date().toISOString();
  const text = `New application: ${pkg.title}
==============================

Submitted: ${submittedAt}
Stripe session: ${sessionId || "n/a"}

BUSINESS
--------
Name of business: ${businessName}
State of registration: ${registryState}

PERSONAL
--------
Name: ${fullName}
Phone: ${phone}
Email: ${email}

ATTACHMENTS
-----------
${attachments.map((a) => `- ${a.filename} (${a.contentType})`).join("\n")}

JOSEBIS GLOBAL VENTURES LLC
https://www.josebisglobalventures.com/
`;

  return {
    email,
    firstName,
    fullName,
    subject: `${pkg.title}: ${businessName} (${registryState}) — ${fullName}`,
    text,
    attachments,
  };
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

    const built =
      packageId === "llc_ein_address"
        ? buildLlcEmail(body, pkg, tokenCheck.payload.sessionId)
        : buildItinEmail(body, pkg, tokenCheck.payload.sessionId);

    if (built.error) {
      res.statusCode = built.status || 400;
      return res.end(JSON.stringify({ ok: false, message: built.error }));
    }

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

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: built.email,
      subject: built.subject,
      text: built.text,
      attachments: built.attachments.map((a) => ({
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
        message: `Thank you, ${built.firstName}. Your information was sent successfully. Our team will contact you shortly.`,
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
