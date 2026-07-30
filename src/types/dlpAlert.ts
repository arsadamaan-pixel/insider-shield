export type DlpSeverity = "low" | "medium" | "high" | "critical";

export type DlpRuleName =
  | "credit_card_like"
  | "ssn_like"
  | "api_key_like"
  | "large_paste"
  | "large_copy_selection"
  | "large_cut_selection"
  | (string & {});

export interface DlpAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  hostname: string;
  ruleName: DlpRuleName;
  severity: DlpSeverity;
  excerptRedacted: string;
  ts: string; // ISO timestamp
  geoViolation: boolean;
  acknowledged: boolean;
}
