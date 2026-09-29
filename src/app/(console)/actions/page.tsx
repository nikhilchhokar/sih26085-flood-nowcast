"use client";
import { useMemo } from "react";
import { ClipboardCheck, ScrollText } from "lucide-react";
import { useApp } from "@/lib/store";
import { useAlerts, useClock, useNetwork, useNowcast } from "@/lib/hooks/data";
import { FloodMap } from "@/components/map/DynamicMap";
import { Legend, MapToolbar, TimeBar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { ActionList } from "@/components/panels/ActionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, ErrorState, Loading, Panel, SimTag, Stat, cx } from "@/components/ui/primitives";

export default function ActionsPage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const { data: al } = useAlerts();
  const clock = useClock();
  const layers = useApp((s) => s.layers);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const focus = useApp((s) => s.mapFocus);
  const actionState = useApp((s) => s.actionState);
  const log = useApp((s) => s.log);
  const actions = al?.actions ?? [];

  const markers = useMemo(
    () =>
      actions.map((a, i) => ({
        id: a.id,
        coord: a.coord,
        node: (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-cyan-600 font-mono text-[11px] font-bold text-white shadow-lg" title={a.title}>
            {i + 1}
          </div>
        ),
      })),
    [actions],
  );
  const handled = actions.filter((a) => actionState[a.id]).length;

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Response / action centre"
        title="Recommended Actions"
        subtitle="The system does not stop at “flood detected”: each forecast hotspot becomes a prioritised, time-bound municipal action."
        right={<SimTag label="Simulated recommendations" />}
      />
      <div className="grid grid-cols-4 gap-2.5">
        <Stat value={actions.filter((a) => a.priority === "P1").length} label="Priority 1" tone="#f87171" sub="Act within 15 min" />
        <Stat value={actions.filter((a) => a.priority === "P2").length} label="Priority 2" tone="#fbbf24" sub="Act within 30 min" />
        <Stat value={`${handled}/${actions.length}`} label="Actioned" tone={handled === actions.length && actions.length ? "#4ade80" : undefined} sub="Dispatch · notify · reroute · ack" />
        <Stat value={ds?.pois.filter((p) => p.kind === "shelter").length ?? "—"} label="Shelters available" sub="Designated (demo)" />
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <Panel title="Action queue" icon={<ClipboardCheck className="h-3.5 w-3.5" />} className="w-[520px] shrink-0" bodyClassName="scroll-thin overflow-y-auto p-3">
          {actions.length ? <ActionList actions={actions} /> : <Loading />}
        </Panel>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
            {ds ? (
              <FloodMap ds={ds} res={now?.result} clock={clock} layers={{ ...layers, rain: false }} selection={selection} onSelect={select} focus={focus} extraMarkers={markers}>
                <MapToolbar />
                <Legend />
                <TimeBar compact />
                <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
              </FloodMap>
            ) : (
              <Loading />
            )}
          </div>
          <Panel title="Action log" icon={<ScrollText className="h-3.5 w-3.5" />} className="h-40 shrink-0" bodyClassName="scroll-thin overflow-y-auto p-0">
            {log.filter((l) => l.kind === "action").length ? (
              log
                .filter((l) => l.kind === "action")
                .map((l) => (
                  <div key={l.id} className={cx("flex gap-2 border-t border-ink-700/60 px-3 py-1.5 text-[11.5px] first:border-t-0")}>
                    <span className="font-mono text-[10px] text-slate-500">{new Date(l.at).toLocaleTimeString("en-IN", { hour12: false })}</span>
                    <span className="text-emerald-300">{l.text}</span>
                  </div>
                ))
            ) : (
              <Empty>Use Dispatch / Notify / Reroute / Ack — every action is logged with a timestamp.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
