import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Faction,
  Feature,
  FortType,
  GroupKey,
  LngLat,
  Scenario,
  ServiceId,
  Tool,
  UnitType,
} from "./types";
import { isFaction, isTool, uid } from "./types";
import { blankScenario, demoScenario } from "./seed";
import { normalizeScenario } from "./io";
import { centroidOf, translateFeature } from "./geo";
import { collabWriteOk } from "@/lib/multiplayer/gate";

type Hist = { scenarioId: string; features: Feature[] };

type Coalesce = { key: string; at: number; features: Feature[] } | null;

export type Appearance = { color: string; image: string };

export type SandboxState = {
  scenarios: Scenario[];
  activeId: string;
  selectedId: string | null;
  pickedIds: string[];
  tool: Tool;
  faction: Faction;
  unitType: UnitType;
  levelId: string;
  service: ServiceId;
  fortType: FortType;
  smoothDraw: boolean;
  closedDraw: boolean;
  panelOpen: boolean;
  board: boolean;
  menu: "map" | "file" | "help" | "collab" | null;
  reachId: string | null;
  appearance: Appearance;
  viewSplit: number;
  coach: boolean;
  past: Hist[];
  future: Hist[];
  coalesce: Coalesce;
  focus: { lng: number; lat: number; zoom?: number; nonce: number } | null;
  setTool: (tool: Tool) => void;
  setFaction: (faction: Faction) => void;
  setUnitType: (unitType: UnitType) => void;
  setLevel: (levelId: string) => void;
  setService: (service: ServiceId) => void;
  setFortType: (fortType: FortType) => void;
  setSmoothDraw: (value: boolean) => void;
  setClosedDraw: (value: boolean) => void;
  setPanel: (open: boolean) => void;
  setBoard: (open: boolean) => void;
  setMenu: (menu: SandboxState["menu"]) => void;
  setReach: (id: string | null) => void;
  setAppearance: (partial: Partial<Appearance>) => void;
  setViewSplit: (value: number) => void;
  dismissCoach: () => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  focusFeature: (id: string) => void;
  setView: (center: LngLat, zoom: number) => void;
  patchScenario: (partial: Partial<Scenario>) => void;
  toggleGroup: (key: GroupKey) => void;
  addFeature: (feature: Feature) => void;
  patchFeature: (id: string, partial: object, coalesceKey?: string) => void;
  deleteFeature: (id: string) => void;
  deleteFeatures: (ids: string[]) => void;
  duplicateFeature: (id: string) => void;
  duplicateFeatures: (ids: string[]) => void;
  nudgeSelected: (dLng: number, dLat: number) => void;
  rotateSelected: (delta: number) => void;
  undo: () => void;
  redo: () => void;
  newScenario: () => void;
  duplicateScenario: () => void;
  renameScenario: (name: string) => void;
  deleteScenario: (id: string) => void;
  switchScenario: (id: string) => void;
  importScenario: (scenario: Scenario) => void;
  setHome: () => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  setMode: (mode: Scenario["mode"]) => void;
  addMoment: (name: string) => void;
  renameMoment: (id: string, name: string) => void;
  deleteMoment: (id: string) => void;
  switchMoment: (id: string) => void;
  toggleCompare: (id: string) => void;
};

function currentOf(state: Pick<SandboxState, "scenarios" | "activeId">): Scenario {
  return state.scenarios.find((scenario) => scenario.id === state.activeId) ?? state.scenarios[0]!;
}

function normalizeAppearance(value: unknown): Appearance {
  const raw = value && typeof value === "object" ? (value as Partial<Appearance>) : {};
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : "#0c0e0d";
  const image = typeof raw.image === "string" && raw.image.startsWith("data:image/") && raw.image.length < 500_000 ? raw.image : "";
  return { color, image };
}

const APPEARANCE_KEY = "zhentu-appearance-v1";

function rememberedAppearance(): Appearance | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return null;
    return normalizeAppearance(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function rememberAppearance(appearance: Appearance) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    // The main save still holds the same colors.
  }
}

function splitOf(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.46;
  return Math.min(0.78, Math.max(0.22, number));
}

function stamp(scenario: Scenario): Scenario {
  const moments = scenario.moments.length
    ? scenario.moments.map((moment) =>
        moment.id === scenario.activeMomentId ? { ...moment, features: scenario.features } : moment,
      )
    : [{ id: scenario.activeMomentId || "start", name: "起始", features: scenario.features }];
  const activeMomentId = moments.some((moment) => moment.id === scenario.activeMomentId) ? scenario.activeMomentId : moments[0]!.id;
  return { ...scenario, moments, activeMomentId };
}

