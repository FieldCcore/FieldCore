const crypto = require('crypto');

const ALG = 'aes-256-gcm';

if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  console.error('[crypto] CRITICAL: ENCRYPTION_KEY is not set in production. Tokens cannot be stored securely.');
}
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex');

function encrypt(text) {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join('.');
}

function decrypt(stored) {
  const [ivHex, encHex, tagHex] = stored.split('.');
  const d = crypto.createDecipheriv(ALG, KEY, Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
