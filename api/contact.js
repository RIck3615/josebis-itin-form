const { getFrom, getResend } = require("../lib/mail");

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 200 * 1024) {
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

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
  }

  try {
    const body = await readJson(req);
    const name = clean(body.name);
    const email = clean(body.email);
    const phone = clean(body.phone);
    const subject = clean(body.subject);
    const message = clean(body.message);

    if (!name || !email || !subject || !message) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please fill in all required fields." }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please provide a valid email address." }));
    }
    if (message.length > 5000) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Message is too long." }));
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

    const submittedAt = new Date().toISOString();
    const text = `New contact message
===================

Submitted: ${submittedAt}

From: ${name}
Email: ${email}
Phone: ${phone || "n/a"}
Subject: ${subject}

MESSAGE
-------
${message}

JOSEBIS GLOBAL VENTURES LLC
https://www.josebisglobalventures.com/
`;

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `Contact: ${subject} — ${name}`,
      text,
    });

    if (error) {
      console.error("Resend contact error", error);
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          message: error.message || "Could not send message. Check Resend configuration.",
        })
      );
    }

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        message: `Thank you, ${name}. Your message was sent. We will get back to you shortly.`,
      })
    );
  } catch (err) {
    console.error("contact error", err);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        ok: false,
        message: err.message || "Could not send message.",
      })
    );
  }
};
