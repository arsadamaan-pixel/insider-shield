import { open, validate, type CityResponse, type Reader } from "maxmind";
import type { GeoLocation } from "@/lib/geo";

// Lazily opens the local MaxMind GeoLite2-City database (see
// .env.example's GEOIP_DB_PATH for how to obtain one) and caches the
// result — same globalThis-singleton pattern as src/lib/prisma.ts,
// guarding against this module being loaded twice by separate module
// loaders (tsx for server.ts vs. Next's own loader for route handlers).
//
// Absent env var, missing file, or a corrupt DB all collapse to "no
// reader" (logged once) rather than throwing — GeoIP is an enhancement
// over the deterministic mock in geo.ts, never a hard dependency.

const g = globalThis as unknown as { __geoipReader?: Promise<Reader<CityResponse> | null> };

function loadReader(): Promise<Reader<CityResponse> | null> {
  const dbPath = process.env.GEOIP_DB_PATH;
  if (!dbPath) return Promise.resolve(null);

  return open<CityResponse>(dbPath).catch((err: unknown) => {
    console.warn(
      `[geoip] could not open GEOIP_DB_PATH="${dbPath}" — falling back to mock locations:`,
      err instanceof Error ? err.message : err
    );
    return null;
  });
}

function getReader(): Promise<Reader<CityResponse> | null> {
  if (!g.__geoipReader) g.__geoipReader = loadReader();
  return g.__geoipReader;
}

// RFC1918 (v4) + loopback/link-local (v4/v6) + unique-local (v6) ranges
// — local dev traffic (127.0.0.1, ::1, 192.168.x.x, etc.) is always one
// of these, and a real GeoIP DB has nothing useful to say about them.
const PRIVATE_V4_PATTERNS = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./];

export function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (PRIVATE_V4_PATTERNS.some((re) => re.test(v4))) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("fe80")) return true; // link-local
  return false;
}

export async function lookupIp(ip: string | null | undefined): Promise<GeoLocation | null> {
  if (!ip || !validate(ip) || isPrivateOrReservedIp(ip)) return null;

  const reader = await getReader();
  if (!reader) return null;

  const result = reader.get(ip);
  const city = result?.city?.names.en;
  const country = result?.country?.names.en;
  const lat = result?.location?.latitude;
  const lng = result?.location?.longitude;
  if (!city || !country || lat === undefined || lng === undefined) return null;

  return { city, country, lat, lng };
}
