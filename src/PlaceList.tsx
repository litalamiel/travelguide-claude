import { useState, type RefObject } from 'react';
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
        </span>
        <span className="pcard__body">
          <span className="pcard__name">{p.name}</span>
          <span className="pcard__tags">
            <span className="ptag"><span className="ptag__ic" style={{ background: c.color }}><Svg d={c.icon} /></span>{c.label}</span>
            {p.mustSee && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#15803d' }} />Must do</span>}
            {p.ifTime && !p.mustSee && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#0284c7' }} />If you have time</span>}
            {p.kids && <span className="ptag"><span className="ptag__ic" style={{ background: KIDS.color }}><Svg d={KIDS.icon} /></span>Kids</span>}
            {p.visited && <span className="ptag ptag--dot"><span className="ptag__dot" style={{ background: '#64748b' }} />Visited</span>}
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
export default function PlaceList({ places, selectedId, onSelect, listRef }: {
  places: Place[]; selectedId?: string; onSelect: (id: string) => void; listRef: RefObject<HTMLDivElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className={'plist' + (expanded ? ' plist--open' : '')} aria-label="Places" ref={listRef}>
      <button className="plist__handle" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
        <span className="plist__grab" aria-hidden="true" />
        <span className="plist__count">{places.length} {places.length === 1 ? 'place' : 'places'}</span>
        <span className="plist__more">{expanded ? 'Show map' : 'Show list'}</span>
      </button>
      <ul className="plist__ul">
        {places.map((p) => <PlaceCard key={p.id} p={p} on={p.id === selectedId} onSelect={() => { onSelect(p.id); setExpanded(false); }} />)}
      </ul>
    </aside>
  );
}
