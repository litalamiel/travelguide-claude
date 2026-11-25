import { useState } from 'react';
import { CATEGORIES, KIDS } from './categories';
import type { CategoryId, Place } from './types';

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Map key (option A): a card in the corner of the map. Rows show or hide a category; the switch shows only kids friendly places. */
export default function MapKey({ places, cats, onToggle, kidsOnly, onKids }: {
  places: Place[]; cats: CategoryId[]; onToggle: (id: CategoryId) => void; kidsOnly: boolean; onKids: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 720);
  const count = (id: CategoryId) => places.filter((p) => p.category === id).length;
  const kids = places.filter((p) => p.kids).length;
  if (!open) {
    return <button className="mapkey__btn" onClick={() => setOpen(true)} aria-expanded="false">
      <Svg d="M4 6h16M4 12h16M4 18h10" size={16} /> Key{cats.length || kidsOnly ? ` · ${cats.length + (kidsOnly ? 1 : 0)} on` : ''}
    </button>;
  }
  return (
    <section className="mapkey" aria-label="Map key">
      <div className="mapkey__head">
        <strong>Map key</strong>
        <span className="muted">{places.length} {places.length === 1 ? 'place' : 'places'}</span>
        <button className="mapkey__close" aria-label="Fold the map key" onClick={() => setOpen(false)}><Svg d="M6 15l6-6 6 6" size={16} /></button>
      </div>
      <ul className="mapkey__list">
        {CATEGORIES.map((c) => {
          const n = count(c.id);
          const shown = !cats.length || cats.includes(c.id);
          return (
            <li key={c.id}>
              <button className={'mapkey__row' + (shown ? '' : ' mapkey__row--off') + (cats.includes(c.id) ? ' mapkey__row--on' : '')} aria-pressed={cats.includes(c.id)} onClick={() => onToggle(c.id)}>
                <span className="mapkey__ic" style={{ background: c.tint, color: c.color }}><Svg d={c.icon} /></span>
                <span className="mapkey__name">{c.label}</span>
                <span className="mapkey__n">{n}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="mapkey__row mapkey__kids" role="switch" aria-checked={kidsOnly} onClick={() => onKids(!kidsOnly)}>
        <span className="mapkey__ic" style={{ background: '#fde68a', color: KIDS.color }}><Svg d={KIDS.icon} /></span>
        <span className="mapkey__name">{KIDS.label} <span className="muted">{kids}</span></span>
        <span className={'switch' + (kidsOnly ? ' switch--on' : '')} aria-hidden="true" />
      </button>
      {cats.length > 0 && <button className="mapkey__all" onClick={() => cats.forEach(onToggle)}>Show all categories</button>}
    </section>
  );
}
