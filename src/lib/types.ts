/* ------------------------------------------------------------------ */
/*  Shared domain types — mirror the planned FastAPI / PostGIS schema  */
/* ------------------------------------------------------------------ */

export type CityId = "delhi" | "mumbai" | "chennai";
export type LngLat = [number, number];
export type RiskLevel = "safe" | "low" | "moderate" | "high" | "critical";
export type Severity = "critical" | "high" | "medium" | "low";

export type RoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unclassified"
  | "residential";

export interface Sector {
  id: string; // SEC-4
  number: number;
  name: string; // Sector 4
  locality: string; // real locality name from OSM
  polygon: LngLat[];
  centroid: LngLat;
  areaKm2: number;
  population: number;
  impervious: number; // 0..1
  meanElev: number;
}

export interface RoadSegment {
  id: string; // R-229
  name: string; // OSM name
  label: string; // "Ring Road — Sector 4"
  cls: RoadClass;
  major: boolean;
  coords: LngLat[];
  lengthM: number;
  sectorId: string;
  nodeId: string; // drain node it discharges to
  elev: number;
  /** 0..1, how low the road sits relative to its surroundings */
  relLow: number;
  /** multiplier on node ponding depth */
  susceptibility: number;
  lanes?: number;
}

export type DrainNodeKind = "manhole" | "junction" | "outfall" | "pump";

export interface DrainNode {
  id: string; // DN-184
  coord: LngLat;
  sectorId: string;
  kind: DrainNodeKind;
  elev: number;
  /** depth from invert to ground; level beyond this = surcharge (m) */
  maxDepth: number;
  /** pipe + chamber storage at surcharge (m³) */
  storage: number;
  /** design outflow capacity (m³/s) */
  capacity: number;
  /** local contributing area (ha) */
  catchmentHa: number;
  /** total upstream area incl. local (ha) */
  upstreamHa: number;
  impervious: number;
  /** baseline silt / debris blockage 0..1 */
  blockage: number;
  downstream: string | null;
  upstream: string[];
  roadIds: string[];
  /** effective surface ponding area (m²) — small in depressions */
  pondArea: number;
  /** topological order (upstream first) */
  order: number;
  outfallName?: string;
}

export interface DrainEdge {
  id: string; // P-104
  from: string;
  to: string;
  coords: LngLat[];
  lengthM: number;
  diameterM: number;
  capacity: number;
  slope: number;
}

export type PoiKind = "hospital" | "fire" | "police" | "shelter";

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  coord: LngLat;
  sectorId: string;
  elev: number;
  nodeId: string; // nearest drain node
  graphNode: number; // nearest routing-graph node
  beds?: number;
  capacity?: number;
  /** road segments giving access (within ~150 m) */
  accessRoadIds: string[];
}

export interface Vehicle {
  id: string;
  kind: "ambulance" | "fire" | "police";
  name: string;
  baseId: string;
  coord: LngLat;
  graphNode: number;
  status: "available" | "en-route" | "on-scene";
}

export interface RouteGraph {
  nodes: LngLat[];
  /** [a, b, lengthM, roadIndex] */
  edges: [number, number, number, number][];
  /** intermediate vertices of each edge (excluding endpoints) */
  geoms: LngLat[][];
}

export interface Grid {
  cols: number;
  rows: number;
  bbox: [number, number, number, number];
}

export interface DemGrid extends Grid {
  values: number[];
  min: number;
  max: number;
}

export interface HeatGrid extends Grid {
  /** index into drainNodes per cell, -1 = none */
  node: number[];
  /** 0..1 depth multiplier (road proximity × relative lowness) */
  weight: number[];
  /** population per cell */
  pop: number[];
}

export interface Junction {
  id: string;
  name: string;
  coord: LngLat;
  roadIds: string[];
  sectorId: string;
}

export interface RainGauge {
  id: string;
  name: string;
  coord: LngLat;
}

export interface Incident {
  id: string;
  name: string;
  coord: LngLat;
  graphNode: number;
  sectorId: string;
  description: string;
}

