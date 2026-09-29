"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useTauTween } from "../map/overlays";
import { cx } from "../ui/primitives";
import { PIPELINE, STEPS, demoProgress, heroAlert, type DemoCtx } from "./steps";

export function DemoOverlay({ ctx }: { ctx: DemoCtx | null }) {
  const demo = useApp((s) => s.demo);
  const setDemo = useApp((s) => s.setDemo);
  const tween = useTauTween();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!demo.active) return;
    const id = setInterval(() => setP(demoProgress.value), 100);
    return () => clearInterval(id);
  }, [demo.active]);
  if (!demo.active || !ctx) return null;
  const step = STEPS[demo.step];
  const exit = () => setDemo({ active: false, finished: false, route: null, highlight: [] });

  if (demo.finished) {
    return (
      <div className="fade-in absolute inset-x-0 top-0 z-30 flex justify-center p-4">
        <div className="shadow-float w-full max-w-3xl rounded border border-line bg-surface">
          <div className="border-b border-line px-6 pt-5 pb-4">
            <div className="text-xs font-medium text-fg-3">Live demo complete</div>
            <p className="mt-1 text-[26px] leading-tight font-semibold text-fg">From rainfall data to street-level flood intelligence to action.</p>
            <p className="mt-2 max-w-2xl text-sm text-fg-3">
              We don&apos;t just predict rain. We predict where it turns into flooding, when, which roads become unsafe, and what the city should do next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-6 py-3">
            <button type="button" onClick={() => tween(120, 900)} className="h-8 rounded border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-3">
              Show +120 min (peak extent)
            </button>
            <button type="button" onClick={() => tween(180, 1200)} className="h-8 rounded border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-3">
              Show +180 min (recovery)
            </button>
            <Link href="/routing" onClick={exit} className="flex h-8 items-center rounded border border-line-strong px-3 text-[13px] text-fg hover:bg-surface-3">
              Open safe route
            </Link>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setDemo({ step: 0, finished: false, paused: false, runId: Date.now(), route: null, highlight: [] })}
              className="flex h-8 items-center gap-1.5 rounded px-3 text-[13px] text-fg-2 hover:bg-surface-3"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Replay
            </button>
            <button type="button" onClick={exit} className="h-8 rounded bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover">
              Exit demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  const alert = step.key === "alert" ? heroAlert(ctx) : null;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
        <div className="shadow-float pointer-events-auto w-full max-w-3xl overflow-hidden rounded border border-line bg-surface">
          <div className="flex items-center gap-1 border-b border-line bg-surface-2 px-4 py-1.5">
            <span className="mr-2 flex items-center gap-1.5 text-xs font-medium text-danger">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Live demo
            </span>
            {PIPELINE.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <span className={cx("text-xs whitespace-nowrap", i === step.stage ? "font-semibold text-accent-fg" : i < step.stage ? "text-fg-3" : "text-fg-4")}>{s}</span>
                {i < PIPELINE.length - 1 && <ChevronRight className="h-3 w-3 text-fg-4" />}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="text-xs text-fg-4 tnum">
              {demo.step + 1} / {STEPS.length}
            </div>
            <div key={demo.step} className="slide-up min-w-0 flex-1">
              <div className="text-lg font-semibold text-fg">{step.title(ctx)}</div>
              <div className="mt-0.5 truncate text-[13px] text-fg-3">{step.sub(ctx)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn label="Previous step (←)" onClick={() => setDemo({ step: Math.max(0, demo.step - 1) })}>
                <ChevronLeft className="h-4 w-4" />
              </IconBtn>
              <IconBtn label={demo.paused ? "Resume (space)" : "Pause (space)"} onClick={() => setDemo({ paused: !demo.paused })} primary>
                {demo.paused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
              </IconBtn>
              <IconBtn label="Next step (→)" onClick={() => (demo.step < STEPS.length - 1 ? setDemo({ step: demo.step + 1 }) : setDemo({ finished: true }))}>
                <ChevronRight className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Exit demo (Esc)" onClick={exit}>
                <X className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
          <div className="flex gap-0.5 px-4 pb-2.5">
            {STEPS.map((s, i) => (
              <div key={s.key} className="h-1 flex-1 overflow-hidden rounded-sm bg-line">
                <div className="h-full bg-accent" style={{ width: i < demo.step ? "100%" : i === demo.step ? `${p * 100}%` : "0%" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {alert && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="slide-up shadow-float w-[440px] overflow-hidden rounded border border-line bg-surface">
            <div className="flex items-center justify-between bg-danger px-4 py-2 text-white">
              <span className="text-[13px] font-semibold">Alert issued · {alert.depth >= 1 ? "Critical" : "High"} flood risk</span>
              <span className="font-mono text-xs opacity-90">{alert.road.id}</span>
            </div>
            <div className="px-4 py-3.5">
              <div className="text-xl font-semibold text-fg">{alert.road.label}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-fg-3">Expected depth</div>
                  <div className="text-3xl font-semibold text-danger tnum">{alert.depth.toFixed(2)} m</div>
                </div>
                <div>
                  <div className="text-xs text-fg-3">Time to impact</div>
                  <div className="text-3xl font-semibold text-fg tnum">{alert.tti ?? "—"} min</div>
                </div>
              </div>
              <div className="mt-3 border-t border-line pt-2 text-[13px] text-fg-2">Recommended: restrict traffic and activate the alternate route.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IconBtn({ children, onClick, label, primary }: { children: React.ReactNode; onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx("flex h-8 w-8 items-center justify-center rounded", primary ? "bg-accent text-white hover:bg-accent-hover" : "border border-line-strong text-fg-2 hover:bg-surface-3")}
    >
      {children}
    </button>
  );
}
