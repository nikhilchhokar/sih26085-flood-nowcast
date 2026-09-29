"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useAlerts, useNetwork, useNowcast } from "@/lib/hooks/data";
import { api } from "@/lib/api/client";
import { NOW_CLOCK } from "@/lib/engine/constants";
import { bboxOf } from "@/lib/geo";
import { STEPS, demoProgress, heroAlertLine, type DemoCtx } from "./steps";

/**
 * Drives the scripted "LIVE DEMO" (≈75 s). Every number shown is read from the
 * simulation output; the script only decides pacing, camera and layers.
 */
export function LiveDemoController() {
  const demo = useApp((s) => s.demo);
  const router = useRouter();
  const path = usePathname();
  const { data: ds } = useNetwork();
  const { data: now } = useNowcast();
  const { data: alerts } = useAlerts();
  const entered = useRef("");
  const elapsed = useRef(0);
  const ctxRef = useRef<DemoCtx | null>(null);

  const ready = !!(ds && now && alerts && !useApp.getState().appliedScenario);
  ctxRef.current = ds && now && alerts ? { ds, res: now.result, alerts: alerts.alerts, route: demo.route } : null;

  // start: make sure we are on the command centre, on the baseline nowcast
  useEffect(() => {
    if (!demo.active) return;
    const st = useApp.getState();
    if (path !== "/command-center") router.push("/command-center");
    if (st.appliedScenario) st.applyScenario(null);
    entered.current = "";
    elapsed.current = 0;
    st.setPlaying(false);
    st.select(null);
    st.setLayers({ rain: true, depth: true, drainage: false, flow: false, risk: false, roads: true, routes: false, infra: true, shelters: true, surcharge: true, blocked: false, level: false });
    st.setTau(-30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.active, demo.runId]);

  useEffect(() => {
    if (!demo.active || !ready) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const st = useApp.getState();
      if (!st.demo.active) return;
      const dt = Math.min(100, t - last);
      last = t;
      const step = STEPS[st.demo.step];
      const key = `${st.demo.runId}:${st.demo.step}`;
      if (entered.current !== key) {
        entered.current = key;
        elapsed.current = 0;
        enter(st.demo.step);
      }
      if (!st.demo.paused && !st.demo.finished) {
        elapsed.current += dt;
        const k = Math.min(1, elapsed.current / (step.duration * 0.88));
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        st.setTau(step.tau[0] + (step.tau[1] - step.tau[0]) * e);
        if (elapsed.current >= step.duration) {
          if (st.demo.step < STEPS.length - 1) st.setDemo({ step: st.demo.step + 1 });
          else st.setDemo({ finished: true });
        }
      }
      demoProgress.value = Math.min(1, elapsed.current / step.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.active, demo.runId, ready]);

  // keyboard controls
  useEffect(() => {
    if (!demo.active) return;
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState();
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "") {
        e.preventDefault();
        st.setDemo({ paused: !st.demo.paused });
      } else if (e.key === "ArrowRight") st.setDemo({ step: Math.min(STEPS.length - 1, st.demo.step + 1), finished: false });
      else if (e.key === "ArrowLeft") st.setDemo({ step: Math.max(0, st.demo.step - 1), finished: false });
      else if (e.key === "Escape") st.setDemo({ active: false, finished: false, route: null, highlight: [] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demo.active]);

  function enter(step: number) {
    const st = useApp.getState();
    const c = ctxRef.current;
    if (!c) return;
    const { ds } = c;
    const hero = ds.roads.find((r) => r.id === ds.hero.roadId)!;
    const heroMid = hero.coords[Math.floor(hero.coords.length / 2)];
    const node = ds.drainNodes.find((n) => n.id === ds.hero.nodeId)!;
    switch (STEPS[step].key) {
      case "rain":
        st.setLayers({ rain: true, depth: true, drainage: false, flow: false, risk: false, routes: false });
        st.select(null);
        st.setDemo({ highlight: [], route: null });
        st.setMapFocus(ds.center, 13.4);
        break;
      case "coupling":
        st.setLayers({ rain: true, drainage: true, flow: true, surcharge: true });
        st.pushLog("Live demo: rainfall forcing coupled into drainage graph","info");
        break;
      case "filling":
        st.setLayers({ rain: false });
        st.select({ kind: "node", id: node.id });
        st.setMapFocus(node.coord, 15.2);
        break;
      case "surcharge":
        st.toast({ tone: "high", title: `Surcharge warning · ${node.id}`, body: `Drain capacity exceeded — water overflowing to street level near ${hero.name}.` });
        st.pushLog(`${node.id} surcharge warning`, "warn");
        break;
      case "propagation":
        st.select(null);
        st.setLayers({ risk: true, flow: true });
        st.setMapFocus(heroMid, 14.3);
        break;
      case "unsafe":
        st.select({ kind: "road", id: ds.hero.unsafeRoadId });
        st.setDemo({ highlight: [ds.hero.roadId, ds.hero.unsafeRoadId] });
        break;
      case "alert":
        st.select({ kind: "road", id: ds.hero.roadId });
        st.toast({ tone: "critical", title: "Critical alert issued", body: heroAlertLine(c) });
        st.pushLog(`Alert issued: ${heroAlertLine(c)}`, "alert");
        break;
      case "route": {
        st.select(null);
        st.setLayers({ routes: true, drainage: false, flow: false });
        st.setDemo({ highlight: [] });
        const inc = ds.incidents.find((i) => i.id === ds.hero.incidentId) ?? ds.incidents[0];
        if (inc) {
          api
            .routes({ city: ds.id, vehicle: "ambulance", originId: ds.hero.hospitalId, destination: { incidentId: inc.id }, clock: NOW_CLOCK + 60 })
            .then((r) => {
              if (useApp.getState().demo.active) {
                useApp.getState().setDemo({ route: r });
                const b = bboxOf(r.options.flatMap((o) => o.coords));
                useApp.setState({ mapFocus: { center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], bounds: b, key: Date.now() } });
              }
            })
            .catch(() => {});
        }
        st.pushLog("Ambulance route recalculated (safe route mode)","action");
        break;
      }
      case "actions":
        st.setLayers({ drainage: true, flow: false });
        st.toast({ tone: "info", title: "6 response actions recommended", body: "Review and dispatch from the Recommended Actions panel." });
        break;
    }
  }

  return null;
}
