"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, Building, CloudRain, FlaskConical, LayoutDashboard, Mountain, Network, Presentation, Siren, WavesHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { useApi } from "@/lib/hooks/useApi";
import { api } from "@/lib/api/client";
import type { CityId } from "@/lib/types";
import { LogoMark } from "@/components/shell/Logo";

const INPUTS = [
  { label: "Rain", icon: CloudRain, color: "#22d3ee", sub: "Radar + AWS nowcast" },
  { label: "Terrain", icon: Mountain, color: "#a3e635", sub: "30 m DEM" },
  { label: "Urban surface", icon: Building, color: "#fbbf24", sub: "Imperviousness" },
  { label: "Drainage", icon: Network, color: "#60a5fa", sub: "Directed drain graph" },
];
const CHAIN = [
  { label: "AI + hydraulic modelling", sub: "Physics-informed GNN trained on SWMM / HEC-RAS 2D", color: "#a78bfa" },
  { label: "Street-level flood prediction", sub: "Depth, probability & time-to-impact per road, 0–3 h", color: "#f97316" },
  { label: "Early warning", sub: "Ward alerts to responders and residents", color: "#ef4444" },
  { label: "Safe action", sub: "Rerouting, evacuation, drain crews, shelters", color: "#34d399" },
];

export default function Landing() {
  const router = useRouter();
  const setCity = useApp((s) => s.setCity);
  const { data: cities } = useApi("cities", () => api.cities());
  useEffect(() => {
    useApp.persist.rehydrate();
  }, []);

  const open = (c: CityId, to = "/command-center") => {
    setCity(c);
    router.push(to);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-950 text-slate-200">
      {/* subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "48px 48px" }}
      />
      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide text-white">Urban Flood Nowcasting System</div>
            <div className="font-mono text-[10.5px] tracking-widest text-slate-500 uppercase">Drainage &amp; rainfall coupling</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-ink-600 px-3 py-1 font-mono text-[11px] tracking-wider text-slate-400">SIH 2026 • SIH26085 • Code Sutra</span>
          <Link href="/present" className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-ink-800">
            <Presentation className="h-3.5 w-3.5" /> Presentation mode
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 pt-8 pb-16 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-cyan-300 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 blink-soft" /> Theme: Disaster Management
          </div>
          <h1 className="mt-5 text-5xl leading-[1.04] font-extrabold tracking-tight text-white md:text-[56px] xl:text-[62px]">
            PREDICT THE FLOOD.
            <br />
            <span className="text-cyan-300">PROTECT THE CITY.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            An AI-powered urban flood nowcasting system coupling rainfall, terrain and drainage behaviour to deliver street-level flood intelligence before the water arrives.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/command-center" className="flex h-12 items-center gap-2 rounded-xl bg-cyan-400 px-6 text-sm font-extrabold tracking-wider text-ink-950 uppercase shadow-[0_0_40px_rgba(34,211,238,0.25)] hover:bg-cyan-300">
              <LayoutDashboard className="h-4.5 w-4.5" /> Open command center
            </Link>
            <Link href="/scenario" className="flex h-12 items-center gap-2 rounded-xl border border-ink-500 px-6 text-sm font-extrabold tracking-wider text-white uppercase hover:bg-ink-800">
              <FlaskConical className="h-4.5 w-4.5" /> Run flood simulation
            </Link>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-4 gap-3">
            {[
              ["Where?", "street & ward"],
              ["When?", "0–3 h ahead"],
              ["How bad?", "depth in metres"],
              ["What next?", "actions & routes"],
            ].map(([q, a]) => (
              <div key={q} className="border-l-2 border-cyan-400/40 pl-3">
                <div className="font-mono text-[11px] font-bold tracking-wider text-cyan-300 uppercase">{q}</div>
                <div className="text-sm text-slate-400">{a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* pipeline visual */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.2em] text-slate-500 uppercase">Data fusion → modelling → nowcast → action</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {INPUTS.map((i) => (
              <div key={i.label} className="rounded-xl border bg-ink-850 px-2 py-3 text-center" style={{ borderColor: i.color + "55" }}>
                <i.icon className="mx-auto h-5 w-5" style={{ color: i.color }} />
                <div className="mt-1.5 text-xs font-bold tracking-wide text-white uppercase">{i.label}</div>
                <div className="text-[10px] text-slate-500">{i.sub}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-center py-1">
            <svg viewBox="0 0 320 34" className="h-8 w-full">
              {[40, 120, 200, 280].map((x) => (
                <path key={x} d={`M ${x} 0 C ${x} 20, 160 14, 160 34`} fill="none" stroke="#3b82f6" strokeWidth="1.6" className="flow-dash" opacity={0.8} />
              ))}
            </svg>
          </div>
          <div className="space-y-1">
            {CHAIN.map((c, k) => (
              <div key={c.label}>
                <div className="flex items-center gap-3 rounded-xl border bg-ink-850 px-4 py-2.5" style={{ borderColor: c.color + "55" }}>
                  <span className="h-8 w-1 rounded-full" style={{ background: c.color }} />
                  <div>
                    <div className="text-sm font-bold tracking-wide text-white uppercase">{c.label}</div>
                    <div className="text-[11.5px] text-slate-400">{c.sub}</div>
                  </div>
                </div>
                {k < CHAIN.length - 1 && (
                  <div className="flex justify-center">
                    <ArrowDown className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-y border-ink-800 bg-ink-900/60">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="max-w-4xl text-2xl leading-snug font-semibold text-white md:text-3xl">
            We don&apos;t just predict rain. We predict <span className="text-cyan-300">where</span> that rain will turn into flooding, <span className="text-cyan-300">when</span> it will happen,{" "}
            <span className="text-cyan-300">which roads</span> will become unsafe, and <span className="text-cyan-300">what the city should do next</span>.
          </p>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {[
              ["Rainfall-only forecasts", "Cannot see drain surcharging or tidal backwater", "Street-level depth maps", "Radar / AWS nowcast downscaled with DEM + drain graph"],
              ["Coarse 3–12 km NWP grids", "One cell hides many micro-topographic zones", "Physics-informed graph network", "Models drain flow, surcharging and backwater"],
              ["Static flood-hazard maps", "Not refreshed as the storm evolves", "Continuous nowcast updates", "Refreshes as new radar and gauge data arrive"],
              ["Warnings stop at the alert", "No link to responder routing or city workflows", "Alerts and API ready", "Feeds emergency-vehicle rerouting and city dashboards"],
            ].map(([a, b, c, d]) => (
              <div key={a} className="grid grid-cols-2 overflow-hidden rounded-xl border border-ink-700">
                <div className="bg-ink-900 p-4">
                  <div className="text-[10px] font-bold tracking-widest text-red-300/70 uppercase">Existing</div>
                  <div className="mt-1 font-semibold text-slate-300">{a}</div>
                  <div className="text-sm text-slate-500">{b}</div>
                </div>
                <div className="bg-cyan-400/[0.04] p-4">
                  <div className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">Our PI-GNN nowcast</div>
                  <div className="mt-1 font-semibold text-white">{c}</div>
                  <div className="text-sm text-slate-400">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[11px] font-bold tracking-[0.2em] text-cyan-400 uppercase">One-ward pilots per city</div>
            <h2 className="mt-1 text-2xl font-bold text-white">Pilot areas</h2>
          </div>
          <span className="text-xs text-slate-500">Real OSM streets &amp; SRTM terrain · simulated storm &amp; drain state</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(cities ?? []).map((c) => (
            <div key={c.id} className="group rounded-2xl border border-ink-700 bg-ink-900 p-5 transition-colors hover:border-cyan-400/40">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold text-white">{c.name}</h3>
                <span className="text-xs text-slate-500">{c.state}</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">{c.pilotArea}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini v={`${c.stats.areaKm2}`} l="km²" />
                <Mini v={`${c.stats.roadKm}`} l="road km" />
                <Mini v={`${Math.round(c.stats.population / 1000)}k`} l="residents" />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-slate-500">
                <WavesHorizontal className="h-3.5 w-3.5" /> Backwater: {c.backwater.label}
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => open(c.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-400/90 py-2 text-xs font-bold text-ink-950 hover:bg-cyan-300">
                  Command center <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => open(c.id, "/scenario")} className="rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-ink-800">
                  Simulate
                </button>
              </div>
            </div>
          ))}
          {!cities && [0, 1, 2].map((i) => <div key={i} className="h-60 animate-pulse rounded-2xl border border-ink-700 bg-ink-900" />)}
        </div>
      </section>

      <footer className="relative border-t border-ink-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Siren className="h-3.5 w-3.5 text-amber-400" /> Prototype for demonstration — rainfall, drainage state, flood depths and alerts are <b className="text-amber-300">simulated</b>.
          </span>
          <span>Roads &amp; facilities © OpenStreetMap contributors · Terrain SRTM 30 m · Basemap OpenFreeMap</span>
        </div>
      </footer>
    </div>
  );
}

function Mini({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 py-2">
      <div className="font-mono text-base font-semibold text-white">{v}</div>
      <div className="text-[10px] tracking-wider text-slate-500 uppercase">{l}</div>
    </div>
  );
}
