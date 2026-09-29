"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { useApi } from "@/lib/hooks/useApi";
import { useThemeSync } from "@/lib/hooks/theme";
import { api } from "@/lib/api/client";
import type { CityId } from "@/lib/types";
import { LogoMark } from "@/components/shell/Logo";

const STEPS = [
  { n: 1, title: "Data fusion", body: "Radar and gauge rainfall, 30 m terrain, urban surface and the stormwater drain graph are aligned on one street network." },
  { n: 2, title: "AI + hydraulic modelling", body: "A physics-informed graph network, trained on SWMM / HEC-RAS 2D runs, couples rainfall with drain flow, surcharge and backwater." },
  { n: 3, title: "Street-level flood prediction", body: "Water depth, exceedance probability and time-to-impact for every road segment, 0–3 hours ahead, refreshed every 5 minutes." },
  { n: 4, title: "Early warning", body: "Threshold alerts by ward to control rooms, responders and residents." },
  { n: 5, title: "Safe action", body: "Flood-aware ambulance routing, evacuation corridors, drain crews and shelter activation." },
];

const OUTCOMES = [
  { q: "Where", a: "Which streets and wards will flood — not just which 5 km weather cell gets rain." },
  { q: "When", a: "Minutes until each road becomes unsafe, with the peak and the recession." },
  { q: "How severe", a: "Predicted water depth in metres and the probability of exceeding 0.3 m." },
  { q: "What next", a: "Prioritised actions: divert traffic, dispatch crews, reroute ambulances, open shelters." },
];

const COMPARE = [
  ["Rainfall-only forecasts", "Cannot see drain surcharging or tidal backwater", "Rainfall nowcast downscaled with the DEM and drain graph"],
  ["Coarse 3–12 km NWP grids", "One cell hides many micro-topographic low spots", "Street-level depth on a 30 m terrain model"],
  ["Static flood-hazard maps", "Not refreshed as the storm evolves", "Continuous updates as new radar and gauge data arrive"],
  ["Warnings stop at the alert", "No link to responder routing or city workflows", "Alerts feed routing, evacuation and a city API"],
];

