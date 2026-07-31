"use client";

import { useState } from "react";
import { TokenGeneratorCard } from "@/components/provisioning/TokenGeneratorCard";
import { TokenTable } from "@/components/provisioning/TokenTable";
import type { ProvisioningEmployeeOption, ProvisioningToken } from "@/types";

interface ProvisioningWorkspaceProps {
  initialTokens: ProvisioningToken[];
  employees: ProvisioningEmployeeOption[];
}

// Single stateful parent tying the generator card and the table
// together (mirrors src/components/users/EmployeeTable.tsx's own
// state + OffboardModal callback pattern) — a freshly generated token
// needs to show up in the table immediately, and a revoked one needs
// to flip status immediately, neither of which the initial server-
// rendered props alone can do.
export function ProvisioningWorkspace({ initialTokens, employees }: ProvisioningWorkspaceProps) {
  const [tokens, setTokens] = useState(initialTokens);

  function handleGenerated(token: ProvisioningToken) {
    setTokens((prev) => [token, ...prev]);
  }

  function handleRevoked(id: string) {
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "revoked", revokedAt: new Date().toISOString() } : t))
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TokenGeneratorCard employees={employees} onGenerated={handleGenerated} />
      <TokenTable tokens={tokens} onRevoked={handleRevoked} />
    </div>
  );
}
