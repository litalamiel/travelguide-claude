import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { DayPlan, PendingPlace, Place } from './types';
import { categoryById } from './categories';

// Free OpenStreetMap vector tiles from OpenFreeMap — no API key, live and zoomable.
// To switch to Google Maps later, replace this component (see README).
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const DAY_COLORS = ['#1d4ed8', '#c2410c', '#15803d', '#7c3aed', '#0e7490', '#be185d', '#a16207', '#475569'];

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
}

export default function MapView({ places, selectedId, onSelect, onCenterChange, plan, activeDay, flyTo, preview, onPreviewMove }: Props) {
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
      m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1, 1.5] },
      });
      m.fire('routes:refresh');
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = places.map((p) => {
      const c = categoryById(p.category);
      const dayIndex = plan?.findIndex((d) => d.places.some((q) => q.id === p.id)) ?? -1;
      const stop = dayIndex >= 0 ? plan![dayIndex].places.findIndex((q) => q.id === p.id) + 1 : 0;
      // MapLibre sets `transform` on the marker element, so the rotated teardrop lives in a child.
      const btn = document.createElement('button');
      btn.className = 'pin' + (p.id === selectedId ? ' pin--selected' : '') + (plan && activeDay && dayIndex + 1 !== activeDay ? ' pin--dim' : '');
      btn.setAttribute('aria-label', `${p.name}, ${c.label}`);
      const color = plan && dayIndex >= 0 ? DAY_COLORS[dayIndex % DAY_COLORS.length] : c.color;
      const inner = stop
        ? `<span class="pin__num">${stop}</span>`
        : `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg>`;
      btn.innerHTML = `<span class="pin__shape" style="background:${color}"></span><span class="pin__inner">${inner}</span>` +
        (p.source === 'reel' ? (p.photos?.[0] ? `<span class="pin__badge" style="background-image:url('${p.photos[0]}')"></span>` : '<span class="pin__badge pin__badge--play">▶</span>') : '');
      btn.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p.id); });
      return new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m);
    });
  }, [places, selectedId, plan, activeDay, onSelect]);

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
    el.innerHTML = `<span class="pin__halo"></span><span class="pin__shape" style="background:${c.color}"></span><span class="pin__inner"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg></span><span class="pin__label">Preview · drag to adjust</span>`;
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
