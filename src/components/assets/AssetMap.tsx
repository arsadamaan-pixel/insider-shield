"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AssetDetailPanel } from "@/components/assets/AssetDetailPanel";
import type { AssetEndpoint } from "@/types";

// Leaflet touches window/document at import time and can't run during
// the server render pass — dynamic(..., {ssr:false}) must itself live
// inside a Client Component (App Router disallows calling it directly
// from a Server Component), which is why this file exists separately
// from LeafletMap.tsx.
const LeafletMap = dynamic(() => import("@/components/assets/LeafletMap").then((mod) => mod.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export function AssetMap({ assets }: { assets: AssetEndpoint[] }) {
  const [selected, setSelected] = useState<AssetEndpoint | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <LeafletMap assets={assets} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </div>
      <div className="lg:col-span-1">
        <AssetDetailPanel asset={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}
