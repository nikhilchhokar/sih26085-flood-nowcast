"use client";
import { useRouter, usePathname } from "next/navigation";
import { useApp, type Selection } from "../store";
import type { Alert, ResponseAction } from "../types";

function targetToSelection(t: Alert["target"]): Selection {
  switch (t.kind) {
    case "road":
      return { kind: "road", id: t.id };
    case "node":
      return { kind: "node", id: t.id };
    case "sector":
      return { kind: "sector", id: t.id };
    default:
      return { kind: "poi", id: t.id };
  }
}

/** Operator actions on alerts & recommended actions (state is local to the demo session). */
export function useOps() {
  const router = useRouter();
  const path = usePathname();
  const st = useApp.getState;

  const viewOnMap = (a: { target: Alert["target"]; coord: [number, number] }) => {
    st().select(targetToSelection(a.target));
    st().setMapFocus(a.coord, 15.3);
    if (path !== "/command-center" && path !== "/nowcast") router.push("/command-center");
  };

  return {
    viewOnMap,
    acknowledge: (a: Alert) => {
      st().setAlertStatus(a.id, "acknowledged");
      st().pushLog(`${a.id} acknowledged — ${a.location}`, "info");
      st().toast({ tone: "success", title: `${a.id} acknowledged`, body: a.location });
    },
    dispatch: (a: Alert) => {
      st().setAlertStatus(a.id, "dispatched");
      st().pushLog(`Response team dispatched to ${a.location} (${a.id})`, "action");
      st().toast({ tone: "success", title: "Team dispatched", body: `QRT-${(a.id.charCodeAt(6) % 7) + 2} en route to ${a.location}` });
    },
    createIncident: (a: Alert) => {
      const id = `INC-${3100 + Math.floor(Math.random() * 800)}`;
      st().addIncident({ id, alertId: a.id, title: a.title, location: a.location, createdAt: Date.now(), status: "open" });
      st().setAlertStatus(a.id, "incident");
      st().pushLog(`Incident ${id} created from ${a.id}`, "action");
      st().toast({ tone: "info", title: `Incident ${id} created`, body: a.title });
    },
    runAction: (act: ResponseAction, verb: "dispatch" | "notify" | "reroute" | "acknowledge") => {
      const status = verb === "dispatch" ? "dispatched" : verb === "notify" ? "notified" : verb === "reroute" ? "rerouted" : "acknowledged";
      st().setActionStatus(act.id, status);
      const msg =
        verb === "dispatch"
          ? `Crew dispatched: ${act.title}`
          : verb === "notify"
            ? `Notification sent (SMS/app, demo): ${act.title}`
            : verb === "reroute"
              ? `Reroute issued: ${act.title}`
              : `Acknowledged: ${act.title}`;
      st().pushLog(msg, "action");
      st().toast({ tone: "success", title: status.toUpperCase(), body: act.title });
      if (verb === "reroute") router.push("/routing");
    },
  };
}
