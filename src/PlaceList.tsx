import { useState, type ReactNode, type RefObject } from 'react';
import { KIDS, categoryById } from './categories';
import type { Place } from './types';

function Svg({ d, size = 12, w = 2.6 }: { d: string; size?: number; w?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

const mapsUrl = (p: Place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}`;
// No real booking yet: "Book" opens a web search for the place's booking page.
const bookUrl = (p: Place) => `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${p.address ?? ''} book`.trim())}`;
const canBook = (p: Place) => p.category === 'stay' || p.category === 'experiences';

/** Card A: photo, bold name, pill tags, note or reel caption, and buttons. */
function PlaceCard({ p, on, onSelect }: { p: Place; on: boolean; onSelect: () => void }) {
  const c = categoryById(p.category);
  const text = p.note || p.reel?.caption || p.address || '';
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <li>
      <div role="button" tabIndex={0} data-id={p.id} className={'pcard' + (on ? ' pcard--on' : '')} onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}>
        <span className="pcard__photo" style={{ background: `linear-gradient(135deg, ${c.color}cc, ${c.color})` }}>
          {p.photos?.length ? <img src={p.photos[0]} alt="" /> : <Svg d={c.icon} size={30} w={2.2} />}
          {p.source === 'reel' && <span className="pcard__reel">▶ reel</span>}
          {!!p.stories?.length && <span className="pcard__reel">▶ {p.stories.length} {p.stories.length === 1 ? 'story' : 'stories'}</span>}
        </span>
        <span className="pcard__body">
          <span className="pcard__name">{p.name}</span>
          <span className="pcard__tags">
            <span className="ptag"><span className="ptag__ic" style={{ background: c.color }}><Svg d={c.icon} /></span>{c.label}</span>
            {p.mustSee && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#2B4436' }} />Must do</span>}
            {p.ifTime && !p.mustSee && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#3F6170' }} />If you have time</span>}
            {p.kids && <span className="ptag ptag--kids">{KIDS.text} FRIENDLY</span>}
            {p.visited && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#69726B' }} />Visited</span>}
          </span>
          {text && <span className="pcard__text">{text}</span>}
          <span className="pcard__btns">
            {p.reelUrl && <a className="pbtn" href={p.reelUrl} target="_blank" rel="noreferrer" onClick={stop}>Watch reel</a>}
            {canBook(p) && <a className="pbtn pbtn--dark" href={bookUrl(p)} target="_blank" rel="noreferrer" onClick={stop}>Book ↗</a>}
            <a className="pbtn" href={mapsUrl(p)} target="_blank" rel="noreferrer" onClick={stop}>Maps ↗</a>
          </span>
        </span>
      </div>
    </li>
  );
}

/** Option A: places list beside the map on desktop; a sheet under the map on phones. */
export default function PlaceList({ places, selectedId, onSelect, listRef, header, lockedCount = 0, onLocked }: {
  places: Place[]; selectedId?: string; onSelect: (id: string) => void; listRef: RefObject<HTMLDivElement>;
  /** Creator view: the Studio card above the places. */
  header?: ReactNode;
  /** Buyer's preview: how many places are locked (shown as one row under the free ones). */
  lockedCount?: number; onLocked?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className={'plist' + (expanded ? ' plist--open' : '')} aria-label="Places" ref={listRef}>
      <button className="plist__handle" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
        <span className="plist__grab" aria-hidden="true" />
        <span className="plist__count">{places.length + lockedCount} {places.length + lockedCount === 1 ? 'place' : 'places'}{lockedCount ? ` · ${lockedCount} locked` : ''}</span>
        <span className="plist__more">{expanded ? 'Show map' : 'Show list'}</span>
      </button>
      {header}
      <ul className="plist__ul">
        {places.map((p) => <PlaceCard key={p.id} p={p} on={p.id === selectedId} onSelect={() => { onSelect(p.id); setExpanded(false); }} />)}
        {lockedCount > 0 && (
          <li><button className="plocked" onClick={onLocked}>
            <span className="plocked__ic"><Svg d="M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3" size={18} w={2.4} /></span>
            <span><strong>{lockedCount} more places locked</strong><small>Get the map to open them</small></span>
          </button></li>
        )}
        {!places.length && !lockedCount && <li className="muted small plist__empty">No places on this map yet. Use Import highlight to add places with their stories.</li>}
      </ul>
    </aside>
  );
}
