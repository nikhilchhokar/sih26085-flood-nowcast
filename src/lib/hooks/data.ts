"use client";
import { api } from "../api/client";
import { useApi, type ApiState } from "./useApi";
import { useApp } from "../store";
import { scenarioKey } from "../scenarioQuery";
import { NOW_CLOCK } from "../engine/constants";

export function useNetwork() {
  const city = useApp((s) => s.city);
  const st = useApi(`network:${city}`, () => api.network(city));
  return st.data && st.data.id !== city ? { ...st, data: undefined } : st;
}

export function useScenarioKey() {
  const city = useApp((s) => s.city);
  const sc = useApp((s) => s.appliedScenario);
  return sc ? scenarioKey(city, sc) : "baseline";
}

/** keepPrevious must never leak another city's data into the current city's view */
function sameCity<T extends { city: string }>(state: ApiState<T>, city: string): ApiState<T> {
  return state.data && state.data.city !== city ? { ...state, data: undefined, loading: true } : state;
}

export function useNowcast() {
  const city = useApp((s) => s.city);
  const sc = useApp((s) => s.appliedScenario);
  const radar = useApp((s) => s.flags.radarOutage);
  const sk = useScenarioKey();
  return sameCity(useApi(`nowcast:${city}:${sk}:${radar}`, () => api.nowcast(city, sc, { radarOutage: radar }), { keepPrevious: true }), city);
}

export function useAlerts() {
  const city = useApp((s) => s.city);
  const sc = useApp((s) => s.appliedScenario);
  const sk = useScenarioKey();
  return sameCity(useApi(`alerts:${city}:${sk}`, () => api.alerts(city, sc), { keepPrevious: true }), city);
}

export function useRainfall() {
  const city = useApp((s) => s.city);
  const sc = useApp((s) => s.appliedScenario);
  const radar = useApp((s) => s.flags.radarOutage);
  const sk = useScenarioKey();
  return sameCity(useApi(`rain:${city}:${sk}:${radar}`, () => api.rainfall(city, sc, { radarOutage: radar }), { keepPrevious: true }), city);
}

export function useHealth(refreshMs = 10000) {
  const flags = useApp((s) => s.flags);
  return useApi(`health:${flags.radarOutage}:${flags.awsDelay}`, () => api.systemHealth(flags), { refreshMs, keepPrevious: true });
}

/** Absolute clock (minutes) currently displayed on maps. */
export function useClock() {
  const tau = useApp((s) => s.tau);
  return NOW_CLOCK + tau;
}
