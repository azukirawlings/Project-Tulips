export type HudSnap = {
  lat: number | null;
  lng: number | null;
  zoom: number;
  measure: string | null;
};

const empty: HudSnap = { lat: null, lng: null, zoom: 12, measure: null };
let snap: HudSnap = empty;
const listeners = new Set<() => void>();

export function getHud(): HudSnap {
  return snap;
}

export function getHudServer(): HudSnap {
  return empty;
}

export function subscribeHud(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setHud(partial: Partial<HudSnap>): void {
  const next = { ...snap, ...partial };
  if (
    next.lat === snap.lat &&
    next.lng === snap.lng &&
    next.zoom === snap.zoom &&
    next.measure === snap.measure
  ) {
    return;
  }
  snap = next;
  listeners.forEach((listener) => listener());
}

type MapApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  goHome: () => void;
};

let api: MapApi | null = null;

export function bindMap(next: MapApi | null): void {
  api = next;
}

export function mapApi(): MapApi | null {
  return api;
}
