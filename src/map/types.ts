export type LngLat = [number, number];

export type Tool =
  | "select"
  | "unit"
  | "fort"
  | "label"
  | "polygon"
  | "curve"
  | "freehand"
  | "arrow"
  | "circle"
  | "measure";

export type FactionTone = "friend" | "foe" | "neutral" | "unknown";
export type Faction = string;
export type ServiceId = "land" | "sea" | "air";
export type CountPair = { now: number; orig: number };
export type UnitType =
  | "infantry"
  | "armor"
  | "mech"
  | "artillery"
  | "recon"
  | "air"
  | "airDefense"
  | "engineer"
  | "logistics"
  | "hq"
  | "special"
  | "missile";
export type GearId =
  | "vehicle"
  | "truck"
  | "apc"
  | "ifv"
  | "amphib"
  | "lightTank"
  | "mbt"
  | "spg"
  | "mlrs"
  | "spaag"
  | "transHeli"
  | "attackHeli"
  | "smallBoat"
  | "patrol"
  | "gunboat"
  | "coastal"
  | "frigate"
  | "destroyer"
  | "cruiser"
  | "carrier"
  | "fighter"
  | "strike"
  | "bomber"
  | "airlift";
export type FortType =
  | "fortress"
  | "bunker"
  | "strongpoint"
  | "outpost"
  | "airfield"
  | "bridge"
  | "depot"
  | "obstacle"
  | "special";
export type Dash = "solid" | "dash" | "dot" | "cross" | "defense";
export type BasemapId = "dark" | "light" | "relief" | "sat";
export type Tone = "dark" | "light";
export type GroupKey = "units" | "forts" | "areas" | "routes" | "labels";

type Base = {
  id: string;
  name: string;
  notes: string;
  faction: Faction;
  hidden: boolean;
  image?: string;
};

export type UnitFeature = Base & {
  kind: "unit";
  at: LngLat;
  unitType: UnitType;
  levelId: string;
  parentId: string | null;
  service: ServiceId;
  heading: number;
  personnel: CountPair;
  equipment: Partial<Record<GearId, CountPair>>;
  callsign: string;
  rangeM?: number;
};

export type FortFeature = Base & {
  kind: "fort";
  at: LngLat;
  fortType: FortType;
  heading: number;
  rangeM?: number;
  reach?: LngLat[];
};

export type LabelFeature = Base & {
  kind: "label";
  at: LngLat;
  subtitle: string;
};

export type PathKind = "polygon" | "curve" | "freehand" | "arrow";

export type PathFeature = Base & {
  kind: PathKind;
  points: LngLat[];
  closed: boolean;
  smooth: boolean;
  dash: Dash;
  widthM?: number;
};

export type CircleFeature = Base & {
  kind: "circle";
  center: LngLat;
  radiusM: number;
  dash: Dash;
};

export type Feature = UnitFeature | FortFeature | LabelFeature | PathFeature | CircleFeature;

export type FactionDef = { id: string; name: string; tone: FactionTone; color?: string; plate?: string; ink?: string };
export type LevelDef = { id: string; name: string };
export type Moment = { id: string; name: string; features: Feature[] };

export type Scenario = {
  id: string;
  name: string;
  center: LngLat;
  zoom: number;
  home: { center: LngLat; zoom: number };
  basemap: BasemapId;
  showLabels: boolean;
  showGrid: boolean;
  showRelief: boolean;
  showLinks: boolean;
  iconSize: "s" | "m" | "l";
  mode: "edit" | "view";
  groups: Record<GroupKey, boolean>;
  factions: FactionDef[];
  levels: LevelDef[];
  features: Feature[];
  moments: Moment[];
  activeMomentId: string;
  compareIds: string[];
  updatedAt: number;
};

export const TOOLS: { id: Tool; label: string; hint: string; key: string }[] = [
  { id: "select", label: "选择", key: "V", hint: "点一下选中。按住拖出方框可以多选，Delete 删除，Ctrl+C 复制。" },
  { id: "unit", label: "部队", key: "U", hint: "点击地图放置部队。可连续放置。" },
  { id: "fort", label: "工事", key: "F", hint: "点击放置要塞、地堡、哨所等虚构工事。" },
  { id: "label", label: "地名", key: "T", hint: "点击放置自定义地名，底图本身不带景点。" },
  { id: "polygon", label: "多边形", key: "P", hint: "逐点点击。靠近起点、双击、右键或 Enter 闭合。" },
  { id: "curve", label: "曲线", key: "C", hint: "点击控制点，双击、右键或 Enter 结束。可闭合。" },
  { id: "freehand", label: "手绘", key: "H", hint: "按住拖动自由曲线，松开完成。可闭合、可平滑。" },
  { id: "arrow", label: "箭头", key: "A", hint: "点击节点，双击、右键或 Enter 结束。打开「弯曲」后沿点连成弯箭。" },
  { id: "circle", label: "圆域", key: "O", hint: "先点圆心，再点一次确定半径。" },
  { id: "measure", label: "测距", key: "M", hint: "点击量测。双击、右键或 Enter 结束，显示距离与方位。" },
];

