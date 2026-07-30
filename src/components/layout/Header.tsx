import { AlertTriangle, Radio } from "lucide-react";

interface HeaderProps {
  title: string;
  highSeverityAlertCount: number;
  riskScore: number; // 0-100
}

function statusFromRiskScore(riskScore: number) {
  if (riskScore >= 75) return { label: "Critical", className: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (riskScore >= 50) return { label: "Elevated", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: "Nominal", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
}

export function Header({ title, highSeverityAlertCount, riskScore }: HeaderProps) {
  const status = statusFromRiskScore(riskScore);

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
      <h1 className="text-lg font-semibold text-slate-100">{title}</h1>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          Threat Status: {status.label}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          {highSeverityAlertCount} high-severity alerts
        </div>
      </div>
    </header>
  );
}
