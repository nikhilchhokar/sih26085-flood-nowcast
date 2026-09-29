"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Siren, X } from "lucide-react";
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
        <div className="w-full max-w-3xl rounded-2xl border border-cyan-400/30 bg-ink-950/95 p-6 text-center shadow-2xl backdrop-blur">
          <div className="font-mono text-[10px] font-bold tracking-[0.25em] text-cyan-400 uppercase">Live demo complete</div>
          <p className="mt-3 text-2xl leading-tight font-bold tracking-tight text-white md:text-3xl">
            From rainfall data
            <span className="text-cyan-300"> → </span>
            street-level flood intelligence
            <span className="text-cyan-300"> → </span>
            action.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            We don&apos;t just predict rain. We predict where it turns into flooding, when, which roads become unsafe, and what the city should do next.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => tween(120, 900)} className="rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800">
              Show +120 min (peak extent)
            </button>
            <button type="button" onClick={() => tween(180, 1200)} className="rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800">
              Show +180 min (recovery)
            </button>
            <Link href="/routing" onClick={exit} className="rounded-lg border border-emerald-500/50 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10">
              Open Safe Route
            </Link>
            <button type="button" onClick={() => setDemo({ step: 0, finished: false, paused: false, runId: Date.now(), route: null, highlight: [] })} className="flex items-center gap-1 rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800">
              <RotateCcw className="h-3.5 w-3.5" /> Replay
            </button>
            <button type="button" onClick={exit} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-ink-950 hover:bg-cyan-300">
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
        <div className="slide-up pointer-events-auto w-full max-w-3xl rounded-2xl border border-cyan-400/25 bg-ink-950/93 shadow-2xl backdrop-blur" key={demo.step}>
          {/* pipeline */}
          <div className="flex items-center gap-1 border-b border-ink-700 px-4 py-2">
            <span className="mr-2 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-red-400 uppercase">
              <span className="h-2 w-2 rounded-full bg-red-500 blink-soft" /> Live demo
            </span>
            {PIPELINE.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <span
                  className={cx(
                    "rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider whitespace-nowrap uppercase transition-colors",
                    i === step.stage ? "bg-cyan-400 text-ink-950" : i < step.stage ? "text-cyan-300/80" : "text-slate-600",
                  )}
                >
                  {s}
                </span>
                {i < PIPELINE.length - 1 && <ChevronRight className={cx("h-3 w-3", i < step.stage ? "text-cyan-400/60" : "text-slate-700")} />}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="font-mono text-[11px] font-bold text-slate-500 tnum">
              {String(demo.step + 1).padStart(2, "0")}/{String(STEPS.length).padStart(2, "0")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-semibold tracking-tight text-white">{step.title(ctx)}</div>
              <div className="mt-0.5 truncate text-[13px] text-slate-400">{step.sub(ctx)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn label="Previous step (←)" onClick={() => setDemo({ step: Math.max(0, demo.step - 1) })}>
                <ChevronLeft className="h-4 w-4" />
              </IconBtn>
              <IconBtn label={demo.paused ? "Resume (space)" : "Pause (space)"} onClick={() => setDemo({ paused: !demo.paused })} highlight>
                {demo.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </IconBtn>
              <IconBtn label="Next step (→)" onClick={() => (demo.step < STEPS.length - 1 ? setDemo({ step: demo.step + 1 }) : setDemo({ finished: true }))}>
                <ChevronRight className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Exit demo (Esc)" onClick={exit}>
                <X className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
          <div className="flex gap-1 px-4 pb-3">
            {STEPS.map((s, i) => (
              <div key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-cyan-400" style={{ width: i < demo.step ? "100%" : i === demo.step ? `${p * 100}%` : "0%" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {alert && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="slide-up w-[440px] rounded-2xl border-2 border-red-500 bg-red-950/95 p-5 shadow-[0_0_80px_rgba(220,38,38,0.45)]">
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.2em] text-red-300 uppercase">
              <Siren className="h-4 w-4" /> Alert issued · {alert.road.id}
            </div>
            <div className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-white uppercase">{alert.road.label}</div>
            <div className="mt-1 inline-block rounded bg-red-600 px-2 py-0.5 text-sm font-bold tracking-wider text-white uppercase">{alert.depth >= 1 ? "Critical" : "High"} flood risk</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-red-300/80 uppercase">Expected depth</div>
                <div className="font-mono text-3xl font-bold text-white tnum">{alert.depth.toFixed(2)} m</div>
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-widest text-red-300/80 uppercase">Time to impact</div>
                <div className="font-mono text-3xl font-bold text-white tnum">{alert.tti ?? "—"} min</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-red-200/80">Recommended: restrict traffic and activate alternate route · SIMULATED</div>
          </div>
        </div>
      )}
    </>
  );
}

function IconBtn({ children, onClick, label, highlight }: { children: React.ReactNode; onClick: () => void; label: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx("flex h-8 w-8 items-center justify-center rounded-lg border", highlight ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25" : "border-ink-600 text-slate-300 hover:bg-ink-800")}
    >
      {children}
    </button>
  );
}
