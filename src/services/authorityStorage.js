/**
 * Private Authority document storage.
 *
 * Uses a DEDICATED private R2 bucket (R2_AUTHORITY_BUCKET) separate from the legacy
 * job-photo bucket. Objects are private with no public-read ACL. No public URL is
 * ever generated. Access is only via server-side streaming through authenticated routes.
 *
 * R2 encrypts objects at rest by default. All transfers use TLS.
 *
 * Object keys are opaque: authority/{accountId}/{uuid} — no filenames, PII, or case refs.
 */
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

function isConfigured() {
  return !!(
    (process.env.R2_AUTHORITY_ACCESS_KEY_ID     || '').trim() &&
    (process.env.R2_AUTHORITY_SECRET_ACCESS_KEY || '').trim() &&
    (process.env.R2_AUTHORITY_BUCKET            || '').trim()
  );
}

let _client = null;

function _getClient() {
  if (_client) return _client;
  if (!isConfigured()) {
    throw new Error(
      'Authority document storage is not configured. ' +
      'Set R2_AUTHORITY_ACCESS_KEY_ID, R2_AUTHORITY_SECRET_ACCESS_KEY, and R2_AUTHORITY_BUCKET.'
    );
  }
  _client = new S3Client({
    region:      process.env.R2_AUTHORITY_REGION   || 'auto',
    endpoint:    process.env.R2_AUTHORITY_ENDPOINT || undefined,
    credentials: {
      accessKeyId:     process.env.R2_AUTHORITY_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_AUTHORITY_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

/**
 * Generate an opaque storage key.
 * Includes account_id for cost attribution / bucket organization.
 * Never contains filenames, case references, or any PII.
 */
function generateStorageKey(accountId) {
  const rand = crypto.randomUUID();
  return `authority/${accountId}/${rand}`;
}

/**
 * Upload a Buffer to the private Authority bucket.
 * Returns { storageKey, contentSha256, byteSize }.
 * No public URL is ever generated.
 */
async function upload(buffer, { accountId } = {}) {
  const client        = _getClient();
  const storageKey    = generateStorageKey(accountId);
  const contentSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const byteSize      = buffer.length;

  await client.send(new PutObjectCommand({
    Bucket:      process.env.R2_AUTHORITY_BUCKET,
    Key:         storageKey,
    Body:        buffer,
    ContentType: 'application/pdf',
    // No ACL parameter — bucket is private by default policy; R2 ignores per-object ACLs
  }));

  return { storageKey, contentSha256, byteSize };
}

/**
 * Retrieve an object as a readable stream.
 * Returns the Body stream from the GetObjectCommand response.
 * The caller must pipe or consume it to release the connection.
 */
async function getStream(storageKey) {
  const client   = _getClient();
  const response = await client.send(new GetObjectCommand({
    Bucket: process.env.R2_AUTHORITY_BUCKET,
    Key:    storageKey,
  }));
  return response.Body;
}

/**
 * Delete an object from the private Authority bucket.
 */
async function deleteObject(storageKey) {
  const client = _getClient();
  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_AUTHORITY_BUCKET,
    Key:    storageKey,
  }));
}

// For testing: reset the cached client so mocks take effect
function _resetClient() {
  _client = null;
}

module.exports = { isConfigured, upload, getStream, deleteObject, generateStorageKey, _resetClient };
