import type {
  BasemapId,
  CountPair,
  Dash,
  Faction,
  FactionDef,
  FactionTone,
  Feature,
  FortType,
  GearId,
  LevelDef,
  LngLat,
  Moment,
  Scenario,
  ServiceId,
  UnitFeature,
  UnitType,
} from "./types";
import {
  BASEMAPS,
  DEFAULT_FACTIONS,
  DEFAULT_LEVELS,
  FORT_TYPES,
  GEAR,
  SERVICES,
  UNIT_TYPES,
  defaultGroups,
  isBasemap,
  legacyLevel,
  uid,
} from "./types";
import { fitPair } from "./order";

function pair(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function text(value: unknown, fallback: string, max = 80): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function notes(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 2000) : "";
}

function imageOf(value: unknown): string {
  return typeof value === "string" && value.startsWith("data:image/") && value.length < 500_000 ? value : "";
}

function dashOf(value: unknown): Dash {
  return value === "dash" || value === "dot" || value === "cross" || value === "defense" ? value : "solid";
}

function count(value: unknown, fallback = 0): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(1_000_000, number);
}

function pairOf(value: unknown, nowFallback: number, origFallback: number): CountPair {
  if (value && typeof value === "object") {
    const item = value as { now?: unknown; orig?: unknown };
    return fitPair({ now: count(item.now, nowFallback), orig: count(item.orig, origFallback) });
  }
  return fitPair({ now: nowFallback, orig: origFallback });
}

function equipmentOf(value: unknown): Partial<Record<GearId, CountPair>> {
  const out: Partial<Record<GearId, CountPair>> = {};
  if (!value || typeof value !== "object") return out;
  const raw = value as Record<string, unknown>;
  for (const gear of GEAR) {
    if (raw[gear.id] === undefined) continue;
    out[gear.id] = pairOf(raw[gear.id], 0, 0);
  }
  return out;
}

function toneOf(value: unknown, fallback: FactionTone): FactionTone {
  return value === "friend" || value === "foe" || value === "neutral" || value === "unknown" ? value : fallback;
}

function oneOf<T extends string>(list: { id: T }[], value: unknown, fallback: T): T {
  return list.some((item) => item.id === value) ? (value as T) : fallback;
}

function metersOf(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 8) return undefined;
  return Math.min(500000, n);
}

function ringOf(value: unknown): LngLat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value.map(pair).filter((point): point is LngLat => point !== null);
  return points.length >= 3 ? points.slice(0, 80) : undefined;
}

function hexOf(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : undefined;
}

function factionId(value: unknown): Faction {
  return typeof value === "string" && value.length > 0 && value.length < 48 ? value : "friend";
}

