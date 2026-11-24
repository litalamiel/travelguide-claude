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

async function fromEmbed(code) {
  const r = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const html = await r.text();
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i) || html.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (!block) return null;
  const author = (block[1].match(/class="CaptionUsername"[^>]*>([\s\S]*?)<\/a>/i) || [])[1];
  const text = decode(block[1].replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, ''));
  return text ? { caption: text, author: author ? decode(author) : undefined } : null;
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
  return m ? { caption: m[2], author: m[1] } : { caption: d };
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x').searchParams.get('url') || '';
  const code = parseShortcode(url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!code) return res.status(400).json({ error: 'That doesn’t look like an Instagram reel or post link.' });
  try {
    const out = (await fromEmbed(code)) || (await fromPreview(code));
    if (!out) return res.status(404).json({ error: 'Couldn’t read this reel’s caption. It may be private or removed.' });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ shortcode: code, ...out });
  } catch (e) {
    return res.status(502).json({ error: 'Instagram didn’t respond. Try again in a moment.' });
  }
}
