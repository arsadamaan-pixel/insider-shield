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
  compliant: boolean;
  os: string | null;
  ipAddress: string | null;
  lastHeartbeat: string | null; // ISO timestamp
}
