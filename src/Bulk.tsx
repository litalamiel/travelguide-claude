import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, categoryById } from './categories';
import { Carousel } from './Place';
import { englishFor, keyFrames } from './reel';
import { analyzeCaption, countryOf, findCaptionPlace, type SearchResult } from './geocode';
import type { CategoryId, Place } from './types';
import { smartGuess, teach, type LessonDraft } from './learn';

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

type ReelData = { caption?: string; author?: string; authorName?: string; avatar?: string; images?: string[]; video?: string };

/** One place found in one reel. */
export interface BulkPlace {
  key: string;
  code: string;
  phrase: string;
  matches: SearchResult[];
  choice: number;
  sure: boolean;
  keep: boolean;
  /** Found from a loose guess (a capitalised word or hashtag), not a pin or "at X". */
  weak?: boolean;
  /** Category the user chose instead of the one we guessed. */
  category?: CategoryId;
  /** How the first suggestion was found, for the learning memory. */
  method?: LessonDraft['method'];
  ai?: LessonDraft['ai'];
  captionEn?: string;
}
export interface BulkReel { code: string; status: 'waiting' | 'reading' | 'done' | 'none' | 'failed'; data?: ReelData; frames?: string[]; framesState?: 'loading' | 'done' | 'none' }

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
    const batchCountry = countryOf(batch.name);
    const countries = new Map<string, number>();
    const mainCountry = () => {
      const [top] = [...countries.entries()].sort((a, b) => b[1] - a[1]);
      return top && top[1] >= 2 ? top[0] : undefined;
    };
    const readOne = async (code: string) => {
      patch(code, { status: 'reading' });
      try {
        const r = await fetch(`${API_BASE}/api/reel?url=${encodeURIComponent(reelUrl(code))}`);
        const data: ReelData = await r.json().catch(() => ({}));
        if (stop) return;
        if (!r.ok || !data.caption) { patch(code, { status: 'failed' }); return; }
        const found: BulkPlace[] = [];
        // The learned guess first: a reel people already confirmed, or Claude's reading.
        const smart = await smartGuess({ code, caption: data.caption, author: data.author, images: data.images ?? [] }, nearRef.current, search).catch(() => undefined);
        if (stop) return;
        const english = await englishFor(data.caption);
        const ai = smart?.ai;
        if (smart?.results.length) {
          found.push({ key: `${code}:${smart.results[0].name}`, code, phrase: smart.results[0].name, matches: smart.results, choice: 0, sure: smart.sure, keep: smart.sure, method: smart.method, ai, captionEn: english });
        }
        for (const p0 of smart?.sure ? [] : analyzeCaption(data.caption, english).slice(0, 4)) {
          // A collection named after a country ("austria") keeps matches in that country.
          const p = !countryOf(p0.area) && batchCountry ? { ...p0, area: [p0.area, batch.name].filter(Boolean).join(', ') } : p0;
          try {
            const f = await search(() => findCaptionPlace(p, nearRef.current));
            if (stop) return;
            let results = f.results;
            // Otherwise, unsure matches prefer the country most of the collection's clear matches are in.
            const main = mainCountry();
            if (!f.confident && main && !countryOf(p.area)) {
              const inMain = results.filter((r) => r.cc === main);
              results = inMain.length ? inMain : results;
            }
            if (f.confident && results[0]?.cc) countries.set(results[0].cc, (countries.get(results[0].cc) ?? 0) + 1);
            if (results.length) {
              found.push({ key: `${code}:${p.query}`, code, phrase: p.query, matches: results.slice(0, f.confident ? 1 : 3), choice: 0, sure: f.confident, keep: f.confident, weak: p.from === 'name' || p.from === 'hashtag', method: 'rules', ai, captionEn: english });
            }
          } catch { /* skip this phrase */ }
        }
        // Loose guesses (a capitalised word, a hashtag) are dropped when the reel already has a clear place.
        // With only loose guesses, the first clear one is the reel's subject.
        // The learned guess counts as a clear place; the rules' extra finds are dropped when they repeat it.
        const near0 = (a: SearchResult, b: SearchResult) => Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lng - b.lng) < 0.004;
        if (smart?.results.length) found.splice(1, found.length - 1, ...found.slice(1).filter((f) => !near0(f.matches[0], smart.results[0])));
        if (found.length && found.every((f) => f.weak)) { const first = found.find((f) => f.sure); if (first) found.splice(0, found.length, first); }
        else if (found.some((f) => f.sure)) found.splice(0, found.length, ...found.filter((f) => f.sure || !f.weak));
        patch(code, { status: found.length ? 'done' : 'none', data });
        // The same place from two reels is kept once.
        const near = (a: SearchResult, b: SearchResult) => Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lng - b.lng) < 0.004;
        setPlaces((ps) => [...ps, ...found.filter((f, i) => !ps.some((q) => near(q.matches[q.choice], f.matches[0])) && !found.slice(0, i).some((q) => near(q.matches[0], f.matches[0])))]);
      } catch {
        if (!stop) patch(code, { status: 'failed' });
      }
    };
    const queue = [...batch.codes];
    const worker = async () => { while (!stop && queue.length) await readOne(queue.shift()!); };
    worker(); worker();
    return () => { stop = true; };
  }, [batch]);
  return { reels, places, setPlaces, setReels };
}

