import { useEffect, useRef, useState } from 'react';
import { categoryById } from './categories';
import { analyzeCaption, findCaptionPlace, type SearchResult } from './geocode';
import type { Place } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** A saved-collection link, e.g. instagram.com/litalorlev/saved/austria/18072363518243116/ */
export function collectionFrom(url: string): { user: string; name: string; url: string } | undefined {
  const m = url.trim().match(/instagram\.com\/([\w.]+)\/saved\/([^/?#\s]+)(?:\/(\d+))?/i);
  if (!m) return undefined;
  let name = m[2];
  try { name = decodeURIComponent(name); } catch { /* keep */ }
  return { user: m[1], name: name.replace(/[-_]+/g, ' '), url: url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}` };
}

/** What the bookmark sends back: a collection name and the reels' short codes. */
export interface ReelBatch { name: string; codes: string[] }

/** Read a batch from the app link the bookmark opens: #reels={"c":"austria","l":["Db6f…",…]} */
export function batchFromHash(hash: string): ReelBatch | undefined {
  const m = hash.match(/^#reels=(.+)$/);
  if (!m) return undefined;
  try {
    const d = JSON.parse(decodeURIComponent(m[1]));
    const codes = (Array.isArray(d.l) ? d.l : []).filter((c: unknown) => typeof c === 'string' && /^[\w-]{5,40}$/.test(c));
    return codes.length ? { name: String(d.c || 'Saved reels').slice(0, 60), codes: [...new Set<string>(codes)].slice(0, 300) } : undefined;
  } catch { return undefined; }
}

/**
 * The "Send to Travel Maps" bookmark. It runs on instagram.com in the user's own signed-in tab:
 * it scrolls the saved collection to load every post, collects the reel links, and offers a
 * button back to the app. It only reads links on the page; it doesn't post or change anything.
 */
export function bookmarkletHref(appOrigin: string): string {
  const code = `(async()=>{
const A=${JSON.stringify(appOrigin)};
if(!/(^|\\.)instagram\\.com$/.test(location.hostname)){alert('Open one of your saved collections on instagram.com, then click Send to Travel Maps.');return}
if(window.__tmBusy)return;window.__tmBusy=1;
const b=document.createElement('div');
b.style.cssText='position:fixed;right:20px;top:20px;z-index:2147483647;width:300px;background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.3);padding:16px;border-top:5px solid #0f766e;font:14px/1.45 system-ui,sans-serif';
document.body.appendChild(b);
const s=h=>{b.innerHTML='<div style="display:flex;justify-content:space-between"><b style="font-size:15px">📍 Travel Maps</b><span id="tmx" style="cursor:pointer;color:#475569">✕</span></div><div style="margin-top:8px">'+h+'</div>';b.querySelector('#tmx').onclick=()=>{b.remove();window.__tmBusy=0}};
const c=new Set();
const g=()=>document.querySelectorAll('a[href]').forEach(a=>{const m=a.getAttribute('href').match(/\\/(?:p|reels?|tv)\\/([\\w-]{5,})/);if(m)c.add(m[1])});
let last=-1,still=0;
while(still<5&&c.size<300){g();s('Collecting reels… <b>'+c.size+'</b>');window.scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,700));if(c.size===last)still++;else{still=0;last=c.size}}
window.scrollTo(0,0);window.__tmBusy=0;
let n=(location.pathname.match(/\\/saved\\/([^/]+)/)||[])[1]||'Saved reels';try{n=decodeURIComponent(n).replace(/[-_]+/g,' ')}catch(e){}
if(!c.size){s('No reels found on this page. Open one of your saved collections on instagram.com and try again.');return}
const u=A+'/#reels='+encodeURIComponent(JSON.stringify({c:n,l:[...c]}));
s('Collected <b>'+c.size+' reels</b> from “'+n.replace(/</g,'')+'”.<a href="'+u+'" target="_blank" style="display:block;margin-top:12px;background:#0f766e;color:#fff;text-align:center;font-weight:700;border-radius:12px;padding:10px;text-decoration:none">Back to Travel Maps</a><div style="margin-top:6px;color:#475569;font-size:12px">Nothing on Instagram is changed.</div>');
})()`;
  return 'javascript:' + encodeURIComponent(code.replace(/\n/g, ''));
}

type ReelData = { caption?: string; author?: string; authorName?: string; avatar?: string; images?: string[] };

/** One place found in one reel. */
export interface BulkPlace {
  key: string;
  code: string;
  phrase: string;
  matches: SearchResult[];
  choice: number;
  sure: boolean;
  keep: boolean;
}
export interface BulkReel { code: string; status: 'waiting' | 'reading' | 'done' | 'none' | 'failed'; data?: ReelData }

const reelUrl = (code: string) => `https://www.instagram.com/p/${code}/`;

/** Reads each reel in turn and finds its places. Two reels are read at once. */
export function useBulkReader(batch: ReelBatch | undefined, near: { lat: number; lng: number }) {
  const [reels, setReels] = useState<BulkReel[]>([]);
  const [places, setPlaces] = useState<BulkPlace[]>([]);
  const nearRef = useRef(near);
  useEffect(() => {
    if (!batch) { setReels([]); setPlaces([]); return; }
    let stop = false;
    setReels(batch.codes.map((code) => ({ code, status: 'waiting' })));
    setPlaces([]);
    const patch = (code: string, p: Partial<BulkReel>) => setReels((rs) => rs.map((r) => (r.code === code ? { ...r, ...p } : r)));
    // Map searches go one at a time (the free map search limits how fast we can ask).
    let searchQueue = Promise.resolve();
    const search = <T,>(fn: () => Promise<T>) => { const p = searchQueue.then(fn); searchQueue = p.then(() => undefined, () => undefined); return p; };
    const readOne = async (code: string) => {
      patch(code, { status: 'reading' });
      try {
        const r = await fetch(`${API_BASE}/api/reel?url=${encodeURIComponent(reelUrl(code))}`);
        const data: ReelData = await r.json().catch(() => ({}));
        if (stop) return;
        if (!r.ok || !data.caption) { patch(code, { status: 'failed' }); return; }
        const found: BulkPlace[] = [];
        for (const p of analyzeCaption(data.caption).slice(0, 4)) {
          try {
            const f = await search(() => findCaptionPlace(p, nearRef.current));
            if (stop) return;
            if (f.results.length) {
              found.push({ key: `${code}:${p.query}`, code, phrase: p.query, matches: f.results.slice(0, f.confident ? 1 : 3), choice: 0, sure: f.confident, keep: f.confident });
            }
          } catch { /* skip this phrase */ }
        }
        patch(code, { status: found.length ? 'done' : 'none', data });
        // The same place from two reels is kept once.
        setPlaces((ps) => [...ps, ...found.filter((f) => !ps.some((q) => q.matches[q.choice].name === f.matches[0].name && Math.abs(q.matches[q.choice].lat - f.matches[0].lat) < 0.002))]);
      } catch {
        if (!stop) patch(code, { status: 'failed' });
      }
    };
    const queue = [...batch.codes];
    const worker = async () => { while (!stop && queue.length) await readOne(queue.shift()!); };
    worker(); worker();
    return () => { stop = true; };
  }, [batch]);
  return { reels, places, setPlaces };
}

/** Turn the kept places into map places. */
export function toPlaces(places: BulkPlace[], reels: BulkReel[], uid: () => string): Place[] {
  return places.filter((p) => p.keep).map((p) => {
    const m = p.matches[p.choice];
    const d = reels.find((r) => r.code === p.code)?.data ?? {};
    return {
      id: uid(), name: m.name, lat: m.lat, lng: m.lng, address: m.address, category: m.category,
      source: 'reel', reelUrl: reelUrl(p.code), photos: (d.images ?? []).slice(0, 4),
      reel: { caption: d.caption, author: d.author, authorName: d.authorName, avatar: d.avatar },
    };
  });
}

export function BulkReview({ batch, reels, places, setPlaces, focus, onFocus, onAdd, onClose }: {
  batch: ReelBatch;
  reels: BulkReel[];
  places: BulkPlace[];
  setPlaces: (fn: (ps: BulkPlace[]) => BulkPlace[]) => void;
  focus?: string;
  onFocus: (key: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string>();
  const doneCount = reels.filter((r) => r.status !== 'waiting' && r.status !== 'reading').length;
  const reading = doneCount < reels.length;
  const keep = places.filter((p) => p.keep).length;
  const toPick = places.filter((p) => !p.sure && !p.keep).length;
  const nothing = reels.filter((r) => r.status === 'none' || r.status === 'failed');
  const listRef = useRef<HTMLDivElement>(null);
  const set = (key: string, patch: Partial<BulkPlace>) => setPlaces((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  useEffect(() => {
    if (focus) listRef.current?.querySelector(`[data-key="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  return (
    <aside className="bulk" aria-label={`Review reels from ${batch.name}`}>
      <div className="bulk__head">
        <div>
          <h2>{batch.name} · {reels.length} {reels.length === 1 ? 'reel' : 'reels'}</h2>
          <div className="muted small">
            {reading ? `Reading ${doneCount} of ${reels.length} · ` : ''}{places.length} found{toPick ? ` · ${toPick} to pick` : ''}{nothing.length ? ` · ${nothing.length} with no place` : ''}
          </div>
        </div>
        <button className="icon-btn" aria-label="Close without adding" onClick={onClose}>✕</button>
      </div>
      {reading && <div className="bulk__prog" aria-hidden="true"><div style={{ width: `${(100 * doneCount) / Math.max(1, reels.length)}%` }} /></div>}
      <div className="bulk__list" ref={listRef}>
        {places.map((p) => {
          const m = p.matches[p.choice];
          const c = categoryById(m.category);
          const cover = reels.find((r) => r.code === p.code)?.data?.images?.[0];
          return (
            <div key={p.key} data-key={p.key} className={'brow' + (focus === p.key ? ' brow--on' : '')}>
              <input type="checkbox" checked={p.keep} aria-label={`Add ${m.name}`} onChange={(e) => set(p.key, { keep: e.target.checked })} />
              <button className="brow__main" onClick={() => onFocus(p.key)}>
                <span className="brow__cover" style={{ background: c.tint }}>{cover && <img src={cover} alt="" />}</span>
                <span className="brow__text">
                  <strong>{m.name}</strong>
                  <small>{c.label} · {m.address || p.phrase}</small>
                  {p.sure || p.matches.length === 1
                    ? <span className="bchip bchip--ok">Clear match</span>
                    : <span className="bchip bchip--ask">{p.keep ? 'Picked' : 'Pick one'} · {p.matches.length} options</span>}
                </span>
              </button>
              {!p.sure && p.matches.length > 1 && (
                <button className="btn btn--small" onClick={() => setOpen(open === p.key ? undefined : p.key)} aria-expanded={open === p.key}>{open === p.key ? 'Done' : 'Pick'}</button>
              )}
              {open === p.key && (
                <div className="brow__opts">
                  <div className="muted small">From “{p.phrase}”</div>
                  {p.matches.map((o, i) => (
                    <label key={i} className={'bopt' + (i === p.choice ? ' bopt--on' : '')}>
                      <input type="radio" name={p.key} checked={i === p.choice} onChange={() => { set(p.key, { choice: i, keep: true }); onFocus(p.key); }} />
                      <span><strong>{o.name}</strong><small>{categoryById(o.category).label} · {o.address}</small></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {reels.filter((r) => r.status === 'reading' || r.status === 'waiting').length > 0 && (
          <div className="brow brow--wait muted small">Reading {reels.filter((r) => r.status === 'reading' || r.status === 'waiting').length} more reels…</div>
        )}
        {nothing.length > 0 && (
          <details className="bulk__none">
            <summary>{nothing.length} {nothing.length === 1 ? 'reel' : 'reels'} with no place we could find</summary>
            {nothing.map((r) => (
              <a key={r.code} href={reelUrl(r.code)} target="_blank" rel="noreferrer" className="small">
                {r.data?.author ? `@${r.data.author}` : r.code} · {r.status === 'failed' ? 'couldn’t read' : 'no place in caption'} ↗
              </a>
            ))}
          </details>
        )}
      </div>
      <div className="bulk__foot">
        <button className="btn btn--primary" disabled={!keep} onClick={onAdd}>Add {keep} {keep === 1 ? 'place' : 'places'} to map</button>
      </div>
    </aside>
  );
}

/** Pasted a collection link: explain, offer the one-time bookmark, open the collection. */
export function CollectionImport({ link }: { link: { user: string; name: string; url: string } }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [hint, setHint] = useState(false);
  // React won't render javascript: links, so the bookmark's address is set directly.
  useEffect(() => { ref.current?.setAttribute('href', bookmarkletHref(window.location.origin)); }, []);
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  return (
    <div className="coll">
      <div className="coll__det">
        <span className="coll__th" aria-hidden="true">🗂️</span>
        <div><strong>Saved collection “{link.name}”</strong><div className="muted small">Instagram only shows this to you, so we read it in your browser.</div></div>
      </div>
      {phone && <p className="warn small">Importing a whole collection works on a computer. On your phone, paste one reel link at a time.</p>}
      <div className="coll__setup">
        <strong>One-time setup:</strong> drag this button to your bookmarks bar
        <div>
          {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
          <a ref={ref} className="coll__bm" onClick={(e) => { e.preventDefault(); setHint(true); }} draggable>📍 Send to Travel Maps</a>
        </div>
        <div className="muted small">{hint ? 'Drag it up to your bookmarks bar instead of clicking it here.' : 'Show the bookmarks bar: ⌘⇧B on Mac, Ctrl+Shift+B on Windows.'}</div>
      </div>
      <button className="btn btn--primary" onClick={() => window.open(link.url, '_blank', 'noopener')}>Open collection on Instagram ↗</button>
      <p className="muted small">Then click “Send to Travel Maps” on that tab. We’ll wait here.</p>
    </div>
  );
}
