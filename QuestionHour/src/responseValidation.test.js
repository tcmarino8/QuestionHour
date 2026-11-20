const validateResponseBody = require('../server/validateResponseBody');

const response = {
  question: 'A statement',
  response: 'agree',
  timestamp: '2026-01-01T00:00:00Z',
  location: '10001',
  lat: 0,
  lng: 0
};

test('accepts zero coordinates', () => {
  expect(() => validateResponseBody(response)).not.toThrow();
});

test.each([undefined, null, '', NaN, Infinity, '0'])('rejects invalid coordinates: %s', (lat) => {
  expect(() => validateResponseBody({ ...response, lat })).toThrow();
});
