export interface Env {
  DB: D1Database;
  APP_ENV: string;
  TZ: string;
  FREE_ONLY_MODE: string;
  ADMIN_USERNAME: string;
  PANEL_ORIGIN: string;
  GITHUB_REPOSITORY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  GITHUB_DISPATCH_TOKEN: string;
}

const enc = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPbkdf2Password(password: string, storedHash: string): Promise<boolean> {
  // Format: pbkdf2_sha256$<iterations>$<salt>$<hex_hash>
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Math.min(Number(parts[1]) || 100000, 100000);
  const salt = parts[2];
  const expectedHex = parts[3];

  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key,
    256
  );
  return timingSafeEqual(toHex(bits), expectedHex);
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(sig);
}

export async function createSessionToken(username: string, secret: string, ttlSeconds = 86400 * 7): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${username}.${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<string | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  const expected = await hmacSign(secret, `${username}.${expStr}`);
  return timingSafeEqual(sig, expected) ? username : null;
}

export async function verifySessionRequest(request: Request, secret: string): Promise<string | null> {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    const userFromBearer = await verifySessionToken(bearer, secret);
    if (userFromBearer) return userFromBearer;
  }
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)ayzela_session=([^;]+)/);
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]), secret);
}
