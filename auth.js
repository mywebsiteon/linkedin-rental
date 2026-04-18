const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'linkedrent_session';
const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set. Add it to your .env file before starting the app.');
  }

  return secret;
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return cookies;

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function signValue(value) {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(value)
    .digest('base64url');
}

function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: String(user._id),
    role: user.role,
    name: user.name,
    exp: Date.now() + (REMEMBER_ME_MAX_AGE_SECONDS * 1000)
  })).toString('base64url');

  return `${payload}.${signValue(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = signValue(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function buildCookie(token, remember) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax'
  ];

  if (remember) {
    parts.push(`Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}`);
  }

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setSessionCookie(res, user, remember) {
  res.setHeader('Set-Cookie', buildCookie(createSessionToken(user), remember));
}

function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function getSessionUserFromCookieHeader(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
}

function getSessionUserFromRequest(req) {
  return getSessionUserFromCookieHeader(req.headers.cookie);
}

function assertAuthConfig() {
  getAuthSecret();
}

module.exports = {
  assertAuthConfig,
  clearSessionCookie,
  getSessionUserFromCookieHeader,
  getSessionUserFromRequest,
  setSessionCookie
};
