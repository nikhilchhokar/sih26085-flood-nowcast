import {
  Activity,
  ChartColumn,
  ClipboardCheck,
  CloudRain,
  Database,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  Network,
  Route,
  Siren,
  Tent,
  WavesHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operations",
    items: [
      { href: "/command-center", label: "Command Center", icon: LayoutDashboard, hint: "Where, when, how severe, what to do" },
      { href: "/nowcast", label: "Flood Nowcast Map", icon: WavesHorizontal, hint: "0–3 h street-level flood evolution" },
      { href: "/rainfall", label: "Rainfall & Weather", icon: CloudRain, hint: "Radar, gauges, rainfall nowcast" },
      { href: "/drainage", label: "Drainage Network", icon: Network, hint: "Directed stormwater graph, surcharge" },
      { href: "/alerts", label: "Alerts & Incidents", icon: Siren, hint: "Threshold alerts and incident log" },
      { href: "/actions", label: "Response Actions", icon: ClipboardCheck, hint: "Recommended municipal actions" },
      { href: "/routing", label: "Safe Route", icon: Route, hint: "Flood-aware emergency routing" },
      { href: "/evacuation", label: "Evacuation", icon: Tent, hint: "Shelters, safe corridors, population at risk" },
    ],
  },
  {
    group: "Planning",
    items: [
      { href: "/scenario", label: "Scenario Simulator", icon: FlaskConical, hint: "What-if storms & drainage conditions" },
      { href: "/analytics", label: "Analytics & History", icon: ChartColumn, hint: "Historical events (synthetic catalogue)" },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/model", label: "Model Performance", icon: Gauge, hint: "Reference & target metrics" },
      { href: "/health", label: "Model / Data Health", icon: Activity, hint: "Feed freshness & component status" },
      { href: "/architecture", label: "Architecture", icon: Layers, hint: "5-layer technical architecture" },
      { href: "/data-sources", label: "Data Sources & Settings", icon: Database, hint: "Live / static / simulated sources" },
    ],
  },
];
