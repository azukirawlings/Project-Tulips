import { useEffect, useState, type CSSProperties } from "react";
import { MapChrome, Presence, StatusBar, ToolRail, TopBar } from "./Chrome";
import { Inspector, FeatureCard } from "./Inspector";
import { Overview } from "./Overview";
import { MapView } from "@/map/MapView";
import { useSandbox } from "@/map/store";
import { luminance, mixHex } from "@/map/types";

export function Sandbox() {
  const panelOpen = useSandbox((state) => state.panelOpen);
  const board = useSandbox((state) => state.board);
  const menu = useSandbox((state) => state.menu);
  const appearance = useSandbox((state) => state.appearance);
  const setMenu = useSandbox((state) => state.setMenu);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-menu-root]")) setMenu(null);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [menu, setMenu]);

  const [panelOn, setPanelOn] = useState(panelOpen);
  const [panelLeaving, setPanelLeaving] = useState(false);
  useEffect(() => {
    if (panelOpen) {
      setPanelOn(true);
      setPanelLeaving(false);
      return;
    }
    setPanelLeaving(true);
    const id = window.setTimeout(() => {
      setPanelOn(false);
      setPanelLeaving(false);
    }, 170);
    return () => window.clearTimeout(id);
  }, [panelOpen]);

  const color = /^#[0-9a-fA-F]{6}$/.test(appearance.color) ? appearance.color : "#0c0e0d";
  const light = luminance(color) > 0.55;
  const style = {
    "--color-bg": color,
    "--color-surface": mixHex(color, light ? "#000000" : "#ffffff", light ? 0.06 : 0.08),
    "--color-surface-2": mixHex(color, light ? "#000000" : "#ffffff", light ? 0.14 : 0.16),
    "--color-fg": light ? "#161a17" : "#e7e8e4",
    "--color-muted": light ? "#3e4a44" : "#9aa097",
    "--color-line": mixHex(color, light ? "#161a17" : "#e7e8e4", 0.22),
    "--color-ink": light ? "#f4f5f2" : "#161a17",
    backgroundColor: color,
    backgroundImage: appearance.image ? `url("${appearance.image}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as CSSProperties;

  return (
    <div className={`shell${panelOn ? " panel-open" : ""}${panelLeaving ? " panel-leaving" : ""}`} data-wallpaper={appearance.image ? "1" : undefined} style={style}>
      <TopBar />
      <ToolRail />
      <div className="mapcell">
        <MapView />
        <MapChrome />
        <FeatureCard />
        <Presence open={board}>{(closing) => <Overview closing={closing} />}</Presence>
      </div>
      <Inspector />
      <StatusBar />
    </div>
  );
}
