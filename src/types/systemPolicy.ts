export interface SensitivePatternRule {
  name: string;
  pattern: string; // regex source, matched against the same names the extension uses
}

// Mirrors the endpoint agent's policy shape (extension/background/background.js
// DEFAULT_POLICY) so OTA updates round-trip without translation.
export interface SystemPolicy {
  dlpEnabled: boolean;
  transmitEvents: boolean;
  sensitivePatterns: SensitivePatternRule[];
  heartbeatIntervalMs: number;
  wsEndpoint: string;
  updatedAt: string; // ISO timestamp
}
