// Vercel serverless function: GET /api/reel?url=<instagram reel or post link>
// Returns the reel's caption (and author) so users don't have to copy it.
// It reads Instagram's public embed page for the post, the same page Instagram
// serves when a reel is embedded on a website. Falls back to the link-preview
// description. For production, switch to Meta's official oEmbed API (needs a
// Meta app with oEmbed Read approved) — see README.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim();

export function parseShortcode(url) {
  const m = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/i);
  return m ? m[1] : null;
}

const imgUrlsFrom = (html) => {
  const urls = [];
  for (const m of html.matchAll(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/gi)) urls.push(m[1]);
  for (const m of html.matchAll(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi)) urls.push(m[1]);
  return [...new Set(urls.map((u) => u.replace(/&amp;/g, '&')))];
};

// Instagram image links expire, so we copy the reel's images as small data URLs.
async function toDataUrls(urls, limit = 4) {
  const out = [];
  for (const u of urls.slice(0, limit)) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      const type = r.headers.get('content-type') || 'image/jpeg';
      if (!r.ok || !type.startsWith('image/')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 1_500_000) continue;
      out.push(`data:${type};base64,${buf.toString('base64')}`);
    } catch { /* skip */ }
  }
  return out;
}

const unescapeJson = (u) => u.replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');

// The reel's video link, if the embed page includes it, so the app can take key frames.
const videoUrlFrom = (html) => {
  const m = html.match(/"video_url"\s*:\s*"([^"]+)"/) || html.match(/<video[^>]+src="([^"]+)"/i);
  return m ? unescapeJson(m[1]) : undefined;
};
const avatarUrlFrom = (html) => {
  const m = html.match(/class="Avatar[^"]*"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/i) || html.match(/"profile_pic_url"\s*:\s*"([^"]+)"/);
  return m ? unescapeJson(m[1]) : undefined;
};

/** Creator's display name from the link preview title, e.g. "Jane Doe (@jane) • Instagram reel". */
async function creatorName(code) {
  try {
    const r = await fetch(`https://www.instagram.com/p/${code}/`, { headers: { 'User-Agent': 'facebookexternalhit/1.1', 'Accept-Language': 'en' } });
    if (!r.ok) return undefined;
    const html = await r.text();
    const t = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || [])[1];
    const m = t && decode(t).match(/^(.+?)\s*\(@[\w.]+\)/);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}

async function fromEmbed(code) {
  const r = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const html = await r.text();
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i) || html.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (!block) return null;
  const author = (block[1].match(/class="CaptionUsername"[^>]*>([\s\S]*?)<\/a>/i) || [])[1];
  const text = decode(block[1].replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, ''));
  return text ? { caption: text, author: author ? decode(author) : undefined, imageUrls: imgUrlsFrom(html), videoUrl: videoUrlFrom(html), avatarUrl: avatarUrlFrom(html) } : null;
}

async function fromPreview(code) {
  const r = await fetch(`https://www.instagram.com/p/${code}/`, { headers: { 'User-Agent': 'facebookexternalhit/1.1', 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const html = await r.text();
  const og = (html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i) || [])[1];
  if (!og) return null;
  // Typical form: `123 likes, 4 comments - user on May 1, 2025: "caption…"`
  const d = decode(og);
  const m = d.match(/^[\s\S]*? - ([\w.]+) on [^:]+:\s*"?([\s\S]*?)"?\.?$/);
  const imageUrls = imgUrlsFrom(html);
  return m ? { caption: m[2], author: m[1], imageUrls } : { caption: d, imageUrls };
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x').searchParams.get('url') || '';
  const code = parseShortcode(url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!code) return res.status(400).json({ error: 'That doesn’t look like an Instagram reel or post link.' });
  try {
    const out = (await fromEmbed(code)) || (await fromPreview(code));
    if (!out) return res.status(404).json({ error: 'Couldn’t read this reel’s caption. It may be private or removed.' });
    const [images, avatar, authorName] = await Promise.all([
      toDataUrls(out.imageUrls || []),
      out.avatarUrl ? toDataUrls([out.avatarUrl], 1).then((a) => a[0]) : undefined,
      creatorName(code),
    ]);
    // Video links expire within hours: the app takes its key frames right away, through /api/media.
    const video = out.videoUrl ? `/api/media?u=${encodeURIComponent(out.videoUrl)}` : undefined;
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ shortcode: code, caption: out.caption, author: out.author, authorName, avatar, images, video });
  } catch (e) {
    return res.status(502).json({ error: 'Instagram didn’t respond. Try again in a moment.' });
  }
}
