import { useEffect, useState } from 'react';
import { CATEGORIES } from './categories';
import { formatPrice } from './Maps';
import type { AccountMode, CreatorProfile, Listing, TripMap } from './types';

const LOCK = 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3';
function Svg({ d, size = 18, w = 2.2 }: { d: string; size?: number; w?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Places open in the buyer's preview. Old listings had "the first N places" instead of picked ones. */
export function freeIds(map: TripMap): Set<string> {
  const picked = map.places.filter((p) => p.free);
  if (picked.length) return new Set(picked.map((p) => p.id));
  return new Set(map.places.slice(0, map.listing?.previewCount ?? 0).map((p) => p.id));
}

export function discountLive(l?: Listing) {
  const d = l?.discount;
  return !!d && d.percent > 0 && (!d.endsAt || new Date(d.endsAt).getTime() > Date.now());
}
export function finalPrice(l: Listing): Listing {
  return discountLive(l) ? { ...l, price: Math.round(l.price * (100 - l.discount!.percent)) / 100 } : l;
}

export function Avatar({ profile, size = 32 }: { profile: CreatorProfile; size?: number }) {
  const letter = (profile.name || profile.handle || 'C').replace('@', '')[0]?.toUpperCase();
  return profile.avatar
    ? <img className="cavatar" src={profile.avatar} alt="" style={{ width: size, height: size }} />
    : <span className="cavatar cavatar--letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</span>;
}

/** Design 1A: Traveler | Creator switch in the top bar. */
export function ModeSwitch({ mode, onChange }: { mode: AccountMode; onChange: (m: AccountMode) => void }) {
  return (
    <div className="mode-wrap"><div className="mode" role="radiogroup" aria-label="Account">
      {(['traveler', 'creator'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={'mode__opt' + (mode === m ? ' mode__opt--on' : '')} onClick={() => onChange(m)}>
          {m === 'traveler' ? 'Traveler' : 'Creator'}
        </button>
      ))}
    </div></div>
  );
}

/** Creator view: the numbers for the open map, shown in the dark header. */
export function CreatorStats({ map }: { map: TripMap }) {
  const free = freeIds(map).size;
  const stories = map.places.reduce((s, p) => s + (p.stories?.length ?? 0), 0);
  const l = map.listing;
  return (
    <div className="cstats">
      <span className={'cstats__tag' + (l?.published ? ' cstats__tag--live' : '')}>{l?.published ? `For sale · ${formatPrice(finalPrice(l))}` : 'Draft · not for sale'}</span>
      <span><b>{map.places.length}</b> pins</span>
      <span><b>{free}</b> free</span>
      <span><b>{stories}</b> stories</span>
      <span className="cstats__muted">Sales show here once checkout is connected</span>
    </div>
  );
}

/** Creator view: the maps you sell, at the top of the places list. */
export function Studio({ maps, currentId, onOpen, onNewHighlight, onSell, onLanding, onPreview }: {
  maps: TripMap[]; currentId: string; onOpen: (id: string) => void; onNewHighlight: () => void; onSell: () => void; onLanding: () => void; onPreview: () => void;
}) {
  return (
    <section className="studio" aria-label="Your maps for sale">
      <div className="studio__head"><strong>Your maps</strong><button className="btn btn--small studio__new" onClick={onNewHighlight}>＋ Import highlight</button></div>
      <ul className="studio__maps">
        {maps.map((m) => (
          <li key={m.id}>
            <button className={'studio__map' + (m.id === currentId ? ' studio__map--on' : '')} onClick={() => onOpen(m.id)}>
              <span className="studio__thumb" style={m.listing?.cover || m.places[0]?.photos?.[0] ? { backgroundImage: `url('${m.listing?.cover || m.places[0]?.photos?.[0]}')` } : undefined} />
              <span className="studio__txt"><strong>{m.name}</strong><small>{m.places.length} pins{m.listing ? ` · ${formatPrice(finalPrice(m.listing))}` : ''}</small></span>
              <span className={'studio__state' + (m.listing?.published ? ' studio__state--live' : '')}>{m.listing?.published ? 'Live' : 'Draft'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="studio__btns">
        <button className="btn btn--small" onClick={onSell}>Price and page</button>
        <button className="btn btn--small" onClick={onLanding} disabled={!maps.find((m) => m.id === currentId)?.listing}>Landing page</button>
        <button className="btn btn--small" onClick={onPreview} disabled={!maps.find((m) => m.id === currentId)?.listing}>Preview as buyer</button>
      </div>
    </section>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const parts = [[Math.floor(ms / 86400000), 'days'], [Math.floor(ms / 3600000) % 24, 'hrs'], [Math.floor(ms / 60000) % 60, 'min'], [Math.floor(ms / 1000) % 60, 'sec']] as const;
  return <span className="countdown">{parts.map(([n, l]) => <span key={l}><b>{String(n).padStart(2, '0')}</b><small>{l}</small></span>)}</span>;
}

/** Design 4A: what travelers see before buying a creator's map. */
export function LandingPage({ map, profile, onPreview, onEdit, onClose }: { map: TripMap; profile: CreatorProfile; onPreview: () => void; onEdit?: () => void; onClose: () => void }) {
  const l = map.listing;
  if (!l) return null;
  const live = discountLive(l);
  const price = finalPrice(l);
  const stories = map.places.reduce((s, p) => s + (p.stories?.length ?? 0), 0);
  const counts = CATEGORIES.map((c) => ({ c, n: map.places.filter((p) => p.category === c.id).length })).filter((x) => x.n);
  const cover = l.cover || map.places.find((p) => p.photos?.length)?.photos?.[0];
  const inside = l.inside?.filter((x) => x.trim()) ?? [];
  const free = freeIds(map);
  return (
    <div className="landing" role="dialog" aria-label={`${map.name}, landing page`}>
      <div className="landing__bar">
        {onEdit && <span className="pill-tag">This is what buyers see</span>}
        <span style={{ flex: 1 }} />
        {onEdit && <button className="btn btn--small" onClick={onEdit}>Edit page</button>}
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" size={20} /></button>
      </div>
      <div className="landing__inner">
        <div className="landing__hero">
          <div className="landing__text">
            <div className="landing__by"><Avatar profile={{ ...profile, name: profile.name || l.creatorName }} size={34} /><strong>{l.creatorName || profile.name}</strong></div>
            <h1>{map.name}</h1>
            {l.description && <p className="landing__desc">{l.description}</p>}
            <div className="landing__price">
              {live && <s>{formatPrice(l)}</s>}
              <span className="landing__amount">{formatPrice(price)}</span>
              <span className="muted">{map.places.length} places{stories ? ` · ${stories} stories` : ''}</span>
            </div>
            {live && (
              <div className="landing__deal">
                <span className="landing__code">{l.discount!.code ? `${l.discount!.code} applied · ` : ''}{l.discount!.percent}% off</span>
                {l.discount!.endsAt && <><span className="muted small">Ends in</span><Countdown to={l.discount!.endsAt} /></>}
              </div>
            )}
            <div className="landing__cta">
              <button className="btn btn--dark landing__buy" disabled title="Checkout isn't connected yet">Get access · {formatPrice(price)}</button>
              <button className="btn landing__prev" onClick={onPreview}>Preview the map</button>
            </div>
            <p className="muted small">Checkout isn’t connected yet, so nothing can be bought. Real payments need a Stripe account.</p>
          </div>
          <div className="landing__cover">{cover ? <img src={cover} alt="" /> : <span className="landing__nocover">Add a cover photo in Edit page</span>}</div>
        </div>
        <div className="landing__inside">
          <div className="landing__card">
            <h2>What’s inside</h2>
            <ul className="landing__list">
              {inside.map((x, i) => <li key={i}>{x}</li>)}
              <li>{map.places.length} places on the map{free.size ? `, ${free.size} free to preview` : ''}</li>
              {stories > 0 && <li>{stories} story videos filmed on the spot</li>}
              <li>Opens in this app and in Google Maps</li>
            </ul>
            <div className="landing__counts">
              {counts.map(({ c, n }) => <span key={c.id} className="ptag"><span className="ptag__ic" style={{ background: c.color }}><Svg d={c.icon} size={12} w={2.6} /></span>{n} {c.label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Design 1 (locked pins): tapping a lock in the preview. */
export function LockedSheet({ map, onUnlock, onClose }: { map: TripMap; onUnlock: () => void; onClose: () => void }) {
  const l = map.listing!;
  const locked = map.places.length - freeIds(map).size;
  return (
    <aside className="locked" aria-label="Locked place">
      <span className="locked__ic"><Svg d={LOCK} size={20} w={2.4} /></span>
      <div className="locked__txt"><strong>Locked place</strong><small>Get the map to see it, with its stories and notes. {locked} places are locked.</small></div>
      <button className="icon-btn locked__x" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" /></button>
      <button className="btn btn--dark locked__buy" onClick={onUnlock}>Unlock all {map.places.length} places · {formatPrice(finalPrice(l))}</button>
    </aside>
  );
}

