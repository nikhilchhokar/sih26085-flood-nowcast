"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { useApp, DEFAULT_LAYERS } from "@/lib/store";
import { useAlerts, useNetwork, useNowcast, useRainfall } from "@/lib/hooks/data";
import { api } from "@/lib/api/client";
import { maxOver, onsetClock, sample, summarize } from "@/lib/engine/analysis";
import { NOW_CLOCK, RISK_COLOR, RISK_TEXT, UNSAFE_DEPTH, clockLabel, riskOf } from "@/lib/engine/constants";
import type { RouteResponse } from "@/lib/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { useTauTween } from "@/components/map/overlays";
import { LogoMark } from "@/components/shell/Logo";
import { Loading, SeverityBadge, cx } from "@/components/ui/primitives";

const STAGES = ["Current conditions","Next 60 min","Flood risk","Critical roads","Alerts","Safe route","Recommended actions"];
const TAU = [0, 60, 90, 90, 60, 60, 120];

export default function PresentPage() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const { data: ds } = useNetwork();
  const { data: now } = useNowcast();
  const { data: al } = useAlerts();
  const { data: rain } = useRainfall();
  const tau = useApp((s) => s.tau);
  const tween = useTauTween();

  useEffect(() => {
    useApp.persist.rehydrate();
  }, []);

  useEffect(() => {
    tween(TAU[Math.min(stage, TAU.length - 1)], 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "" || e.key === "PageDown") {
        e.preventDefault();
        setStage((s) => Math.min(STAGES.length, s + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") setStage((s) => Math.max(0, s - 1));
      else if (e.key === "Escape") router.push("/command-center");
      else if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    if (!ds || route) return;
    api
      .routes({ city: ds.id, vehicle: "ambulance", originId: ds.hero.hospitalId, destination: { incidentId: ds.hero.incidentId }, clock: NOW_CLOCK + 60 })
      .then(setRoute)
      .catch(() => {});
  }, [ds, route]);

  const res = now?.result;
  const summary = useMemo(() => (ds && res ? summarize(ds, res) : null), [ds, res]);
  const at = (c: number) => {
    if (!ds || !res) return { unsafe: 0, surcharged: 0 };
    return {
      unsafe: ds.roads.filter((r, i) => r.major && sample(res.roads.depth[i], res, c) >= UNSAFE_DEPTH).length,
      surcharged: ds.drainNodes.filter((_, k) => sample(res.nodes.pond[k], res, c) >= 0.05).length,
    };
  };
  const heroNodeK = ds ? ds.drainNodes.findIndex((n) => n.id === ds.hero.nodeId) : -1;
  const critical = useMemo(() => {
    if (!ds || !res) return [];
    return ds.roads
      .map((r, i) => ({ r, pk: maxOver(res.roads.depth[i], res, NOW_CLOCK, NOW_CLOCK + 180), on: onsetClock(res.roads.depth[i], res, NOW_CLOCK, UNSAFE_DEPTH) }))
      .filter((x) => x.r.major && !x.r.name.startsWith("Unnamed"))
      .sort((a, b) => b.pk.max - a.pk.max)
      .filter((x, i, arr) => arr.findIndex((y) => y.r.name === x.r.name) === i)
      .slice(0, 5);
  }, [ds, res]);

  const layers = {
    ...DEFAULT_LAYERS,
    rain: stage <= 1,
    drainage: stage === 1,
    flow: stage === 1,
    risk: stage >= 2 && stage !== 5,
    depth: stage >= 1,
    routes: stage === 5,
    shelters: stage === 6,
    infra: stage >= 5,
  };
  const heroRoad = ds?.roads.find((r) => r.id === ds.hero.roadId);
  const heroMid = heroRoad?.coords[Math.floor(heroRoad.coords.length / 2)];
  const focus = ds
    ? stage === 0 || stage === 2
      ? { center: ds.center, zoom: 13.4, key: stage + 1 }
      : stage === 5 && route
        ? { center: route.destination.coord, zoom: 14.1, key: 60 }
        : heroMid
          ? { center: heroMid, zoom: stage === 3 ? 14.3 : 14.0, key: stage + 1 }
          : null
    : null;

  if (stage >= STAGES.length) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface px-10 text-center">
        <LogoMark className="h-16 w-16" />
        <p className="mt-8 max-w-5xl text-5xl leading-tight font-semibold tracking-tight text-fg">
          We don&apos;t just predict rain.
          <br />
          <span className="text-fg-2">We predict where it turns into flooding, when it will happen, which roads become unsafe — </span>
          <span className="text-accent">and what the city should do next.</span>
        </p>
        <p className="mt-8 font-mono text-lg text-fg-4">From rainfall data → street-level flood intelligence → action</p>
        <div className="mt-10 flex gap-3">
          <button type="button" onClick={() => setStage(0)} className="rounded border border-line-strong px-4 py-2 text-sm text-fg-2 hover:bg-surface-3">
            Restart
          </button>
          <Link href="/command-center" className="rounded bg-accent px-5 py-2 text-sm font-semibold text-white">
            Open command center
          </Link>
        </div>
        <p className="absolute bottom-6 font-mono text-xs text-fg-4">SIH 2026 · SIH26085 · CODE SUTRA · DEMO / SIMULATED DATA</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-5">
        <LogoMark className="h-9 w-9" />
        <div className="leading-tight">
          <div className="text-base font-semibold text-fg">Predict the flood. Protect the city.</div>
          <div className="font-mono text-xs text-fg-4">
            {ds?.name} · {ds?.pilotArea} · nowcast issued {clockLabel(NOW_CLOCK)} · demo data
          </div>
        </div>
        <div className="mx-auto flex items-center gap-1">
          {STAGES.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(i)}
              className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", i === stage ? "bg-accent text-white" : i < stage ? "text-accent" : "text-fg-4 hover:text-fg-2")}
            >
              <span className={cx("flex h-5 w-5 items-center justify-center rounded-full font-mono text-xs", i === stage ? "bg-surface text-accent" : "border border-current")}>{i + 1}</span>
              <span className="hidden 2xl:inline">{s}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="rounded p-2 text-fg-3 hover:bg-surface-3" title="Fullscreen (F)">
          <Expand className="h-5 w-5" />
        </button>
        <Link href="/command-center" className="rounded p-2 text-fg-3 hover:bg-surface-3" title="Exit (Esc)">
          <X className="h-5 w-5" />
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-[1.35] border-r border-line">
          {ds ? (
            <FloodMap
              ds={ds}
              res={res}
              clock={NOW_CLOCK + tau}
              layers={layers}
              variant="present"
              focus={focus}
              routes={stage === 5 ? (route?.options.filter((o) => o.id !== "C") ?? null) : null}
              selectedRouteId="A"
              incidents={stage === 5 ? ds.incidents.filter((i) => i.id === ds.hero.incidentId) : []}
              showShelterLabels={stage === 6}
            >
              <div className="absolute bottom-5 left-5 z-10 rounded border border-line-strong bg-surface px-5 py-3 shadow-float">
                <div className="font-mono text-4xl font-semibold text-fg tnum">{clockLabel(NOW_CLOCK + tau)}</div>
                <div className="text-sm font-semibold text-accent">{tau < 1 ? "Now" : `Forecast T+${Math.round(tau)} min`}</div>
              </div>
              <div className="absolute right-5 bottom-5 z-10 flex gap-1 rounded border border-line-strong bg-surface p-2">
                {(["safe", "low", "moderate", "high", "critical"] as const).map((r) => (
                  <div key={r} className="flex items-center gap-1.5 px-1.5">
                    <span className="h-3 w-3 rounded-sm" style={{ background: RISK_COLOR[r] }} />
                    <span className="text-xs font-semibold text-fg">{r}</span>
                  </div>
                ))}
              </div>
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-8">
          <div key={stage} className="slide-up">
            <div className="font-mono text-sm font-semibold text-accent">
              {String(stage + 1).padStart(2, "0")} · {STAGES[stage]}
            </div>
            {stage === 0 && (
              <div className="mt-6 space-y-6">
                <Huge value={rain ? `${Math.round(rain.current)}` : "—"} unit="mm/hr" label="Rainfall now" color="#22d3ee" />
                <div className="grid grid-cols-2 gap-6">
                  <Mid value={`${rain?.accumulated ?? "—"} mm`} label="Since 06:00" />
                  <Mid value={res && heroNodeK >= 0 ? `${Math.round(sample(res.nodes.util[heroNodeK], res, NOW_CLOCK) * 100)}%` : "—"} label={`${ds?.hero.nodeId} capacity used`} />
                </div>
                <p className="text-2xl text-fg-2">The map is still mostly safe. The question is what the next three hours bring.</p>
              </div>
            )}
            {stage === 1 && (
              <div className="mt-6 space-y-6">
                <Huge value={rain ? `${Math.round(rain.peak.value)}` : "—"} unit="mm/hr" label={`Rainfall peak at ${rain ? clockLabel(rain.peak.clock) : "—"}`} color="#a5b4fc" />
                <div className="grid grid-cols-2 gap-6">
                  <Mid value={String(at(NOW_CLOCK + 60).surcharged)} label="Drain nodes surcharging by +60 min" color="#60a5fa" />
                  <Mid value={String(at(NOW_CLOCK + 60).unsafe)} label="Road segments unsafe by +60 min" color="#f97316" />
                </div>
                <p className="text-2xl text-fg-2">Rain exceeds what the drains were built for ({ds?.designRainfall} mm/hr). The drainage graph decides where water surfaces.</p>
              </div>
            )}
            {stage === 2 && summary && (
              <div className="mt-6 space-y-6">
                <Huge value={summary.maxDepth.toFixed(2)} unit="m" label="Maximum street water depth" color={RISK_TEXT[riskOf(summary.maxDepth)]} />
                <div className="grid grid-cols-3 gap-6">
                  <Mid value={String(summary.roadsAtRisk)} label="Roads at risk" color="#f97316" />
                  <Mid value={String(summary.sectorsAffected)} label="Sectors affected" />
                  <Mid value={summary.affectedPopulation.toLocaleString("en-IN")} label="People affected" color="#fda4af" />
                </div>
                <p className="text-2xl text-fg-2">Peak flooding expected around {clockLabel(summary.peakClock)}.</p>
              </div>
            )}
            {stage === 3 && res && (
              <div className="mt-6 space-y-3">
                {critical.map(({ r, pk, on }) => (
                  <div key={r.id} className="flex items-center gap-5 rounded border border-line bg-surface px-5 py-4">
                    <div className="h-12 w-2 rounded-full" style={{ background: RISK_COLOR[riskOf(pk.max)] }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-2xl font-semibold text-fg">{r.label}</div>
                      <div className="text-base text-fg-3">{on ? `Unsafe in ${Math.max(0, Math.round(on - NOW_CLOCK))} min` : "Unsafe now"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-4xl font-semibold" style={{ color: RISK_TEXT[riskOf(pk.max)] }}>
                        {pk.max.toFixed(2)} m
                      </div>
                      <div className="text-sm text-fg-4">peak {clockLabel(pk.clock)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stage === 4 && (
              <div className="mt-6 space-y-4">
                {(al?.alerts ?? []).slice(0, 3).map((a) => (
                  <div key={a.id} className={cx("rounded border px-6 py-5", a.severity === "critical" ? "border-danger bg-danger-subtle" : "border-line bg-surface")}>
                    <div className="flex items-center gap-3">
                      <SeverityBadge severity={a.severity} className="text-sm" />
                      {a.timeToImpactMin != null && <span className="font-mono text-xl font-semibold text-warn">T–{a.timeToImpactMin} min</span>}
                    </div>
                    <p className="mt-2 text-2xl leading-snug font-semibold text-fg">{a.message}</p>
                  </div>
                ))}
              </div>
            )}
            {stage === 5 && (
              <div className="mt-6 space-y-5">
                <div className="inline-block rounded border-2 border-ok px-4 py-1.5 text-lg font-semibold text-ok">Safe route mode active</div>
                {route ? (
                  route.options
                    .filter((o) => o.id !== "C")
                    .map((o) => (
                      <div key={o.id} className={cx("rounded border px-6 py-5", o.passable ? "border-ok/50 bg-ok-subtle" : "border-danger/40 bg-danger-subtle")}>
                        <div className="flex items-baseline justify-between">
                          <span className="text-2xl font-semibold text-fg">
                            {o.label} <span className="text-lg font-medium text-fg-3">· {o.strategy}</span>
                          </span>
                          <span className={cx("text-lg font-semibold", o.passable ? "text-ok" : "text-danger")}>{o.passable ? `Risk ${o.risk}` : "Blocked"}</span>
                        </div>
                        <div className="mt-2 flex gap-10 font-mono text-4xl font-semibold text-fg">
                          <span>{o.distanceKm} km</span>
                          <span>{o.etaMin} min</span>
                          <span style={{ color: RISK_TEXT[o.risk] }}>{o.maxDepth.toFixed(2)} m</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <Loading />
                )}
                <p className="text-xl text-fg-2">Ambulance avoids {heroRoad?.name} — the shortest road is not the safest road.</p>
              </div>
            )}
            {stage === 6 && (
              <div className="mt-6 space-y-2.5">
                {(al?.actions ?? []).map((a, i) => (
                  <div key={a.id} className="flex items-center gap-4 rounded border border-line bg-surface px-5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent font-mono text-lg font-semibold text-white">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate text-xl font-semibold text-fg">{a.title}</div>
                      <div className="truncate text-sm text-fg-3">
                        {a.priority} · by {clockLabel(a.dueClock)} · {a.location}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStage((s) => Math.max(0, s - 1))} className="flex items-center gap-2 rounded border border-line-strong px-5 py-3 text-lg font-semibold text-fg-2 hover:bg-surface-3">
              <ChevronLeft className="h-5 w-5" /> Back
            </button>
            <span className="font-mono text-xs text-fg-4">← → navigate · F fullscreen · Esc exit</span>
            <button type="button" onClick={() => setStage((s) => s + 1)} className="flex items-center gap-2 rounded bg-accent px-6 py-3 text-lg font-semibold text-white hover:bg-accent-hover">
              Next <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Huge({ value, unit, label, color }: { value: string; unit: string; label: string; color?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[112px] leading-none font-semibold tracking-tight tnum" style={{ color }}>
          {value}
        </span>
        <span className="text-4xl font-semibold text-fg-3">{unit}</span>
      </div>
      <div className="mt-2 text-xl font-semibold text-fg-3">{label}</div>
    </div>
  );
}

function Mid({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="rounded border border-line bg-surface px-5 py-4">
      <div className="font-mono text-5xl font-semibold text-fg tnum" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mt-1 text-base font-semibold text-fg-3">{label}</div>
    </div>
  );
}