function featureOf(raw: unknown): Feature | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const kind = item.kind;
  const image = imageOf(item.image);
  const shared = {
    id: typeof item.id === "string" && item.id ? item.id : uid("f"),
    name: text(item.name, "未命名"),
    notes: notes(item.notes),
    faction: factionId(item.faction),
    hidden: Boolean(item.hidden),
    ...(image ? { image } : {}),
  };
  if (kind === "unit") {
    const at = pair(item.at);
    if (!at) return null;
    const legacy = Number(item.strength);
    const personnel = item.personnel
      ? pairOf(item.personnel, 0, 0)
      : { now: Number.isFinite(legacy) ? count(legacy, 100) : 100, orig: 100 };
    return {
      ...shared,
      kind,
      at,
      unitType: oneOf<UnitType>(UNIT_TYPES, item.unitType, "infantry"),
      levelId: typeof item.levelId === "string" && item.levelId ? item.levelId : legacyLevel(item.echelon) ?? "platoon",
      parentId: typeof item.parentId === "string" && item.parentId ? item.parentId : null,
      service: SERVICES.some((entry) => entry.id === item.service) ? (item.service as ServiceId) : "land",
      heading: Number.isFinite(Number(item.heading)) ? Number(item.heading) : 0,
      personnel,
      equipment: equipmentOf(item.equipment),
      callsign: text(item.callsign, ""),
      ...(metersOf(item.rangeM) ? { rangeM: metersOf(item.rangeM) } : {}),
    };
  }
  if (kind === "fort") {
    const at = pair(item.at);
    if (!at) return null;
    return {
      ...shared,
      kind,
      at,
      fortType: oneOf<FortType>(FORT_TYPES, item.fortType, "strongpoint"),
      heading: Number.isFinite(Number(item.heading)) ? Number(item.heading) : 0,
      ...(metersOf(item.rangeM) ? { rangeM: metersOf(item.rangeM) } : {}),
      ...(ringOf(item.reach) ? { reach: ringOf(item.reach) } : {}),
    };
  }
  if (kind === "label") {
    const at = pair(item.at);
    if (!at) return null;
    return { ...shared, kind, at, subtitle: text(item.subtitle, "") };
  }
  if (kind === "circle") {
    const center = pair(item.center);
    const radiusM = Number(item.radiusM);
    if (!center || !Number.isFinite(radiusM)) return null;
    return { ...shared, kind, center, radiusM: Math.max(8, radiusM), dash: dashOf(item.dash), ...(item.face === -1 ? { face: -1 as const } : {}) };
  }
  if (kind === "polygon" || kind === "curve" || kind === "freehand" || kind === "arrow") {
    if (!Array.isArray(item.points)) return null;
    const points = item.points.map(pair).filter((point): point is LngLat => point !== null);
    if (points.length < 2) return null;
    const width = Number(item.widthM);
    return {
      ...shared,
      kind,
      points,
      closed: kind === "polygon" ? true : Boolean(item.closed),
      smooth: Boolean(item.smooth),
      dash: dashOf(item.dash),
      ...(item.face === -1 ? { face: -1 as const } : {}),
      widthM: kind === "arrow" && Number.isFinite(width) ? Math.max(12, Math.min(50000, width)) : undefined,
    };
  }
  return null;
}

function levelsOf(raw: unknown): LevelDef[] {
  const list: LevelDef[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = text(row.id, "");
      if (!id || list.some((level) => level.id === id)) continue;
      list.push({ id, name: text(row.name, "层级", 24) });
      if (list.length >= 12) break;
    }
  }
  return list.length ? list : DEFAULT_LEVELS.map((level) => ({ ...level }));
}

function factionsOf(raw: unknown, used: string[]): FactionDef[] {
  const list: FactionDef[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = text(row.id, "");
      if (!id || list.some((faction) => faction.id === id)) continue;
      const color = hexOf(row.color);
      const plate = hexOf(row.plate);
      const ink = hexOf(row.ink);
      list.push({
        id,
        name: text(row.name, "阵营", 24),
        tone: toneOf(row.tone, "unknown"),
        ...(color ? { color } : {}),
        ...(plate ? { plate } : {}),
        ...(ink ? { ink } : {}),
      });
      if (list.length >= 8) break;
    }
  }
  if (!list.length) {
    for (const faction of DEFAULT_FACTIONS) list.push({ ...faction });
  }
  for (const id of used) {
    if (list.some((faction) => faction.id === id) || list.length >= 8) continue;
    const tone = toneOf(id, "unknown");
    const name = id === "friend" ? "我方" : id === "foe" ? "敌方" : id === "neutral" ? "中立" : id === "unknown" ? "不明" : "阵营";
    list.push({ id, name, tone });
  }
  return list;
}

function bindUnits(features: Feature[], levels: LevelDef[]): Feature[] {
  const ids = new Set(levels.map((level) => level.id));
  const fallback = levels[levels.length - 1]!.id;
  const placed = features.map((feature) => {
    if (feature.kind !== "unit") return feature;
    return { ...feature, levelId: ids.has(feature.levelId) ? feature.levelId : fallback };
  });
  const units = new Map(placed.filter((feature): feature is UnitFeature => feature.kind === "unit").map((unit) => [unit.id, unit]));
  return placed.map((feature) => {
    if (feature.kind !== "unit" || !feature.parentId) return feature;
    const parent = units.get(feature.parentId);
    if (!parent) return { ...feature, parentId: null };
    const parentRank = levels.findIndex((level) => level.id === parent.levelId);
    const rank = levels.findIndex((level) => level.id === feature.levelId);
    if (parentRank < 0 || rank < 0 || parentRank >= rank) return { ...feature, parentId: null };
    const seen = new Set<string>([feature.id]);
    let cursor: string | null = parent.id;
    while (cursor) {
      if (seen.has(cursor)) return { ...feature, parentId: null };
      seen.add(cursor);
      cursor = units.get(cursor)?.parentId ?? null;
    }
    return feature;
  });
}

