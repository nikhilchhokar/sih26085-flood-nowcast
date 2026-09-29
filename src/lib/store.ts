"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CityId, LngLat, RouteResponse, ScenarioParams } from "./types";

export type LayerKey =
  | "risk"
  | "depth"
  | "rain"
  | "drainage"
  | "roads"
  | "infra"
  | "routes"
  | "shelters"
  | "flow"
  | "surcharge"
  | "blocked"
  | "level";

export type Selection =
  | { kind: "road"; id: string }
  | { kind: "node"; id: string }
  | { kind: "sector"; id: string }
  | { kind: "poi"; id: string }
  | { kind: "junction"; id: string }
  | { kind: "incident"; id: string }
  | { kind: "rain"; coord: LngLat };

export type AlertStatus = "new" | "acknowledged" | "dispatched" | "incident";
export type ActionStatus = "pending" | "dispatched" | "notified" | "rerouted" | "acknowledged";
export type Basemap = "openfreemap" | "carto" | "offline";

export interface LogEntry {
  id: number;
  at: number;
  text: string;
  kind: "info" | "warn" | "action" | "alert";
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "critical" | "high" | "medium" | "info" | "success";
}

export interface CreatedIncident {
  id: string;
  alertId: string;
  title: string;
  location: string;
  createdAt: number;
  status: "open" | "team-dispatched" | "resolved";
}

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  risk: true,
  depth: true,
  rain: false,
  drainage: true,
  roads: true,
  infra: true,
  routes: true,
  shelters: true,
  flow: true,
  surcharge: true,
  blocked: false,
  level: false,
};

interface DemoState {
  active: boolean;
  step: number;
  paused: boolean;
  finished: boolean;
  route: RouteResponse | null;
  highlight: string[];
  runId: number;
}

interface AppState {
  hydrated: boolean;
  city: CityId;
  sectorId: string | null;
  tau: number;
  playing: boolean;
  layers: Record<LayerKey, boolean>;
  selection: Selection | null;
  appliedScenario: ScenarioParams | null;
  appliedScenarioLabel: string | null;
  alertState: Record<string, { status: AlertStatus; at: number }>;
  actionState: Record<string, { status: ActionStatus; at: number }>;
  incidents: CreatedIncident[];
  log: LogEntry[];
  toasts: Toast[];
  flags: { radarOutage: boolean; awsDelay: boolean };
  basemap: Basemap;
  demo: DemoState;
  routing: {
    vehicle: "ambulance" | "fire" | "police";
    originId: string | null;
    destIncidentId: string | null;
    destCoord: LngLat | null;
    departOffset: number;
    selectedRoute: "A" | "B" | "C";
  };
  notificationsSeen: number;
  mapFocus: { center: LngLat; zoom?: number; key: number; bounds?: [number, number, number, number] } | null;

  setMapFocus: (center: LngLat, zoom?: number) => void;
  setCity: (c: CityId) => void;
  setSector: (s: string | null) => void;
  setTau: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setLayer: (k: LayerKey, v: boolean) => void;
  setLayers: (l: Partial<Record<LayerKey, boolean>>) => void;
  select: (s: Selection | null) => void;
  applyScenario: (p: ScenarioParams | null, label?: string | null) => void;
  setAlertStatus: (id: string, status: AlertStatus) => void;
  setActionStatus: (id: string, status: ActionStatus) => void;
  addIncident: (i: CreatedIncident) => void;
  pushLog: (text: string, kind?: LogEntry["kind"]) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setFlag: (k: "radarOutage" | "awsDelay", v: boolean) => void;
  setBasemap: (b: Basemap) => void;
  setDemo: (d: Partial<DemoState>) => void;
  setRouting: (r: Partial<AppState["routing"]>) => void;
  markNotificationsSeen: (n: number) => void;
  resetOperationalState: () => void;
}

let logSeq = 1;
let toastSeq = 1;

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      hydrated: false,
      city: "delhi",
      sectorId: null,
      tau: 0,
      playing: false,
      layers: DEFAULT_LAYERS,
      selection: null,
      appliedScenario: null,
      appliedScenarioLabel: null,
      alertState: {},
      actionState: {},
      incidents: [],
      log: [],
      toasts: [],
      flags: { radarOutage: false, awsDelay: false },
      basemap: "openfreemap",
      demo: { active: false, step: 0, paused: false, finished: false, route: null, highlight: [], runId: 0 },
      routing: {
        vehicle: "ambulance",
        originId: null,
        destIncidentId: null,
        destCoord: null,
        departOffset: 40,
        selectedRoute: "A",
      },
      notificationsSeen: 0,
      mapFocus: null,

      setMapFocus: (center, zoom) => set({ mapFocus: { center, zoom, key: Date.now() + Math.random() } }),
      setCity: (city) =>
        set((s) =>
          s.city === city
            ? s
            : {
                city,
                sectorId: null,
                selection: null,
                appliedScenario: null,
                appliedScenarioLabel: null,
                tau: 0,
                playing: false,
                alertState: {},
                actionState: {},
                incidents: [],
                notificationsSeen: 0,
                routing: { ...s.routing, originId: null, destIncidentId: null, destCoord: null, selectedRoute: "A" },
              },
        ),
      setSector: (sectorId) => set({ sectorId }),
      setTau: (tau) => set({ tau: Math.max(-60, Math.min(180, tau)) }),
      setPlaying: (playing) => set({ playing }),
      setLayer: (k, v) => set((s) => ({ layers: { ...s.layers, [k]: v } })),
      setLayers: (l) => set((s) => ({ layers: { ...s.layers, ...l } })),
      select: (selection) => set({ selection }),
      applyScenario: (appliedScenario, label = null) => set({ appliedScenario, appliedScenarioLabel: label, alertState: {}, actionState: {} }),
      setAlertStatus: (id, status) => set((s) => ({ alertState: { ...s.alertState, [id]: { status, at: Date.now() } } })),
      setActionStatus: (id, status) => set((s) => ({ actionState: { ...s.actionState, [id]: { status, at: Date.now() } } })),
      addIncident: (i) => set((s) => ({ incidents: [i, ...s.incidents] })),
      pushLog: (text, kind = "info") =>
        set((s) => ({ log: [{ id: logSeq++, at: Date.now(), text, kind }, ...s.log].slice(0, 80) })),
      toast: (t) => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "critical" ? 9000 : 5500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
      setBasemap: (basemap) => set({ basemap }),
      setDemo: (d) => set((s) => ({ demo: { ...s.demo, ...d } })),
      setRouting: (r) => set((s) => ({ routing: { ...s.routing, ...r } })),
      markNotificationsSeen: (notificationsSeen) => set({ notificationsSeen }),
      resetOperationalState: () =>
        set({
          alertState: {},
          actionState: {},
          incidents: [],
          log: [],
          toasts: [],
          selection: null,
          tau: 0,
          playing: false,
          appliedScenario: null,
          appliedScenarioLabel: null,
          notificationsSeen: 0,
          layers: DEFAULT_LAYERS,
        }),
    }),
    {
      name: "sih26085-console",
      skipHydration: true,
      partialize: (s) => ({ city: s.city, basemap: s.basemap, flags: s.flags }),
      onRehydrateStorage: () => () => {
        useApp.setState({ hydrated: true });
      },
    },
  ),
);
