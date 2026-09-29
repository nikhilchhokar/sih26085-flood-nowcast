"use client";
import { useEffect, useMemo, useState } from "react";
import { Bus, LoaderCircle, Tent, TriangleAlert, Users } from "lucide-react";
import { useApp, DEFAULT_LAYERS } from "@/lib/store";
import { useNetwork, useNowcast } from "@/lib/hooks/data";
import { api } from "@/lib/api/client";
import { metersBetween } from "@/lib/geo";
import { maxOver, sample, sectorImpacts } from "@/lib/engine/analysis";
import { HORIZON_MIN, NOW_CLOCK, RISK_COLOR, RISK_TEXT, UNSAFE_DEPTH, clockLabel, riskOf } from "@/lib/engine/constants";
import type { RouteOption } from "@/lib/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { Legend, MapToolbar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, KV, Loading, Meter, Panel, RiskBadge, Select, SimTag, Stat, Tag, cx } from "@/components/ui/primitives";

const FLEET = 12;
const BUS_SEATS = 50;
const LOAD_MIN = 10;

export default function EvacuationPage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const globalSector = useApp((s) => s.sectorId);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const scenario = useApp((s) => s.appliedScenario);
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<{ shelterId: string; opt: RouteOption | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ds && !sectorId) setSectorId(globalSector ?? ds.hero.sectorId);
  }, [ds, globalSector, sectorId]);

  const sector = ds?.sectors.find((s) => s.id === sectorId);

  // peak time for this sector
  const peak = useMemo(() => {
    if (!ds || !now || !sector) return null;
    let best = { clock: NOW_CLOCK, pop: -1 };
    for (let c = NOW_CLOCK; c <= NOW_CLOCK + HORIZON_MIN; c += 10) {
      const imp = sectorImpacts(ds, now.result, c).find((x) => x.id === sector.id)!;
      if (imp.popAtRisk > best.pop) best = { clock: c, pop: imp.popAtRisk };
    }
    return best;
  }, [ds, now, sector]);
  const clock = peak?.clock ?? NOW_CLOCK + 90;
  const impact = useMemo(() => (ds && now && sector ? sectorImpacts(ds, now.result, clock).find((x) => x.id === sector.id) : undefined), [ds, now, sector, clock]);

  const shelters = useMemo(() => {
    if (!ds || !now || !sector) return [];
    const idx = new Map(ds.roads.map((r, i) => [r.id, i]));
    return ds.pois
      .filter((p) => p.kind === "shelter")
      .map((p) => {
        const access = Math.max(0, ...p.accessRoadIds.map((id) => (idx.has(id) ? maxOver(now.result.roads.depth[idx.get(id)!], now.result, NOW_CLOCK, NOW_CLOCK + HORIZON_MIN).max : 0)));
        return { p, access, safe: access < UNSAFE_DEPTH, d: metersBetween(sector.centroid, p.coord) };
      })
      .sort((a, b) => Number(b.safe) - Number(a.safe) || a.d - b.d);
  }, [ds, now, sector]);

  // safe routes from sector centroid to the 3 nearest safe shelters
  useEffect(() => {
    if (!ds || !sector || !shelters.length) return;
    const cand = shelters.filter((s) => s.safe && s.p.sectorId !== sector.id).slice(0, 3);
    if (!cand.length) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      cand.map((c) =>
        api
          .routes({ city: ds.id, vehicle: "ambulance", originCoord: sector.centroid, destination: { coord: c.p.coord, name: c.p.name }, clock: NOW_CLOCK + 30, params: scenario })
          .then((r) => ({ shelterId: c.p.id, opt: r.options.find((o) => o.id === "A") ?? null }))
          .catch(() => ({ shelterId: c.p.id, opt: null })),
      ),
    ).then((rs) => {
      if (cancelled) return;
      setRoutes(rs.sort((a, b) => (a.opt?.distanceKm ?? 99) - (b.opt?.distanceKm ?? 99)));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ds, sector, shelters, scenario]);

  const best = routes.find((r) => r.opt);
  const bestShelter = best ? ds?.pois.find((p) => p.id === best.shelterId) : undefined;
  const popRisk = impact?.popAtRisk ?? 0;
  const trips = Math.ceil(popRisk / (FLEET * BUS_SEATS));
  const evacMin = best?.opt ? trips * (2 * best.opt.etaMin + LOAD_MIN) : null;
  const avoid = useMemo(() => {
    if (!ds || !now || !sector) return [];
    return ds.roads
      .map((r, i) => ({ r, d: sample(now.result.roads.depth[i], now.result, clock) }))
      .filter((x) => x.r.sectorId === sector.id && x.r.major && x.d >= UNSAFE_DEPTH)
      .sort((a, b) => b.d - a.d);
  }, [ds, now, sector, clock]);

  const layers = { ...DEFAULT_LAYERS, drainage: false, rain: false, routes: true, shelters: true, infra: true, risk: true, depth: true };
  const evacLines = routes.filter((r) => r.opt && r !== best).map((r) => ({ coords: r.opt!.coords, color: "#64748b" }));

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Evacuation planning"
        title="Evacuation View"
        subtitle="Flooded and safe zones at the forecast peak, designated shelters on high ground, and a safe evacuation corridor that avoids blocked roads."
        right={
          <>
            <Select
              label="Ward / sector"
              value={sectorId ?? ""}
              onChange={(v) => {
                setSectorId(v);
                setRoutes([]);
              }}
              options={(ds?.sectors ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.locality}` }))}
              className="min-w-56"
            />
            <SimTag label="Simulated" />
          </>
        }
      />
      <div className="grid grid-cols-5 gap-2.5">
        <Stat icon={<Users className="h-3.5 w-3.5" />} value={popRisk.toLocaleString("en-IN")} label="Population at risk" sub={`${sector?.name ?? ""} at peak ${clockLabel(clock)}`} tone={popRisk ? "#fb7185" : "#4ade80"} />
        <Stat icon={<Tent className="h-3.5 w-3.5" />} value={bestShelter?.id ?? "—"} label="Nearest safe shelter" sub={bestShelter ? `${bestShelter.name} · cap ${bestShelter.capacity}` : "computing…"} tone="#34d399" />
        <Stat icon={<Bus className="h-3.5 w-3.5" />} value={evacMin == null ? "—" : evacMin >= 60 ? `${Math.floor(evacMin / 60)}h ${evacMin % 60}m` : `${evacMin} min`} label="Est. evacuation time" sub={`${FLEET} buses × ${BUS_SEATS} seats · ${trips} trip${trips === 1 ? "" : "s"}`} />
        <Stat value={best?.opt ? best.opt.distanceKm : "—"} unit="km" label="Safe route distance" sub={best?.opt ? `ETA ${best.opt.etaMin} min · max depth ${best.opt.maxDepth.toFixed(2)} m` : ""} />
        <Stat icon={<TriangleAlert className="h-3.5 w-3.5" />} value={avoid.length} label="Roads to avoid" sub={`Unsafe in ${sector?.name ?? "sector"} at peak`} tone={avoid.length ? "#f97316" : undefined} />
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
          {ds ? (
            <FloodMap
              ds={ds}
              res={now?.result}
              clock={clock}
              layers={layers}
              variant="evacuation"
              selection={selection}
              onSelect={select}
              focusSectorId={sectorId}
              routes={best?.opt ? [{ ...best.opt, id: "A" }] : null}
              selectedRouteId="A"
              evacLines={evacLines}
              showShelterLabels
              focus={sector ? { center: sector.centroid, zoom: 14.2, key: sector.number } : null}
            >
              <MapToolbar />
              <Legend />
              <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
              {loading && (
                <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/95 px-3 py-1.5 text-xs text-slate-300">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-300" /> Routing evacuation corridors…
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-900/92 px-3 py-1.5 text-[11px] text-slate-300 shadow-xl">
                Showing forecast peak for {sector?.name} · {clockLabel(clock)} · green = safe corridor · grey dashed = alternates
              </div>
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>
        <div className="scroll-thin flex w-[380px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title={`${sector?.name ?? "Sector"} · ${sector?.locality ?? ""}`} className="shrink-0" right={impact ? <RiskBadge level={impact.risk} /> : null}>
            <KV k="Residents (est.)" v={sector?.population.toLocaleString("en-IN")} />
            <KV k="Flooded area at peak" v={`${impact?.floodedAreaPct.toFixed(1) ?? 0}%`} />
            <KV k="Max street depth" v={<span style={{ color: RISK_TEXT[riskOf(impact?.maxDepth ?? 0)] }}>{impact?.maxDepth.toFixed(2)} m</span>} />
            <KV k="Shelter demand vs capacity" v={bestShelter ? `${popRisk.toLocaleString("en-IN")} / ${bestShelter.capacity}` : "—"} />
            {bestShelter && <Meter value={Math.min(1, popRisk / Math.max(1, bestShelter.capacity ?? 1))} color={popRisk > (bestShelter.capacity ?? 0) ? "#f97316" : "#34d399"} className="mt-1" />}
            {bestShelter && popRisk > (bestShelter.capacity ?? 0) && <p className="mt-1 text-[11px] text-amber-300">Demand exceeds {bestShelter.id} capacity — open alternates below.</p>}
            <p className="mt-2 text-[10.5px] text-slate-500">
              Evacuation time = trips × (2 × route ETA + {LOAD_MIN} min loading). Assumes {FLEET} buses; refine with actual fleet data.
            </p>
          </Panel>
          <Panel title="Roads to avoid" icon={<TriangleAlert className="h-3.5 w-3.5" />} className="shrink-0" bodyClassName="p-1.5">
            {avoid.length ? (
              avoid.slice(0, 8).map(({ r, d }) => (
                <button key={r.id} type="button" onClick={() => select({ kind: "road", id: r.id })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-ink-800">
                  <span className="truncate text-slate-200">{r.label}</span>
                  <span className="font-mono" style={{ color: RISK_TEXT[riskOf(d)] }}>
                    {d.toFixed(2)} m
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-xs text-slate-500">No blocked roads in this sector at peak.</p>
            )}
          </Panel>
          <Panel title="Shelters" icon={<Tent className="h-3.5 w-3.5" />} sim className="shrink-0" bodyClassName="p-0">
            {shelters.map(({ p, access, safe, d }) => {
              const r = routes.find((x) => x.shelterId === p.id);
              return (
                <button key={p.id} type="button" onClick={() => select({ kind: "poi", id: p.id })} className={cx("flex w-full items-center gap-2 border-t border-ink-700/60 px-3 py-1.5 text-left first:border-t-0 hover:bg-ink-800", best?.shelterId === p.id && "bg-emerald-500/10")}>
                  <span className="w-10 font-mono text-xs text-emerald-300">{p.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-200">{p.name}</span>
                    <span className="text-[10px] text-slate-500">
                      cap {p.capacity} · {(d / 1000).toFixed(1)} km{r?.opt ? ` · route ${r.opt.distanceKm} km` : ""}
                    </span>
                  </span>
                  <Tag tone={safe ? "green" : "red"}>{safe ? "Available" : `Access ${access.toFixed(1)} m`}</Tag>
                </button>
              );
            })}
          </Panel>
        </div>
      </div>
    </div>
  );
}
