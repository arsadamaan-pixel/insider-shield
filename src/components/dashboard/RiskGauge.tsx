"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

interface RiskGaugeProps {
  score: number; // 0-100
}

function colorForScore(score: number) {
  if (score >= 75) return "#f87171"; // red-400
  if (score >= 50) return "#fbbf24"; // amber-400
  return "#34d399"; // emerald-400
}

export function RiskGauge({ score }: RiskGaugeProps) {
  const data = [{ name: "risk", value: score, fill: colorForScore(score) }];

  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-2 text-xs text-slate-500">Aggregate Risk Score</p>
      <div className="relative h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={12}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#1e293b" }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-slate-100">{score}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">/ 100</span>
        </div>
      </div>
    </div>
  );
}
