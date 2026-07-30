"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { AssetEndpoint } from "@/types";

const DEFAULT_CENTER: [number, number] = [10, 20];

interface LeafletMapProps {
  assets: AssetEndpoint[];
  selectedId: string | null;
  onSelect: (asset: AssetEndpoint) => void;
}

export function LeafletMap({ assets, selectedId, onSelect }: LeafletMapProps) {
  return (
    <div className="h-[28rem] overflow-hidden rounded-lg border border-slate-800">
      <MapContainer center={DEFAULT_CENTER} zoom={2} minZoom={2} worldCopyJump className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {assets.map((asset) => (
          <CircleMarker
            key={asset.id}
            center={[asset.location.lat, asset.location.lng]}
            radius={asset.id === selectedId ? 10 : 7}
            pathOptions={{
              color: asset.compliant ? "#10b981" : "#ef4444",
              fillColor: asset.compliant ? "#10b981" : "#ef4444",
              fillOpacity: 0.6,
              weight: asset.id === selectedId ? 3 : 1.5,
            }}
            eventHandlers={{ click: () => onSelect(asset) }}
          >
            <Tooltip>
              {asset.employeeName} — {asset.compliant ? "Compliant" : "Violation"}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
