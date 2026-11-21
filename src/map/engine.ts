import {
  bearing,
  centroidOf,
  coordText,
  dedupe,
  destination,
  distMeters,
  formatBearing,
  formatDistance,
  gridStep,
  metersPerPixel,
  militaryArrow,
  pathClosed,
  pathDisplay,
  pathLength,
  simplifyCap,
  translateFeature,
} from "./geo";
import { bindMap, setHud } from "./hud";
import { areaMarker, pointMarker } from "./symbols";
import { levelRank } from "./order";
import { activeScenario, useSandbox } from "./store";
import type { Feature, LngLat, PathFeature, Tool, UnitFeature } from "./types";
import { BASEMAPS, FORT_TYPES, GEAR, HILLSHADE_URL, UNIT_TYPES, defaultHeadcount, factionColor, factionTone, groupOf, iconColors, iconScale, labelOf, mixHex, uid } from "./types";

type LeafletNS = typeof import("leaflet");
type Entry = { geom: string; style: string; hit?: string; main: LeafletLayer; head?: LeafletLayer; label?: LeafletLayer; marks?: LeafletLayer };
type LeafletLayer = {
  remove: () => void;
  getElement?: () => HTMLElement | undefined;
  _path?: SVGElement;
  setStyle?: (style: Record<string, unknown>) => void;
  setLatLngs?: (latlngs: unknown) => void;
  setLatLng?: (latlng: [number, number]) => void;
  setRadius?: (radius: number) => void;
  bindTooltip?: (content: string, options: Record<string, unknown>) => void;
  setTooltipContent?: (content: string) => void;
  bringToFront?: () => void;
  setZIndexOffset?: (offset: number) => void;
  setIcon?: (icon: unknown) => void;
  dragging?: { enable: () => void; disable: () => void };
  on: (event: string, handler: (event: MapEvent) => void) => void;
  getLatLng?: () => { lng: number; lat: number };
};

type MapEvent = {
  latlng: { lng: number; lat: number };
  containerPoint: { x: number; y: number };
  originalEvent: MouseEvent;
};

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e7e8e4";
}

function sideColor(faction: string, tone: "light" | "dark"): string {
  const hex = factionColor(activeScenario(useSandbox.getState()).factions, faction);
  return tone === "light" ? mixHex(hex, "#142018", 0.45) : hex;
}

function markerMeta(feature: Feature) {
  const scenario = activeScenario(useSandbox.getState());
  const tone = factionTone(scenario.factions, feature.faction);
  const level = feature.kind === "unit" ? scenario.levels.find((item) => item.id === feature.levelId)?.name ?? "" : "";
  const steps = Math.max(1, scenario.levels.length - 1);
  const rank = feature.kind === "unit" ? levelRank(scenario.levels, feature.levelId) : steps;
  const scale = (feature.kind === "unit" ? 1.16 - (Math.min(rank, steps) / steps) * 0.26 : 1) * iconScale(scenario.iconSize);
  return { tone, level, scale };
}

function iconLook(feature: Feature): { plate: string; ink: string } {
  const scenario = activeScenario(useSandbox.getState());
  const color = factionColor(scenario.factions, feature.faction);
  const auto = iconColors(color, scenario.basemap);
  const faction = scenario.factions.find((item) => item.id === feature.faction);
  return { plate: faction?.plate || auto.plate, ink: faction?.ink || auto.ink };
}

function escText(value: string): string {
  return value.replaceAll("&", "\u0026amp;").replaceAll("<", "\u0026lt;").replaceAll(">", "\u0026gt;");
}

function toLL(point: LngLat): [number, number] {
  return [point[1], point[0]];
}

function fromLL(latlng: { lng: number; lat: number }): LngLat {
  return [latlng.lng, latlng.lat];
}

function nearPx(map: { latLngToContainerPoint: (ll: [number, number]) => { x: number; y: number } }, a: LngLat, b: LngLat, px: number) {
  const pa = map.latLngToContainerPoint(toLL(a));
  const pb = map.latLngToContainerPoint(toLL(b));
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= px;
}

