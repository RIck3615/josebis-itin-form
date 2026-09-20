/**
 * Local localhost server (no Vercel login required).
 * Serves static files + /api/* handlers. Loads .env.local.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvLocal();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  send(res, 200, fs.readFileSync(filePath), {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
}

function wrapRes(nodeRes) {
  let statusCode = 200;
  const headers = {};
  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v) {
      statusCode = v;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    end(body) {
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(statusCode, headers);
      }
      nodeRes.end(body);
    },
  };
}

function clearAppModules() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.includes(`${path.sep}api${path.sep}`) || key.includes(`${path.sep}lib${path.sep}`)) {
      delete require.cache[key];
    }
  });
}

const API = {
  "/api/config": "./api/config.js",
  "/api/verify-payment": "./api/verify-payment.js",
  "/api/submit": "./api/submit.js",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (API[pathname]) {
      clearAppModules();
      const handler = require(API[pathname]);
      const vercelRes = wrapRes(res);
      await handler(req, vercelRes);
      return;
    }

    if (pathname.startsWith("/api/")) {
      send(res, 404, JSON.stringify({ ok: false, message: "API not found." }), {
        "Content-Type": "application/json",
      });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      send(res, 500, JSON.stringify({ ok: false, message: err.message || "Server error" }), {
        "Content-Type": "application/json",
      });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  console.log(`ITIN page: http://localhost:${PORT}/get-itin.html`);
});
