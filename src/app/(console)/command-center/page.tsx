"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Siren, ClipboardCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useAlerts, useClock, useHealth, useNetwork, useNowcast, useRainfall } from "@/lib/hooks/data";
import { summarize } from "@/lib/engine/analysis";
import { NOW_CLOCK } from "@/lib/engine/constants";
import { alongPath } from "@/lib/geo";
import { FloodMap } from "@/components/map/DynamicMap";
import { LayerPanel, Legend, MapToolbar, TimeBar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { KpiStrip } from "@/components/panels/KpiStrip";
import { NowcastPanel } from "@/components/panels/NowcastPanel";
import { AlertList } from "@/components/panels/AlertList";
import { ActionList } from "@/components/panels/ActionList";
import { EnginePanel } from "@/components/panels/EnginePanel";
import { DataFusionStrip } from "@/components/panels/DataFusionStrip";
import { DemoOverlay } from "@/components/demo/DemoOverlay";
import { ErrorState, Loading, Panel, Tag, cx } from "@/components/ui/primitives";
import type { MapVehicle } from "@/components/map/FloodMap";

export default function CommandCenter() {
  const { data: ds, error: dsErr, reload: reloadDs } = useNetwork();
  const { data: now, error: nowErr, reload: reloadNow } = useNowcast();
  const { data: al } = useAlerts();
  const { data: rain } = useRainfall();
  const { data: health } = useHealth();
  const clock = useClock();
  const tau = useApp((s) => s.tau);
  const layers = useApp((s) => s.layers);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const sectorId = useApp((s) => s.sectorId);
  const focus = useApp((s) => s.mapFocus);
  const demo = useApp((s) => s.demo);
  const radarOutage = useApp((s) => s.flags.radarOutage);

  // progressive reveal during the live demo: KPIs cover the horizon revealed so far
  const horizon = demo.active ? Math.max(5, Math.round(Math.max(0, tau) / 5) * 5) : 180;
  const summary = useMemo(
    () => (ds && now ? summarize(ds, now.result, NOW_CLOCK, horizon, { degraded: radarOutage, sectorId }) : undefined),
    [ds, now, horizon, radarOutage, sectorId],
  );

  const alertsVisible = !demo.active || demo.step >= 6;
  const alerts = useMemo(() => {
    const list = al?.alerts ?? [];
    return sectorId ? list.filter((a) => a.sectorId === sectorId) : list;
  }, [al, sectorId]);
  const actions = al?.actions ?? [];

  // ambulance animation along the recalculated safe route
  const route = demo.active ? demo.route : null;
  const [vehPos, setVehPos] = useState<number>(0);
  useEffect(() => {
    if (!route) return;
    setVehPos(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      setVehPos(Math.min(1, (performance.now() - t0) / 9000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route]);
  const vehicles: MapVehicle[] = useMemo(() => {
    const A = route?.options.find((o) => o.id === "A");
    if (!A) return [];
    return [{ id: "AMB-01", kind: "ambulance", coord: alongPath(A.coords, vehPos), label: "AMB-01", active: true }];
  }, [route, vehPos]);

  const sectorFocus = useMemo(() => {
    if (!ds || !sectorId) return null;
    const s = ds.sectors.find((x) => x.id === sectorId);
    return s ? { center: s.centroid, zoom: 14.4, key: sectorId.length + s.number * 1000 } : null;
  }, [ds, sectorId]);

  if (dsErr || nowErr) return <ErrorState error={(dsErr ?? nowErr)!} onRetry={() => (reloadDs(), reloadNow())} />;

  const ctx = ds && now && al ? { ds, res: now.result, alerts: al.alerts, route: demo.route } : null;

  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <KpiStrip summary={summary} rain={rain} horizonLabel={demo.active ? `Forecast to T+${horizon} min` : "Forecast 0–3 h"} actions={actions.length} />
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
            {ds ? (
              <FloodMap
                ds={ds}
                res={now?.result}
                clock={clock}
                layers={layers}
                selection={selection}
                onSelect={select}
                focus={focus ?? sectorFocus}
                focusSectorId={sectorId}
                routes={route?.options ?? null}
                selectedRouteId="A"
                highlightRoadIds={demo.active ? demo.highlight : undefined}
                incidents={route ? ds.incidents.filter((i) => i.id === ds.hero.incidentId) : []}
                vehicles={vehicles}
              >
                <LayerPanel defaultOpen={false} />
                <MapToolbar />
                <Legend showRain={layers.rain} showDrain={layers.drainage} />
                <TimeBar degraded={radarOutage} />
                <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} offsetTop={demo.active && !demo.finished ? 150 : 12} />
                {route && (
                  <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-emerald-500/60 bg-emerald-950/90 px-4 py-1.5 text-center shadow-xl" style={{ top: demo.active && !demo.finished ? 150 : 12 }}>
                    <div className="flex items-center gap-2 text-xs font-extrabold tracking-[0.18em] text-emerald-300 uppercase">
                      <ShieldCheck className="h-4 w-4" /> Safe route mode active
                    </div>
                  </div>
                )}
                <DemoOverlay ctx={ctx} />
              </FloodMap>
            ) : (
              <Loading label="Loading city network…" />
            )}
          </div>
          <DataFusionStrip ds={ds} health={health} className="hidden h-[74px] shrink-0 [@media(min-height:840px)]:flex" />
        </div>

        <div className="scroll-thin flex w-[372px] shrink-0 flex-col gap-2.5 overflow-y-auto pr-0.5">
          <NowcastPanel ds={ds} res={now?.result} className="shrink-0" />
          <Panel
            title="Alerts"
            icon={<Siren className="h-3.5 w-3.5" />}
            sim
            right={
              <Link href="/alerts" className="text-[11px] text-cyan-300 hover:underline">
                All →
              </Link>
            }
            className="shrink-0"
            bodyClassName="p-2.5"
          >
            {alertsVisible ? (
              <AlertList alerts={alerts} compact limit={4} emptyText={sectorId ? "No alerts for this ward." : "No active alerts."} />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-3 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 blink-soft" /> Monitoring… thresholds not yet exceeded
              </div>
            )}
          </Panel>
          <Panel
            title="Recommended Actions"
            icon={<ClipboardCheck className="h-3.5 w-3.5" />}
            sim
            right={
              <Link href="/actions" className="text-[11px] text-cyan-300 hover:underline">
                Action centre →
              </Link>
            }
            className={cx("shrink-0", demo.active && demo.step === 8 && "ring-2 ring-cyan-400")}
            bodyClassName="p-2.5"
          >
            {!demo.active || demo.step >= 8 || demo.finished ? (
              <ActionList actions={actions} compact />
            ) : (
              <p className="px-1 py-2 text-xs text-slate-500">Generated once the nowcast crosses alert thresholds.</p>
            )}
          </Panel>
          <EnginePanel ds={ds} nowcast={now} className="shrink-0" />
          <div className="flex flex-wrap gap-1.5 px-1 pb-1">
            <Tag tone="amber">Demo data</Tag>
            <Tag tone="slate">OSM roads</Tag>
            <Tag tone="slate">SRTM 30 m</Tag>
          </div>
        </div>
      </div>
    </div>
  );
}
