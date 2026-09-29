"use client";
import dynamic from "next/dynamic";
import type { FloodMapProps } from "./FloodMap";
import { Loading } from "../ui/primitives";

/** MapLibre / deck.gl touch `window`, so the map is client-only. */
const Inner = dynamic(() => import("./FloodMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#dfe5ea]">
      <Loading label="Initialising GIS engine…" className="text-fg-4" />
    </div>
  ),
});

/** Keyed by city so switching cities always mounts a clean map. */
export function FloodMap(props: FloodMapProps) {
  return <Inner key={props.ds.id} {...props} />;
}
