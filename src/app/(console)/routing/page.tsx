"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ambulance, Car, CircleCheck, Crosshair, LoaderCircle, MapPin, Navigation, ShieldCheck, Siren, Truck, TriangleAlert } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNetwork, useNowcast } from "@/lib/hooks/data";
import { api } from "@/lib/api/client";
import { alongPath, bboxOf } from "@/lib/geo";
import { DEFAULT_LAYERS } from "@/lib/store";
import { NOW_CLOCK, RISK_COLOR, RISK_TEXT, VEHICLE_LIMITS, clockLabel } from "@/lib/engine/constants";
import type { RouteOption, RouteResponse } from "@/lib/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { Legend, MapToolbar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ErrorState, Loading, Panel, RiskBadge, Segmented, Select, SimTag, Tag, cx } from "@/components/ui/primitives";

const VEH = { ambulance: Ambulance, fire: Truck, police: Car } as const;

export default function RoutingPage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const routing = useApp((s) => s.routing);
  const setRouting = useApp((s) => s.setRouting);
  const scenario = useApp((s) => s.appliedScenario);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const toast = useApp((s) => s.toast);
  const pushLog = useApp((s) => s.pushLog);
  const [resp, setResp] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const raf = useRef(0);

  // defaults + deep links (?origin=H-01, ?incident=INC-2041)
  useEffect(() => {
    if (!ds) return;
    const q = new URLSearchParams(window.location.search);
    const patch: Partial<typeof routing> = {};
    const o = q.get("origin");
    const inc = q.get("incident");
    if (o && ds.pois.some((p) => p.id === o)) {
      patch.originId = o;
      const k = ds.pois.find((p) => p.id === o)!.kind;
      patch.vehicle = k === "fire" ? "fire" : k === "police" ? "police" : "ambulance";
    } else if (!routing.originId || !ds.pois.some((p) => p.id === routing.originId)) patch.originId = ds.hero.hospitalId || ds.pois.find((p) => p.kind === "hospital")?.id || null;
    if (inc && ds.incidents.some((i) => i.id === inc)) {
      patch.destIncidentId = inc;
      patch.destCoord = null;
    } else if (!routing.destIncidentId && !routing.destCoord) patch.destIncidentId = ds.hero.incidentId || ds.incidents[0]?.id || null;
    if (Object.keys(patch).length) setRouting(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds]);

  const origins = useMemo(() => (ds ? ds.pois.filter((p) => (routing.vehicle === "ambulance" ? p.kind === "hospital" : routing.vehicle === "fire" ? p.kind === "fire" : p.kind === "police")) : []), [ds, routing.vehicle]);
  useEffect(() => {
    if (routing.originId && origins.length && !origins.some((o) => o.id === routing.originId)) setRouting({ originId: origins[0].id });
  }, [origins, routing.originId, setRouting]);

  const clock = NOW_CLOCK + routing.departOffset;
  useEffect(() => {
    if (!ds || !routing.originId || (!routing.destIncidentId && !routing.destCoord)) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setProgress(null);
    cancelAnimationFrame(raf.current);
    api
      .routes({
        city: ds.id,
        vehicle: routing.vehicle,
        originId: routing.originId,
        destination: routing.destIncidentId ? { incidentId: routing.destIncidentId } : { coord: routing.destCoord!, name: "Selected emergency location" },
        clock,
        params: scenario,
      })
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setRouting({ selectedRoute: "A" });
      })
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, routing.vehicle, routing.originId, routing.destIncidentId, routing.destCoord?.[0], routing.destCoord?.[1], clock, scenario]);

  const sel = resp?.options.find((o) => o.id === routing.selectedRoute) ?? resp?.options[0];
  const origin = ds?.pois.find((p) => p.id === routing.originId);
  const vehicles = useMemo(() => {
    if (!sel || !origin) return [];
    const coord = progress == null ? sel.coords[0] : alongPath(sel.coords, progress);
    return [{ id: "veh", kind: routing.vehicle, coord, label: routing.vehicle === "ambulance" ? "AMB-01" : routing.vehicle === "fire" ? "FT-01" : "PCR-01", active: progress != null && progress < 1 }];
  }, [sel, origin, progress, routing.vehicle]);

  const dispatch = () => {
    if (!sel) return;
    cancelAnimationFrame(raf.current);
    const dur = Math.max(5000, sel.etaMin * 700);
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else toast({ tone: "success", title: "Arrived on scene", body: `${VEHICLE_LIMITS[routing.vehicle].label} reached ${resp?.destination.name} via ${sel.label} (${sel.distanceKm} km).` });
    };
    raf.current = requestAnimationFrame(tick);
    pushLog(`${VEHICLE_LIMITS[routing.vehicle].label} dispatched via ${sel.label} (${sel.strategy})`, "action");
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const layers = { ...DEFAULT_LAYERS, drainage: false, risk: false, rain: false, routes: true, depth: true, roads: true, infra: true, shelters: false };
  const incidents = ds ? ds.incidents.filter((i) => i.id === routing.destIncidentId) : [];
  const destMarker = routing.destCoord
    ? [
        {
          id: "dest",
          coord: routing.destCoord,
          node: (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-red-600 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>
          ),
        },
      ]
    : [];
  const avoided = resp?.avoidedRoadIds.map((id) => ds?.roads.find((r) => r.id === id)).filter(Boolean) ?? [];
  const Veh = VEH[routing.vehicle];

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Emergency routing"
        title="Shortest Safe Route"
        subtitle="Flood-aware routing on the OSM road graph: edges deeper than the vehicle's wading limit are removed and shallow water is penalised — instead of the plain shortest path."
        right={
          <span className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-extrabold tracking-[0.16em] text-emerald-300 uppercase">
            <ShieldCheck className="h-4 w-4" /> Safe route mode active
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="scroll-thin flex w-[360px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Dispatch request" icon={<Siren className="h-3.5 w-3.5" />} className="shrink-0">
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">Vehicle</div>
                <Segmented
                  value={routing.vehicle}
                  onChange={(v) =>
                    setRouting({
                      vehicle: v,
                      originId: ds?.pois.find((p) => p.kind === (v === "ambulance" ? "hospital" : v === "fire" ? "fire" : "police"))?.id ?? null,
                    })
                  }
                  options={[
                    { value: "ambulance", label: "Ambulance" },
                    { value: "fire", label: "Fire Tender" },
                    { value: "police", label: "Police" },
                  ]}
                />
                <p className="mt-1 text-[10.5px] text-slate-500">Wading limit {VEHICLE_LIMITS[routing.vehicle].max} m · comfortable {VEHICLE_LIMITS[routing.vehicle].comfortable} m</p>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">Origin</div>
                <Select className="w-full" label="Origin" value={routing.originId ?? ""} onChange={(v) => setRouting({ originId: v })} options={origins.map((o) => ({ value: o.id, label: `${o.id} · ${o.name}` }))} />
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">Destination</div>
                <div className="space-y-1">
                  {ds?.incidents.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setRouting({ destIncidentId: i.id, destCoord: null })}
                      className={cx("flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left", routing.destIncidentId === i.id ? "border-red-500/60 bg-red-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-500")}
                    >
                      <Siren className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-slate-100">{i.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{i.id}</span>
                      </span>
                    </button>
                  ))}
                  <Button size="sm" className="w-full" active={pick} onClick={() => setPick(!pick)}>
                    <Crosshair className="h-3.5 w-3.5" /> {pick ? "Click on the map…" : routing.destCoord ? "Custom location set — pick again" : "Pick location on map"}
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">Departure</div>
                <Segmented
                  value={String(routing.departOffset)}
                  onChange={(v) => setRouting({ departOffset: Number(v) })}
                  options={[0, 30, 60, 90, 120].map((t) => ({ value: String(t), label: t === 0 ? "Now" : `+${t}` }))}
                />
                <p className="mt-1 text-[10.5px] text-slate-500">Depths checked over {clockLabel(clock)}–{clockLabel(clock + 30)} (travel window)</p>
              </div>
            </div>
          </Panel>
          {avoided.length > 0 && (
            <Panel title="Flooded roads avoided" icon={<TriangleAlert className="h-3.5 w-3.5" />} className="shrink-0" bodyClassName="p-2">
              {avoided.slice(0, 6).map((r) => (
                <button key={r!.id} type="button" onClick={() => select({ kind: "road", id: r!.id })} className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800">
                  <span className="truncate text-slate-200">{r!.label}</span>
                  <span className="font-mono text-[10px] text-slate-500">{r!.id}</span>
                </button>
              ))}
            </Panel>
          )}
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
          {ds ? (
            <FloodMap
              ds={ds}
              res={now?.result}
              clock={clock}
              layers={layers}
              variant="routing"
              selection={selection}
              onSelect={select}
              routes={resp?.options ?? null}
              selectedRouteId={sel?.id ?? null}
              incidents={incidents}
              vehicles={vehicles}
              extraMarkers={destMarker}
              pickMode={pick}
              onPick={(p) => {
                setRouting({ destCoord: p, destIncidentId: null });
                setPick(false);
              }}
              focus={resp ? { center: resp.destination.coord, bounds: bboxOf(resp.options.flatMap((o) => o.coords)), key: resp.options.length * 1000 + (resp.options[0]?.coords.length ?? 0) + resp.atClock } : null}
              showSectorLabels={false}
            >
              <MapToolbar />
              <Legend />
              <div className="absolute right-3 bottom-3 z-10 rounded-lg border border-ink-600 bg-ink-900/92 px-3 py-2 text-[11px] shadow-xl">
                <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">Routes</div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="h-1.5 w-6 rounded bg-emerald-600" /> Selected (safe)
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="h-0 w-6 border-t-2 border-dashed border-red-500" /> Flood-blind shortest
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="h-1.5 w-6 rounded bg-red-800" /> Flooded road on route
                </div>
              </div>
              <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
              {loading && (
                <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/95 px-3 py-1.5 text-xs text-slate-300">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-300" /> Computing flood-aware routes…
                </div>
              )}
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>

        <div className="scroll-thin flex w-[330px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Route options" icon={<Navigation className="h-3.5 w-3.5" />} sim className="shrink-0" bodyClassName="p-2.5">
            {err && <p className="text-xs text-red-300">{err}</p>}
            {!resp && !err && <Loading label="Planning…" />}
            <div className="space-y-2">
              {resp?.options.map((o) => (
                <RouteCard key={o.id} o={o} selected={o.id === sel?.id} onClick={() => (setRouting({ selectedRoute: o.id }), setProgress(null))} />
              ))}
            </div>
            {resp && resp.options.length > 0 && !resp.options.find((o) => o.id === "A") && <p className="mt-2 text-xs text-amber-300">No safe route exists within the wading limit — consider a fire tender or wait for recession.</p>}
          </Panel>
          {sel && (
            <Panel title="Dispatch" className="shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600">
                  <Veh className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="truncate text-slate-200">{origin?.name}</div>
                  <div className="truncate text-slate-500">→ {resp?.destination.name}</div>
                </div>
              </div>
              {progress != null && (
                <div className="mt-3">
                  <div className="flex justify-between font-mono text-[11px] text-slate-400">
                    <span>{progress >= 1 ? "On scene" : "En route"}</span>
                    <span>ETA {Math.max(0, Math.round(sel.etaMin * (1 - progress)))} min</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              )}
              <Button variant={sel.passable ? "success" : "danger"} size="md" className="mt-3 w-full" onClick={dispatch} disabled={progress != null && progress < 1}>
                {sel.passable ? <CircleCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                {sel.passable ? `Dispatch via ${sel.label}` : `Dispatch anyway (unsafe)`}
              </Button>
            </Panel>
          )}
          <div className="px-1">
            <SimTag label="Depths simulated · OSM road graph" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteCard({ o, selected, onClick }: { o: RouteOption; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("w-full rounded-xl border p-3 text-left transition-colors", selected ? (o.passable ? "border-emerald-500/70 bg-emerald-500/10" : "border-red-500/70 bg-red-500/10") : "border-ink-700 bg-ink-850 hover:border-ink-500")}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-white">{o.label}</span>
        {o.recommended && <Tag tone="green">Recommended</Tag>}
        {!o.passable && <Tag tone="red">Unsafe</Tag>}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{o.strategy}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9.5px] font-bold tracking-wider text-slate-500 uppercase">Distance</div>
          <div className="font-mono text-base font-semibold text-white">{o.distanceKm} km</div>
        </div>
        <div>
          <div className="text-[9.5px] font-bold tracking-wider text-slate-500 uppercase">ETA</div>
          <div className="font-mono text-base font-semibold text-white">{o.etaMin} min</div>
        </div>
        <div>
          <div className="text-[9.5px] font-bold tracking-wider text-slate-500 uppercase">Flood risk</div>
          <RiskBadge level={o.risk} size="xs" className="mt-1" />
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-slate-400">
        Max depth on route <span className="font-mono" style={{ color: RISK_TEXT[o.risk] }}>{o.maxDepth.toFixed(2)} m</span>
        {o.floodedRoadIds.length > 0 && <span> · {o.floodedRoadIds.length} wet segment{o.floodedRoadIds.length > 1 ? "s" : ""}</span>}
      </div>
    </button>
  );
}
