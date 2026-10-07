"use strict";

// A small same-origin demo server. Production deployments should use a managed
// database, a durable session store, HTTPS, and a payment provider.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = process.env.LUMORA_DATA_DIR ? path.resolve(process.env.LUMORA_DATA_DIR) : path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 32 * 1024;
const sessions = new Map();
const products = {
  salad: { name: "Garden Fresh Salad", price: 320 },
  pasta: { name: "Creamy Truffle Pasta", price: 480 },
  steak: { name: "Grilled Steak", price: 720 },
  pizza: { name: "Italian Burrata Pizza", price: 420 },
  donut: { name: "Classic Donuts", price: 250 },
  shake: { name: "Chocolate Shake", price: 280 },
  signature: { name: "The Lumora Signature", price: 899 }
};
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon"
};

fs.mkdirSync(DATA_DIR, { recursive: true });
let database = { users: [], reservations: [], orders: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    database = { ...database, ...stored };
  } catch (error) {
    console.error("Could not read data/store.json:", error.message);
    process.exit(1);
  }
}

function persist() {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, DATA_FILE);
}

function sendJson(response, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(body);
}

function getSession(request) {
  const cookies = Object.fromEntries((request.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
  const sessionId = cookies.lumora_session;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) sessions.delete(sessionId);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return { ...session, user: database.users.find((user) => user.id === session.userId) };
}

function setSessionCookie(response, sessionId, clear = false) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const age = clear ? 0 : Math.floor(SESSION_TTL / 1000);
  response.setHeader("Set-Cookie", `lumora_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error("Request is too large."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("Send valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function passwordMatches(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function createSession(user, response) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + SESSION_TTL });
  setSessionCookie(response, sessionId);
}

function cleanText(value, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.valueOf()) && date >= today;
}

async function handleApi(request, response, url) {
  const session = getSession(request);
  if (request.method === "GET" && url.pathname === "/api/me") {
    return sendJson(response, 200, { user: session?.user ? publicUser(session.user) : null });
  }
  if (request.method === "POST" && url.pathname === "/api/register") {
    const body = await readJson(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email)) return sendJson(response, 400, { error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 128) return sendJson(response, 400, { error: "Password must contain 8 to 128 characters." });
    if (database.users.some((user) => user.email === email)) return sendJson(response, 409, { error: "An account with that email already exists. Sign in instead." });
    const credentials = hashPassword(password);
    const user = { id: crypto.randomUUID(), email, salt: credentials.salt, passwordHash: credentials.hash, createdAt: new Date().toISOString() };
    database.users.push(user);
    persist();
    createSession(user, response);
    return sendJson(response, 201, { user: publicUser(user) });
  }
  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const user = database.users.find((entry) => entry.email === email);
    if (!user || !passwordMatches(password, user)) return sendJson(response, 401, { error: "Email or password is incorrect." });
    createSession(user, response);
    return sendJson(response, 200, { user: publicUser(user) });
  }
  if (request.method === "POST" && url.pathname === "/api/logout") {
    const id = (request.headers.cookie || "").match(/(?:^|;\s*)lumora_session=([^;]*)/)?.[1];
    if (id) sessions.delete(decodeURIComponent(id));
    setSessionCookie(response, "", true);
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/reservations") {
    const body = await readJson(request);
    const reservation = {
      id: crypto.randomUUID(), userId: session?.userId || null,
      name: cleanText(body.name, 100), email: cleanText(body.email, 254).toLowerCase(),
      phone: cleanText(body.phone, 30), date: cleanText(body.date, 10), time: cleanText(body.time, 30),
      guests: cleanText(body.guests, 20), notes: cleanText(body.notes, 1000),
      createdAt: new Date().toISOString()
    };
    if (reservation.name.length < 2 || !validEmail(reservation.email) || reservation.phone.replace(/\D/g, "").length < 8 || !validDate(reservation.date) || !reservation.time || !reservation.guests) {
      return sendJson(response, 400, { error: "Please complete the reservation details with a valid future date." });
    }
    database.reservations.push(reservation);
    persist();
    return sendJson(response, 201, { reservation: { id: reservation.id, date: reservation.date, time: reservation.time, guests: reservation.guests } });
  }
  if (request.method === "POST" && url.pathname === "/api/orders") {
    const body = await readJson(request);
    const name = cleanText(body.name, 100);
    const phone = cleanText(body.phone, 30);
    const pickup = cleanText(body.pickup, 80);
    const payment = body.payment;
    if (name.length < 2 || phone.replace(/\D/g, "").length < 8 || !pickup || !["cash", "card"].includes(payment)) {
      return sendJson(response, 400, { error: "Please complete your contact, pickup and payment details." });
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > Object.keys(products).length) {
      return sendJson(response, 400, { error: "Your bag is empty. Add items from the menu first." });
    }
    const ids = new Set();
    const items = [];
    for (const requested of body.items) {
      const id = requested?.id;
      const quantity = Number(requested?.quantity);
      if (!products[id] || ids.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return sendJson(response, 400, { error: "One or more items in your bag are invalid. Please review your order." });
      }
      ids.add(id);
      items.push({ id, name: products[id].name, quantity, unitPrice: products[id].price, lineTotal: products[id].price * quantity });
    }
    const order = {
      id: crypto.randomUUID(), reference: `LM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      userId: session?.userId || null, name, phone, pickup, payment,
      paymentStatus: "pay-at-pickup", orderStatus: "received",
      items, total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      createdAt: new Date().toISOString()
    };
    database.orders.push(order);
    persist();
    return sendJson(response, 201, { order: { reference: order.reference, total: order.total, paymentStatus: order.paymentStatus } });
  }
  return sendJson(response, 404, { error: "API route not found." });
}

function serveStatic(request, response, url) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (requestedPath === "/") requestedPath = "/index.html";
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Page not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET" && request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, POST" });
    if (request.method === "POST" && !String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return sendJson(response, 415, { error: "Use application/json for API requests." });
    }
    try {
      return await handleApi(request, response, url);
    } catch (error) {
      console.error("API request failed:", error);
      if (!response.headersSent) return sendJson(response, error.status || 500, { error: error.status ? error.message : "The request could not be completed." });
      response.destroy();
    }
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") return response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
  serveStatic(request, response, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Lumora is ready at http://127.0.0.1:${PORT}`);
  console.log(`Accounts, reservations and pickup orders are saved in ${DATA_FILE}.`);
  console.log("Online payments are not enabled; orders are marked pay-at-pickup.");
});

function shutDown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
