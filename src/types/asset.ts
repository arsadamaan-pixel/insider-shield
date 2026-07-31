import type { GeoLocation } from "@/lib/geo";

// Composite shape for the Geo-Compliance Asset Map — an Employee row
// enriched with a deterministic map position (src/lib/geo.ts),
// compliance status (derived from DlpAlert.geoViolation), and the most
// recent Heartbeat data available for that employee, if any.
export interface AssetEndpoint {
  id: string;
  employeeName: string;
  employeeEmail: string;
  managedDeviceId: string;
  location: GeoLocation;
  // True when no real GeoIP match was available (no GEOIP_DB_PATH
  // configured, a private/unset IP, or no match in the database) and
  // `location` is the deterministic mock fallback instead — see
  // src/lib/geo.ts's resolveEmployeeGeo(). Surfaced in the UI so a real
  // and a fake position are never visually indistinguishable on a
  // geo-compliance map.
  approximate: boolean;
  compliant: boolean;
  os: string | null;
  ipAddress: string | null;
  lastHeartbeat: string | null; // ISO timestamp
}
