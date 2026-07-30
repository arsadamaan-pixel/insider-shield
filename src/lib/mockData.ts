import type { DlpAlert, DlpSeverity, MockEmployee } from "@/types";
import { CITIES, seededRandom } from "@/lib/geo";
import { riskLevelFromScore } from "@/lib/risk";

// Synthetic data only — no real employee, device, or incident records.
// Intended for local dashboard development before the ingestion
// pipeline (Phase 3 backend work) has real telemetry to show.

const FIRST_NAMES = [
  "Amara", "Kavindu", "Nadia", "Ishan", "Priya", "Rashmi", "Tharindu",
  "Dilani", "Sanjay", "Chamari", "Ruwan", "Nethmi", "Kasun", "Sithara",
];
const LAST_NAMES = [
  "Perera", "Fernando", "Silva", "Jayasuriya", "Wickramasinghe",
  "Bandara", "Gunawardena", "Rathnayake", "de Mel", "Herath",
];
const DEPARTMENTS = ["Engineering", "Finance", "Sales", "HR", "Legal", "IT Ops"];
const TITLES = ["Analyst", "Engineer", "Manager", "Coordinator", "Specialist", "Lead"];

const DLP_RULES: { name: DlpAlert["ruleName"]; severity: DlpSeverity }[] = [
  { name: "credit_card_like", severity: "high" },
  { name: "ssn_like", severity: "critical" },
  { name: "api_key_like", severity: "high" },
  { name: "large_paste", severity: "medium" },
  { name: "large_copy_selection", severity: "low" },
];

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

export function generateMockEmployees(count = 24, seed = 42): MockEmployee[] {
  const rand = seededRandom(seed);
  const employees: MockEmployee[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(rand, FIRST_NAMES);
    const last = pick(rand, LAST_NAMES);
    const location = pick(rand, CITIES);
    const riskScore = Math.floor(rand() * 100);
    const status: MockEmployee["status"] = rand() > 0.92 ? "suspended" : rand() > 0.85 ? "offboarded" : "active";

    employees.push({
      id: `emp-${i + 1}`,
      fullName: `${first} ${last}`,
      // Indexed to guarantee uniqueness — first/last name combinations
      // can collide across a large enough sample.
      email: `${first}.${last}.${i + 1}`.toLowerCase() + "@insider-shield.dev",
      department: pick(rand, DEPARTMENTS),
      title: pick(rand, TITLES),
      status,
      riskLevel: riskLevelFromScore(riskScore),
      riskScore,
      managedDeviceId: rand() > 0.1 ? `dev-${1000 + i}` : null,
      lastSeenAt: new Date(Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 24 * 3)).toISOString(),
      location: {
        city: location.city,
        country: location.country,
        lat: location.lat + (rand() - 0.5) * 0.5,
        lng: location.lng + (rand() - 0.5) * 0.5,
      },
    });
  }

  return employees;
}

export function generateMockDlpAlerts(employees: MockEmployee[], count = 18, seed = 7): DlpAlert[] {
  const rand = seededRandom(seed);
  const alerts: DlpAlert[] = [];

  for (let i = 0; i < count; i++) {
    const employee = pick(rand, employees);
    const rule = pick(rand, DLP_RULES);
    const geoViolation = rand() > 0.8;

    alerts.push({
      id: `alert-${i + 1}`,
      employeeId: employee.id,
      employeeName: employee.fullName,
      hostname: pick(rand, ["docs.google.com", "mail.corp.internal", "github.com", "notion.so", "slack.com"]),
      ruleName: rule.name,
      severity: geoViolation ? "critical" : rule.severity,
      excerptRedacted: "sk************ey",
      ts: new Date(Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 48)).toISOString(),
      geoViolation,
      acknowledged: rand() > 0.7,
    });
  }

  return alerts.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export interface DashboardSnapshot {
  employees: MockEmployee[];
  alerts: DlpAlert[];
  totalEndpointPings: number;
  highSeverityAlertCount: number;
  geoViolationCount: number;
  riskScore: number; // aggregate 0-100, drives the gauge
}

export function generateDashboardSnapshot(): DashboardSnapshot {
  const employees = generateMockEmployees();
  const alerts = generateMockDlpAlerts(employees);

  const highSeverityAlertCount = alerts.filter((a) => a.severity === "high" || a.severity === "critical").length;
  const geoViolationCount = alerts.filter((a) => a.geoViolation).length;
  const avgRisk = Math.round(employees.reduce((sum, e) => sum + e.riskScore, 0) / employees.length);

  return {
    employees,
    alerts,
    totalEndpointPings: employees.filter((e) => e.managedDeviceId).length * 288, // ~ every 5 min/day
    highSeverityAlertCount,
    geoViolationCount,
    riskScore: avgRisk,
  };
}
