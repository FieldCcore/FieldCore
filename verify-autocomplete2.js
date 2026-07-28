// Extracts VITE_API_URL from the built JS bundle on production
// and directly hits /api/maps/autocomplete to see what the backend returns.
const https = require('https');
const http  = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const chunks = [];
    mod.get(url, { headers: { 'User-Agent': 'fieldcore-verify/1.0' } }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  // 1. Fetch the built JS bundle and extract VITE_API_URL
  console.log('=== 1. Finding JS bundle ===');
  const home = await get('https://www.getfieldcore.com');
  const scriptMatch = home.body.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!scriptMatch) {
    console.log('Could not find JS bundle in HTML');
    console.log(home.body.slice(0, 500));
    return;
  }
  const bundleUrl = 'https://www.getfieldcore.com' + scriptMatch[1];
  console.log('Bundle URL:', bundleUrl);

  console.log('\n=== 2. Extracting VITE_API_URL from bundle ===');
  const bundle = await get(bundleUrl);
  // Look for the Railway URL pattern in the minified bundle
  const railwayMatch = bundle.body.match(/https?:\/\/[a-z0-9\-]+\.up\.railway\.app[^"']*/i)
    || bundle.body.match(/VITE_API_URL[^,;]{0,100}/);
  if (railwayMatch) {
    console.log('Found backend URL hint:', railwayMatch[0].slice(0, 120));
  } else {
    // Try to find any non-vercel http origin
    const origins = [...bundle.body.matchAll(/https?:\/\/[a-z0-9\-\.]+\.[a-z]{2,}(?::\d+)?(?=\/api|["'])/gi)]
      .map(m => m[0])
      .filter(u => !u.includes('vercel') && !u.includes('googleapis') && !u.includes('google') && !u.includes('stripe') && !u.includes('twilio'));
    console.log('Other origins found:', [...new Set(origins)]);
  }

  // Also check if VITE_API_URL is empty (relative URLs)
  const emptyApiUrl = bundle.body.includes('VITE_API_URL=""') || bundle.body.includes("VITE_API_URL:''");
  console.log('VITE_API_URL appears empty (relative URLs):', emptyApiUrl);

})().catch(e => console.error('ERROR:', e.message));
