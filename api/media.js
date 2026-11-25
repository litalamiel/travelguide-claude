// GET /api/media?u=<Instagram CDN video or image link>
// Passes the file through with CORS headers so the app can draw key frames from
// the reel video in the browser. Only Instagram/Facebook CDN hosts are allowed.
const ALLOWED = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
  let target;
  try { target = new URL(u); } catch { return res.status(400).json({ error: 'Bad link' }); }
  if (target.protocol !== 'https:' || !ALLOWED.test(target.hostname)) return res.status(403).json({ error: 'Host not allowed' });
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers.Range = req.headers.range;
    const r = await fetch(target, { headers });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h); if (v) res.setHeader(h, v);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 40_000_000) return res.status(413).json({ error: 'Too large' });
    return res.end(buf);
  } catch {
    return res.status(502).json({ error: 'Could not load the media' });
  }
}
