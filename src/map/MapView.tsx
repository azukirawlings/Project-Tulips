import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { mountMap } from "./engine";
import { useSandbox } from "./store";
import { BASEMAPS } from "./types";

const leafletPromise: Promise<typeof import("leaflet")> | null =
  typeof window === "undefined" ? null : import("leaflet");

function resolveLeaflet(mod: unknown): typeof import("leaflet") {
  const record = mod as { default?: { map?: unknown }; map?: unknown };
  if (record.default && typeof record.default.map === "function") return record.default as typeof import("leaflet");
  if (typeof record.map === "function") return mod as typeof import("leaflet");
  throw new Error("地图库没有加载");
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tool = useSandbox((state) => state.tool);
  const basemap = useSandbox(
    (state) => state.scenarios.find((scenario) => scenario.id === state.activeId)?.basemap ?? "dark",
  );
  const tone = BASEMAPS.find((item) => item.id === basemap)?.tone ?? "dark";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !leafletPromise) return;
    let dead = false;
    let destroy = () => {};
    void leafletPromise
      .then((mod) => {
        if (dead || !host.isConnected) return;
        destroy = mountMap(resolveLeaflet(mod), host);
      })
      .catch((err: unknown) => {
        if (!dead) setError(err instanceof Error ? err.message : "地图没有展开");
      });
    return () => {
      dead = true;
      destroy();
    };
  }, []);

  return (
    <div className="map-frame">
      <div ref={hostRef} className="map-host" data-tool={tool} data-tone={tone} />
      {error ? <p className="map-error">{error}</p> : null}
    </div>
  );
}
