const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

let _client = null;

function isConfigured() {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

function getClient() {
  if (_client) return _client;
  if (!isConfigured()) return null;
  _client = new S3Client({
    region:      process.env.R2_REGION || 'auto',
    endpoint:    process.env.R2_ENDPOINT || undefined,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

// Upload a Buffer to Cloudflare R2 or AWS S3.
// Returns the public URL, or null if storage is not configured.
async function upload(buffer, { filename, contentType = 'application/octet-stream', folder = 'uploads' } = {}) {
  const client = getClient();
  if (!client) return null;
  const key = `${folder}/${Date.now()}-${filename}`;
  await client.send(new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : key;
}

module.exports = { upload, isConfigured };
