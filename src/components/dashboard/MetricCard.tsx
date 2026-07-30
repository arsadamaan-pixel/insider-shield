import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "critical";
}

const TONE_STYLES: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "text-emerald-400 bg-emerald-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  critical: "text-red-400 bg-red-500/10",
};

export function MetricCard({ label, value, icon: Icon, tone = "default" }: MetricCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-md ${TONE_STYLES[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-slate-100">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
