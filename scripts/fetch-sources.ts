/**
 * One-off fetch of public source data for the pilot areas:
 *   - OpenStreetMap roads, emergency facilities, localities, land cover (Overpass API)
 *   - SRTM 30 m terrain samples (OpenTopoData public API)
 *
 * Output: data/raw/<city>.json  (snapshot; the app never calls these services at runtime)
 * Usage:  npm run data:fetch [-- delhi]
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CITIES } from "./cities.config";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const TOPO = "https://api.opentopodata.org/v1/srtm30m";
const UA = "CodeSutra-SIH26085-prototype/0.1 (hackathon demo; one-off fetch)";
const DEM_N = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string, label: string): Promise<any> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      console.log(`  ✓ ${label}: ${json.elements.length} elements`);
      return json;
    } catch (e) {
      console.warn(`  ! ${label} attempt ${attempt} failed: ${(e as Error).message}`);
      await sleep(4000 * attempt);
    }
  }
  throw new Error(`Overpass failed for ${label}`);
}

async function dem(bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  const pts: [number, number][] = [];
  for (let r = 0; r < DEM_N; r++) {
    for (let c = 0; c < DEM_N; c++) {
      const lat = n - ((r + 0.5) / DEM_N) * (n - s);
      const lon = w + ((c + 0.5) / DEM_N) * (e - w);
      pts.push([lat, lon]);
    }
  }
  const values: number[] = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const loc = chunk.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join("|");
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        const res = await fetch(`${TOPO}?locations=${loc}`, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        for (const r of json.results) values.push(r.elevation ?? NaN);
        ok = true;
      } catch (e) {
        console.warn(`  ! DEM chunk ${i} attempt ${attempt}: ${(e as Error).message}`);
        await sleep(2500 * attempt);
      }
    }
    if (!ok) throw new Error("DEM fetch failed");
    await sleep(1150); // public API: max 1 call / second
  }
  console.log(`  ✓ DEM: ${values.length} samples (${DEM_N}x${DEM_N})`);
  return { cols: DEM_N, rows: DEM_N, bbox, values };
}

async function main() {
  const only = process.argv[2];
  const outDir = join(process.cwd(), "data", "raw");
  mkdirSync(outDir, { recursive: true });

  for (const city of CITIES) {
    if (only && city.id !== only) continue;
    const out = join(outDir, `${city.id}.json`);
    if (existsSync(out) && !process.env.FORCE) {
      console.log(`${city.name}: exists, skipping (FORCE=1 to refetch)`);
      continue;
    }
    console.log(`${city.name} ${city.bbox.join(",")}`);
    const [w, s, e, n] = city.bbox;
    const b = `(${s},${w},${n},${e})`;
    // facilities: search ~1 km beyond the pilot area so every area has responders
    const m = 0.01;
    const bf = `(${s - m},${w - m},${n + m},${e + m})`;

    const roads = await overpass(
      `[out:json][timeout:120];
       way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]${b}->.r;
       .r out body; .r >; out skel qt;`,
      "roads",
    );
    await sleep(2000);
    const facilities = await overpass(
      `[out:json][timeout:90];
       ( nwr["amenity"~"^(hospital|fire_station|police|school|college|community_centre)$"]${bf};
         nwr["healthcare"="hospital"]${bf}; );
       out center tags;`,
      "facilities",
    );
    await sleep(2000);
    const places = await overpass(
      `[out:json][timeout:60];
       node["place"~"^(suburb|neighbourhood|quarter|locality)$"]${b};
       out body;`,
      "places",
    );
    await sleep(2000);
    const cover = await overpass(
      `[out:json][timeout:120];
       ( way["leisure"~"^(park|garden|stadium|pitch|golf_course)$"]${b};
         way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"]${b};
         way["natural"~"^(water|wood|scrub|wetland)$"]${b};
         way["waterway"~"^(river|canal|drain|stream)$"]${b}; );
       out geom;`,
      "land cover / water",
    );
    await sleep(1500);
    const terrain = await dem(city.bbox);

    writeFileSync(
      out,
      JSON.stringify({
        city: city.id,
        fetchedAt: new Date().toISOString(),
        attribution: {
          osm: "© OpenStreetMap contributors, ODbL",
          dem: "SRTM GL1 30 m via OpenTopoData",
        },
        roads,
        facilities,
        places,
        cover,
        dem: terrain,
      }),
    );
    console.log(`  → ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