export const SERVICES: { id: ServiceId; label: string }[] = [
  { id: "land", label: "陆军" },
  { id: "sea", label: "海军" },
  { id: "air", label: "空军" },
];

export const GEAR: { id: GearId; service: ServiceId; label: string }[] = [
  { id: "vehicle", service: "land", label: "普通车辆" },
  { id: "truck", service: "land", label: "卡车" },
  { id: "apc", service: "land", label: "装甲运兵车" },
  { id: "ifv", service: "land", label: "步兵战车" },
  { id: "amphib", service: "land", label: "两栖战车" },
  { id: "lightTank", service: "land", label: "轻型坦克" },
  { id: "mbt", service: "land", label: "主战坦克" },
  { id: "spg", service: "land", label: "自行火炮" },
  { id: "mlrs", service: "land", label: "自走火箭炮" },
  { id: "spaag", service: "land", label: "自行防空武器" },
  { id: "transHeli", service: "land", label: "运输直升机" },
  { id: "attackHeli", service: "land", label: "武装直升机" },
  { id: "smallBoat", service: "sea", label: "小型船只" },
  { id: "patrol", service: "sea", label: "武装巡逻艇" },
  { id: "gunboat", service: "sea", label: "炮艇" },
  { id: "coastal", service: "sea", label: "岸防舰" },
  { id: "frigate", service: "sea", label: "护卫舰" },
  { id: "destroyer", service: "sea", label: "驱逐舰" },
  { id: "cruiser", service: "sea", label: "巡洋舰" },
  { id: "carrier", service: "sea", label: "航空母舰" },
  { id: "fighter", service: "air", label: "战斗机" },
  { id: "strike", service: "air", label: "对地攻击机" },
  { id: "bomber", service: "air", label: "轰炸机" },
  { id: "airlift", service: "air", label: "运输机" },
];

export const DEFAULT_FACTIONS: FactionDef[] = [
  { id: "friend", name: "我方", tone: "friend" },
  { id: "foe", name: "敌方", tone: "foe" },
];

export const DEFAULT_LEVELS: LevelDef[] = [
  { id: "front", name: "集团军" },
  { id: "division", name: "师" },
  { id: "brigade", name: "旅" },
  { id: "regiment", name: "团" },
  { id: "battalion", name: "营" },
  { id: "company", name: "连" },
  { id: "platoon", name: "排" },
  { id: "squad", name: "班" },
];

const LEGACY_LEVEL: Record<string, string> = {
  team: "squad",
  squad: "squad",
  platoon: "platoon",
  company: "company",
  battalion: "battalion",
  regiment: "regiment",
  brigade: "brigade",
  division: "division",
};

export function legacyLevel(value: unknown): string | null {
  return typeof value === "string" && LEGACY_LEVEL[value] ? LEGACY_LEVEL[value] : null;
}

export const TONE_COLOR: Record<FactionTone, string> = {
  friend: "#8ec3dc",
  foe: "#e07a74",
  neutral: "#a9b79a",
  unknown: "#c9d2dc",
};

export const FACTION_PALETTE = ["#8ec3dc", "#e07a74", "#a9b79a", "#c9d2dc", "#e2c27a", "#c79ad4", "#7dceb0", "#e09a62"];

export function factionTone(factions: FactionDef[], id: string): FactionTone {
  return factions.find((item) => item.id === id)?.tone ?? "unknown";
}