export function normalizeScenario(raw: unknown): Scenario | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const center = pair(item.center) ?? ([-80.409, 37.13] as LngLat);
  const zoom = Math.max(2, Math.min(19, Number(item.zoom) || 12));
  const homeCenter = pair((item.home as { center?: unknown } | undefined)?.center) ?? center;
  const homeZoom = Math.max(
    2,
    Math.min(19, Number((item.home as { zoom?: unknown } | undefined)?.zoom) || zoom),
  );
  const groups = defaultGroups();
  if (item.groups && typeof item.groups === "object") {
    for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
      const value = (item.groups as Record<string, unknown>)[key];
      if (typeof value === "boolean") groups[key] = value;
    }
  }
  const parsed = Array.isArray(item.features)
    ? item.features.map(featureOf).filter((feature): feature is Feature => feature !== null).slice(0, 800)
    : [];
  const levels = levelsOf(item.levels);
  const features = bindUnits(parsed, levels);
  const factions = factionsOf(
    item.factions,
    features.map((feature) => feature.faction),
  );
  const known = new Set(factions.map((faction) => faction.id));
  const basemap: BasemapId = isBasemap(item.basemap) ? item.basemap : "dark";
  const aligned = features.map((feature) => (known.has(feature.faction) ? feature : { ...feature, faction: factions[0]!.id }));
  const packed = momentsOf(item.moments, aligned);
  const requested = typeof item.activeMomentId === "string" ? item.activeMomentId : packed.moments[0]!.id;
  const activeMomentId = packed.moments.some((moment) => moment.id === requested) ? requested : packed.moments[0]!.id;
  const compareIds = Array.isArray(item.compareIds)
    ? item.compareIds.filter((id): id is string => typeof id === "string" && packed.moments.some((moment) => moment.id === id)).slice(0, 12)
    : [];
  return {
    id: typeof item.id === "string" && item.id ? item.id : uid("sc"),
    name: text(item.name, "未命名沙盘") || "未命名沙盘",
    center,
    zoom,
    home: { center: homeCenter, zoom: homeZoom },
    basemap: BASEMAPS.some((map) => map.id === basemap) ? basemap : "dark",
    showLabels: Boolean(item.showLabels),
    showGrid: Boolean(item.showGrid),
    showRelief: Boolean(item.showRelief),
    showLinks: Boolean(item.showLinks),
    iconSize: item.iconSize === "s" || item.iconSize === "l" ? item.iconSize : "m",
    mode: item.mode === "view" ? "view" : "edit",
    groups,
    factions,
    levels,
    features: aligned,
    moments: packed.moments.map((moment) => (moment.id === activeMomentId ? { ...moment, features: aligned } : moment)),
    activeMomentId,
    compareIds,
    updatedAt: Number(item.updatedAt) || Date.now(),
  };
}

function momentsOf(raw: unknown, fallback: Feature[]): { moments: Moment[] } {
  const moments: Moment[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = text(row.id, "");
      if (!id || moments.some((moment) => moment.id === id)) continue;
      const features = Array.isArray(row.features)
        ? row.features.map(featureOf).filter((feature): feature is Feature => feature !== null).slice(0, 800)
        : [];
      moments.push({ id, name: text(row.name, "时间", 24), features });
      if (moments.length >= 24) break;
    }
  }
  if (!moments.length) moments.push({ id: "start", name: "起始", features: fallback });
  return { moments };
}

export function parseScenarioFile(text: string): Scenario {
  const data = JSON.parse(text) as { scenario?: unknown };
  const scenario = normalizeScenario(data?.scenario ?? data);
  if (!scenario) throw new Error("不是 Project Tulip 沙盘文件");
  return { ...scenario, id: uid("sc"), updatedAt: Date.now() };
}

export function downloadScenario(scenario: Scenario): void {
  const blob = new Blob(
    [JSON.stringify({ format: "zhentu", version: 1, scenario }, null, 2)],
    { type: "application/json" },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Project Tulip-${scenario.name || "沙盘"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
