import { useEffect, useRef, useState } from 'react';
import { getClip } from './clips';

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Load clip videos from this browser's storage as object URLs (freed when the ids change or on unmount). */
export function useClipUrls(ids: string[] | undefined) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const key = (ids ?? []).join(',');
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all((ids ?? []).map((id) => getClip(id).catch(() => undefined))).then((blobs) => {
      if (!alive) return;
      setUrls(blobs.map((b) => { if (!b) return null; const u = URL.createObjectURL(b); made.push(u); return u; }));
    });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); setUrls([]); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Design 3A: the place's story videos, played one after the other like Instagram stories. */
export function StoryPlayer({ ids, label }: { ids: string[]; label: string }) {
  const urls = useClipUrls(ids);
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const n = ids.length;
  useEffect(() => { setI(0); }, [ids.join(',')]);
  useEffect(() => { setProgress(0); }, [i]);
  if (!n) return null;
  const loaded = urls.length === n;
  const missing = loaded && urls.every((u) => !u);
  const go = (d: number) => setI((x) => Math.min(n - 1, Math.max(0, x + d)));
  const url = urls[i];
  return (
    <div className="story" aria-label={`Stories for ${label}, ${i + 1} of ${n}`}>
      <div className="story__bars" aria-hidden="true">
        {ids.map((id, j) => <span key={id} className="story__bar"><span style={{ width: `${j < i ? 100 : j === i ? progress * 100 : 0}%` }} /></span>)}
      </div>
      {!loaded && <div className="story__msg">Loading stories…</div>}
      {missing && <div className="story__msg">These story videos are saved in the creator’s browser only, so they can’t play here yet.</div>}
      {loaded && url && (
        <video key={url} ref={video} className="story__video" src={url} autoPlay muted={muted} playsInline
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
          onEnded={() => (i < n - 1 ? go(1) : setProgress(1))} />
      )}
      {loaded && !url && !missing && <div className="story__msg">This clip isn’t available in this browser.</div>}
      <button className="story__tap story__tap--prev" aria-label="Previous story" onClick={() => go(-1)} disabled={i === 0} />
      <button className="story__tap story__tap--next" aria-label="Next story" onClick={() => go(1)} disabled={i === n - 1} />
      {i > 0 && <button className="story__nav story__nav--prev" aria-label="Previous story" onClick={() => go(-1)}><Svg d="M15 6l-6 6 6 6" /></button>}
      {i < n - 1 && <button className="story__nav story__nav--next" aria-label="Next story" onClick={() => go(1)}><Svg d="M9 6l6 6-6 6" /></button>}
      <button className="story__mute" aria-label={muted ? 'Turn sound on' : 'Mute'} onClick={() => setMuted((m) => !m)}>
        <Svg d={muted ? 'M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6' : 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14'} />
      </button>
      <span className="story__count">{i + 1} / {n}</span>
    </div>
  );
}
