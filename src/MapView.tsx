import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { CategoryId, DayPlan, PendingPlace, Place } from './types';
import { KIDS, STAR, categoryById } from './categories';

// Free OpenStreetMap vector tiles from OpenFreeMap — no API key, live and zoomable.
// To switch to Google Maps later, replace this component (see README).
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** Forest & Brass map tint: cream land, sage water and parks, quiet roads. */
const MAP_TINT = { land: '#F1F0E9', water: '#CCD8D3', green: '#E2E7DA', building: '#E7E5DC', road: '#FFFFFF', label: '#69726B' };
export function tintMap(m: maplibregl.Map) {
  for (const l of m.getStyle()?.layers ?? []) {
    const id = l.id;
    try {
      if (l.type === 'background') m.setPaintProperty(id, 'background-color', MAP_TINT.land);
      else if (l.type === 'fill' && /water|ocean|sea/.test(id)) m.setPaintProperty(id, 'fill-color', MAP_TINT.water);
      else if (l.type === 'line' && /waterway|river/.test(id)) m.setPaintProperty(id, 'line-color', MAP_TINT.water);
      else if (l.type === 'fill' && /park|wood|forest|grass|landcover|garden/.test(id)) m.setPaintProperty(id, 'fill-color', MAP_TINT.green);
      else if (l.type === 'fill' && /building/.test(id)) m.setPaintProperty(id, 'fill-color', MAP_TINT.building);
      else if (l.type === 'fill' && /landuse|residential/.test(id)) m.setPaintProperty(id, 'fill-color', MAP_TINT.land);
      else if (l.type === 'symbol' && (l.layout as Record<string, unknown> | undefined)?.['text-field']) m.setPaintProperty(id, 'text-color', MAP_TINT.label);
    } catch { /* layer without that property */ }
  }
}
export const DAY_COLORS = ['#3F6170', '#B0703C', '#2B4436', '#6B4C66', '#2B4436', '#965A6C', '#B0894C', '#69726B'];

