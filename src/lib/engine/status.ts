import type { NodeStatus } from "../api/types";

export function nodeStatus(util: number, pond: number): NodeStatus {
  if (pond >= 0.05) return "surcharged";
  if (util >= 0.9) return "warning";
  if (util >= 0.75) return "watch";
  return "normal";
}

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  normal: "Normal",
  watch: "Watch",
  warning: "Warning",
  surcharged: "Surcharged",
};

export const NODE_STATUS_COLOR: Record<NodeStatus, string> = {
  normal: "#38bdf8",
  watch: "#facc15",
  warning: "#f97316",
  surcharged: "#dc2626",
};

/** Colour for drain utilisation 0..1 (pipes & nodes). */
export function utilColor(u: number) {
  if (u >= 0.999) return "#dc2626";
  if (u >= 0.9) return "#f97316";
  if (u >= 0.75) return "#facc15";
  if (u >= 0.5) return "#38bdf8";
  return "#1d4ed8";
}
