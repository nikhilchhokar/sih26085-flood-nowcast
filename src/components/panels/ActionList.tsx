"use client";
import { BellRing, CheckCheck, MapPin, Navigation, Send } from "lucide-react";
import type { ResponseAction } from "@/lib/types";
import { useApp, type ActionStatus } from "@/lib/store";
import { useOps } from "@/lib/hooks/ops";
import { clockLabel } from "@/lib/engine/constants";
import { Button, Tag, cx } from "../ui/primitives";

const PRIORITY_TONE = { P1: "red", P2: "amber", P3: "slate" } as const;

const STATUS_LABEL: Record<ActionStatus, { label: string; tone: "slate" | "green" | "blue" }> = {
  pending: { label: "Pending", tone: "slate" },
  dispatched: { label: "Dispatched", tone: "green" },
  notified: { label: "Notified", tone: "green" },
  rerouted: { label: "Rerouted", tone: "green" },
  acknowledged: { label: "Acknowledged", tone: "blue" },
};

export function ActionRow({ act, compact, index }: { act: ResponseAction; compact?: boolean; index: number }) {
  const ops = useOps();
  const st = useApp((s) => s.actionState[act.id]?.status ?? "pending");
  const s = STATUS_LABEL[st];
  return (
    <div className="rounded border border-line bg-surface px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-medium text-fg-2 tnum">{index + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] leading-snug font-semibold text-fg">{act.title}</span>
            <Tag tone={PRIORITY_TONE[act.priority]} className="shrink-0">
              {act.priority}
            </Tag>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
            <button type="button" className="flex items-center gap-1 hover:text-accent" onClick={() => ops.viewOnMap(act)}>
              <MapPin className="h-3 w-3" />
              {act.location}
            </button>
            <span className="tnum">Due {clockLabel(act.dueClock)}</span>
            <Tag tone={s.tone}>{s.label}</Tag>
          </div>
          {!compact && <p className="mt-1 text-[13px] leading-snug text-fg-3">{act.reason}</p>}
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
              <CheckCheck className="h-3 w-3" /> Acknowledge
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionList({ actions, compact }: { actions: ResponseAction[]; compact?: boolean }) {
  return (
    <div className={cx("space-y-2")}>
      {actions.map((a, i) => (
        <ActionRow key={a.id} act={a} compact={compact} index={i} />
      ))}
    </div>
  );
}
