export interface GeoLocation {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

// Formalizes what was previously ad-hoc mock-city logic in mockData.ts
// into a reusable helper. Not a real IP->geo lookup — see PLAN.md/the
// Phase 4 plan for why: real GeoIP would show nothing useful for
// localhost/private IPs in local dev, and needs a new dependency. This
// deterministically assigns each employee a stable position instead.
export const CITIES: GeoLocation[] = [
  { city: "Colombo", country: "Sri Lanka", lat: 6.9271, lng: 79.8612 },
  { city: "London", country: "United Kingdom", lat: 51.5072, lng: -0.1276 },
  { city: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { city: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { city: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
  { city: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
];

// Small deterministic PRNG (mulberry32) so the same seed always produces
// the same sequence — used both for mockData.ts's synthetic generator
// and (via geoForEmployee below) for stable per-employee positioning.
export function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a-style string hash, feeding seededRandom so a given employee id
// always resolves to the same city + jitter, independent of any other
// generator's sequence.
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function geoForEmployee(employee: { id: string }): GeoLocation {
  const rand = seededRandom(hashSeed(employee.id));
  const base = CITIES[Math.floor(rand() * CITIES.length)];
  return {
    city: base.city,
    country: base.country,
    lat: base.lat + (rand() - 0.5) * 0.5,
    lng: base.lng + (rand() - 0.5) * 0.5,
  };
}
