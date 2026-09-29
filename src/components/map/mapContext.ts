"use client";
import { createContext, useContext } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { CityDataset } from "@/lib/types";

export const MapCtx = createContext<{ map: MLMap | null; ds: CityDataset | null }>({ map: null, ds: null });
export const useMapCtx = () => useContext(MapCtx);
