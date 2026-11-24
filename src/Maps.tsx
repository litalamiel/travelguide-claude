import { useState } from 'react';
import { categoryById } from './categories';
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

export function MapsPanel({ maps, currentId, onSwitch, onCreate, onRename, onDelete, onSell, onClose }: {
  maps: TripMap[]; currentId: string;
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
          <div><strong>Are you a creator?</strong><div className="muted small">Sell the current map to your followers.</div></div>
          <button className="btn" onClick={onSell}>Sell this map</button>
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
  const [previewCount, setPreviewCount] = useState(Math.min(l?.previewCount ?? 3, map.places.length));
  const [saved, setSaved] = useState(false);
  const priceNum = Number(price);
  const valid = creatorName.trim() && priceNum >= 1 && map.places.length >= 3;

  const build = (published: boolean): Listing => ({ published, creatorName: creatorName.trim(), description: description.trim(), price: priceNum, currency, previewCount });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Sell this map" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2>Sell “{map.name}”</h2><Close onClick={onClose} /></div>
        {map.places.length < 3 && <p className="warn small">Add at least 3 places before selling this map.</p>}
        <label className="field">Your creator name
          <input value={creatorName} onChange={(e) => { setCreatorName(e.target.value); setSaved(false); }} placeholder="e.g. @yourhandle" />
        </label>
        <label className="field">What buyers get
          <textarea rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} placeholder="My favourite cafés, viewpoints and a 4-day route…" />
        </label>
        <div className="grid2">
          <label className="field">Price
            <input type="number" min={1} step={0.5} value={price} onChange={(e) => { setPrice(e.target.value); setSaved(false); }} />
          </label>
          <label className="field">Currency
            <select value={currency} onChange={(e) => { setCurrency(e.target.value as Listing['currency']); setSaved(false); }}>
              <option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option><option value="ILS">ILS ₪</option>
            </select>
          </label>
        </div>
        <label className="field">Free preview: {previewCount} of {map.places.length} places
          <input type="range" min={0} max={Math.max(0, map.places.length - 1)} value={previewCount} onChange={(e) => { setPreviewCount(Number(e.target.value)); setSaved(false); }} />
        </label>
        <p className="muted small">Buyers see the free places right away. The rest of the map and your trip plan unlock after they pay. Checkout and payouts are not connected yet, so nothing is charged.</p>
        <div className="row">
          {l?.published && <button className="btn btn--danger" onClick={() => { onSave(build(false)); setSaved(true); }}>Stop selling</button>}
          <button className="btn" disabled={!valid} onClick={() => { onSave(build(true)); onPreview(); }}>Preview buyer page</button>
          <button className="btn btn--primary" disabled={!valid} onClick={() => { onSave(build(true)); setSaved(true); }}>{l?.published ? 'Save changes' : 'Put up for sale'}</button>
        </div>
        {saved && <p className="small" role="status">Saved.</p>}
      </div>
    </div>
  );
}

export function BuyerPreview({ map, onClose, onEdit }: { map: TripMap; onClose: () => void; onEdit: () => void }) {
  const l = map.listing;
  if (!l) return null;
  const free = map.places.slice(0, l.previewCount);
  const locked = map.places.length - free.length;
  const cats = new Set(map.places.map((p) => categoryById(p.category).label));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal buyer" role="dialog" aria-label="Buyer page preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head"><span className="pill-tag">Preview of what buyers see</span><Close onClick={onClose} /></div>
        <div className="buyer__hero">
          <div className="small">{l.creatorName}</div>
          <h2>{map.name}</h2>
          <div className="small">{map.places.length} places · {[...cats].slice(0, 4).join(', ')}</div>
        </div>
        {l.description && <p>{l.description}</p>}
        <div className="small muted">Free preview</div>
        <ul className="buyer__list">
          {free.map((p) => (
            <li key={p.id}><span className="dot" style={{ background: categoryById(p.category).color }} /><span><strong>{p.name}</strong><small>{categoryById(p.category).label}</small></span></li>
          ))}
          {locked > 0 && (
            <li className="buyer__locked">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              <span>{locked} more places locked</span>
            </li>
          )}
        </ul>
        <button className="btn btn--primary btn--block" disabled title="Checkout isn't connected yet">Unlock full map · {formatPrice(l)}</button>
        <p className="muted small">Checkout isn't connected yet. Next step: real payments with Stripe, and a public link for this page.</p>
        <button className="btn" onClick={onEdit}>Edit listing</button>
      </div>
    </div>
  );
}
