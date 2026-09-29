"use client";
import { Ambulance, Car, Flame, Hospital, ShieldCheck, Siren, Tent, Truck } from "lucide-react";
import type { Incident, Poi, RiskLevel, Sector } from "@/lib/types";
import { RISK_COLOR, UNSAFE_DEPTH } from "@/lib/engine/constants";
import { cx } from "../ui/primitives";

const POI_STYLE = {
  hospital: { Icon: Hospital, bg: "#ffffff", fg: "#dc2626", ring: "#dc2626", label: "Hospital" },
  fire: { Icon: Flame, bg: "#ffffff", fg: "#ea580c", ring: "#ea580c", label: "Fire station" },
  police: { Icon: ShieldCheck, bg: "#ffffff", fg: "#1d4ed8", ring: "#1d4ed8", label: "Police station" },
  shelter: { Icon: Tent, bg: "#ffffff", fg: "#047857", ring: "#047857", label: "Relief shelter" },
} as const;

export function PoiMarker({ poi, visible, accessDepth, selected, onClick, showLabel }: { poi: Poi; visible: boolean; accessDepth: number; selected: boolean; onClick: () => void; showLabel?: boolean }) {
  const s = POI_STYLE[poi.kind];
  const atRisk = poi.kind !== "shelter" && accessDepth >= UNSAFE_DEPTH;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${poi.id} · ${poi.name}${atRisk ? " — access road flooding" : ""}`}
      className={cx("group relative flex items-center justify-center transition-opacity", visible ? "opacity-100" : "pointer-events-none opacity-0")}
    >
      {atRisk && <span className="pulse-ring absolute h-6 w-6 rounded-full border-2 border-red-500" />}
      <span
        className={cx("flex items-center justify-center rounded-full border-[1.5px] shadow-md", poi.kind === "shelter" ? "h-[18px] w-[18px]" : "h-5 w-5", selected && "scale-125")}
        style={{ background: s.bg, borderColor: atRisk ? "#dc2626" : s.ring }}
      >
        <s.Icon className={poi.kind === "shelter" ? "h-2.5 w-2.5" : "h-3 w-3"} style={{ color: s.fg }} strokeWidth={2.6} />
      </span>
      {poi.kind === "shelter" && (selected || showLabel) && (
        <span className="absolute top-5 rounded bg-emerald-700 px-1 font-mono text-[9px] font-bold text-white shadow">{poi.id}</span>
      )}
    </button>
  );
}

export function SectorLabel({ sector, visible, risk, onClick }: { sector: Sector; visible: boolean; risk?: RiskLevel; onClick: () => void }) {
  const c = risk && risk !== "safe" ? RISK_COLOR[risk] : "#334155";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx("rounded-md border bg-white/85 px-1.5 py-0.5 text-center shadow-sm backdrop-blur-[1px] transition-opacity", visible ? "opacity-100" : "pointer-events-none opacity-0")}
      style={{ borderColor: c + "99" }}
      title={`${sector.name} · ${sector.locality} — click for impact`}
    >
      <div className="text-[9px] leading-3 font-extrabold tracking-wider uppercase" style={{ color: c }}>
        {sector.name}
      </div>
      <div className="max-w-24 truncate text-[8.5px] leading-3 text-slate-600">{sector.locality}</div>
    </button>
  );
}

export function IncidentMarker({ incident, visible, onClick }: { incident: Incident; visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${incident.id} · ${incident.name}`}
      className={cx("relative flex flex-col items-center transition-opacity", visible ? "opacity-100" : "pointer-events-none opacity-0")}
    >
      <span className="pulse-ring absolute top-0 h-8 w-8 rounded-full border-2 border-red-600" />
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-red-600 shadow-lg">
        <Siren className="h-4 w-4 text-white" strokeWidth={2.5} />
      </span>
      <span className="-mt-0.5 h-2 w-0.5 bg-red-600" />
    </button>
  );
}

export function VehicleMarker({ kind, label, active }: { kind: "ambulance" | "fire" | "police"; label?: string; active?: boolean }) {
  const Icon = kind === "ambulance" ? Ambulance : kind === "fire" ? Truck : Car;
  const bg = kind === "ambulance" ? "#0891b2" : kind === "fire" ? "#ea580c" : "#1d4ed8";
  return (
    <div className="relative flex flex-col items-center" title={label}>
      {active && <span className="pulse-ring absolute h-9 w-9 rounded-full border-2" style={{ borderColor: bg }} />}
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-white shadow-lg" style={{ background: bg }}>
        <Icon className="h-4 w-4 text-white" strokeWidth={2.4} />
      </span>
      {label && <span className="mt-0.5 rounded bg-ink-900/85 px-1 font-mono text-[9px] font-semibold text-white">{label}</span>}
    </div>
  );
}
