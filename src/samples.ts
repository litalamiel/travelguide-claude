import type { Place } from './types';

// Sample places so the map isn't empty on first open. Coordinates are approximate.
export const SAMPLE_PLACES: Place[] = [
  { id: 's1', name: 'Pastéis de Belém', lat: 38.6975, lng: -9.2032, category: 'coffee', source: 'sample', mustSee: true },
  { id: 's2', name: 'Jerónimos Monastery', lat: 38.6979, lng: -9.2068, category: 'sights', source: 'sample' },
  { id: 's3', name: 'Belém Tower', lat: 38.6916, lng: -9.216, category: 'sights', source: 'sample' },
  { id: 's4', name: 'LX Factory', lat: 38.7037, lng: -9.1785, category: 'shopping', source: 'sample' },
  { id: 's5', name: 'Time Out Market', lat: 38.7069, lng: -9.1459, category: 'eat', source: 'sample' },
  { id: 's6', name: 'Manteigaria', lat: 38.7108, lng: -9.143, category: 'coffee', source: 'sample' },
  { id: 's7', name: 'Miradouro de Santa Luzia', lat: 38.7116, lng: -9.1301, category: 'views', source: 'sample' },
  { id: 's8', name: 'São Jorge Castle', lat: 38.7139, lng: -9.1335, category: 'sights', source: 'sample', mustSee: true },
  { id: 's9', name: 'Miradouro da Senhora do Monte', lat: 38.7193, lng: -9.1327, category: 'views', source: 'sample' },
  { id: 's10', name: 'Pena Palace', lat: 38.7876, lng: -9.3906, category: 'sights', source: 'sample', mustSee: true },
  { id: 's11', name: 'Cabo da Roca', lat: 38.7804, lng: -9.4989, category: 'nature', source: 'sample' },
  { id: 's12', name: 'Praia da Comporta', lat: 38.3797, lng: -8.7966, category: 'beaches', source: 'sample' },
  { id: 's13', name: 'Roman Temple of Évora', lat: 38.5728, lng: -7.9073, category: 'sights', source: 'sample' },
  { id: 's14', name: 'Memmo Alfama', lat: 38.7111, lng: -9.1300, category: 'stay', address: 'Travessa das Merceeiras 27, Lisbon', source: 'sample' },
  { id: 's15', name: 'Tivoli Palácio de Seteais', lat: 38.7955, lng: -9.3958, category: 'stay', address: 'Rua Barbosa du Bocage 8, Sintra', source: 'sample' },
];
