/**
 * Study-area definitions for the three demo cities.
 * Each bbox is a ~4–5 km pilot area around a historically flood-prone corridor
 * ("one-ward pilot per city before scale-up" — see proposal, slide 4).
 */
export type CityId = "delhi" | "mumbai" | "chennai";

export interface CityConfig {
  id: CityId;
  name: string;
  state: string;
  pilotArea: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  zoom: number;
  /** Where stormwater finally discharges (river / creek / lake). Nearest drain nodes become outfalls. */
  outfallAnchors: { name: string; coord: [number, number] }[];
  /** Road whose name (substring match) hosts the demo hotspot. */
  heroRoadMatch: RegExp;
  /** Approximate hotspot location used to pick the demo node. */
  heroAnchor: [number, number];
  /** Receiving water body that can cause backwater. */
  backwater: { kind: "river" | "tidal"; label: string };
  /** Gross residential density used to synthesise population (persons / km²). */
  density: number;
  /** Design rainfall intensity the existing drains were sized for (mm/hr). */
  designRainfall: number;
}

export const CITIES: CityConfig[] = [
  {
    id: "delhi",
    name: "Delhi",
    state: "NCT of Delhi",
    pilotArea: "ITO – Rajghat – Daryaganj corridor",
    bbox: [77.218, 28.612, 77.268, 28.652],
    zoom: 13.6,
    outfallAnchors: [
      { name: "Yamuna (Rajghat regulator)", coord: [77.2585, 28.6445] },
      { name: "Yamuna (ITO drain outfall)", coord: [77.2600, 28.6265] },
    ],
    heroRoadMatch: /Ring Road/i,
    heroAnchor: [77.2545, 28.6345],
    backwater: { kind: "river", label: "Yamuna river stage (backflow at regulators)" },
    density: 24000,
    designRainfall: 50,
  },
  {
    id: "mumbai",
    name: "Mumbai",
    state: "Maharashtra",
    pilotArea: "Hindmata – Parel – Dadar – King's Circle",
    bbox: [72.833, 18.995, 72.872, 19.040],
    zoom: 13.6,
    outfallAnchors: [
      { name: "Arabian Sea (Dadar outfall)", coord: [72.8345, 19.0200] },
      { name: "Mahim Creek outfall", coord: [72.8420, 19.0385] },
      { name: "Worli outfall", coord: [72.8340, 19.0020] },
    ],
    heroRoadMatch: /Ambedkar|Hindmata|Tilak/i,
    heroAnchor: [72.8430, 19.0060],
    backwater: { kind: "tidal", label: "High tide at sea outfalls (flood gates)" },
    density: 42000,
    designRainfall: 50,
  },
  {
    id: "chennai",
    name: "Chennai",
    state: "Tamil Nadu",
    pilotArea: "Velachery – Taramani – Guindy",
    bbox: [80.205, 12.965, 80.248, 13.005],
    zoom: 13.6,
    outfallAnchors: [
      { name: "Velachery Lake", coord: [80.2170, 12.9800] },
      { name: "Pallikaranai marsh channel", coord: [80.2240, 12.9660] },
      { name: "Buckingham Canal", coord: [80.2470, 12.9900] },
    ],
    heroRoadMatch: /Velachery|100 Feet|Taramani/i,
    heroAnchor: [80.2210, 12.9790],
    backwater: { kind: "tidal", label: "Tide-locked canal outfalls / marsh stage" },
    density: 18000,
    designRainfall: 45,
  },
];
