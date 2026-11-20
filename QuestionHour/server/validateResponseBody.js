function validateResponseBody(body = {}) {
  const required = ['question', 'response', 'timestamp', 'location', 'lat', 'lng'];
  const missing = required.filter(field => body[field] === undefined || body[field] === null || body[field] === '');

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    throw new Error('lat and lng must be finite numbers');
  }
}

module.exports = validateResponseBody;
