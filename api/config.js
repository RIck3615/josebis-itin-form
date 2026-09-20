const { listPackages } = require("../lib/packages");

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      packages: listPackages(),
      allowTestPayment: process.env.ALLOW_TEST_PAYMENT === "true",
      siteName: "JOSEBIS GLOBAL VENTURES LLC",
    })
  );
};
