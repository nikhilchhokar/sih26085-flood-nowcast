import { json } from "@/lib/server/datasets";
import { systemHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return json(systemHealth({ radarOutage: q.get("radarOutage") === "1", awsDelay: q.get("awsDelay") === "1" }));
}
