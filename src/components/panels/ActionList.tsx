"use client";
import { BellRing, CheckCheck, Eye, MapPin, Navigation, Send, Tent, TrafficCone, Truck } from "lucide-react";
import type { ResponseAction } from "@/lib/types";
import { useApp, type ActionStatus } from "@/lib/store";
import { useOps } from "@/lib/hooks/ops";
import { clockLabel } from "@/lib/engine/constants";
import { Button, Tag, cx } from "../ui/primitives";

const KIND_ICON = {
  divert: TrafficCone,
  dispatch: Truck,
  notify: BellRing,
  reroute: Navigation,
  activate: Tent,
  monitor: Eye,
} as const;

const PRIORITY_TONE = { P1: "red", P2: "amber", P3: "slate" } as const;

const STATUS_LABEL: Record<ActionStatus, { label: string; tone: "slate" | "green" | "cyan" | "blue" | "violet" }> = {
  pending: { label: "Pending", tone: "slate" },
  dispatched: { label: "Dispatched", tone: "green" },
  notified: { label: "Notified", tone: "cyan" },
  rerouted: { label: "Rerouted", tone: "blue" },
  acknowledged: { label: "Acknowledged", tone: "violet" },
};

export function ActionRow({ act, compact, index }: { act: ResponseAction; compact?: boolean; index: number }) {
  const ops = useOps();
  const st = useApp((s) => s.actionState[act.id]?.status ?? "pending");
  const Icon = KIND_ICON[act.kind] ?? Send;
  const s = STATUS_LABEL[st];
  return (
    <div className={cx("rounded-lg border border-ink-700 bg-ink-850 p-2.5", st !== "pending" && "border-emerald-500/25")}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-600 bg-ink-800 font-mono text-[11px] font-bold text-slate-300">{index + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone={PRIORITY_TONE[act.priority]}>{act.priority}</Tag>
            <Icon className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[13px] leading-snug font-semibold text-white">{act.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <button type="button" className="flex items-center gap-1 hover:text-cyan-300" onClick={() => ops.viewOnMap(act)}>
              <MapPin className="h-3 w-3" />
              {act.location}
            </button>
            <span>
              By <b className="font-mono text-slate-200">{clockLabel(act.dueClock)}</b>
            </span>
            <Tag tone={s.tone}>{s.label}</Tag>
          </div>
          {!compact && <p className="mt-1 text-[11.5px] leading-snug text-slate-400">{act.reason}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="xs" onClick={() => ops.runAction(act, "dispatch")} disabled={st === "dispatched"}>
              <Send className="h-3 w-3" /> Dispatch
            </Button>
            <Button size="xs" onClick={() => ops.runAction(act, "notify")} disabled={st === "notified"}>
              <BellRing className="h-3 w-3" /> Notify
            </Button>
            <Button size="xs" onClick={() => ops.runAction(act, "reroute")} disabled={st === "rerouted"}>
              <Navigation className="h-3 w-3" /> Reroute
            </Button>
            <Button size="xs" variant="ghost" onClick={() => ops.runAction(act, "acknowledge")} disabled={st === "acknowledged"}>
              <CheckCheck className="h-3 w-3" /> Ack
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionList({ actions, compact }: { actions: ResponseAction[]; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {actions.map((a, i) => (
        <ActionRow key={a.id} act={a} compact={compact} index={i} />
      ))}
    </div>
  );
}