export default function Landing() {
  const router = useRouter();
  const setCity = useApp((s) => s.setCity);
  const { data: cities } = useApi("cities", () => api.cities());
  useEffect(() => {
    useApp.persist.rehydrate();
  }, []);
  useThemeSync();

  const open = (c: CityId, to = "/command-center") => {
    setCity(c);
    router.push(to);
  };

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-7" />
            <span className="text-[15px] font-semibold">FloodNowcast</span>
          </Link>
          <nav className="hidden items-center gap-5 text-[13px] text-fg-3 md:flex">
            <Link href="/command-center" className="hover:text-fg">
              Command center
            </Link>
            <Link href="/scenario" className="hover:text-fg">
              Scenario simulator
            </Link>
            <Link href="/architecture" className="hover:text-fg">
              Architecture
            </Link>
            <Link href="/present" className="hover:text-fg">
              Presentation
            </Link>
          </nav>
          <div className="flex-1" />
          <span className="hidden text-xs text-fg-4 lg:inline">SIH 2026 · SIH26085 · Code Sutra</span>
          <Link href="/command-center" className="flex h-8 items-center rounded bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
            Open command center
          </Link>
        </div>
      </header>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <p className="text-[13px] font-medium text-accent">Smart India Hackathon 2026 · Disaster Management</p>
            <h1 className="mt-3 text-[44px] leading-[1.1] font-semibold text-fg md:text-[52px]">
              Predict the flood.
              <br />
              Protect the city.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-2">
              An AI-powered urban flood nowcasting system coupling rainfall, terrain and drainage behaviour to deliver street-level flood intelligence before the water arrives.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/command-center" className="flex h-10 items-center gap-2 rounded bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover">
                Open command center <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/scenario" className="flex h-10 items-center rounded border border-line-strong px-5 text-sm font-medium text-fg hover:bg-surface-3">
                Run flood simulation
              </Link>
            </div>
            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
              {[
                ["0–3 h", "nowcast horizon"],
                ["30 m", "terrain resolution"],
                ["5 min", "update cycle"],
                ["3", "pilot cities"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-semibold text-fg tnum">{v}</dt>
                  <dd className="text-[13px] text-fg-3">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded border border-line bg-surface-2 p-6">
            <div className="text-[13px] font-semibold text-fg">How it works</div>
            <div className="mt-1 text-[13px] text-fg-3">Data fusion → modelling → nowcast → action</div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {["Rain", "Terrain", "Urban surface", "Drainage"].map((x) => (
                <div key={x} className="rounded border border-line bg-surface px-2 py-2 text-center text-[13px] font-medium text-fg-2">
                  {x}
                </div>
              ))}
            </div>
            <ol className="relative mt-5 space-y-4">
              <span className="absolute top-2 bottom-2 left-[11px] w-px bg-line-strong" aria-hidden />
              {STEPS.map((s) => (
                <li key={s.n} className="relative flex gap-3">
                  <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent bg-surface text-xs font-semibold text-accent">{s.n}</span>
                  <div>
                    <div className="text-sm font-semibold text-fg">{s.title}</div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="max-w-3xl text-2xl leading-snug font-semibold text-fg">
            We don&apos;t just predict rain. We predict where it turns into flooding, when it happens, which roads become unsafe, and what the city should do next.
          </h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOMES.map((o) => (
              <div key={o.q} className="bg-surface p-5">
                <div className="text-sm font-semibold text-accent">{o.q}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-xl font-semibold text-fg">Why a rainfall forecast is not enough</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-fg-3">The differentiator is the coupling between rainfall and drainage behaviour, resolved at street level.</p>
          <table className="mt-6 w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-fg-3">
                <th className="py-2 pr-4 font-medium">Existing approach</th>
                <th className="py-2 pr-4 font-medium">Limitation</th>
                <th className="py-2 font-medium">This system</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([a, b, c]) => (
                <tr key={a} className="border-b border-line">
                  <td className="py-3 pr-4 font-medium text-fg">{a}</td>
                  <td className="py-3 pr-4 text-fg-3">{b}</td>
                  <td className="py-3 text-fg-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-xl font-semibold text-fg">Pilot areas</h2>
          <p className="mt-1 text-[13px] text-fg-3">One ward cluster per city before scale-up. Real street network and terrain; simulated storm and drain state.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {(cities ?? []).map((c) => (
              <div key={c.id} className="flex flex-col rounded border border-line bg-surface p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-fg">{c.name}</h3>
                  <span className="text-xs text-fg-4">{c.state}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-fg-3">{c.pilotArea}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-line py-3">
                  <Mini v={`${c.stats.areaKm2}`} l="km²" />
                  <Mini v={`${c.stats.roadKm}`} l="road km" />
                  <Mini v={`${Math.round(c.stats.population / 1000)}k`} l="residents" />
                </dl>
                <p className="mt-3 flex-1 text-xs text-fg-3">Backwater: {c.backwater.label}</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => open(c.id)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-accent text-[13px] font-medium text-white hover:bg-accent-hover">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => open(c.id, "/scenario")} className="h-8 rounded border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-3">
                    Simulate
                  </button>
                </div>
              </div>
            ))}
            {!cities && [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded border border-line bg-surface" />)}
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-fg-4">
          <span>Prototype for demonstration. Rainfall, drainage state, flood depths and alerts are simulated.</span>
          <span>Roads and facilities © OpenStreetMap contributors · Terrain SRTM 30 m · Basemap OpenFreeMap</span>
        </div>
      </footer>
    </div>
  );
}

function Mini({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <dt className="text-base font-semibold text-fg tnum">{v}</dt>
      <dd className="text-xs text-fg-4">{l}</dd>
    </div>
  );
}
