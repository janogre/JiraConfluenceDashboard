import crypto from 'node:crypto';

const ALG = 'aes-256-gcm';
export const COOKIE_NAME = 'jcd_session';
export const STATE_COOKIE = 'jcd_oauth_state';
const MAX_COOKIE_BYTES = 3900;

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET mangler');
  // Avled en 32-byte nøkkel fra hemmeligheten (uansett lengde på input).
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url(iv).base64url(tag).base64url(ciphertext)
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv(ALG, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return null; // tuklet, feil nøkkel eller ugyldig — behandles som ingen session
  }
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const found = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + '='));
  if (!found) return null;
  return decodeURIComponent(found.slice(name.length + 1));
}

export function readSession(request) {
  return decrypt(readCookie(request, COOKIE_NAME));
}

function cookie(name, value, maxAge) {
  return {
    name,
    value: encodeURIComponent(value),
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
    maxAge,
  };
}

export function sessionCookie(session, maxAge = 3600) {
  let value = encrypt(session);
  if (value.length > MAX_COOKIE_BYTES && session.availableClouds) {
    // H.1-mitigering (spec §5): dropp availableClouds og marker at de må hentes på nytt.
    value = encrypt({ ...session, availableClouds: undefined, cloudsTrimmed: true });
  }
  return cookie(COOKIE_NAME, value, maxAge);
}

export function stateCookie(state) {
  return cookie(STATE_COOKIE, encrypt({ state }), 600);
}

export function clearSessionCookie() {
  return cookie(COOKIE_NAME, '', 0);
}

export function clearStateCookie() {
  return cookie(STATE_COOKIE, '', 0);
}
