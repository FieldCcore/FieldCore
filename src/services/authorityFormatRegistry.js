/**
 * Authority document format registry.
 *
 * Only PDF is registered in this stage. Future formats can be added here without
 * changes to the Authority domain model or storage layer.
 *
 * Format detection uses magic bytes (file content), never the client-supplied
 * content-type header or file extension.
 */

const AUTHORITY_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_FORMATS = {
  'application/pdf': {
    // PDF magic: %PDF- (5 bytes)
    magic:    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
    maxBytes: AUTHORITY_MAX_UPLOAD_BYTES,
    label:    'PDF',
  },
};

/**
 * Validate that a buffer is an allowed Authority document format.
 * Inspects file content — ignores the declared content-type.
 *
 * @param {Buffer} buffer
 * @returns {{ valid: boolean, contentType?: string, reason?: string, maxBytes?: number }}
 */
function validateFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, reason: 'empty_file' };
  }

  if (buffer.length > AUTHORITY_MAX_UPLOAD_BYTES) {
    return { valid: false, reason: 'oversized', maxBytes: AUTHORITY_MAX_UPLOAD_BYTES };
  }

  for (const [contentType, spec] of Object.entries(ALLOWED_FORMATS)) {
    if (
      buffer.length >= spec.magic.length &&
      buffer.slice(0, spec.magic.length).equals(spec.magic)
    ) {
      return { valid: true, contentType };
    }
  }

  return { valid: false, reason: 'unsupported_format' };
}

module.exports = { validateFormat, ALLOWED_FORMATS, AUTHORITY_MAX_UPLOAD_BYTES };