export function mountMap(L: LeafletNS, host: HTMLElement): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const map = L.map(host, {
    zoomControl: false,
    attributionControl: true,
    minZoom: 2,
    maxZoom: 19,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90,
    worldCopyJump: true,
    keyboard: false,
    doubleClickZoom: true,
  });
  map.attributionControl.setPrefix(false);
  const isOn = (id: string) => {
    const state = useSandbox.getState();
    return state.selectedId === id || state.pickedIds.includes(id);
  };
  const labelPane = map.createPane("labels");
  labelPane.style.zIndex = "380";
  labelPane.style.pointerEvents = "none";
  const hillPane = map.createPane("hill");
  hillPane.style.zIndex = "340";
  hillPane.style.pointerEvents = "none";
  hillPane.classList.add("hill-pane");
  const handlePane = map.createPane("handlePane");
  handlePane.style.zIndex = "670";
  const underPane = map.createPane("under");
  underPane.style.zIndex = "250";
  underPane.style.pointerEvents = "none";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("grid-overlay");
  map.getContainer().appendChild(svg);
  const markSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  markSvg.classList.add("mark-overlay");
  map.getContainer().appendChild(markSvg);
  const markNodes = new Map<string, SVGPathElement>();

  let base = L.tileLayer("", { attribution: "" });
  let labels = L.tileLayer("", { pane: "labels" });
  let hill = L.tileLayer(HILLSHADE_URL, { pane: "hill", opacity: 0.42, maxZoom: 16, maxNativeZoom: 16 });
  const draftLayer = L.layerGroup().addTo(map);
  const overlay = L.layerGroup().addTo(map);
  const rangeLayer = L.layerGroup().addTo(map);
  const handleLayer = L.layerGroup().addTo(map);
  const entries = new Map<string, Entry>();
  let swallow = false;
  let draft: LngLat[] = [];
  let circleCenter: LngLat | null = null;
  let measureDone = false;
  let drawing = false;
  let extend: { id: string; end: "start" | "end"; extra: LngLat[] } | null = null;
  let lastClick = 0;
  let seenNonce = useSandbox.getState().focus?.nonce ?? -1;
  let baseKey = "";
  let labelKey = "";
  let hillOn = false;

  const styleFor = (feature: Feature, selected: boolean) => {
    const scenario = activeScenario(useSandbox.getState());
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    const color = sideColor(feature.faction, tone);
    const dash = "dash" in feature ? feature.dash : "solid";
    const closed = feature.kind === "circle" || feature.kind === "polygon" || ("closed" in feature && feature.closed);
    return {
      color,
      weight: selected ? 2.75 : 1.7,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: closed && feature.kind !== "arrow" ? (selected ? 0.2 : 0.13) : 0,
      dashArray: dash === "dash" ? "8 6" : dash === "dot" ? "1.4 5" : undefined,
      lineJoin: "round" as const,
      lineCap: "round" as const,
    };
  };

  const geomKey = (feature: Feature) => {
    const zoom = Math.round(map.getZoom() * 2) / 2;
    if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") return JSON.stringify(feature.at);
    if (feature.kind === "circle") return JSON.stringify([feature.center, Math.round(feature.radiusM)]);
    if (feature.kind === "arrow") return JSON.stringify([feature.points, feature.smooth, feature.widthM]);
    return JSON.stringify([feature.points, feature.closed, feature.smooth, feature.kind]);
  };

  const styleKey = (feature: Feature, selected: boolean) => {
    const scenario = activeScenario(useSandbox.getState());
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    const color = factionColor(scenario.factions, feature.faction);
    const look = iconLook(feature);
    return JSON.stringify([feature, selected, tone, color, look, scenario.iconSize]);
  };

  const setInteractive = (layer: LeafletLayer, pointer: boolean, drag: boolean) => {
    const element = layer.getElement?.() ?? layer._path;
    if (element) element.style.pointerEvents = pointer ? "auto" : "none";
    if (layer.dragging) {
      if (drag) layer.dragging.enable();
      else layer.dragging.disable();
    }
  };

  const tintMarker = (layer: LeafletLayer, feature: Feature) => {
    const element = layer.getElement?.();
    if (!element) return;
    const scenario = activeScenario(useSandbox.getState());
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    element.style.color = sideColor(feature.faction, tone);
  };

  const paint = (entry: Entry, feature: Feature) => {
    const selected = isOn(feature.id);
    const style = styleFor(feature, selected);
    if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") {
      const meta = markerMeta(feature);
      const spec = pointMarker(feature, selected, meta.tone, meta.level, meta.scale, iconLook(feature));
      entry.main.setIcon?.(
        L.divIcon({
          className: spec.className,
          html: spec.html,
          iconSize: spec.size,
          iconAnchor: spec.anchor,
        }),
      );
      entry.main.setLatLng?.(toLL(feature.at));
      entry.main.setZIndexOffset?.(selected ? 1000 : 0);
      tintMarker(entry.main, feature);
      return;
    }
    if (feature.kind === "circle") {
      entry.main.setStyle?.(style);
      entry.main.setLatLng?.(toLL(feature.center));
      entry.main.setRadius?.(feature.radiusM);
    } else if (feature.kind === "arrow") {
      const ring = militaryArrow(feature.points, feature.widthM ?? 480, feature.smooth);
      entry.main.setStyle?.({ ...style, fillOpacity: selected ? 0.78 : 0.62, weight: 1.25, dashArray: undefined });
      entry.main.setLatLngs?.(ring.map(toLL));
      entry.head?.remove();
      entry.head = undefined;
    } else {
      entry.main.setStyle?.(style);
      entry.main.setLatLngs?.(pathDisplay(feature).map(toLL));
    }
    entry.main.setTooltipContent?.(feature.name);
    entry.main.bringToFront?.();
    if (entry.label) {
      const spec = areaMarker(feature.name, markerMeta(feature).tone, selected);
      entry.label.setIcon?.(
        L.divIcon({ className: spec.className, html: spec.html, iconSize: [12, 12], iconAnchor: [6, 6] }),
      );
      entry.label.setLatLng?.(toLL(centroidOf(feature)));
      entry.label.setZIndexOffset?.(selected ? 700 : -40);
      tintMarker(entry.label, feature);
    }
    scheduleMarks();
  };

  const bindSelect = (layer: LeafletLayer, id: string, draggable: boolean) => {
    layer.on("click", (event) => {
      L.DomEvent.stopPropagation(event.originalEvent);
      swallow = true;
      if (useSandbox.getState().tool === "select") useSandbox.getState().select(id);
    });
    if (!draggable) {
      layer.on("mousedown", (event) => startShapeDrag(event, id));
    } else {
      layer.on("dragend", () => {
        const latlng = layer.getLatLng?.();
        if (!latlng) return;
        const next = fromLL(latlng);
        const feature = activeScenario(useSandbox.getState()).features.find((item) => item.id === id);
        if (feature?.kind === "fort" && feature.reach?.length) {
          const dLng = next[0] - feature.at[0];
          const dLat = next[1] - feature.at[1];
          useSandbox.getState().patchFeature(id, {
            at: next,
            reach: feature.reach.map((point) => [point[0] + dLng, point[1] + dLat] as LngLat),
          });
          return;
        }
        useSandbox.getState().patchFeature(id, { at: next });
      });
    }
  };

  const startShapeDrag = (event: MapEvent, id: string) => {
    if (useSandbox.getState().tool !== "select") return;
    L.DomEvent.stopPropagation(event.originalEvent);
    const feature = activeScenario(useSandbox.getState()).features.find((item) => item.id === id);
    if (!feature || feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") return;
    const start = event.latlng;
    let moved = false;
    map.dragging.disable();
    const move = (ev: MapEvent) => {
      const dLng = ev.latlng.lng - start.lng;
      const dLat = ev.latlng.lat - start.lat;
      if (Math.hypot(dLng, dLat) > 1e-7) moved = true;
      const entry = entries.get(id);
      if (!entry) return;
      paint(entry, translateFeature(feature, dLng, dLat));
    };
    const up = (ev: MapEvent) => {
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      swallow = true;
      if (!moved) {
        useSandbox.getState().select(id);
        return;
      }
      const movedFeature = translateFeature(feature, ev.latlng.lng - start.lng, ev.latlng.lat - start.lat);
      const partial =
        movedFeature.kind === "circle"
          ? { center: movedFeature.center }
          : { points: (movedFeature as PathFeature).points };
      useSandbox.getState().patchFeature(id, partial);
      useSandbox.getState().select(id);
    };
    map.on("mousemove", move);
    map.on("mouseup", up);
  };

  const createEntry = (feature: Feature): Entry => {
    const selected = isOn(feature.id);
    const style = styleFor(feature, selected);
    if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") {
      const meta = markerMeta(feature);
      const spec = pointMarker(feature, selected, meta.tone, meta.level, meta.scale, iconLook(feature));
      const marker = L.marker(toLL(feature.at), {
        icon: L.divIcon({
          className: spec.className,
          html: spec.html,
          iconSize: spec.size,
          iconAnchor: spec.anchor,
        }),
        draggable: true,
        keyboard: false,
        autoPan: false,
        zIndexOffset: selected ? 1000 : 0,
      }).addTo(map);
      tintMarker(marker as unknown as LeafletLayer, feature);
      bindSelect(marker as unknown as LeafletLayer, feature.id, true);
      return { geom: "", style: "", main: marker as unknown as LeafletLayer };
    }
    let main: LeafletLayer;
    let head: LeafletLayer | undefined;
    if (feature.kind === "circle") {
      main = L.circle(toLL(feature.center), { ...style, radius: feature.radiusM }).addTo(map) as unknown as LeafletLayer;
    } else if (feature.kind === "arrow") {
      const ring = militaryArrow(feature.points, feature.widthM ?? 480, feature.smooth);
      main = L.polygon(ring.map(toLL), { ...style, fillOpacity: 0.62, weight: 1.25 }).addTo(map) as unknown as LeafletLayer;
    } else {
      const closed = pathClosed(feature);
      const latlngs = pathDisplay(feature).map(toLL);
      main = (closed ? L.polygon(latlngs, style) : L.polyline(latlngs, style)).addTo(map) as unknown as LeafletLayer;
    }
    main.bindTooltip?.(feature.name, { sticky: true, className: "feat-tip", direction: "top", opacity: 1 });
    bindSelect(main, feature.id, false);
    if (head) bindSelect(head, feature.id, false);
    const spec = areaMarker(feature.name, markerMeta(feature).tone, selected);
    const label = L.marker(toLL(centroidOf(feature)), {
      icon: L.divIcon({ className: spec.className, html: spec.html, iconSize: [12, 12], iconAnchor: [6, 6] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -40,
    }).addTo(map);
    tintMarker(label as unknown as LeafletLayer, feature);
    return { geom: "", style: "", main, head, label: label as unknown as LeafletLayer };
  };

  const circleEdge = (center: LngLat, radiusM: number): LngLat[] => {
    const points: LngLat[] = [];
    for (let i = 0; i <= 48; i += 1) points.push(destination(center, (i / 48) * 360, radiusM));
    return points;
  };

  let markFrame = 0;
  const scheduleMarks = () => {
    if (markFrame) return;
    markFrame = requestAnimationFrame(() => {
      markFrame = 0;
      drawMarks();
    });
  };

  const drawMarks = () => {
    const scenario = activeScenario(useSandbox.getState());
    const size = map.getSize();
    markSvg.setAttribute("width", String(size.x));
    markSvg.setAttribute("height", String(size.y));
    const pad = 32;
    const minX = -pad;
    const minY = -pad;
    const maxX = size.x + pad;
    const maxY = size.y + pad;
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    const groups = new Map<string, string>();
    for (const feature of scenario.features) {
      if (feature.hidden || !scenario.groups[groupOf(feature)]) continue;
      const dash = "dash" in feature ? feature.dash : "solid";
      if (dash !== "cross" && dash !== "defense") continue;
      const source = feature.kind === "circle" ? circleEdge(feature.center, feature.radiusM) : "points" in feature ? pathDisplay(feature) : [];
      if (source.length < 2) continue;
      const pix = source.map((point) => map.latLngToContainerPoint(toLL(point)));
      let visible = 0;
      for (let i = 1; i < pix.length; i += 1) {
        const clip = clipSeg(pix[i - 1]!.x, pix[i - 1]!.y, pix[i]!.x, pix[i]!.y, minX, minY, maxX, maxY);
        if (clip) visible += Math.hypot(clip.bx - clip.ax, clip.by - clip.ay);
      }
      if (visible < 1) continue;
      const spacing = Math.max(16, visible / 280);
      const phase = spacing * 0.65;
      let travel = 0;
      let count = 0;
      let d = "";
      for (let i = 1; i < pix.length; i += 1) {
        const from = pix[i - 1]!;
        const to = pix[i]!;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len >= 0.5) {
          const clip = clipSeg(from.x, from.y, to.x, to.y, minX, minY, maxX, maxY);
          if (clip) {
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;
            const begin = travel + Math.hypot(clip.ax - from.x, clip.ay - from.y);
            const end = travel + Math.hypot(clip.bx - from.x, clip.by - from.y);
            const stepIn = ((phase - begin) % spacing + spacing) % spacing;
            for (let dist = begin + stepIn; dist <= end && count < 280; dist += spacing) {
              const along = dist - travel;
              const x = from.x + ux * along;
              const y = from.y + uy * along;
              if (dash === "defense") {
                d += `M${x.toFixed(1)} ${y.toFixed(1)}l${(px * 6).toFixed(1)} ${(py * 6).toFixed(1)}`;
              } else {
                const arm = 3.2;
                d += `M${(x - (ux + px) * arm).toFixed(1)} ${(y - (uy + py) * arm).toFixed(1)}l${((ux + px) * arm * 2).toFixed(1)} ${((uy + py) * arm * 2).toFixed(1)}`;
                d += `M${(x - (ux - px) * arm).toFixed(1)} ${(y - (uy - py) * arm).toFixed(1)}l${((ux - px) * arm * 2).toFixed(1)} ${((uy - py) * arm * 2).toFixed(1)}`;
              }
              count += 1;
            }
          }
        }
        travel += len;
      }
      if (!d) continue;
      const color = sideColor(feature.faction, tone);
      groups.set(color, (groups.get(color) ?? "") + d);
    }
    const used = new Set<string>();
    for (const [color, d] of groups) {
      let node = markNodes.get(color);
      if (!node) {
        node = document.createElementNS("http://www.w3.org/2000/svg", "path");
        node.setAttribute("fill", "none");
        node.setAttribute("stroke", color);
        node.setAttribute("stroke-width", "1.35");
        node.setAttribute("stroke-linecap", "butt");
        markSvg.appendChild(node);
        markNodes.set(color, node);
      }
      node.setAttribute("d", d);
      used.add(color);
    }
    for (const [color, node] of markNodes) {
      if (used.has(color)) continue;
      node.remove();
      markNodes.delete(color);
    }
  };

  const clipSeg = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ) => {
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
    for (let i = 0; i < 4; i += 1) {
      const pi = p[i]!;
      const qi = q[i]!;
      if (pi === 0) {
        if (qi < 0) return null;
        continue;
      }
      const t = qi / pi;
      if (pi < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
    return { ax: x1 + t0 * dx, ay: y1 + t0 * dy, bx: x1 + t1 * dx, by: y1 + t1 * dy };
  };

  const syncFeatures = () => {
    const state = useSandbox.getState();
    const scenario = activeScenario(state);
    const visible = new Set<string>();
    for (const feature of scenario.features) {
      if (feature.hidden || !scenario.groups[groupOf(feature)]) continue;
      visible.add(feature.id);
      const geom = geomKey(feature);
      const style = styleKey(feature, isOn(feature.id));
      let entry = entries.get(feature.id);
      if (!entry) {
        entry = createEntry(feature);
        entries.set(feature.id, entry);
      }
      if (entry.geom !== geom || entry.style !== style) paint(entry, feature);
      entry.geom = geom;
      entry.style = style;
      const view = scenario.mode === "view";
      const select = state.tool === "select";
      const hit = `${select}|${view}`;
      if (entry.hit !== hit) {
        setInteractive(entry.main, select || view, select && !view);
        if (entry.head) setInteractive(entry.head, select || view, false);
        entry.hit = hit;
      }
      if (entry.marks) {
        entry.marks.remove();
        entry.marks = undefined;
      }
    }
    for (const [id, entry] of entries) {
      if (visible.has(id)) continue;
      entry.main.remove();
      entry.head?.remove();
      entry.label?.remove();
      entry.marks?.remove();
      entries.delete(id);
    }
    syncRanges();
    scheduleMarks();
  };

  const syncRanges = () => {
    rangeLayer.clearLayers();
    const scenario = activeScenario(useSandbox.getState());
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    for (const feature of scenario.features) {
      if (feature.hidden || !scenario.groups[groupOf(feature)]) continue;
      const color = sideColor(feature.faction, tone);
      const stroke = { pane: "under", interactive: false, color, weight: 1.6, fill: false, fillOpacity: 0, dashArray: "7 5" };
      const ranged =
        (feature.kind === "unit" && feature.unitType === "missile") || (feature.kind === "fort" && feature.fortType === "special");
      if (ranged && feature.rangeM && feature.rangeM >= 8 && "at" in feature) {
        rangeLayer.addLayer(L.circle(toLL(feature.at), { ...stroke, radius: feature.rangeM }));
      }
      if (feature.kind === "fort" && feature.fortType === "special" && feature.reach && feature.reach.length >= 3) {
        const ring = pathDisplay({
          id: feature.id,
          kind: "curve",
          name: "",
          notes: "",
          faction: feature.faction,
          hidden: false,
          points: feature.reach,
          closed: true,
          smooth: true,
          dash: "solid",
        });
        rangeLayer.addLayer(L.polygon(ring.map(toLL), stroke));
      }
    }
  };

  const syncHandles = () => {
    handleLayer.clearLayers();
    const state = useSandbox.getState();
    if (state.tool !== "select" || drawing || activeScenario(state).mode === "view") return;
    const feature = activeScenario(state).features.find((item) => item.id === state.selectedId);
    if (!feature) return;
    const add = (at: LngLat, onDown: (event: MapEvent) => void) => {
      const handle = L.circleMarker(toLL(at), {
        radius: coarse ? 8 : 5,
        weight: 1.5,
        color: token("--color-fg"),
        fillColor: token("--color-bg"),
        fillOpacity: 1,
        pane: "handlePane",
      }).addTo(handleLayer);
      handle.on("mousedown", (event: MapEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent);
        swallow = true;
        onDown(event);
      });
    };
    if (feature.kind === "circle") {
      add(feature.center, (event) => dragCircle(feature.id, "center", event));
      add(destinationSafe(feature.center, 90, feature.radiusM), (event) => dragCircle(feature.id, "rim", event));
      return;
    }
    if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label") return;
    const openLine = !pathClosed(feature) && (feature.kind === "curve" || feature.kind === "freehand" || feature.kind === "arrow");
    if (openLine && feature.points.length >= 2) {
      const cap = (at: LngLat, end: "start" | "end") => {
        const button = L.marker(toLL(at), {
          pane: "handlePane",
          keyboard: false,
          icon: L.divIcon({
            className: "end-handle",
            html: "<span>+</span>",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(handleLayer);
        button.on("mousedown", (event: MapEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          swallow = true;
        });
        button.on("click", (event: MapEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          swallow = true;
          extend = { id: feature.id, end, extra: [] };
          drawing = true;
          draft = [];
          syncHandles();
        });
      };
      cap(feature.points[0]!, "start");
      cap(feature.points[feature.points.length - 1]!, "end");
    }
    if (feature.points.length > 48) return;
    feature.points.forEach((point, index) => {
      add(point, (event) => {
        if (event.originalEvent.altKey) {
          const min = pathClosed(feature) ? 3 : 2;
          if (feature.points.length > min) {
            useSandbox.getState().patchFeature(
              feature.id,
              { points: feature.points.filter((_, i) => i !== index) },
            );
          }
          return;
        }
        dragVertex(feature.id, index, event);
      });
    });
  };

  const destinationSafe = (from: LngLat, deg: number, meters: number) => {
    const φ = (from[1] * Math.PI) / 180;
    const δ = meters / 6371000;
    const θ = (deg * Math.PI) / 180;
    const φ2 = Math.asin(Math.sin(φ) * Math.cos(δ) + Math.cos(φ) * Math.sin(δ) * Math.cos(θ));
    const λ2 =
      (from[0] * Math.PI) / 180 +
      Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ), Math.cos(δ) - Math.sin(φ) * Math.sin(φ2));
    return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI] as LngLat;
  };

  const dragVertex = (id: string, index: number, event: MapEvent) => {
    const feature = activeScenario(useSandbox.getState()).features.find((item) => item.id === id);
    if (!feature || !("points" in feature)) return;
    drawing = true;
    map.dragging.disable();
    const points = feature.points.map((point) => [...point] as LngLat);
    const move = (ev: MapEvent) => {
      points[index] = fromLL(ev.latlng);
      const entry = entries.get(id);
      if (entry) paint(entry, { ...feature, points });
    };
    const up = (ev: MapEvent) => {
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      drawing = false;
      swallow = true;
      points[index] = fromLL(ev.latlng);
      useSandbox.getState().patchFeature(id, { points });
    };
    map.on("mousemove", move);
    map.on("mouseup", up);
    move(event);
  };

  const dragCircle = (id: string, mode: "center" | "rim", event: MapEvent) => {
    const feature = activeScenario(useSandbox.getState()).features.find((item) => item.id === id);
    if (!feature || feature.kind !== "circle") return;
    drawing = true;
    map.dragging.disable();
    const move = (ev: MapEvent) => {
      const entry = entries.get(id);
      if (!entry) return;
      if (mode === "center") paint(entry, { ...feature, center: fromLL(ev.latlng) });
      else paint(entry, { ...feature, radiusM: Math.max(8, distMeters(feature.center, fromLL(ev.latlng))) });
    };
    const up = (ev: MapEvent) => {
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      drawing = false;
      swallow = true;
      if (mode === "center") useSandbox.getState().patchFeature(id, { center: fromLL(ev.latlng) });
      else useSandbox.getState().patchFeature(id, { radiusM: Math.max(8, distMeters(feature.center, fromLL(ev.latlng))) });
    };
    map.on("mousemove", move);
    map.on("mouseup", up);
    move(event);
  };

  const clearDraft = () => {
    draft = [];
    circleCenter = null;
    measureDone = false;
    draftLayer.clearLayers();
    setHud({ measure: null });
  };

  const rubberStyle = () => ({
    color: token("--color-accent"),
    weight: 1.6,
    dashArray: "4 4",
    fillColor: token("--color-accent"),
    fillOpacity: 0.08,
    interactive: false,
  });

  const showRubber = (points: LngLat[], closed: boolean, radius?: number, caption?: string | null) => {
    draftLayer.clearLayers();
    if (radius !== undefined && points[0]) {
      const layer = L.circle(toLL(points[0]), { ...rubberStyle(), radius });
      draftLayer.addLayer(layer);
      return;
    }
    if (points.length < 2) return;
    const tool = useSandbox.getState().tool;
    if (tool === "arrow") {
      const lat = points[points.length - 1]?.[1] ?? 0;
      const width = Math.max(40, metersPerPixel(lat, map.getZoom()) * 18);
      const ring = militaryArrow(points, width, useSandbox.getState().smoothDraw);
      draftLayer.addLayer(L.polygon(ring.map(toLL), { ...rubberStyle(), fillOpacity: 0.35 }));
    } else {
      const layer = closed ? L.polygon(points.map(toLL), rubberStyle()) : L.polyline(points.map(toLL), rubberStyle());
      draftLayer.addLayer(layer);
    }
    if (!caption) return;
    const at = points[points.length - 1]!;
    draftLayer.addLayer(
      L.marker(toLL(at), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "measure-tag",
          html: `<span>${escText(caption)}</span>`,
          iconSize: [8, 8],
          iconAnchor: [4, 28],
        }),
      }),
    );
  };

  const measureText = (points: LngLat[]) => {
    if (points.length < 2) return null;
    const meters = pathLength(points);
    const last = bearing(points[points.length - 2]!, points[points.length - 1]!);
    return `${formatDistance(meters)} · ${formatBearing(last)}`;
  };

  const finishPath = () => {
    if (extend) {
      const pending = extend;
      extend = null;
      drawing = false;
      const feature = activeScenario(useSandbox.getState()).features.find((item) => item.id === pending.id);
      if (feature && "points" in feature && pending.extra.length) {
        const extra = dedupe(pending.extra);
        const points = pending.end === "end" ? dedupe([...feature.points, ...extra]) : dedupe([...extra].reverse().concat(feature.points));
        useSandbox.getState().patchFeature(feature.id, { points });
      }
      clearDraft();
      return;
    }
    const reachId = useSandbox.getState().reachId;
    if (reachId) {
      const points = dedupe(draft);
      if (points.length >= 3) useSandbox.getState().patchFeature(reachId, { reach: points });
      useSandbox.getState().setReach(null);
      clearDraft();
      return;
    }
    const state = useSandbox.getState();
    const tool = state.tool;
    const points = dedupe(draft);
    if (points.length === 0 && !circleCenter) return;
    if (tool === "measure") {
      if (points.length < 2) return;
      measureDone = true;
      const text = measureText(points);
      setHud({ measure: text });
      showRubber(points, false, undefined, text);
      draft = [];
      return;
    }
    const closed =
      tool === "polygon" || ((tool === "curve" || tool === "freehand") && state.closedDraw);
    const min = closed ? 3 : 2;
    if (points.length < min || (tool !== "polygon" && tool !== "curve" && tool !== "arrow" && tool !== "freehand")) {
      clearDraft();
      return;
    }
    const kind = tool === "polygon" || tool === "curve" || tool === "freehand" || tool === "arrow" ? tool : "arrow";
    state.addFeature({
      id: uid(kind),
      kind,
      name: kind === "polygon" ? "区域" : kind === "arrow" ? "轴线" : closed ? "曲线区" : "曲线",
      notes: "",
      faction: state.faction,
      hidden: false,
      points,
      closed,
      smooth: kind === "curve" || ((kind === "freehand" || kind === "arrow") && state.smoothDraw),
      dash: "solid",
      widthM:
        kind === "arrow"
          ? Math.max(40, Math.round(metersPerPixel(points[points.length - 1]?.[1] ?? 0, map.getZoom()) * 18))
          : undefined,
    });
    clearDraft();
  };

  const onMapClick = (event: MapEvent) => {
    if (swallow) {
      swallow = false;
      return;
    }
    const state = useSandbox.getState();
    const point = fromLL(event.latlng);
    if (extend) {
      extend.extra.push(point);
      const feature = activeScenario(state).features.find((item) => item.id === extend.id);
      if (feature && "points" in feature) {
        const preview = extend.end === "end" ? [...feature.points, ...extend.extra] : [...extend.extra].reverse().concat(feature.points);
        showRubber(preview, false);
      }
      return;
    }
    if (state.reachId) {
      draft.push(point);
      showRubber(draft, draft.length >= 3);
      return;
    }
    const tool = state.tool;
    if (tool === "select") {
      state.select(null);
      return;
    }
    if (tool === "unit") {
      const scenario = activeScenario(state);
      const levelId = scenario.levels.some((level) => level.id === state.levelId)
        ? state.levelId
        : scenario.levels[scenario.levels.length - 1]?.id ?? "platoon";
      const levelName = scenario.levels.find((level) => level.id === levelId)?.name ?? "";
      const head = defaultHeadcount(levelId);
      const faction = scenario.factions.some((item) => item.id === state.faction)
        ? state.faction
        : scenario.factions[0]?.id ?? "friend";
      state.addFeature({
        id: uid("unit"),
        kind: "unit",
        name: `${labelOf(UNIT_TYPES, state.unitType)}${levelName}`,
        callsign: "",
        notes: "",
        faction,
        hidden: false,
        at: point,
        unitType: state.unitType,
        levelId,
        parentId: null,
        service: state.service,
        heading: 0,
        personnel: { now: head, orig: head },
        equipment: {},
      });
      return;
    }
    if (tool === "fort") {
      state.addFeature({
        id: uid("fort"),
        kind: "fort",
        name: labelOf(FORT_TYPES, state.fortType),
        notes: "",
        faction: state.faction,
        hidden: false,
        at: point,
        fortType: state.fortType,
        heading: 0,
      });
      return;
    }
    if (tool === "label") {
      state.addFeature({
        id: uid("label"),
        kind: "label",
        name: "新地名",
        subtitle: "",
        notes: "",
        faction: state.faction,
        hidden: false,
        at: point,
      });
      return;
    }
    if (tool === "circle") {
      if (!circleCenter) {
        circleCenter = point;
        showRubber([point], false, 0);
        return;
      }
      const radius = distMeters(circleCenter, point);
      if (radius >= 8) {
        state.addFeature({
          id: uid("circle"),
          kind: "circle",
          name: "圆域",
          notes: "",
          faction: state.faction,
          hidden: false,
          center: circleCenter,
          radiusM: radius,
          dash: "solid",
        });
      }
      clearDraft();
      return;
    }
    if (tool === "polygon" || tool === "curve" || tool === "arrow" || tool === "measure") {
      if (tool === "measure" && measureDone) {
        clearDraft();
        measureDone = false;
      }
      const now = Date.now();
      if (draft.length && nearPx(map, draft[draft.length - 1]!, point, 5) && now - lastClick < 320) {
        finishPath();
        return;
      }
      const canClose = tool === "polygon" || (tool === "curve" && state.closedDraw);
      if (canClose && draft.length >= 3 && nearPx(map, draft[0]!, point, 12)) {
        finishPath();
        return;
      }
      draft.push(point);
      lastClick = now;
      const preview =
        tool === "curve" && (state.closedDraw ? draft.length >= 3 : draft.length >= 2)
          ? pathDisplay({
              id: "draft",
              kind: "curve",
              name: "",
              notes: "",
              faction: state.faction,
              hidden: false,
              points: draft,
              closed: state.closedDraw,
              smooth: true,
              dash: "solid",
            })
          : draft;
      showRubber(preview, tool === "polygon" || (tool === "curve" && state.closedDraw && draft.length >= 3));
      if (tool === "measure") setHud({ measure: measureText(draft) });
      if (tool === "measure" && draft.length >= 2) showRubber(draft, false, undefined, measureText(draft));
    }
  };

  map.on("click", onMapClick);
  map.on("dblclick", (event: MapEvent) => {
    if (useSandbox.getState().tool === "select") return;
    L.DomEvent.stopPropagation(event.originalEvent);
    L.DomEvent.preventDefault(event.originalEvent);
    finishPath();
  });
  map.on("contextmenu", (event: MapEvent) => {
    event.originalEvent.preventDefault();
    finishPath();
  });
  map.on("mousedown", (event: MapEvent) => {
    const oe = event.originalEvent;
    if (oe.button !== 0) return;
    const state = useSandbox.getState();
    if (state.tool !== "select" || activeScenario(state).mode === "view") return;
    const target = oe.target as HTMLElement | null;
    if (target?.closest(".leaflet-marker-icon, .leaflet-interactive")) return;
    const origin = event.latlng;
    const originPx = map.latLngToContainerPoint(origin);
    let box: { setBounds: (bounds: ReturnType<LeafletNS["latLngBounds"]>) => void; remove: () => void; getBounds: () => { contains: (ll: [number, number]) => boolean } } | null = null;
    map.dragging.disable();
    const move = (ev: MapEvent) => {
      const px = map.latLngToContainerPoint(ev.latlng);
      if (!box && Math.hypot(px.x - originPx.x, px.y - originPx.y) < 6) return;
      const bounds = L.latLngBounds(origin, ev.latlng);
      if (!box) box = L.rectangle(bounds, { color: "#d5dbe3", weight: 1, fillOpacity: 0.12, dashArray: "4 3", interactive: false }).addTo(map);
      else box.setBounds(bounds);
    };
    const up = () => {
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      if (!box) return;
      swallow = true;
      const bounds = box.getBounds();
      box.remove();
      const ids = activeScenario(useSandbox.getState())
        .features.filter((feature) => bounds.contains(toLL(centroidOf(feature))))
        .map((feature) => feature.id);
      useSandbox.getState().selectMany(ids);
    };
    map.on("mousemove", move);
    map.on("mouseup", up);
  });
  map.on("mousedown", (event: MapEvent) => {
    if (useSandbox.getState().tool !== "freehand" || event.originalEvent.button > 0) return;
    map.dragging.disable();
    draft = [fromLL(event.latlng)];
    const move = (ev: MapEvent) => {
      const point = fromLL(ev.latlng);
      const last = draft[draft.length - 1];
      if (!last || !nearPx(map, last, point, 3)) {
        draft.push(point);
        if (draft.length > 2500) draft.splice(0, draft.length - 2500);
        showRubber(draft, false);
      }
    };
    const up = () => {
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.dragging.enable();
      const state = useSandbox.getState();
      const lat = draft[0]?.[1] ?? 0;
      const epsilon = (metersPerPixel(lat, map.getZoom()) * 3) / 111320;
      const points = dedupe(simplifyCap(draft, epsilon, 48));
      const closed = state.closedDraw;
      if (points.length >= (closed ? 3 : 2)) {
        state.addFeature({
          id: uid("free"),
          kind: "freehand",
          name: closed ? "闭合手绘" : "手绘",
          notes: "",
          faction: state.faction,
          hidden: false,
          points,
          closed,
          smooth: state.smoothDraw,
          dash: "solid",
        });
      }
      clearDraft();
    };
    map.on("mousemove", move);
    map.on("mouseup", up);
  });
  map.on("mousemove", (event: MapEvent) => {
    const lat = Math.round(event.latlng.lat * 1e5) / 1e5;
    const lng = Math.round(event.latlng.lng * 1e5) / 1e5;
    setHud({ lat, lng, zoom: map.getZoom() });
    if (circleCenter && useSandbox.getState().tool === "circle") {
      showRubber([circleCenter], false, distMeters(circleCenter, fromLL(event.latlng)));
    }
  });
  map.on("zoomend", () => setHud({ zoom: map.getZoom() }));

  const drawGrid = () => {
    const scenario = activeScenario(useSandbox.getState());
    const size = map.getSize();
    svg.setAttribute("width", String(size.x));
    svg.setAttribute("height", String(size.y));
    if (!scenario.showGrid) {
      if (svg.childNodes.length) svg.replaceChildren();
      return;
    }
    svg.replaceChildren();
    const bounds = map.getBounds();
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    const step = gridStep(map.getCenter().lat, map.getZoom());
    const stroke = tone === "light" ? "rgba(20,24,22,0.22)" : "rgba(231,232,228,0.18)";
    const fill = tone === "light" ? "rgba(20,24,22,0.62)" : "rgba(231,232,228,0.62)";
    const ns = "http://www.w3.org/2000/svg";
    const addLine = (x1: number, y1: number, x2: number, y2: number) => {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", stroke);
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
    };
    const addText = (x: number, y: number, value: string) => {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(x));
      text.setAttribute("y", String(y));
      text.setAttribute("fill", fill);
      text.textContent = value;
      svg.appendChild(text);
    };
    const west = Math.floor(bounds.getWest() / step) * step;
    const south = Math.floor(bounds.getSouth() / step) * step;
    for (let lng = west; lng < bounds.getEast() + step; lng += step) {
      const top = map.latLngToContainerPoint([bounds.getNorth(), lng]);
      const bottom = map.latLngToContainerPoint([bounds.getSouth(), lng]);
      addLine(top.x, top.y, bottom.x, bottom.y);
      addText(top.x + 4, 14, coordText(lng, step, "lng"));
    }
    for (let lat = south; lat < bounds.getNorth() + step; lat += step) {
      const left = map.latLngToContainerPoint([lat, bounds.getWest()]);
      const right = map.latLngToContainerPoint([lat, bounds.getEast()]);
      addLine(left.x, left.y, right.x, right.y);
      addText(6, left.y - 4, coordText(lat, step, "lat"));
    }
  };

  const syncBasemap = () => {
    const scenario = activeScenario(useSandbox.getState());
    const spec = BASEMAPS.find((item) => item.id === scenario.basemap) ?? BASEMAPS[0]!;
    host.dataset.tone = spec.tone;
    const nextBase = `${spec.id}`;
    if (nextBase !== baseKey) {
      if (map.hasLayer(base)) map.removeLayer(base);
      base = L.tileLayer(spec.url, {
        maxZoom: spec.maxZoom,
        maxNativeZoom: spec.maxNativeZoom,
        attribution: spec.attribution,
      }).addTo(map);
      base.bringToBack();
      baseKey = nextBase;
    }
    const nextLabels = scenario.showLabels ? spec.labels : "";
    if (nextLabels !== labelKey) {
      if (map.hasLayer(labels)) map.removeLayer(labels);
      if (nextLabels) {
        labels = L.tileLayer(nextLabels, {
          pane: "labels",
          maxZoom: spec.maxZoom,
          maxNativeZoom: spec.maxNativeZoom,
          opacity: 0.92,
        }).addTo(map);
      }
      labelKey = nextLabels;
    }
    if (scenario.showRelief !== hillOn) {
      hillOn = scenario.showRelief;
      if (hillOn) hill.addTo(map);
      else map.removeLayer(hill);
    }
    if (stateTool() === "select") map.doubleClickZoom.enable();
    else map.doubleClickZoom.disable();
  };

  const stateTool = (): Tool => useSandbox.getState().tool;

  const publishView = () => {
    const center = map.getCenter();
    useSandbox.getState().setView([center.lng, center.lat], map.getZoom());
    drawGrid();
    setHud({ zoom: map.getZoom() });
  };

  map.on("move", () => {
    scheduleMarks();
    if (activeScenario(useSandbox.getState()).showGrid) drawGrid();
  });
  map.on("moveend", publishView);
  map.on("resize", drawGrid);

  const fly = (lng: number, lat: number, zoom?: number) => {
    map.flyTo([lat, lng], zoom ?? Math.max(map.getZoom(), 12), { duration: reduce ? 0 : 0.55 });
  };

  const scenario = activeScenario(useSandbox.getState());
  map.setView([scenario.center[1], scenario.center[0]], scenario.zoom);
  syncBasemap();
  syncFeatures();
  syncHandles();
  drawGrid();
  host.dataset.ready = "1";
  setHud({ zoom: map.getZoom(), lat: scenario.center[1], lng: scenario.center[0] });

  bindMap({
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    goHome: () => {
      const home = activeScenario(useSandbox.getState()).home;
      fly(home.center[0], home.center[1], home.zoom);
    },
  });

  const syncOverlay = () => {
    overlay.clearLayers();
    const scenario = activeScenario(useSandbox.getState());
    const tone = BASEMAPS.find((item) => item.id === scenario.basemap)?.tone ?? "dark";
    if (scenario.showLinks) {
      const units = scenario.features.filter((feature): feature is UnitFeature => feature.kind === "unit" && !feature.hidden);
      for (const unit of units) {
        if (!unit.parentId) continue;
        const parent = units.find((item) => item.id === unit.parentId);
        if (!parent) continue;
        L.polyline([toLL(parent.at), toLL(unit.at)], {
          color: sideColor(unit.faction, tone),
          weight: 1.2,
          opacity: 0.75,
          dashArray: "2 5",
          interactive: false,
        }).addTo(overlay);
      }
    }
    const picked = scenario.moments.filter((moment) => scenario.compareIds.includes(moment.id));
    if (picked.length < 2) return;
    const ids = new Set<string>();
    for (const moment of picked) {
      for (const feature of moment.features) if (feature.kind === "unit") ids.add(feature.id);
    }
    for (const id of ids) {
      const presence = picked.map((moment) =>
        moment.features.find((feature): feature is UnitFeature => feature.kind === "unit" && feature.id === id) ?? null,
      );
      const samples = presence.filter((feature): feature is UnitFeature => feature !== null);
      if (!samples.length) continue;
      const firstAt = presence.findIndex((feature) => feature);
      const lastAt = presence.length - 1 - [...presence].reverse().findIndex((feature) => feature);
      if (firstAt > 0) lifeTag(samples[0]!.at, `新出现 · ${picked[firstAt]?.name || "时间"}`, 48);
      if (lastAt < presence.length - 1) lifeTag(samples[samples.length - 1]!.at, `消失 · ${picked[lastAt + 1]?.name || "时间"}`, -4);
      if (samples.length < 2) continue;
      const color = sideColor(samples[0]!.faction, tone);
      let moved = false;
      for (let i = 1; i < samples.length; i += 1) {
        if (distMeters(samples[i - 1]!.at, samples[i]!.at) > 40) moved = true;
      }
      if (moved) {
        for (let i = 1; i < samples.length; i += 1) {
          const from = samples[i - 1]!.at;
          const to = samples[i]!.at;
          if (distMeters(from, to) <= 40) continue;
          const shade = mixHex(color, "#f7f8f6", 0.62 * (1 - (i - 1) / Math.max(1, samples.length - 1)));
          L.polyline([toLL(from), toLL(to)], { color: shade, weight: 2.6, opacity: 0.95, interactive: false }).addTo(overlay);
          arrowHead(to, from, shade);
        }
      }
      const delta = changeText(samples[0]!, samples[samples.length - 1]!);
      if (delta) {
        const at = samples[samples.length - 1]!.at;
        L.marker(toLL(at), {
          icon: L.divIcon({ className: "delta-tag", html: `<span>${escText(delta)}</span>`, iconSize: [12, 12], iconAnchor: [6, 28] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 800,
        }).addTo(overlay);
      }
    }
    picked.forEach((moment, index) => {
      const fade = 0.62 * (1 - index / Math.max(1, picked.length - 1));
      for (const feature of moment.features) {
        if (feature.kind === "unit" || feature.kind === "fort" || feature.kind === "label" || feature.hidden) continue;
        const shade = mixHex(sideColor(feature.faction, tone), "#f7f8f6", fade);
        if (feature.kind === "circle") {
          L.circle(toLL(feature.center), { radius: feature.radiusM, color: shade, weight: 1.6, fillOpacity: 0.04, interactive: false }).addTo(overlay);
        } else if (feature.kind === "arrow") {
          const ring = militaryArrow(feature.points, feature.widthM ?? 480, feature.smooth);
          L.polygon(ring.map(toLL), { color: shade, weight: 1, fillColor: shade, fillOpacity: 0.28, interactive: false }).addTo(overlay);
        } else {
          const closed = pathClosed(feature);
          const latlngs = pathDisplay(feature).map(toLL);
          const layer = closed
            ? L.polygon(latlngs, { color: shade, weight: 1.6, fillOpacity: 0.05, interactive: false })
            : L.polyline(latlngs, { color: shade, weight: 1.8, interactive: false });
          layer.addTo(overlay);
        }
        const at = centroidOf(feature);
        L.marker(toLL(at), {
          icon: L.divIcon({
            className: "time-tag",
            html: `<span>${escText(moment.name || "时间")}</span>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(overlay);
      }
    });
  };

  const lifeTag = (at: LngLat, text: string, lift: number) => {
    L.marker(toLL(at), {
      icon: L.divIcon({
        className: "delta-tag",
        html: `<span>${escText(text)}</span>`,
        iconSize: [12, 12],
        iconAnchor: [6, lift],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 820,
    }).addTo(overlay);
  };

  const arrowHead = (tip: LngLat, from: LngLat, color: string) => {
    const end = map.latLngToContainerPoint(toLL(tip));
    const start = map.latLngToContainerPoint(toLL(from));
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const wing = (turn: number) => {
      const latlng = map.containerPointToLatLng([end.x - Math.cos(angle + turn) * 8, end.y - Math.sin(angle + turn) * 8]);
      return [latlng.lat, latlng.lng] as [number, number];
    };
    L.polyline([toLL(tip), wing(0.45)], { color, weight: 2.2, interactive: false }).addTo(overlay);
    L.polyline([toLL(tip), wing(-0.45)], { color, weight: 2.2, interactive: false }).addTo(overlay);
  };

  const changeText = (first: UnitFeature, last: UnitFeature): string => {
    const bits: string[] = [];
    if (first.personnel.now !== last.personnel.now || first.personnel.orig !== last.personnel.orig) {
      bits.push(`人数 ${first.personnel.now}→${last.personnel.now}`);
    }
    for (const gear of GEAR) {
      if (gear.service !== first.service && gear.service !== last.service) continue;
      const before = first.equipment[gear.id]?.now ?? 0;
      const after = last.equipment[gear.id]?.now ?? 0;
      if (before !== after) bits.push(`${gear.label} ${before}→${after}`);
    }
    if (!bits.length) return "";
    return `→ ${bits.slice(0, 3).join(" · ")}`;
  };

  syncOverlay();

  const unsub = useSandbox.subscribe((state, prev) => {
    if (state.tool !== prev.tool || state.activeId !== prev.activeId) clearDraft();
    if (state.focus && state.focus.nonce !== seenNonce) {
      seenNonce = state.focus.nonce;
      fly(state.focus.lng, state.focus.lat, state.focus.zoom);
    }
    syncBasemap();
    if (!drawing) {
      syncFeatures();
      syncHandles();
    }
    syncOverlay();
    drawGrid();
  });

  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if (typing) return;
    const state = useSandbox.getState();
    if (event.key === "Escape" && state.menu) {
      state.setMenu(null);
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "c") {
      if (activeScenario(state).mode === "view") return;
      const ids = state.pickedIds.length ? state.pickedIds : state.selectedId ? [state.selectedId] : [];
      if (!ids.length) return;
      event.preventDefault();
      state.duplicateFeatures(ids);
      return;
    }
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) state.redo();
      else state.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      state.redo();
      return;
    }
    if (activeScenario(state).mode === "view") {
      if (event.key === "Escape" && state.selectedId) state.select(null);
      if (event.key === "+" || event.key === "=") map.zoomIn();
      if (event.key === "-" || event.key === "_") map.zoomOut();
      return;
    }
    if (event.key === "Escape") {
      if (extend) {
        extend = null;
        drawing = false;
        clearDraft();
        return;
      }
      if (state.reachId) {
        state.setReach(null);
        clearDraft();
        return;
      }
      if (draft.length || circleCenter) clearDraft();
      else if (state.selectedId) state.select(null);
      else state.setTool("select");
      return;
    }
    if (event.key === "Enter") {
      finishPath();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && (state.pickedIds.length || state.selectedId)) {
      event.preventDefault();
      state.deleteFeatures(state.pickedIds.length ? state.pickedIds : [state.selectedId!]);
      return;
    }
    if (event.key === "[" || event.key === "]") {
      state.rotateSelected(event.key === "[" ? -15 : 15);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
    };
    const pan = arrows[event.key];
    if (pan) {
      event.preventDefault();
      if (state.selectedId) {
        const feature = activeScenario(state).features.find((item) => item.id === state.selectedId);
        if (!feature) return;
        const at = centroidOf(feature);
        const pixel = map.latLngToContainerPoint(toLL(at));
        const next = map.containerPointToLatLng([pixel.x + pan[0], pixel.y + pan[1]]);
        state.nudgeSelected(next.lng - at[0], next.lat - at[1]);
      } else map.panBy(pan, { animate: false });
      return;
    }
    if (meta || event.altKey) return;
    const byKey: Record<string, Tool> = {
      v: "select",
      u: "unit",
      f: "fort",
      t: "label",
      p: "polygon",
      c: "curve",
      h: "freehand",
      a: "arrow",
      o: "circle",
      m: "measure",
    };
    const next = byKey[event.key.toLowerCase()];
    if (next) state.setTool(next);
    if (event.key === "+" || event.key === "=") map.zoomIn();
    if (event.key === "-" || event.key === "_") map.zoomOut();
  };
  window.addEventListener("keydown", onKey);
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(host);

  return () => {
    unsub();
    window.removeEventListener("keydown", onKey);
    observer.disconnect();
    bindMap(null);
    map.remove();
    host.dataset.ready = "0";
  };
}
