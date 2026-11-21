import type { CountPair, Feature, GearId, LevelDef, ServiceId, UnitFeature } from "./types";
import { GEAR } from "./types";

export type Tally = {
  now: number;
  orig: number;
  loss: number;
  gearNow: number;
  gearOrig: number;
  gearLoss: number;
  rows: { id: GearId; service: ServiceId; label: string; now: number; orig: number; loss: number }[];
};

export function unitsOf(features: Feature[]): UnitFeature[] {
  return features.filter((feature): feature is UnitFeature => feature.kind === "unit" && !feature.hidden);
}

export function descendantIds(units: UnitFeature[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const unit of units) {
      if (unit.parentId && ids.has(unit.parentId) && !ids.has(unit.id)) {
        ids.add(unit.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function tally(units: UnitFeature[]): Tally {
  let now = 0;
  let orig = 0;
  const gear = new Map<GearId, { now: number; orig: number }>();
  for (const item of GEAR) gear.set(item.id, { now: 0, orig: 0 });
  for (const unit of units) {
    now += unit.personnel.now;
    orig += unit.personnel.orig;
    for (const item of GEAR) {
      const pair = unit.equipment[item.id];
      if (!pair) continue;
      const row = gear.get(item.id)!;
      row.now += pair.now;
      row.orig += pair.orig;
    }
  }
  const rows = GEAR.map((item) => {
    const pair = gear.get(item.id)!;
    return { id: item.id, service: item.service, label: item.label, now: pair.now, orig: pair.orig, loss: Math.max(0, pair.orig - pair.now) };
  }).filter((row) => row.orig > 0 || row.now > 0);
  const gearNow = rows.reduce((sum, row) => sum + row.now, 0);
  const gearOrig = rows.reduce((sum, row) => sum + row.orig, 0);
  return {
    now,
    orig,
    loss: Math.max(0, orig - now),
    gearNow,
    gearOrig,
    gearLoss: Math.max(0, gearOrig - gearNow),
    rows,
  };
}

export function levelRank(levels: LevelDef[], id: string): number {
  const index = levels.findIndex((level) => level.id === id);
  return index < 0 ? levels.length : index;
}

export function seniorIds(units: UnitFeature[], levels: LevelDef[]): Set<string> {
  const best = new Map<string, number>();
  for (const unit of units) {
    const rank = levelRank(levels, unit.levelId);
    const prev = best.get(unit.service);
    if (prev === undefined || rank < prev) best.set(unit.service, rank);
  }
  const ids = new Set<string>();
  for (const unit of units) {
    if (levelRank(levels, unit.levelId) === best.get(unit.service)) ids.add(unit.id);
  }
  return ids;
}

export function parentChoices(units: UnitFeature[], levels: LevelDef[], unit: UnitFeature): UnitFeature[] {
  const blocked = descendantIds(units, unit.id);
  const rank = levelRank(levels, unit.levelId);
  return units.filter((item) => !blocked.has(item.id) && levelRank(levels, item.levelId) < rank);
}

export function fitPair(pair: CountPair): CountPair {
  const now = Math.max(0, Math.min(1_000_000, Math.round(pair.now) || 0));
  const orig = Math.max(now, Math.max(0, Math.min(1_000_000, Math.round(pair.orig) || 0)));
  return { now, orig };
}

export function unitStock(unit: UnitFeature): { now: number; orig: number; text: string } {
  if (unit.service === "land") {
    const now = unit.personnel.now;
    const orig = unit.personnel.orig;
    return { now, orig, text: now === 0 && orig === 0 ? "" : `${now}/${orig}` };
  }
  let now = 0;
  let orig = 0;
  for (const item of GEAR) {
    if (item.service !== unit.service) continue;
    const pair = unit.equipment[item.id];
    if (!pair) continue;
    now += pair.now;
    orig += pair.orig;
  }
  return { now, orig, text: now === 0 && orig === 0 ? "" : `${unit.service === "sea" ? "舰" : "机"} ${now}/${orig}` };
}

export function zeroPair(): CountPair {
  return { now: 0, orig: 0 };
}
