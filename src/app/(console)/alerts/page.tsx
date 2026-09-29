"use client";
import { useMemo, useState } from "react";
import { ClipboardList, Gauge, ScrollText, Siren } from "lucide-react";
import { useApp, type AlertStatus } from "@/lib/store";
import { useAlerts, useNetwork } from "@/lib/hooks/data";
import { useOps } from "@/lib/hooks/ops";
import type { Severity } from "@/lib/types";
import { AlertList } from "@/components/panels/AlertList";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Empty, ErrorState, Loading, Panel, Segmented, SeverityBadge, SimTag, Stat, Tag, cx } from "@/components/ui/primitives";

export default function AlertsPage() {
  const { data, error, loading, reload } = useAlerts();
  const { data: ds } = useNetwork();
  const alertState = useApp((s) => s.alertState);
  const incidents = useApp((s) => s.incidents);
  const log = useApp((s) => s.log);
  const sectorId = useApp((s) => s.sectorId);
  const ops = useOps();
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [status, setStatus] = useState<"all" | AlertStatus>("all");

  const alerts = useMemo(
    () =>
      (data?.alerts ?? []).filter(
        (a) => (sev === "all" || a.severity === sev) && (status === "all" || (alertState[a.id]?.status ?? "new") === status) && (!sectorId || a.sectorId === sectorId),
      ),
    [data, sev, status, alertState, sectorId],
  );
  const count = (s: Severity) => (data?.alerts ?? []).filter((a) => a.severity === s).length;
  const open = (data?.alerts ?? []).filter((a) => (alertState[a.id]?.status ?? "new") === "new").length;

  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Alert centre"
        title="Alerts & Incidents"
        subtitle="Threshold alerts generated from the nowcast — each tied to a location, predicted depth, time-to-impact and a recommended action."
        right={<SimTag label="Simulated alerts" />}
      />
      <div className="grid grid-cols-5 gap-2.5">
        <Stat value={count("critical")} label="Critical" tone="#f87171" sub="Depth > 1.0 m forecast" />
        <Stat value={count("high")} label="High" tone="#fb923c" sub="Road unsafe / drain ≥ 90%" />
        <Stat value={count("medium")} label="Medium" tone="#fbbf24" sub="Advisories" />
        <Stat value={open} label="Unhandled" sub="Awaiting operator" tone={open ? "#e2e8f0" : "#4ade80"} />
        <Stat value={incidents.length + (ds?.incidents.length ?? 0)} label="Incidents" sub={`${incidents.length} created · ${ds?.incidents.length ?? 0} field reports`} />
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <Panel
          title="Active alerts"
          icon={<Siren className="h-3.5 w-3.5" />}
          className="min-w-0 flex-1"
          bodyClassName="scroll-thin overflow-y-auto p-3"
          right={
            <div className="flex items-center gap-2">
              <Segmented
                size="xs"
                value={sev}
                onChange={setSev}
                options={[
                  { value: "all", label: "All" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                ]}
              />
              <Segmented
                size="xs"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "Any status" },
                  { value: "new", label: "New" },
                  { value: "acknowledged", label: "Ack" },
                  { value: "dispatched", label: "Dispatched" },
                  { value: "incident", label: "Incident" },
                ]}
              />
            </div>
          }
        >
          {loading ? <Loading /> : <AlertList alerts={alerts} emptyText="No alerts match the filters." />}
        </Panel>
        <div className="scroll-thin flex w-[400px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Incidents" icon={<ClipboardList className="h-3.5 w-3.5" />} className="shrink-0" bodyClassName="p-0">
            {incidents.map((i) => (
              <div key={i.id} className="border-t border-ink-700/60 px-3 py-2 first:border-t-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-violet-300">{i.id}</span>
                  <Tag tone={i.status === "open" ? "violet" : i.status === "team-dispatched" ? "green" : "slate"}>{i.status}</Tag>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">from {i.alertId}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-200">{i.title}</p>
                <p className="text-[11px] text-slate-500">{i.location}</p>
              </div>
            ))}
            {ds?.incidents.map((i) => (
              <div key={i.id} className="border-t border-ink-700/60 px-3 py-2 first:border-t-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-red-300">{i.id}</span>
                  <Tag tone="red">Field report</Tag>
                  <SimTag />
                </div>
                <p className="mt-0.5 text-xs text-slate-200">{i.name}</p>
                <p className="text-[11px] text-slate-500">{i.description}</p>
              </div>
            ))}
            {!incidents.length && !ds?.incidents.length && <Empty>No incidents.</Empty>}
          </Panel>
          <Panel title="Alert thresholds" icon={<Gauge className="h-3.5 w-3.5" />} className="shrink-0">
            <div className="space-y-1.5 text-xs">
              <Threshold sev="critical" text="Street depth forecast to exceed 1.0 m within 3 h" />
              <Threshold sev="high" text="Road forecast unsafe (≥ 0.3 m) or hotspot HIGH risk (≥ 0.5 m)" />
              <Threshold sev="high" text="Hospital access road forecast unsafe" />
              <Threshold sev="medium" text="Drain node forecast ≥ 90% capacity" />
              <Threshold sev="medium" text="Rainfall rising > 15 mm/hr in 30 min over a sector" />
            </div>
            <p className="mt-2 text-[10.5px] text-slate-500">Prototype thresholds. Production: calibrated per ward against false-alarm rate (proposal slide 4).</p>
          </Panel>
          <Panel title="Activity log" icon={<ScrollText className="h-3.5 w-3.5" />} className="shrink-0" bodyClassName="p-0">
            {log.length ? (
              <div className="max-h-72 overflow-y-auto">
                {log.map((l) => (
                  <div key={l.id} className="flex gap-2 border-t border-ink-700/60 px-3 py-1.5 text-[11.5px] first:border-t-0">
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{new Date(l.at).toLocaleTimeString("en-IN", { hour12: false })}</span>
                    <span className={cx(l.kind === "alert" ? "text-red-300" : l.kind === "warn" ? "text-amber-300" : l.kind === "action" ? "text-emerald-300" : "text-slate-300")}>{l.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Operator actions (dispatch, acknowledge, incidents) are logged here.</Empty>
            )}
          </Panel>
          {data?.alerts[0] && (
            <Button variant="outline" onClick={() => ops.viewOnMap(data.alerts[0])}>
              Show top alert on map
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Threshold({ sev, text }: { sev: Severity; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <SeverityBadge severity={sev} className="w-20 shrink-0 justify-center" />
      <span className="text-slate-300">{text}</span>
    </div>
  );
}
