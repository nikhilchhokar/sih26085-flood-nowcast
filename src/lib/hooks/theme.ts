"use client";
import { useEffect } from "react";
import { useApp } from "../store";

/** Keeps <html data-theme> in sync with the persisted theme. */
export function useThemeSync() {
  const theme = useApp((s) => s.theme);
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
  }, [theme, hydrated]);
}