/** Send every reviewed place to the learning memory: kept ones with what the user chose, the rest as turned down. */
export function teachBulk(places: BulkPlace[], reels: BulkReel[]) {
  for (const p of places) {
    const d = reels.find((r) => r.code === p.code)?.data ?? {};
    const m = p.matches[p.choice];
    const draft: LessonDraft = {
      shortcode: p.code, author: d.author, caption: d.caption, captionEn: p.captionEn, cover: d.images?.[0],
      method: p.method ?? 'rules', guess: p.matches[0], ai: p.ai, flow: 'bulk',
    };
    teach(draft, p.keep && m ? { ...m, category: p.category ?? m.category } : undefined);
  }
}

/** Turn the kept places into map places. */
export function toPlaces(places: BulkPlace[], reels: BulkReel[], uid: () => string): Place[] {
  return places.filter((p) => p.keep).map((p) => {
    const m = p.matches[p.choice];
    const d = reels.find((r) => r.code === p.code)?.data ?? {};
    return {
      id: uid(), name: m.name, lat: m.lat, lng: m.lng, address: m.address, category: p.category ?? m.category,
      source: 'reel', reelUrl: reelUrl(p.code), photos: [...(d.images ?? []), ...(reels.find((r) => r.code === p.code)?.frames ?? [])].slice(0, 10),
      reel: { caption: d.caption, author: d.author, authorName: d.authorName, avatar: d.avatar },
    };
  });
}

function CatIcon({ id, size = 30 }: { id: CategoryId; size?: number }) {
  const c = categoryById(id);
  return (
    <span className="bicon" style={{ background: c.tint, color: c.color, width: size, height: size }} title={c.label} aria-label={c.label}>
      <svg aria-hidden="true" width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
    </span>
  );
}

/** Where bulk-imported places go: an existing map, or a new one with this name. */
export type BulkTarget = { mapId: string } | { newName: string };

