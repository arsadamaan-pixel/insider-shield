export type EmployeeStatus = "active" | "suspended" | "offboarded";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Employee {
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
  location: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
}