export function factionColor(factions: FactionDef[], id: string): string {
  const faction = factions.find((item) => item.id === id);
  if (faction?.color && /^#[0-9a-fA-F]{6}$/.test(faction.color)) return faction.color;
  return TONE_COLOR[faction?.tone ?? "unknown"];
}

export function mixHex(hex: string, toward: string, amount: number): string {
  const from = hexRgb(hex);
  const to = hexRgb(toward);
  const channel = (index: number) => Math.round(from[index]! * (1 - amount) + to[index]! * amount);
  return `#${[channel(0), channel(1), channel(2)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function hexRgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#0c0e0d";
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
}

export function defaultHeadcount(levelId: string): number {
  const table: Record<string, number> = {
    front: 8000,
    division: 3000,
    brigade: 1500,
    regiment: 800,
    battalion: 400,
    company: 120,
    platoon: 30,
    squad: 9,
  };
  return table[levelId] ?? 100;
}

export function iconScale(size: Scenario["iconSize"] | undefined): number {
  if (size === "s") return 0.72;
  if (size === "l") return 1.35;
  return 1;
}

export function iconColors(color: string, basemap: BasemapId): { plate: string; ink: string } {
  if (basemap === "sat" || basemap === "relief") {
    return { plate: mixHex(color, "#14171c", 0.72), ink: mixHex(color, "#f5f7fa", 0.62) };
  }
  if (basemap === "dark") {
    return { plate: mixHex(color, "#0c0e0d", 0.5), ink: mixHex(color, "#f7f8f6", 0.28) };
  }
  return { plate: mixHex(color, "#f7f8f6", 0.8), ink: mixHex(color, "#16181c", 0.35) };
}

export const LAND_UNITS: { id: UnitType; label: string }[] = [
  { id: "infantry", label: "步兵" },
  { id: "armor", label: "装甲" },
  { id: "mech", label: "机械化" },
  { id: "artillery", label: "炮兵" },
  { id: "recon", label: "侦察" },
  { id: "air", label: "航空" },
  { id: "airDefense", label: "防空" },
  { id: "engineer", label: "工兵" },
  { id: "logistics", label: "后勤" },
  { id: "hq", label: "指挥" },
  { id: "special", label: "特战" },
];

export const AIR_UNITS: { id: UnitType; label: string }[] = [
  { id: "air", label: "飞机" },
  { id: "missile", label: "导弹" },
];

export const UNIT_TYPES: { id: UnitType; label: string }[] = [...LAND_UNITS, { id: "missile", label: "导弹" }];

export const FORT_TYPES: { id: FortType; label: string }[] = [
  { id: "fortress", label: "要塞" },
  { id: "bunker", label: "地堡" },
  { id: "strongpoint", label: "据点" },
  { id: "outpost", label: "哨所" },
  { id: "airfield", label: "机场" },
  { id: "bridge", label: "桥梁" },
  { id: "depot", label: "仓库" },
  { id: "obstacle", label: "障碍" },
  { id: "special", label: "特殊工事" },
];

export const BASEMAPS: {
  id: BasemapId;
  label: string;
  detail: string;
  url: string;
  labels: string;
  maxZoom: number;
  maxNativeZoom?: number;
  attribution: string;
  tone: Tone;
}[] = [
  {
    id: "dark",
    label: "夜图",
    detail: "深色，无景点无路名",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
    attribution: "© Esri, OSM",
    tone: "dark",
  },
  {
    id: "light",
    label: "素图",
    detail: "浅色，无标注",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
    attribution: "© Esri, OSM",
    tone: "light",
  },
  {
    id: "relief",
    label: "地貌",
    detail: "地势晕渲",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
    maxNativeZoom: 13,
    attribution: "© Esri",
    tone: "light",
  },
  {
    id: "sat",
    label: "卫星",
    detail: "影像，默认无地名",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "© Esri",
    tone: "dark",
  },
];

export const HILLSHADE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

export const GROUPS: { id: GroupKey; label: string }[] = [
  { id: "units", label: "部队" },
  { id: "forts", label: "工事" },
  { id: "areas", label: "区域" },
  { id: "routes", label: "路线" },
  { id: "labels", label: "地名" },
];

export function groupOf(feature: Feature): GroupKey {
  if (feature.kind === "unit") return "units";
  if (feature.kind === "fort") return "forts";
  if (feature.kind === "label") return "labels";
  if (feature.kind === "arrow") return "routes";
  if ((feature.kind === "curve" || feature.kind === "freehand") && !feature.closed) return "routes";
  return "areas";
}

export function isTool(value: unknown): value is Tool {
  return TOOLS.some((tool) => tool.id === value);
}

export function isFaction(value: unknown): value is Faction {
  return typeof value === "string" && value.length > 0 && value.length < 48;
}

export function isBasemap(value: unknown): value is BasemapId {
  return BASEMAPS.some((item) => item.id === value);
}

export function labelOf<T extends string>(list: { id: T; label: string }[], id: T): string {
  return list.find((item) => item.id === id)?.label ?? id;
}

export function defaultGroups(): Record<GroupKey, boolean> {
  return { units: true, forts: true, areas: true, routes: true, labels: true };
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