export interface CityDataset {
  id: CityId;
  name: string;
  state: string;
  pilotArea: string;
  bbox: [number, number, number, number];
  center: LngLat;
  zoom: number;
  fetchedAt: string;
  attribution: { osm: string; dem: string };
  backwater: { kind: "river" | "tidal"; label: string; defaultOn: boolean };
  designRainfall: number;
  sectors: Sector[];
  roads: RoadSegment[];
  drainNodes: DrainNode[];
  drainEdges: DrainEdge[];
  pois: Poi[];
  vehicles: Vehicle[];
  junctions: Junction[];
  graph: RouteGraph;
  dem: DemGrid;
  heat: HeatGrid;
  rainGrid: Grid;
  gauges: RainGauge[];
  incidents: Incident[];
  water: { lines: LngLat[][]; polygons: LngLat[][] };
  green: LngLat[][];
  storm: StormTrack;
  hero: {
    roadId: string;
    nodeId: string;
    downstreamNodeId: string;
    unsafeRoadId: string;
    sectorId: string;
    residentsSectorId: string;
    shelterId: string;
    hospitalId: string;
    incidentId: string;
  };
  stats: {
    roadKm: number;
    drainKm: number;
    population: number;
    areaKm2: number;
  };
}

/* ----------------------------- storm ------------------------------ */

export interface StormTrack {
  /** storm-core position at clock minute t0 */
  origin: LngLat;
  t0: number;
  /** core velocity in degrees / minute */
  velocity: LngLat;
  /** core radius (km) */
  sigmaKm: number;
  /** 0..1: how much of the rain is concentrated in the core */
  contrast: number;
}

/* ---------------------------- scenario ---------------------------- */

export interface ScenarioParams {
  /** "baseline" = observed + nowcast rainfall; "design" = synthetic design storm */
  mode: "baseline" | "design";
  /** design storm mean intensity (mm/hr) — ignored for baseline */
  rainfallIntensity: number;
  /** design storm duration (min) */
  stormDuration: number;
  /** multiplier on baseline rainfall (1 = as observed/nowcast) */
  rainfallScale: number;
  /** effective drainage capacity (% of design) */
  drainageCapacity: number;
  /** additional network-wide blockage (%) */
  blockage: number;
  /** antecedent water level in drains (m) */
  initialWaterLevel: number;
  backwater: boolean;
  /** impervious surface (%) — null = use land-use data */
  impervious: number | null;
}

/* ---------------------------- results ----------------------------- */

export interface SimResult {
  city: CityId;
  params: ScenarioParams;
  /** clock minute of "NOW" (issue time) */
  now: number;
  /** clock minute of step 0 */
  t0: number;
  dt: number;
  steps: number;
  /** city-mean rainfall per step (mm/hr) */
  rainMean: number[];
  /** backwater factor per step 0..1 */
  backwater: number[];
  nodes: {
    level: number[][]; // m
    util: number[][]; // 0..1+
    flow: number[][]; // m³/s
    pond: number[][]; // ponding depth at node (m)
  };
  roads: {
    depth: number[][]; // m
  };
  computeMs: number;
}

export interface NowcastSummary {
  maxDepth: number;
  maxDepthRoadId: string | null;
  roadsAtRisk: number;
  criticalIntersections: number;
  firstImpactMin: number | null;
  peakClock: number;
  affectedPopulation: number;
  hospitalsAtRisk: number;
  sectorsAffected: number;
  confidence: number;
}

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  location: string;
  sectorId: string;
  target: { kind: "road" | "node" | "sector" | "poi"; id: string };
  coord: LngLat;
  predictedDepth: number | null;
  timeToImpactMin: number | null;
  issuedClock: number;
  recommendedAction: string;
}

export type ActionKind = "dispatch" | "notify" | "reroute" | "monitor" | "activate" | "divert";

export interface ResponseAction {
  id: string;
  priority: "P1" | "P2" | "P3";
  kind: ActionKind;
  title: string;
  location: string;
  reason: string;
  dueClock: number;
  target: { kind: "road" | "node" | "sector" | "poi"; id: string };
  coord: LngLat;
}

export interface RouteOption {
  id: "A" | "B" | "C";
  label: string;
  strategy: string;
  coords: LngLat[];
  distanceKm: number;
  etaMin: number;
  maxDepth: number;
  risk: RiskLevel;
  floodedRoadIds: string[];
  roadIds: string[];
  recommended: boolean;
  passable: boolean;
}

export interface RouteResponse {
  vehicle: "ambulance" | "fire" | "police";
  originId: string;
  destination: { name: string; coord: LngLat };
  atClock: number;
  options: RouteOption[];
  avoidedRoadIds: string[];
}

export type HealthStatus = "online" | "delayed" | "warning" | "offline" | "static";