interface Props {
  places: Place[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCenterChange: (c: { lat: number; lng: number }) => void;
  plan?: DayPlan[];
  activeDay?: number;
  flyTo?: { lat: number; lng: number; key: number };
  preview?: PendingPlace;
  onPreviewMove?: (lat: number, lng: number) => void;
  /** Places found while importing many reels: solid = clear match, dashed = needs a pick, faded = not kept. */
  bulk?: { key: string; lat: number; lng: number; category: CategoryId; sure: boolean; keep: boolean; name: string }[];
  bulkFocus?: string;
  onBulkSelect?: (key: string) => void;
  /** Selling: 'preview' = buyer's preview (locked places are dark lock pins), 'creator' = small lock badge on paid places. */
  lockMode?: 'preview' | 'creator';
  freeSet?: Set<string>;
  onLocked?: () => void;
  /** Creator's photo (URL) or initial, shown on open pins in the buyer's preview. */
  creatorBadge?: { avatar?: string; letter: string };
  /** Change to fit every place in view (e.g. when the buyer's preview opens). */
  fitKey?: number;
}

export default function MapView({ places, selectedId, onSelect, onCenterChange, plan, activeDay, flyTo, preview, onPreviewMove, bulk, bulkFocus, onBulkSelect, lockMode, freeSet, onLocked, creatorBadge, fitKey }: Props) {
  const lockedRef = useRef(onLocked);
  lockedRef.current = onLocked;
  const bulkMarkers = useRef<maplibregl.Marker[]>([]);
  const bulkSelect = useRef(onBulkSelect);
  bulkSelect.current = onBulkSelect;
  const previewMarker = useRef<maplibregl.Marker>();
  const moveRef = useRef(onPreviewMove);
  moveRef.current = onPreviewMove;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const markers = useRef<maplibregl.Marker[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      center: [-9.16, 38.71],
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    m.addControl(new maplibregl.GeolocateControl({}), 'top-left');
    m.on('moveend', () => { const c = m.getCenter(); onCenterChange({ lat: c.lat, lng: c.lng }); });
    m.on('load', () => {
      loaded.current = true;
      tintMap(m);
      m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1, 1.5] },
      });
      m.fire('routes:refresh');
    });
    map.current = m;
    // The places list beside the map can appear or hide, so follow the container's size, not just the window's.
    const ro = new ResizeObserver(() => m.resize());
    if (el.current) ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = places.map((p) => {
      const c = categoryById(p.category);
      const isFree = !freeSet || freeSet.has(p.id);
      if (lockMode === 'preview' && !isFree) {
        const lk = document.createElement('button');
        lk.className = 'lockpin';
        lk.setAttribute('aria-label', 'Locked place');
        lk.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3"/></svg>';
        lk.addEventListener('click', (e) => { e.stopPropagation(); lockedRef.current?.(); });
        return new maplibregl.Marker({ element: lk, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(m);
      }
      const dayIndex = plan?.findIndex((d) => d.places.some((q) => q.id === p.id)) ?? -1;
      const stop = dayIndex >= 0 ? plan![dayIndex].places.findIndex((q) => q.id === p.id) + 1 : 0;
      // MapLibre sets `transform` on the marker element, so the rotated teardrop lives in a child.
      const btn = document.createElement('button');
      btn.className = 'pin' + (p.ifTime && !p.mustSee ? ' pin--maybe' : '') + (p.id === selectedId ? ' pin--selected' : '') + (plan && activeDay && dayIndex + 1 !== activeDay ? ' pin--dim' : '');
      btn.setAttribute('aria-label', `${p.name}, ${c.label}${p.mustSee ? ', must do' : p.ifTime ? ', if you have time' : ''}${p.kids ? ', kids friendly' : ''}`);
      const color = plan && dayIndex >= 0 ? DAY_COLORS[dayIndex % DAY_COLORS.length] : c.color;
      const inner = stop
        ? `<span class="pin__num">${stop}</span>`
        : `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg>`;
      btn.innerHTML = `<span class="pin__shape" style="background:${color}"></span><span class="pin__inner">${inner}</span>` +
        (p.mustSee ? `<span class="pin__star"><svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="${STAR}"/></svg></span>` : '') +
        (p.kids ? `<span class="pin__kids" aria-hidden="true">${KIDS.text}</span>` : '') +
        (lockMode === 'creator' && !isFree ? '<span class="pin__paid" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' : '') +
        (lockMode === 'preview' && creatorBadge ? (creatorBadge.avatar ? `<span class="pin__badge" style="background-image:url('${creatorBadge.avatar}')"></span>` : `<span class="pin__badge pin__badge--letter">${creatorBadge.letter.replace(/[<>&"']/g, '')}</span>`) :
        p.source === 'reel' ? (p.photos?.[0] ? `<span class="pin__badge" style="background-image:url('${p.photos[0]}')"></span>` : '<span class="pin__badge pin__badge--play">▶</span>') : '');
      btn.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p.id); });
      return new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m);
    });
  }, [places, selectedId, plan, activeDay, onSelect, lockMode, freeSet, creatorBadge]);

  // Fit all places in view on request.
  useEffect(() => {
    const m = map.current;
    if (!m || !fitKey || !places.length) return;
    const b = new maplibregl.LngLatBounds();
    places.forEach((p) => b.extend([p.lng, p.lat]));
    const phone = window.innerWidth <= 720;
    m.fitBounds(b, { padding: phone ? { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 40, right: 40 } : { top: 90, bottom: 60, left: 70, right: 80 }, maxZoom: 14, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Bulk import pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    bulkMarkers.current.forEach((mk) => mk.remove());
    bulkMarkers.current = (bulk ?? []).map((b) => {
      const c = categoryById(b.category);
      const btn = document.createElement('button');
      btn.className = 'pin pin--bulk' + (b.sure ? '' : ' pin--unsure') + (b.keep ? '' : ' pin--off') + (b.key === bulkFocus ? ' pin--selected' : '');
      btn.setAttribute('aria-label', `${b.name}, ${c.label}${b.sure ? '' : ', needs a pick'}`);
      btn.innerHTML = `<span class="pin__shape" style="background:${b.sure || b.keep ? c.color : '#fff'};${b.sure || b.keep ? '' : `border-color:${c.color}`}"></span><span class="pin__inner"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${b.sure || b.keep ? '#fff' : c.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg></span>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); bulkSelect.current?.(b.key); });
      return new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat([b.lng, b.lat]).addTo(m);
    });
  }, [bulk, bulkFocus]);

  // Keep every found place in view while reels are being read.
  const bulkCount = bulk?.length ?? 0;
  useEffect(() => {
    const m = map.current;
    if (!m || !bulk?.length) return;
    const b = new maplibregl.LngLatBounds();
    bulk.forEach((p) => b.extend([p.lng, p.lat]));
    const phone = window.innerWidth <= 720;
    m.fitBounds(b, { padding: phone ? { top: 60, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 } : { top: 80, bottom: 80, left: 420, right: 80 }, maxZoom: 13, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkCount]);

  // Day routes
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const src = m.getSource('routes') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: (plan ?? []).map((d, i) => ({
          type: 'Feature' as const,
          properties: { color: DAY_COLORS[i % DAY_COLORS.length], width: activeDay === d.day ? 5 : 3, opacity: !activeDay || activeDay === d.day ? 0.9 : 0.25 },
          geometry: { type: 'LineString' as const, coordinates: [...d.places, ...(d.stay ? [d.stay] : [])].map((p) => [p.lng, p.lat]) },
        })).filter((f) => f.geometry.coordinates.length > 1),
      });
    };
    if (loaded.current) draw(); else m.once('routes:refresh', draw);
  }, [plan, activeDay]);

  // Fit to the active day or the whole plan
  useEffect(() => {
    const m = map.current;
    if (!m || !plan?.length) return;
    const pts = (activeDay ? plan.filter((d) => d.day === activeDay) : plan).flatMap((d) => [...d.places, ...(d.stay ? [d.stay] : [])]);
    if (!pts.length) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 90, maxZoom: 15, duration: 600 });
  }, [plan, activeDay]);

  // Preview pin (not saved yet). Draggable so the user can nudge it onto the right spot.
  const previewKey = preview ? `${preview.name}|${preview.category}` : '';
  useEffect(() => {
    const m = map.current;
    previewMarker.current?.remove();
    previewMarker.current = undefined;
    if (!m || !preview) return;
    const c = categoryById(preview.category);
    const el = document.createElement('div');
    el.className = 'pin pin--preview';
    el.innerHTML = `<span class="pin__halo"></span><span class="pin__shape" style="background:${c.color}"></span><span class="pin__inner"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg></span><span class="pin__label">Preview · drag to adjust</span>`;
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([preview.lng, preview.lat]).addTo(m);
    mk.on('dragend', () => { const ll = mk.getLngLat(); moveRef.current?.(ll.lat, ll.lng); });
    previewMarker.current = mk;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, !!preview]);

  useEffect(() => {
    if (flyTo && map.current) {
      const h = map.current.getContainer().clientHeight;
      const phone = window.innerWidth <= 720;
      // On phones the confirm sheet covers the lower part, so keep the pin in the top third.
      map.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: Math.max(map.current.getZoom(), 14), offset: [0, phone ? -h * 0.28 : 0] });
    }
  }, [flyTo]);

  return <div ref={el} className="map" role="application" aria-label="Map of your places" />;
}
