import { useRef, useState } from 'react';
import { freeIds } from './Creator';
import { fileToDataUrl } from './photos';
import type { Listing, TripMap } from './types';

const CURRENCY_SYMBOL: Record<Listing['currency'], string> = { USD: '$', EUR: '€', GBP: '£', ILS: '₪' };
export const formatPrice = (l: Listing) => `${CURRENCY_SYMBOL[l.currency]}${l.price.toFixed(2).replace(/\.00$/, '')}`;

function Close({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-btn" aria-label="Close" onClick={onClick}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

export function MapsPanel({ maps, currentId, creator, onSwitch, onCreate, onRename, onDelete, onSell, onClose }: {
  maps: TripMap[]; currentId: string; creator?: boolean;
  onSwitch: (id: string) => void; onCreate: (name: string) => void; onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void; onSell: () => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string>();
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string>();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Your maps" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2>Your maps</h2><Close onClick={onClose} /></div>
        <p className="muted small">Make a separate map for each trip. Each map keeps its own places and plan.</p>
        <ul className="maplist">
          {maps.map((m) => (
            <li key={m.id} className={'maplist__item' + (m.id === currentId ? ' maplist__item--on' : '')}>
              {editing === m.id ? (
                <form className="maplist__edit" onSubmit={(e) => { e.preventDefault(); if (editName.trim()) onRename(m.id, editName.trim()); setEditing(undefined); }}>
                  <label htmlFor={`rename-${m.id}`} className="sr-only">Map name</label>
                  <input id={`rename-${m.id}`} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button className="btn btn--small btn--primary" type="submit">Save</button>
                </form>
              ) : (
                <button className="maplist__open" onClick={() => onSwitch(m.id)}>
                  <strong>{m.name}</strong>
                  <small>{m.places.length} places{m.listing?.published ? ` · For sale ${formatPrice(m.listing)}` : ''}</small>
                </button>
              )}
              {confirmDelete === m.id ? (
                <span className="maplist__actions">
                  <button className="btn btn--small btn--danger" onClick={() => { onDelete(m.id); setConfirmDelete(undefined); }}>Delete map</button>
                  <button className="btn btn--small" onClick={() => setConfirmDelete(undefined)}>Keep</button>
                </span>
              ) : editing !== m.id && (
                <span className="maplist__actions">
                  <button className="btn btn--small" onClick={() => { setEditing(m.id); setEditName(m.name); }}>Rename</button>
                  <button className="btn btn--small btn--danger" onClick={() => setConfirmDelete(m.id)}>Delete</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName(''); } }}>
          <label htmlFor="new-map" className="sr-only">New map name</label>
          <input id="new-map" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New map, e.g. Japan in April" />
          <button className="btn btn--primary" type="submit" disabled={!name.trim()}>Create map</button>
        </form>
        <div className="sell-cta">
          {creator ? <>
            <div><strong>Selling this map</strong><div className="muted small">Price, cover, what’s inside and the landing page.</div></div>
            <button className="btn" onClick={onSell}>Price and page</button>
          </> : <>
            <div><strong>Are you a creator?</strong><div className="muted small">Switch to the creator account to make maps you sell.</div></div>
            <button className="btn" onClick={onSell}>Switch to Creator</button>
          </>}
        </div>
      </div>
    </div>
  );
}

export function SellPanel({ map, onSave, onPreview, onClose }: { map: TripMap; onSave: (l: Listing) => void; onPreview: () => void; onClose: () => void }) {
  const l = map.listing;
  const [creatorName, setCreatorName] = useState(l?.creatorName ?? '');
  const [description, setDescription] = useState(l?.description ?? '');
  const [price, setPrice] = useState(String(l?.price ?? 9));
  const [currency, setCurrency] = useState<Listing['currency']>(l?.currency ?? 'USD');
  const [cover, setCover] = useState(l?.cover);
  const [inside, setInside] = useState((l?.inside ?? []).join('\n'));
  const [code, setCode] = useState(l?.discount?.code ?? '');
  const [percent, setPercent] = useState(String(l?.discount?.percent ?? ''));
  const [ends, setEnds] = useState(l?.discount?.endsAt?.slice(0, 10) ?? '');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const coverInput = useRef<HTMLInputElement>(null);
  const priceNum = Number(price);
  const free = freeIds(map).size;
  const valid = creatorName.trim() && priceNum >= 1 && map.places.length >= 3;
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setSaved(false); };

  const build = (published: boolean): Listing => ({
    published, creatorName: creatorName.trim(), description: description.trim(), price: priceNum, currency,
    previewCount: l?.previewCount ?? 0, cover,
    inside: inside.split('\n').map((x) => x.trim()).filter(Boolean),
    discount: Number(percent) > 0 ? { code: code.trim().toUpperCase(), percent: Math.min(90, Number(percent)), endsAt: ends ? new Date(`${ends}T23:59:59`).toISOString() : undefined } : undefined,
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Sell this map" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2>Sell “{map.name}”</h2><Close onClick={onClose} /></div>
        {map.places.length < 3 && <p className="warn small">Add at least 3 places before selling this map.</p>}
        <label className="field">Your creator name
          <input value={creatorName} onChange={(e) => touch(setCreatorName)(e.target.value)} placeholder="e.g. Maya Travels" />
        </label>
        <label className="field">Short description
          <textarea rows={2} value={description} onChange={(e) => touch(setDescription)(e.target.value)} placeholder="My favourite city. The best spots from 6 visits…" />
        </label>
        <div className="field-label">Cover photo</div>
        <div className="row cover-pick">
          {cover ? <img src={cover} alt="Cover" className="cover-pick__img" /> : <span className="muted small">No cover yet. The first place photo is used.</span>}
          <button className="btn btn--small" onClick={() => coverInput.current?.click()}>{cover ? 'Change' : 'Choose photo'}</button>
          {cover && <button className="btn btn--small btn--danger" onClick={() => { setCover(undefined); setSaved(false); }}>Remove</button>}
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setCover(await fileToDataUrl(f, 1200)); setSaved(false); } catch (x) { setErr((x as Error).message); } }} />
        </div>
        <label className="field">What’s inside · one line each
          <textarea rows={3} value={inside} onChange={(e) => touch(setInside)(e.target.value)} placeholder={'The hotels I always go back to\nRestaurants, coffee and street food'} />
        </label>
        <div className="grid2">
          <label className="field">Price
            <input type="number" min={1} step={0.5} value={price} onChange={(e) => touch(setPrice)(e.target.value)} />
          </label>
          <label className="field">Currency
            <select value={currency} onChange={(e) => touch(setCurrency)(e.target.value as Listing['currency'])}>
              <option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option><option value="ILS">ILS ₪</option>
            </select>
          </label>
        </div>
        <div className="field-label">Launch discount (optional)</div>
        <div className="grid3">
          <label className="field">Code<input value={code} onChange={(e) => touch(setCode)(e.target.value)} placeholder="MAYA20" /></label>
          <label className="field">% off<input type="number" min={0} max={90} value={percent} onChange={(e) => touch(setPercent)(e.target.value)} placeholder="20" /></label>
          <label className="field">Ends<input type="date" value={ends} onChange={(e) => touch(setEnds)(e.target.value)} /></label>
        </div>
        <p className="muted small">Free preview: {free} of {map.places.length} places. Choose them with “Free preview” on each place. Everything else shows as a locked pin until someone buys.</p>
        {err && <p className="warn small">{err}</p>}
        <div className="row">
          {l?.published && <button className="btn btn--danger" onClick={() => { onSave(build(false)); setSaved(true); }}>Stop selling</button>}
          <button className="btn" disabled={!valid} onClick={() => { onSave(build(l?.published ?? false)); onPreview(); }}>See landing page</button>
          <button className="btn btn--primary" disabled={!valid} onClick={() => { onSave(build(true)); setSaved(true); }}>{l?.published ? 'Save changes' : 'Put up for sale'}</button>
        </div>
        {saved && <p className="small" role="status">Saved.</p>}
      </div>
    </div>
  );
}
