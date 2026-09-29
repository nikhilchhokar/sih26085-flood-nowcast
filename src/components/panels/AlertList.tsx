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
  incident: <Tag tone="violet">Incident open</Tag>,
} as const;

export function AlertCard({ a, compact }: { a: Alert; compact?: boolean }) {
  const ops = useOps();
  const st = useApp((s) => s.alertState[a.id]?.status ?? "new");
  return (
    <div
      className={cx(
        "rounded-lg border p-2.5 transition-colors",
        a.severity === "critical" ? "border-red-500/60 bg-red-500/[0.07]" : a.severity === "high" ? "border-red-500/25 bg-ink-850" : "border-ink-700 bg-ink-850",
        st !== "new" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <SeverityBadge severity={a.severity} />
        <span className="font-mono text-[10px] text-slate-500">{a.id}</span>
        {STATUS_TAG[st]}
        <span className="ml-auto font-mono text-[10px] text-slate-500">{clockLabel(a.issuedClock)}</span>
      </div>
      <p className={cx("mt-1.5 leading-snug text-slate-100", compact ? "text-[12.5px]" : "text-sm")}>{a.message}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {a.location}
        </span>
        {a.predictedDepth != null && (
          <span>
            Depth <b className="font-mono text-slate-200">{a.predictedDepth.toFixed(2)} m</b>
          </span>
        )}
        {a.timeToImpactMin != null && (
          <span>
            Impact in <b className="font-mono text-amber-300">{a.timeToImpactMin} min</b>
          </span>
        )}
      </div>
      {!compact && (
        <p className="mt-1.5 rounded-md bg-ink-800 px-2 py-1 text-[11.5px] text-slate-300">
          <span className="font-semibold text-slate-400">Recommended: </span>
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
          <CheckCheck className="h-3 w-3" /> {compact ? "Ack" : "Mark acknowledged"}
        </Button>
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
