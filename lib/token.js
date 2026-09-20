const crypto = require("crypto");

function secret() {
  const s = process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!s) {
    throw new Error("PAYMENT_TOKEN_SECRET (or STRIPE_SECRET_KEY) is not configured.");
  }
  return s;
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, message: "Missing payment token. Please complete payment first." };
  }
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, message: "Invalid payment token." };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, message: "Corrupt payment token." };
  }
  if (!payload || payload.v !== 1) {
    return { ok: false, message: "Unsupported payment token." };
  }
  if (!payload.exp || Date.now() > payload.exp) {
    return { ok: false, message: "Payment session expired. Please pay again." };
  }
  if (payload.status !== "paid") {
    return { ok: false, message: "Payment not confirmed." };
  }
  return { ok: true, payload };
}

function issuePaidToken({ packageId, sessionId, email }) {
  const ttlHours = Number(process.env.PAYMENT_TOKEN_TTL_HOURS || 48);
  const payload = {
    v: 1,
    status: "paid",
    packageId,
    sessionId: sessionId || null,
    email: email || null,
    iat: Date.now(),
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  return { token: signPayload(payload), payload };
}

module.exports = { issuePaidToken, verifyToken };
