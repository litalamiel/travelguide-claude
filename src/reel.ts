const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

const EN = new Set('the and of to in is it for with you this that on my we our at best was are be from your all so one day place here must just trip food view can not have love'.split(' '));

// Very common words in other languages travel captions are often written in.
const OTHER = new Set(('de het een en van op met voor niet dit deze zijn naar vanaf mooie plek ' + // Dutch
  'der die das und ist nicht mit für ein eine auf wir sehr ' + // German
  'el la los las y es muy con para una por del que en ' + // Spanish
  'o os as um uma não com para muito do da dos das em ' + // Portuguese
  'il lo gli e è molto con per una che di ' + // Italian
  'le les et est très avec pour une des du au dans nous').split(' '));
const EN_ONLY = new Set([...EN].filter((w) => !OTHER.has(w)));

/** Does any part of the caption read as another language? Mixed captions count. */
export function looksNonEnglish(text: string): boolean {
  const body = text.replace(/#[\p{L}\d_]+|@[\w.]+|https?:\S+/gu, ' ');
  if (/[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Greek}]/u.test(body)) return true;
  for (const line of body.split(/\n+/)) {
    const words = line.toLowerCase().match(/\p{L}+/gu) ?? [];
    if (words.length < 4) continue;
    const other = words.filter((w) => OTHER.has(w)).length;
    const en = words.filter((w) => EN_ONLY.has(w)).length;
    if (other >= 2 && other > en) return true;
  }
  return false;
}

const LANGS: Record<string, string> = { pt: 'Portuguese', es: 'Spanish', it: 'Italian', fr: 'French', de: 'German', he: 'Hebrew', iw: 'Hebrew', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', 'zh-CN': 'Chinese', ru: 'Russian', ar: 'Arabic', el: 'Greek', tr: 'Turkish', th: 'Thai', pl: 'Polish' };
export const langName = (code?: string) => (code ? LANGS[code] ?? LANGS[code.split('-')[0]] ?? code.toUpperCase() : 'another language');

/** The caption in English when it's written in another language (used to read the kind of place and the country). */
export async function englishFor(caption: string): Promise<string | undefined> {
  if (!looksNonEnglish(caption)) return undefined;
  try { return (await translateToEnglish(caption)).text; } catch { return undefined; }
}

export async function translateToEnglish(text: string): Promise<{ text: string; lang?: string }> {
  const r = await fetch(`${API_BASE}/api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw new Error(d.error || 'Translation is unavailable right now.');
  return { text: d.text, lang: d.lang };
}

/** Colour histogram (4×4×4 bins), brightness and sharpness of a small frame. */
function frameStats(data: Uint8ClampedArray, w: number, h: number) {
  const hist = new Float32Array(64);
  let lum = 0, edge = 0;
  const px = w * h;
  for (let i = 0; i < px; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)] += 1 / px;
    const l = (r * 3 + g * 6 + b) / 10;
    lum += l / px;
    if (i % w < w - 1) {
      const j = i + 1;
      edge += Math.abs(l - (data[j * 4] * 3 + data[j * 4 + 1] * 6 + data[j * 4 + 2]) / 10) / px;
    }
  }
  return { hist, lum, edge };
}
const histDiff = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < 64; i++) d += Math.abs(a[i] - b[i]); return d / 2; };

/**
 * Pick the reel's key scenes (the pool, the rooms, the kids' club…), not evenly spaced stills.
 * Samples the video every half second, splits it where the picture changes (a cut),
 * keeps the sharpest frame of each scene, drops near-repeats and dark or blank frames,
 * and returns up to `max` frames in reel order as small JPEGs.
 */
export async function keyFrames(src: string, max = 8, width = 720): Promise<string[]> {
  const url = src.startsWith('/') ? `${API_BASE}${src}` : src;
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const once = (ev: string) => new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), 15000);
    video.addEventListener(ev, () => { clearTimeout(t); ok(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(t); fail(new Error('video')); }, { once: true });
  });
  const seek = async (t: number) => { video.currentTime = t; await once('seeked'); };
  await once('loadeddata');
  const d = video.duration || 0;
  if (!d || !isFinite(d)) return [];

  // 1. Sample small frames through the reel.
  const small = document.createElement('canvas');
  small.width = 48; small.height = 64;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  const step = Math.max(0.5, d / 90);
  const samples: { t: number; hist: Float32Array; lum: number; edge: number }[] = [];
  const started = Date.now();
  for (let t = Math.min(0.3, d / 2); t < d - 0.05 && Date.now() - started < 25000; t += step) {
    await seek(t);
    sctx.drawImage(video, 0, 0, small.width, small.height);
    samples.push({ t, ...frameStats(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height) });
  }
  if (!samples.length) return [];

  // 2. Split into scenes where the colours jump.
  const scenes: (typeof samples)[] = [[samples[0]]];
  for (let i = 1; i < samples.length; i++) {
    if (histDiff(samples[i].hist, samples[i - 1].hist) > 0.3) scenes.push([]);
    scenes[scenes.length - 1].push(samples[i]);
  }

  // 3. Best frame per scene: sharp, not too dark or washed out, away from the cut.
  const usable = (f: (typeof samples)[0]) => f.lum > 25 && f.lum < 235 && f.edge > 2;
  let picks = scenes.map((sc) => {
    const inner = sc.length > 2 ? sc.slice(Math.floor(sc.length * 0.2), Math.ceil(sc.length * 0.8)) : sc;
    const best = [...inner].sort((a, b) => b.edge - a.edge)[0];
    return { ...best, len: sc.length };
  }).filter(usable);
  if (!picks.length) picks = [samples[Math.floor(samples.length / 2)]].map((f) => ({ ...f, len: 1 }));

  // 4. Drop near-repeats (the reel cutting back to the same shot), keeping the longer scene.
  const chosen: typeof picks = [];
  for (const p of [...picks].sort((a, b) => b.len - a.len || b.edge - a.edge)) {
    if (chosen.some((c) => histDiff(c.hist, p.hist) < 0.18)) continue;
    chosen.push(p);
    if (chosen.length >= max) break;
  }
  chosen.sort((a, b) => a.t - b.t);

  // 5. Full-size stills.
  const canvas = document.createElement('canvas');
  const out: string[] = [];
  for (const c of chosen) {
    await seek(c.t);
    const scale = Math.min(1, width / (video.videoWidth || width));
    canvas.width = Math.round((video.videoWidth || width) * scale);
    canvas.height = Math.round((video.videoHeight || width) * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    out.push(canvas.toDataURL('image/jpeg', 0.72));
  }
  video.removeAttribute('src'); video.load();
  return out;
}
