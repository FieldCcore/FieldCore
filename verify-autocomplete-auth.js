// Usage: node verify-autocomplete-auth.js <password>
// Tests the full autocomplete + geocode pipeline with a real auth token.
const https = require('https');

const EMAIL    = process.argv[2];
const PASSWORD = process.argv[3];
const BASE     = 'https://fieldcore-production-ee0d.up.railway.app';

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node verify-autocomplete-auth.js <email> <password>');
  process.exit(1);
}

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u       = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const opts    = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const chunks = [];
    const req = https.request(opts, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.status || res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  // 1. Login
  console.log('\n=== 1. Login ===');
  const login = await request('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  console.log('status:', login.status);
  if (login.status !== 200 || !login.body?.token) {
    console.error('Login failed:', JSON.stringify(login.body));
    process.exit(1);
  }
  const token = login.body.token;
  console.log('token received: YES');
  const auth = { Authorization: `Bearer ${token}` };

  // 2. Autocomplete
  console.log('\n=== 2. GET /api/maps/autocomplete?input=8791+NW+35 ===');
  const ac = await request('GET', `${BASE}/api/maps/autocomplete?input=8791+NW+35`, null, auth);
  console.log('status:', ac.status);
  console.log('predictions count:', ac.body?.predictions?.length ?? 'N/A');
  if (ac.body?.predictions?.length > 0) {
    console.log('first prediction:', ac.body.predictions[0].description);
    console.log('structured_formatting:', JSON.stringify(ac.body.predictions[0].structured_formatting));
    console.log('\nRESULT: AUTOCOMPLETE WORKS ✅');
  } else {
    console.log('response body:', JSON.stringify(ac.body));
    console.log('\nRESULT: NO PREDICTIONS — GOOGLE_MAPS_API_KEY likely missing or Places API not enabled ❌');
  }

  // 3. Geocode
  console.log('\n=== 3. GET /api/maps/geocode?address=8791+NW+35th+St,+Coral+Springs,+FL+33065 ===');
  const geo = await request('GET', `${BASE}/api/maps/geocode?address=8791+NW+35th+St,+Coral+Springs,+FL+33065`, null, auth);
  console.log('status:', geo.status);
  if (geo.status === 200 && geo.body?.lat) {
    console.log('lat:', geo.body.lat, '| lng:', geo.body.lng);
    console.log('formatted_address:', geo.body.formatted_address);
    console.log('\nRESULT: GEOCODING WORKS ✅');
  } else {
    console.log('response body:', JSON.stringify(geo.body));
    console.log('\nRESULT: GEOCODING FAILED — GOOGLE_MAPS_API_KEY likely missing or Geocoding API not enabled ❌');
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