/** "Add to map" picker above the Add button. Starts on a map named like the collection, or a new map with that name. */
function MapPicker({ maps, target, onChange, collection }: {
  maps: { id: string; name: string; count: number }[];
  target: BulkTarget;
  onChange: (t: BulkTarget) => void;
  collection: string;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const existing = 'mapId' in target ? maps.find((m) => m.id === target.mapId) : undefined;
  const isNew = 'newName' in target;
  const sameAsCollection = maps.some((m) => m.name.trim().toLowerCase() === collection.trim().toLowerCase());
  return (
    <div className="mpick" ref={ref}>
      <div className="mpick__label">Add to map</div>
      {naming ? (
        <form className="mpick__name" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onChange({ newName: name.trim() }); setNaming(false); } }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name the new map" aria-label="New map name" />
          <button className="btn btn--small btn--primary" disabled={!name.trim()}>OK</button>
          <button type="button" className="btn btn--small" onClick={() => setNaming(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="mpick__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>
            <b>{isNew ? `New map: “${target.newName}”` : existing?.name}</b>
            <small>{isNew ? (target.newName === collection ? 'Named after the collection' : 'A new map') : `${existing?.count ?? 0} ${existing?.count === 1 ? 'place' : 'places'} already`}</small>
          </span>
          <span aria-hidden="true">▾</span>
        </button>
      )}
      {open && (
        <div className="mpick__menu" role="listbox" aria-label="Choose a map">
          {!sameAsCollection && (
            <button type="button" role="option" aria-selected={isNew && target.newName === collection} className={isNew && target.newName === collection ? 'is-on' : ''}
              onClick={() => { onChange({ newName: collection }); setOpen(false); }}>
              <span>{isNew && target.newName === collection ? '✓ ' : ''}New map: “{collection}”</span>
            </button>
          )}
          {maps.map((m) => {
            const on = !isNew && existing?.id === m.id;
            return (
              <button type="button" role="option" aria-selected={on} key={m.id} className={on ? 'is-on' : ''} onClick={() => { onChange({ mapId: m.id }); setOpen(false); }}>
                <span>{on ? '✓ ' : ''}{m.name}</span><small>{m.count} {m.count === 1 ? 'place' : 'places'}</small>
              </button>
            );
          })}
          <button type="button" className="mpick__new" onClick={() => { setName(''); setNaming(true); setOpen(false); }}>＋ New map with another name…</button>
        </div>
      )}
    </div>
  );
}

export function BulkReview({ batch, reels, places, setPlaces, setReels, focus, onFocus, onAdd, onClose, maps, target, onTarget }: {
  maps: { id: string; name: string; count: number }[];
  target: BulkTarget;
  onTarget: (t: BulkTarget) => void;
  batch: ReelBatch;
  reels: BulkReel[];
  places: BulkPlace[];
  setPlaces: (fn: (ps: BulkPlace[]) => BulkPlace[]) => void;
  setReels: (fn: (rs: BulkReel[]) => BulkReel[]) => void;
  focus?: string;
  onFocus: (key: string | undefined) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const doneCount = reels.filter((r) => r.status !== 'waiting' && r.status !== 'reading').length;
  const reading = doneCount < reels.length;
  const keep = places.filter((p) => p.keep).length;
  const toPick = places.filter((p) => !p.sure && !p.keep).length;
  const nothing = reels.filter((r) => r.status === 'none' || r.status === 'failed');
  const listRef = useRef<HTMLDivElement>(null);
  const set = (key: string, patch: Partial<BulkPlace>) => setPlaces((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const open = places.find((p) => p.key === focus);

  useEffect(() => {
    if (focus) listRef.current?.querySelector(`[data-key="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  return (
    <>
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
            const cat = p.category ?? m.category;
            const c = categoryById(cat);
            const cover = reels.find((r) => r.code === p.code)?.data?.images?.[0];
            return (
              <div key={p.key} data-key={p.key} className={'brow' + (focus === p.key ? ' brow--on' : '')}>
                <input type="checkbox" checked={p.keep} aria-label={`Add ${m.name}`} onChange={(e) => set(p.key, { keep: e.target.checked })} />
                <CatIcon id={cat} />
                <button className="brow__main" onClick={() => onFocus(focus === p.key ? undefined : p.key)} aria-expanded={focus === p.key}>
                  <span className="brow__cover" style={{ background: c.tint }}>{cover && <img src={cover} alt="" />}</span>
                  <span className="brow__text">
                    <strong>{m.name}</strong>
                    <small>{c.label} · {m.address || p.phrase}</small>
                    {p.sure || p.matches.length === 1
                      ? <span className="bchip bchip--ok">Clear match</span>
                      : <span className="bchip bchip--ask">{p.keep ? 'Picked' : 'Pick one'} · {p.matches.length} options</span>}
                  </span>
                </button>
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
          <MapPicker maps={maps} target={target} onChange={onTarget} collection={batch.name} />
          <button className="btn btn--primary" disabled={!keep} onClick={onAdd}>
            Add {keep} {keep === 1 ? 'place' : 'places'} to “{'newName' in target ? target.newName : maps.find((m) => m.id === target.mapId)?.name}”
          </button>
        </div>
      </aside>
      {open && (
        <ReelCard key={open.key} place={open} reel={reels.find((r) => r.code === open.code)} setReels={setReels}
          onChange={(patch) => set(open.key, patch)} onFocus={() => onFocus(open.key)} onClose={() => onFocus(undefined)} />
      )}
    </>
  );
}

/** The reel behind one found place: big frames, creator, caption, category and place options. */
function ReelCard({ place, reel, setReels, onChange, onFocus, onClose }: {
  place: BulkPlace;
  reel?: BulkReel;
  setReels: (fn: (rs: BulkReel[]) => BulkReel[]) => void;
  onChange: (patch: Partial<BulkPlace>) => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  const d = reel?.data ?? {};
  const m = place.matches[place.choice];
  const cat = place.category ?? m.category;
  const [more, setMore] = useState(false);
  const [allCats, setAllCats] = useState(false);
  // Key frames are taken when a reel is opened (Instagram gives no video for reels with licensed music).
  useEffect(() => {
    if (!reel || !d.video || reel.framesState) return;
    const code = reel.code;
    setReels((rs) => rs.map((r) => (r.code === code ? { ...r, framesState: 'loading' } : r)));
    keyFrames(d.video, 6)
      .then((f) => setReels((rs) => rs.map((r) => (r.code === code ? { ...r, frames: f, framesState: f.length ? 'done' : 'none' } : r))))
      .catch(() => setReels((rs) => rs.map((r) => (r.code === code ? { ...r, framesState: 'none' } : r))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel?.code]);
  const photos = [...(d.images ?? []), ...(reel?.frames ?? [])];
  const caption = d.caption ?? '';
  const shownCats = allCats ? CATEGORIES.map((c) => c.id) : Array.from(new Set([cat, 'stay', 'eat', 'nature', 'experiences', 'views'] as CategoryId[]));
  return (
    <section className="bcard" aria-label={`Reel for ${m.name}`}>
      <button className="icon-btn bcard__close" aria-label="Close reel" onClick={onClose}>✕</button>
      <div className="bcard__media">
        {photos.length ? <Carousel key={photos.length} photos={photos} alt={`From the reel about ${m.name}`} /> : <div className="bcard__nomedia muted small">No images from this reel</div>}
      </div>
      {reel?.framesState === 'loading' && <p className="muted small bcard__pad">Taking key frames from the video…</p>}
      {reel?.data && !d.video && <p className="muted small bcard__pad">Instagram didn’t share this reel’s video (usually because of licensed music), so only the cover is shown.</p>}
      <div className="bcard__body">
        <div className="bcard__title">
          <CatIcon id={cat} size={36} />
          <div><strong>{m.name}</strong><div className="muted small">{categoryById(cat).label} · {m.address}</div></div>
        </div>
        <div className="bcard__creator">
          {d.avatar ? <img src={d.avatar} alt="" /> : <span className="bcard__av" aria-hidden="true">{(d.author ?? '?')[0]?.toUpperCase()}</span>}
          <strong>{d.author ? `@${d.author}` : 'Instagram'}</strong>
          <a href={reelUrl(place.code)} target="_blank" rel="noreferrer">Watch reel ↗</a>
        </div>
        {caption && (
          <p className={'bcard__caption' + (more ? '' : ' bcard__caption--short')}>{caption}</p>
        )}
        {caption.length > 180 && <button className="linkbtn" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Show more'}</button>}
        {!place.sure && place.matches.length > 1 && (
          <div className="bcard__opts">
            <div className="small"><strong>Which place is it?</strong> <span className="muted">From “{place.phrase}”</span></div>
            {place.matches.map((o, i) => (
              <label key={i} className={'bopt' + (i === place.choice ? ' bopt--on' : '')}>
                <input type="radio" name={place.key} checked={i === place.choice} onChange={() => { onChange({ choice: i, keep: true }); onFocus(); }} />
                <span><strong>{o.name}</strong><small>{categoryById(o.category).label} · {o.address}</small></span>
              </label>
            ))}
          </div>
        )}
        <div className="bcard__cats" role="group" aria-label="Category">
          {shownCats.map((id) => {
            const c = categoryById(id);
            return <button key={id} className={'pillbtn' + (id === cat ? ' pillbtn--on' : '')} aria-pressed={id === cat} onClick={() => onChange({ category: id })}>{c.label}</button>;
          })}
          {!allCats && <button className="pillbtn" onClick={() => setAllCats(true)}>More…</button>}
        </div>
        <label className="check"><input type="checkbox" checked={place.keep} onChange={(e) => onChange({ keep: e.target.checked })} /> Add this place to the map</label>
      </div>
    </section>
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
