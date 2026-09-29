/** Calibration diagnostics for a built dataset. Usage: npx tsx scripts/diag.ts delhi */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CityDataset } from "../src/lib/types";
import { simulate } from "../src/lib/engine/simulate";
import { BASELINE_PARAMS, NOW_CLOCK } from "../src/lib/engine/constants";
import { sample } from "../src/lib/engine/analysis";

const id = (process.argv[2] ?? "delhi") as CityDataset["id"];
const ds: CityDataset = JSON.parse(readFileSync(join(process.cwd(), "src", "data", "cities", `${id}.json`), "utf-8"));
const p = { ...BASELINE_PARAMS[id], backwater: ds.backwater.defaultOn };
const res = simulate(ds, p);
const majors = ds.roads.map((r, i) => ({ r, i })).filter((x) => x.r.major);
console.log("clock  rain  util>0.9  surch  pond>0.1  roads>=0.1 >=0.3 >=0.5 >=1.0  maxd");
for (let c = 540; c <= NOW_CLOCK + 180; c += 15) {
  const u = ds.drainNodes.map((_, k) => sample(res.nodes.util[k], res, c));
  const pd = ds.drainNodes.map((_, k) => sample(res.nodes.pond[k], res, c));
  const d = majors.map(({ i }) => sample(res.roads.depth[i], res, c));
  const cnt = (th: number) => d.filter((x) => x >= th).length;
  console.log(
    `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}  ${sample(res.rainMean, res, c).toFixed(0).padStart(4)}  ${String(u.filter((x) => x >= 0.9).length).padStart(8)}  ${String(u.filter((x) => x >= 1).length).padStart(5)}  ${String(pd.filter((x) => x >= 0.1).length).padStart(8)}  ${String(cnt(0.1)).padStart(10)} ${String(cnt(0.3)).padStart(5)} ${String(cnt(0.5)).padStart(5)} ${String(cnt(1)).padStart(5)}  ${Math.max(...d).toFixed(2)}`,
  );
}
const hero = ds.roads.findIndex((r) => r.id === ds.hero.roadId);
const hn = ds.drainNodes.findIndex((n) => n.id === ds.hero.nodeId);
console.log("hero road depth:", [0, 30, 60, 90, 120, 150, 180].map((o) => sample(res.roads.depth[hero], res, NOW_CLOCK + o).toFixed(2)).join(" "));
console.log("hero node util :", [0, 30, 60, 90, 120, 150, 180].map((o) => sample(res.nodes.util[hn], res, NOW_CLOCK + o).toFixed(2)).join(" "));
console.log("nodes:", ds.drainNodes.length, "outfalls:", ds.drainNodes.filter((n) => n.kind === "outfall").map((n) => `${n.id}(${n.outfallName}, up ${n.upstreamHa}ha, cap ${n.capacity})`).join("; "));
const top = majors
  .map(({ r, i }) => ({ r, d: sample(res.roads.depth[i], res, NOW_CLOCK) }))
  .sort((a, b) => b.d - a.d)
  .slice(0, 8);
console.log("top @NOW:", top.map((x) => `${x.r.id} ${x.r.name} ${x.d.toFixed(2)} susc ${x.r.susceptibility} node ${x.r.nodeId}`).join("\n  "));
