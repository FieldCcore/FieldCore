const RAILWAY = 'https://fieldcore-production-ee0d.up.railway.app';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const path = req.url;

  const bodyChunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });
  const body = bodyChunks.length ? Buffer.concat(bodyChunks) : undefined;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['connection'];
  delete forwardHeaders['transfer-encoding'];

  try {
    const upstream = await fetch(`${RAILWAY}${path}`, {
      method: req.method,
      headers: forwardHeaders,
      body: body?.length ? body : undefined,
    });

    upstream.headers.forEach((v, k) => {
      if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
    });
    res.status(upstream.status);

    const respBody = await upstream.arrayBuffer();
    res.send(Buffer.from(respBody));
  } catch (err) {
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  }
}