function replace(state: SandboxState, scenario: Scenario): Scenario[] {
  const next = stamp(scenario);
  return state.scenarios.map((item) => (item.id === next.id ? next : item));
}

function initial(): Pick<
  SandboxState,
  | "scenarios"
  | "activeId"
  | "selectedId"
  | "tool"
  | "faction"
  | "unitType"
  | "levelId"
  | "service"
  | "fortType"
  | "smoothDraw"
  | "closedDraw"
  | "panelOpen"
  | "board"
  | "menu"
  | "appearance"
  | "viewSplit"
  | "coach"
  | "past"
  | "future"
  | "coalesce"
  | "focus"
> {
  const demo = demoScenario();
  return {
    scenarios: [demo],
    activeId: demo.id,
    selectedId: null,
    tool: "select",
    faction: "friend",
    unitType: "infantry",
    levelId: "platoon",
    service: "land",
    fortType: "fortress",
    smoothDraw: true,
    closedDraw: false,
    panelOpen: false,
    board: false,
    menu: null,
    appearance: rememberedAppearance() ?? { color: "#0c0e0d", image: "" },
    viewSplit: 0.46,
    coach: true,
    past: [],
    future: [],
    coalesce: null,
    focus: null,
  };
}

export const useSandbox = create<SandboxState>()(
  persist(
    (set, get) => ({
      ...initial(),
      pickedIds: [],
      reachId: null,
      setTool: (tool) => {
        const scenario = currentOf(get());
        if ((scenario.mode === "view" || !collabWriteOk()) && tool !== "select") return;
        set({ tool, menu: null });
      },
      setFaction: (faction) => set({ faction }),
      setUnitType: (unitType) => set({ unitType }),
      setLevel: (levelId) => set({ levelId }),
      setService: (service) => set({ service }),
      setFortType: (fortType) => set({ fortType }),
      setSmoothDraw: (smoothDraw) => set({ smoothDraw }),
      setClosedDraw: (closedDraw) => set({ closedDraw }),
      setPanel: (panelOpen) => set({ panelOpen, board: panelOpen ? get().board : false }),
      setBoard: (board) => set({ board, panelOpen: board ? true : get().panelOpen }),
      setMenu: (menu) => set({ menu }),
      setReach: (reachId) => set({ reachId, menu: null }),
      setAppearance: (partial) => {
        const appearance = normalizeAppearance({ ...get().appearance, ...partial });
        rememberAppearance(appearance);
        set({ appearance });
      },
      setViewSplit: (value) => set({ viewSplit: splitOf(value) }),
      dismissCoach: () => set({ coach: false }),
      select: (selectedId) => {
        const state = get();
        const viewing = currentOf(state).mode === "view" && Boolean(selectedId);
        set({
          selectedId,
          pickedIds: selectedId ? [selectedId] : [],
          panelOpen: viewing ? true : state.panelOpen,
          board: viewing ? false : state.board,
        });
      },
      selectMany: (ids) => {
        const pickedIds = [...new Set(ids)];
        set({
          pickedIds,
          selectedId: pickedIds[0] ?? null,
          panelOpen: pickedIds.length === 1,
          board: pickedIds.length === 1 ? false : get().board,
        });
      },
      focusFeature: (id) => {
        const state = get();
        const scenario = currentOf(state);
        const feature = scenario.features.find((item) => item.id === id);
        if (!feature) return;
        const at = centroidOf(feature);
        set({
          selectedId: id,
          pickedIds: [id],
          panelOpen: true,
          board: false,
          focus: { lng: at[0], lat: at[1], nonce: (state.focus?.nonce ?? 0) + 1 },
        });
      },
      setView: (center, zoom) => {
        const state = get();
        const scenario = currentOf(state);
        if (
          Math.abs(scenario.center[0] - center[0]) < 1e-7 &&
          Math.abs(scenario.center[1] - center[1]) < 1e-7 &&
          Math.abs(scenario.zoom - zoom) < 0.01
        ) {
          return;
        }
        set({ scenarios: replace(state, { ...scenario, center, zoom }) });
      },
      patchScenario: (partial) => {
        const state = get();
        const scenario = currentOf(state);
        const viewOnly = Object.keys(partial).every((key) =>
          ["basemap", "mode", "showLabels", "showGrid", "showRelief", "showLinks", "briefLabels", "iconSize", "groups", "center", "zoom", "activeMomentId", "compareIds"].includes(key),
        );
        if (!viewOnly && !collabWriteOk()) return;
        set({
          scenarios: replace(state, {
            ...scenario,
            ...partial,
            ...(viewOnly ? {} : { updatedAt: Date.now() }),
          }),
        });
      },
      toggleGroup: (key) => {
        const state = get();
        const scenario = currentOf(state);
        set({
          scenarios: replace(state, {
            ...scenario,
            groups: { ...scenario.groups, [key]: !scenario.groups[key] },
          }),
        });
      },
      addFeature: (feature) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        set({
          scenarios: replace(state, {
            ...scenario,
            features: [...scenario.features, feature],
            updatedAt: Date.now(),
          }),
          selectedId: feature.id,
          past: [...state.past, { scenarioId: scenario.id, features: scenario.features }].slice(-80),
          future: [],
          coalesce: null,
        });
      },
      patchFeature: (id, partial, coalesceKey) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        const now = Date.now();
        const burst = Boolean(
          coalesceKey && state.coalesce && state.coalesce.key === coalesceKey && now - state.coalesce.at < 900,
        );
        const before = burst ? state.coalesce!.features : scenario.features;
        const features = scenario.features.map((feature) =>
          feature.id === id ? ({ ...feature, ...partial } as Feature) : feature,
        );
        set({
          scenarios: replace(state, { ...scenario, features, updatedAt: now }),
          past: burst ? state.past : [...state.past, { scenarioId: scenario.id, features: before }].slice(-80),
          future: [],
          coalesce: coalesceKey ? { key: coalesceKey, at: now, features: before } : null,
        });
      },
      deleteFeature: (id) => {
        get().deleteFeatures([id]);
      },
      deleteFeatures: (ids) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        const drop = new Set(ids);
        if (!scenario.features.some((feature) => drop.has(feature.id))) return;
        set({
          scenarios: replace(state, {
            ...scenario,
            features: scenario.features
              .filter((feature) => !drop.has(feature.id))
              .map((feature) =>
                feature.kind === "unit" && feature.parentId && drop.has(feature.parentId) ? { ...feature, parentId: null } : feature,
              ),
            updatedAt: Date.now(),
          }),
          selectedId: null,
          pickedIds: [],
          past: [...state.past, { scenarioId: scenario.id, features: scenario.features }].slice(-80),
          future: [],
          coalesce: null,
        });
      },
      duplicateFeature: (id) => {
        get().duplicateFeatures([id]);
      },
      duplicateFeatures: (ids) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        const copies: Feature[] = [];
        for (const id of ids) {
          const feature = scenario.features.find((item) => item.id === id);
          if (!feature) continue;
          const copy = translateFeature(structuredClone(feature), 0.004, -0.003);
          copy.id = uid(feature.kind);
          copy.name = `${feature.name} 副本`.slice(0, 80);
          copies.push(copy);
        }
        if (!copies.length) return;
        set({
          scenarios: replace(state, {
            ...scenario,
            features: [...scenario.features, ...copies],
            updatedAt: Date.now(),
          }),
          selectedId: copies[0]!.id,
          pickedIds: copies.map((feature) => feature.id),
          past: [...state.past, { scenarioId: scenario.id, features: scenario.features }].slice(-80),
          future: [],
          coalesce: null,
        });
      },
      nudgeSelected: (dLng, dLat) => {
        const state = get();
        const scenario = currentOf(state);
        const feature = scenario.features.find((item) => item.id === state.selectedId);
        if (!feature) return;
        const moved = translateFeature(feature, dLng, dLat);
        const partial =
          moved.kind === "fort"
            ? { at: moved.at, ...(moved.reach ? { reach: moved.reach } : {}) }
            : moved.kind === "unit" || moved.kind === "label"
              ? { at: moved.at }
              : moved.kind === "circle"
                ? { center: moved.center }
                : { points: moved.points };
        get().patchFeature(feature.id, partial, `nudge:${feature.id}`);
      },
      rotateSelected: (delta) => {
        const state = get();
        const scenario = currentOf(state);
        const feature = scenario.features.find((item) => item.id === state.selectedId);
        if (!feature || (feature.kind !== "unit" && feature.kind !== "fort")) return;
        const heading = (feature.heading + delta + 360) % 360;
        get().patchFeature(feature.id, { heading }, `heading:${feature.id}`);
      },
      undo: () => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        let index = -1;
        for (let i = state.past.length - 1; i >= 0; i--) {
          if (state.past[i]!.scenarioId === scenario.id) {
            index = i;
            break;
          }
        }
        if (index < 0) return;
        const hist = state.past[index]!;
        set({
          past: state.past.filter((_, i) => i !== index),
          future: [...state.future, { scenarioId: scenario.id, features: scenario.features }].slice(-80),
          scenarios: replace(state, { ...scenario, features: hist.features, updatedAt: Date.now() }),
          coalesce: null,
          selectedId:
            state.selectedId && hist.features.some((feature) => feature.id === state.selectedId)
              ? state.selectedId
              : null,
        });
      },
      redo: () => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        let index = -1;
        for (let i = state.future.length - 1; i >= 0; i--) {
          if (state.future[i]!.scenarioId === scenario.id) {
            index = i;
            break;
          }
        }
        if (index < 0) return;
        const hist = state.future[index]!;
        set({
          future: state.future.filter((_, i) => i !== index),
          past: [...state.past, { scenarioId: scenario.id, features: scenario.features }].slice(-80),
          scenarios: replace(state, { ...scenario, features: hist.features, updatedAt: Date.now() }),
          coalesce: null,
        });
      },
      newScenario: () => {
        const state = get();
        const scenario = blankScenario("未命名沙盘", currentOf(state));
        set({
          scenarios: [...state.scenarios, scenario],
          activeId: scenario.id,
          selectedId: null,
          menu: null,
          focus: {
            lng: scenario.center[0],
            lat: scenario.center[1],
            zoom: scenario.zoom,
            nonce: (state.focus?.nonce ?? 0) + 1,
          },
        });
      },
      duplicateScenario: () => {
        const state = get();
        const scenario = currentOf(state);
        const copy = structuredClone(scenario);
        copy.id = uid("sc");
        copy.name = `${scenario.name} 副本`.slice(0, 80);
        copy.updatedAt = Date.now();
        set({
          scenarios: [...state.scenarios, copy],
          activeId: copy.id,
          selectedId: null,
          menu: null,
        });
      },
      renameScenario: (name) => {
        if (!collabWriteOk()) return;
        const clean = name.slice(0, 40);
        const state = get();
        const scenario = currentOf(state);
        set({ scenarios: replace(state, { ...scenario, name: clean, updatedAt: Date.now() }) });
      },
      deleteScenario: (id) => {
        const state = get();
        const remaining = state.scenarios.filter((scenario) => scenario.id !== id);
        const scenarios = remaining.length ? remaining : [blankScenario("未命名沙盘")];
        const active = scenarios.find((scenario) => scenario.id === state.activeId) ?? scenarios[0]!;
        set({
          scenarios,
          activeId: active.id,
          selectedId: null,
          menu: null,
          focus: {
            lng: active.center[0],
            lat: active.center[1],
            zoom: active.zoom,
            nonce: (state.focus?.nonce ?? 0) + 1,
          },
        });
      },
      switchScenario: (id) => {
        const state = get();
        const scenario = state.scenarios.find((item) => item.id === id);
        if (!scenario) return;
        set({
          activeId: id,
          selectedId: null,
          menu: null,
          focus: {
            lng: scenario.center[0],
            lat: scenario.center[1],
            zoom: scenario.zoom,
            nonce: (state.focus?.nonce ?? 0) + 1,
          },
        });
      },
      importScenario: (scenario) => {
        const state = get();
        set({
          scenarios: [...state.scenarios, scenario],
          activeId: scenario.id,
          selectedId: null,
          menu: null,
          focus: {
            lng: scenario.center[0],
            lat: scenario.center[1],
            zoom: scenario.zoom,
            nonce: (state.focus?.nonce ?? 0) + 1,
          },
        });
      },
      setHome: () => {
        const state = get();
        const scenario = currentOf(state);
        set({
          scenarios: replace(state, {
            ...scenario,
            home: { center: [...scenario.center] as LngLat, zoom: scenario.zoom },
          }),
        });
      },
      flyTo: (lng, lat, zoom) => {
        const state = get();
        set({
          focus: { lng, lat, zoom, nonce: (state.focus?.nonce ?? 0) + 1 },
          menu: null,
        });
      },
      setMode: (mode) => {
        const state = get();
        const scenario = currentOf(state);
        set({
          tool: mode === "view" ? "select" : state.tool,
          scenarios: replace(state, { ...scenario, mode }),
        });
      },
      addMoment: (name) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = stamp(currentOf(state));
        if (scenario.moments.length >= 24) return;
        const id = uid("tm");
        const moment = { id, name: name.slice(0, 24) || "时间", features: structuredClone(scenario.features) };
        set({
          scenarios: replace(state, {
            ...scenario,
            moments: [...scenario.moments, moment],
            activeMomentId: id,
            updatedAt: Date.now(),
          }),
          past: [],
          future: [],
          selectedId: null,
        });
      },
      renameMoment: (id, name) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = currentOf(state);
        set({
          scenarios: replace(state, {
            ...scenario,
            moments: scenario.moments.map((moment) => (moment.id === id ? { ...moment, name: name.slice(0, 24) } : moment)),
            updatedAt: Date.now(),
          }),
        });
      },
      deleteMoment: (id) => {
        if (!collabWriteOk()) return;
        const state = get();
        const scenario = stamp(currentOf(state));
        if (scenario.moments.length <= 1) return;
        const moments = scenario.moments.filter((moment) => moment.id !== id);
        const active = scenario.activeMomentId === id ? moments[0]! : moments.find((moment) => moment.id === scenario.activeMomentId) ?? moments[0]!;
        set({
          scenarios: replace(state, {
            ...scenario,
            moments,
            activeMomentId: active.id,
            features: structuredClone(active.features),
            compareIds: scenario.compareIds.filter((item) => item !== id),
            updatedAt: Date.now(),
          }),
          past: [],
          future: [],
          selectedId: null,
        });
      },
      switchMoment: (id) => {
        const state = get();
        const scenario = stamp(currentOf(state));
        const next = scenario.moments.find((moment) => moment.id === id);
        if (!next || id === scenario.activeMomentId) return;
        set({
          scenarios: replace(state, {
            ...scenario,
            activeMomentId: id,
            features: structuredClone(next.features),
          }),
          past: [],
          future: [],
          selectedId: null,
        });
      },
      toggleCompare: (id) => {
        const state = get();
        const scenario = currentOf(state);
        if (!scenario.moments.some((moment) => moment.id === id)) return;
        const compareIds = scenario.compareIds.includes(id)
          ? scenario.compareIds.filter((item) => item !== id)
          : [...scenario.compareIds, id].slice(0, 12);
        set({ scenarios: replace(state, { ...scenario, compareIds }) });
      },
    }),
    {
      name: "zhentu-sandbox-v1",
      skipHydration: true,
      partialize: (state) => ({
        scenarios: state.scenarios,
        activeId: state.activeId,
        selectedId: state.selectedId,
        tool: state.tool,
        faction: state.faction,
        unitType: state.unitType,
        levelId: state.levelId,
        service: state.service,
        fortType: state.fortType,
        smoothDraw: state.smoothDraw,
        closedDraw: state.closedDraw,
        panelOpen: state.panelOpen,
        board: state.board,
        appearance: state.appearance,
        viewSplit: state.viewSplit,
        coach: state.coach,
      }),
      merge: (persisted, current) => {
        const data = persisted as (Partial<SandboxState> & { echelon?: string }) | undefined;
        const kept = rememberedAppearance();
        if (!data?.scenarios?.length) return kept ? { ...current, appearance: kept } : current;
        const scenarios = data.scenarios
          .map((scenario) => normalizeScenario(scenario))
          .filter((scenario): scenario is Scenario => scenario !== null);
        if (!scenarios.length) return kept ? { ...current, appearance: kept } : current;
        const appearance = data.appearance ? normalizeAppearance(data.appearance) : kept ?? current.appearance;
        rememberAppearance(appearance);
        const activeId = scenarios.some((scenario) => scenario.id === data.activeId)
          ? (data.activeId as string)
          : scenarios[0]!.id;
        return {
          ...current,
          scenarios,
          activeId,
          selectedId: typeof data.selectedId === "string" ? data.selectedId : null,
          tool: isTool(data.tool) ? data.tool : current.tool,
          faction: isFaction(data.faction) ? data.faction : current.faction,
          unitType: data.unitType ?? current.unitType,
          levelId:
            typeof data.levelId === "string"
              ? data.levelId
              : data.echelon === "team"
                ? "squad"
                : typeof data.echelon === "string"
                  ? data.echelon
                  : current.levelId,
          service: data.service === "sea" || data.service === "air" || data.service === "land" ? data.service : current.service,
          fortType: data.fortType ?? current.fortType,
          smoothDraw: data.smoothDraw ?? true,
          closedDraw: Boolean(data.closedDraw),
          panelOpen: Boolean(data.panelOpen),
          board: Boolean(data.board),
          appearance,
          viewSplit: splitOf(data.viewSplit),
          coach: data.coach !== false,
          menu: null,
          past: [],
          future: [],
          coalesce: null,
          focus: null,
          pickedIds: [],
          reachId: null,
        };
      },
    },
  ),
);

export function activeScenario(state: Pick<SandboxState, "scenarios" | "activeId">): Scenario {
  return currentOf(state);
}

export function canUndo(state: SandboxState): boolean {
  return state.past.some((item) => item.scenarioId === state.activeId);
}

export function canRedo(state: SandboxState): boolean {
  return state.future.some((item) => item.scenarioId === state.activeId);
}
