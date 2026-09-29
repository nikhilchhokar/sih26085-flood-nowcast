"use client";
import { CheckCheck, FilePlus, MapPin, Send } from "lucide-react";
import type { Alert } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useOps } from "@/lib/hooks/ops";
import { clockLabel } from "@/lib/engine/constants";
import { Button, Empty, SeverityBadge, Tag, cx } from "../ui/primitives";

const STATUS_TAG = {
  new: null,
  acknowledged: <Tag tone="slate">Acknowledged</Tag>,
  dispatched: <Tag tone="green">Team dispatched</Tag>,
  incident: <Tag tone="blue">Incident open</Tag>,
} as const;

const BAR = { critical: "var(--danger)", high: "var(--danger)", medium: "var(--warn)", low: "var(--accent)" } as const;

export function AlertCard({ a, compact }: { a: Alert; compact?: boolean }) {
  const ops = useOps();
  const st = useApp((s) => s.alertState[a.id]?.status ?? "new");
  return (
    <div className={cx("flex overflow-hidden rounded border border-line bg-surface", st !== "new" && "opacity-75")}>
      <span className="w-[3px] shrink-0" style={{ background: BAR[a.severity] }} />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={a.severity} />
          <span className="font-mono text-xs text-fg-4">{a.id}</span>
          {STATUS_TAG[st]}
          <span className="ml-auto text-xs text-fg-4 tnum">{clockLabel(a.issuedClock)}</span>
        </div>
        <p className={cx("mt-1.5 leading-snug text-fg", compact ? "text-[13px]" : "text-sm")}>{a.message}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {a.location}
          </span>
          {a.predictedDepth != null && (
            <span>
              Depth <span className="font-medium text-fg tnum">{a.predictedDepth.toFixed(2)} m</span>
            </span>
          )}
          {a.timeToImpactMin != null && (
            <span>
              Impact in <span className="font-medium text-fg tnum">{a.timeToImpactMin} min</span>
            </span>
          )}
        </div>
        {!compact && (
          <p className="mt-2 border-l-2 border-line-strong pl-2 text-[13px] text-fg-2">
            <span className="text-fg-3">Recommended: </span>
            {a.recommendedAction}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" onClick={() => ops.viewOnMap(a)}>
            <MapPin className="h-3 w-3" /> View on map
          </Button>
          <Button size="xs" onClick={() => ops.dispatch(a)} disabled={st === "dispatched"}>
            <Send className="h-3 w-3" /> Dispatch team
          </Button>
          {!compact && (
            <Button size="xs" onClick={() => ops.createIncident(a)} disabled={st === "incident"}>
              <FilePlus className="h-3 w-3" /> Create incident
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => ops.acknowledge(a)} disabled={st === "acknowledged"}>
            <CheckCheck className="h-3 w-3" /> {compact ? "Acknowledge" : "Mark acknowledged"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AlertList({ alerts, compact, limit, emptyText }: { alerts: Alert[]; compact?: boolean; limit?: number; emptyText?: string }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  if (!list.length) return <Empty>{emptyText ?? "No active alerts."}</Empty>;
  return (
    <div className="space-y-2">
      {list.map((a) => (
        <AlertCard key={a.id} a={a} compact={compact} />
      ))}
    </div>
  );
}
