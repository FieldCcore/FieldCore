import crypto from 'crypto';

const PORTAL_SECRET = () => (process.env.JWT_SECRET || '').trim() + '_portal';
const TOKEN_TTL_HOURS = 48;

export function portalJwtSign(payload) {
  const secret = PORTAL_SECRET();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + TOKEN_TTL_HOURS * 3600 };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

export function portalJwtVerify(token) {
  const secret = PORTAL_SECRET();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [h, p, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (expected !== sig) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Token expired');
  return payload;
}

export function requirePortalAuth(req, res) {
  const header = req.headers.authorization || '';
  const rawToken = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!rawToken) { res.status(401).json({ error: 'Unauthorized.' }); return null; }
  try {
    return portalJwtVerify(rawToken);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return null;
  }
}
