import type { GeoLocation } from "@/lib/geo";

export type EmployeeStatus = "active" | "suspended" | "offboarded";

export type RiskLevel = "low" | "medium" | "high" | "critical";

// Synthetic shape produced by src/lib/mockData.ts — used only there and
// by pages still on mock data (e.g. policies/page.tsx's Header stats).
export interface MockEmployee {
  id: string;
  fullName: string;
  email: string;
  department: string;
  title: string;
  status: EmployeeStatus;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  managedDeviceId: string | null;
  lastSeenAt: string; // ISO timestamp
  location: GeoLocation;
}

// Real Prisma-backed shape used by users/page.tsx and assets/page.tsx.
// riskLevel is computed on read (src/lib/risk.ts), never persisted.
export interface EnrichedEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string | null;
  riskScore: number;
  riskLevel: RiskLevel;
  status: EmployeeStatus;
  managedDeviceId: string | null;
  lastSeenAt: string | null; // ISO timestamp
  lastKnownIp: string | null;
  createdAt: string; // ISO timestamp
  offboardedAt: string | null; // ISO timestamp
}
