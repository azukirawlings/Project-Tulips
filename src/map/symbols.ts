import type { FactionTone, FortFeature, FortType, LabelFeature, UnitFeature, UnitType } from "./types";
import { unitStock } from "./order";

function esc(value: string): string {
  return value
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;")
    .replaceAll("'", "\u0026#39;");
}

const FRAMES: Record<FactionTone, string> = {
  friend: `<rect class="frame" x="6.5" y="8" width="23" height="18"/>`,
  foe: `<polygon class="frame" points="18,3.2 32.8,18 18,32.8 3.2,18"/>`,
  neutral: `<rect class="frame" x="7" y="7" width="22" height="22"/>`,
  unknown: `<circle class="frame" cx="18" cy="18" r="12.2"/>`,
};

const SERVICE_MARK: Record<"sea" | "air", string> = {
  sea: `<path d="M7 22.5 H29 M10 22.5 C13 26 16 26 18 22.5 C20 19 23 19 26 22.5"/><path d="M18 22 V12 M14.5 14.5 H21.5"/>`,
  air: `<path d="M6 20 H30 M18 20 L11 13.5 M18 20 L25 13.5 M18 20 V11"/>`,
};

const UNIT_ICONS: Record<UnitType, string> = {
  infantry: `<path d="M14 14 L22 22 M22 14 L14 22"/>`,
  armor: `<ellipse cx="18" cy="18" rx="6.2" ry="3.6"/>`,
  mech: `<rect x="13" y="15" width="10" height="6"/><path d="M13 16.5 H11.2 M25 16.5 H26.8 M13 19.5 H11.2 M25 19.5 H26.8"/>`,
  artillery: `<circle cx="18" cy="18" r="3.4"/><circle cx="18" cy="18" r="0.8" fill="currentColor" stroke="none"/>`,
  recon: `<path d="M13 23 L23 13"/>`,
  air: `<path d="M11 21 L18 12 L25 21 M18 12 V24"/>`,
  airDefense: `<path d="M12 22.5 A7 7 0 0 1 24 22.5 M18 20.5 V13 M15.2 15.6 L18 13 L20.8 15.6"/>`,
  engineer: `<path d="M12 23 H24 M14 23 V17 H22 V23 M16.2 17 V14.2 H19.8 V17"/>`,
  logistics: `<rect x="13" y="14" width="10" height="9"/><path d="M13 17.5 H23"/>`,
  hq: `<path d="M15.5 24 V12.5 H23.5 L21 15.4 L23.5 18.2 H15.5"/>`,
  special: `<path d="M18 12.2 L19.4 16.2 H23.6 L20.2 18.6 L21.5 22.6 L18 20.2 L14.5 22.6 L15.8 18.6 L12.4 16.2 H16.6 Z"/>`,
  missile: `<path d="M18 7.5 L21.2 16 L18 14.2 L14.8 16 Z M18 14.2 V24 M15.2 21.5 H20.8"/>`,
};

const FORT_ICONS: Record<FortType, string> = {
  fortress: `<polygon class="frame" points="18,3 22,10 30,8 26,15 33,20 24,21 22,30 18,23 14,30 12,21 3,20 10,15 6,8 14,10"/>`,
  bunker: `<polygon class="frame" points="18,5 30,12 30,24 18,31 6,24 6,12"/><path d="M12 18 H24"/>`,
  strongpoint: `<polygon class="frame" points="18,5 32,29 4,29"/><path d="M18 14 V23"/>`,
  outpost: `<path class="frame" d="M14 12 H22 V26 H14 Z"/><path d="M18 12 V6 M14 8.5 H22"/>`,
  airfield: `<rect class="frame" x="6" y="14" width="24" height="8"/><path d="M10 18 H26" stroke-dasharray="1.6 1.8"/>`,
  bridge: `<path class="frame" d="M6 13 H30 M6 23 H30 M11 13 V23 M18 13 V23 M25 13 V23"/>`,
  depot: `<rect class="frame" x="8" y="11" width="20" height="14"/><path d="M8 16 H28 M18 11 V25"/>`,
  obstacle: `<path class="frame" d="M7 27 L13 10 L18 22 L23 10 L29 27"/>`,
  special: `<circle class="frame" cx="18" cy="18" r="11"/><path d="M18 10.5 V25.5 M10.5 18 H25.5"/>`,
};

function glyph(inner: string, heading: number, size: number, plate: string, ink: string): string {
  return `<svg class="glyph" viewBox="0 0 36 36" style="width:${size}px;height:${size}px;transform:rotate(${heading}deg);color:${ink}" aria-hidden="true"><circle class="plate" cx="18" cy="18" r="15.2" fill="${plate}" stroke="none"/><polygon class="nose" points="18,0.8 21,4.6 15,4.6"/>${inner}</svg>`;
}

export function pointMarker(
  feature: UnitFeature | FortFeature | LabelFeature,
  selected: boolean,
  tone: FactionTone,
  level = "",
  scale = 1,
  colors?: { plate: string; ink: string },
): {
  className: string;
  html: string;
  size: [number, number];
  anchor: [number, number];
} {
  const selectedClass = selected ? " selected" : "";
  if (feature.kind === "label") {
    const sub = feature.subtitle ? `<small>${esc(feature.subtitle)}</small>` : "";
    return {
      className: `place side-${tone}${selectedClass}`,
      html: `<i class="tick"></i><span class="nm">${esc(feature.name)}${sub}</span>`,
      size: [14, 14],
      anchor: [7, 7],
    };
  }
  if (feature.kind === "fort") {
    const size = Math.round(36 * scale);
    const plate = colors?.plate ?? "#14171c";
    const ink = colors?.ink ?? "currentColor";
    return {
      className: `mk fort side-${tone}${selectedClass}`,
      html: `${glyph(FORT_ICONS[feature.fortType], feature.heading, size, plate, ink)}<span class="cap" style="top:${size + 4}px">${esc(feature.name)}</span>`,
      size: [size, size],
      anchor: [Math.round(size / 2), Math.round(size / 2)],
    };
  }
  const stock = unitStock(feature);
  const ratio = stock.orig > 0 ? stock.now / stock.orig : 1;
  const worn = ratio < 0.45 ? " worn" : "";
  const call = feature.callsign ? `<small>${esc(feature.callsign)}</small>` : "";
  const figure = stock.text ? `<small>${esc(stock.text)}</small>` : "";
  const mark =
    feature.service === "land"
      ? UNIT_ICONS[feature.unitType]
      : feature.service === "air" && feature.unitType === "missile"
        ? UNIT_ICONS.missile
        : SERVICE_MARK[feature.service];
  const size = Math.round(36 * scale);
  const plate = colors?.plate ?? "#14171c";
  const ink = colors?.ink ?? "currentColor";
  return {
    className: `mk side-${tone}${selectedClass}${worn}`,
    html: `<span class="ech">${esc(level)}</span>${glyph(
      `${FRAMES[tone]}${mark}`,
      feature.heading,
      size,
      plate,
      ink,
    )}<span class="hp" style="top:${size}px"><i style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></i></span><span class="cap" style="top:${size + 6}px"><b>${esc(feature.name)}</b>${call}${figure}</span>`,
    size: [size, size],
    anchor: [Math.round(size / 2), Math.round(size / 2)],
  };
}

export function areaMarker(name: string, tone: FactionTone, selected: boolean): {
  className: string;
  html: string;
} {
  return {
    className: `area-label side-${tone}${selected ? " selected" : ""}`,
    html: `<span>${esc(name)}</span>`,
  };
}
