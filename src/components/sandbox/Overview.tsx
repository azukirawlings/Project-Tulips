import { useEffect, useMemo, useState } from "react";
import { activeScenario, useSandbox } from "@/map/store";
import type { FactionDef, FactionTone, Feature, LevelDef, ServiceId, UnitFeature } from "@/map/types";
import { FACTION_PALETTE, SERVICES, factionColor, iconColors, uid } from "@/map/types";
import { descendantIds, levelRank, tally, unitsOf } from "@/map/order";

const TONES: FactionTone[] = ["friend", "foe", "neutral", "unknown"];

export function Overview({ closing = false }: { closing?: boolean }) {
  const scenario = useSandbox(activeScenario);
  const focusFeature = useSandbox((state) => state.focusFeature);
  const units = useMemo(() => unitsOf(scenario.features), [scenario.features]);
  const [compare, setCompare] = useState<Compare>({ kind: "factions", ids: [] });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const trees = useMemo(() => scenario.factions.map((faction) => ({ faction, rows: treeOf(units.filter((unit) => unit.faction === faction.id), scenario.levels) })), [scenario.factions, scenario.levels, units]);
  const scoped = useMemo(() => unitsFor(compare, units), [compare, units]);
  const stats = tally(scoped);

  const toggleFaction = (id: string) => {
    setCompare((current) => {
      if (current.kind === "factions" && current.ids.includes(id)) return { kind: "factions", ids: current.ids.filter((item) => item !== id) };
      if (current.kind === "factions") return { kind: "factions", ids: [...current.ids, id] };
      return { kind: "factions", ids: [id] };
    });
  };
  const toggleUnit = (unit: UnitFeature) => {
    setCompare((current) => {
      const prev = current.kind === "units" && current.faction === unit.faction ? current.ids : [];
      if (prev.includes(unit.id)) return { kind: "units", faction: unit.faction, ids: prev.filter((id) => id !== unit.id) };
      const kept = prev.filter((id) => !descendantIds(units, id).has(unit.id) && !descendantIds(units, unit.id).has(id));
      return { kind: "units", faction: unit.faction, ids: [...kept, unit.id] };
    });
  };
  const factionOn = (id: string) => compare.kind === "factions" && compare.ids.includes(id);
  const unitOn = (unit: UnitFeature) => compare.kind === "units" && compare.faction === unit.faction && compare.ids.includes(unit.id);
  const subject = !compare.ids.length
    ? "未选择"
    : compare.kind === "factions"
      ? compare.ids.map((id) => scenario.factions.find((item) => item.id === id)?.name || "未命名").join("、")
      : compare.ids.map((id) => units.find((unit) => unit.id === id)?.name || "未命名").join("、");
  const setBoard = useSandbox((state) => state.setBoard);

  return (
    <div className={closing ? "board-window out" : "board-window"} role="dialog" aria-label="总览">
      <div className="board-pick">
        <header>
          <strong>选择</strong>
          <button type="button" className="icon-btn" aria-label="关闭总览" onClick={() => setBoard(false)}>
            ×
          </button>
        </header>
        <p className="hint">点阵营可多选。同一阵营的部队可多选。再点一次取消。点到另一个阵营的部队时，只保留最后一支。</p>
        <div className="org-tree">
        {trees.map(({ faction, rows }) => {
          const id = `side:${faction.id}`;
          const expanded = open[id] !== false;
          const color = factionColor(scenario.factions, faction.id);
          return (
            <section key={faction.id} className="side-block" style={{ ["--side" as string]: color }}>
              <div className={factionOn(faction.id) ? "side-head on" : "side-head"}>
                <button type="button" className="twist" aria-label={expanded ? "收起" : "展开"} onClick={() => setOpen((current) => ({ ...current, [id]: !expanded }))}>
                  {expanded ? "−" : "+"}
                </button>
                <button type="button" className="tree-name" onClick={() => toggleFaction(faction.id)}>
                  <i className="swatch" style={{ background: color }} />
                  <b>{faction.name || "未命名"}</b>
                </button>
              </div>
              {expanded ? (
                rows.length ? (
                  <div className="side-body">
                    {(() => {
                      let hideBelow = -1;
                      return rows.map((row) => {
                        if (row.kind === "head") {
                          hideBelow = -1;
                          return (
                            <p key={`${faction.id}-${row.service}`} className="svc-head">
                              <span>{SERVICES.find((item) => item.id === row.service)?.label}</span>
                            </p>
                          );
                        }
                        if (hideBelow >= 0 && row.depth > hideBelow) return null;
                        const { unit, depth, children } = row;
                        const unitOpen = open[unit.id] !== false;
                        hideBelow = children && !unitOpen ? depth : -1;
                        const levelName = scenario.levels.find((level) => level.id === unit.levelId)?.name ?? "层级";
                        return (
                          <div key={unit.id} className="limb" style={{ marginLeft: depth * 16 }}>
                            <div className={unitOn(unit) ? "tree-row on" : "tree-row"}>
                              {children ? (
                                <button
                                  type="button"
                                  className="twist"
                                  aria-label={unitOpen ? "收起下级" : "展开下级"}
                                  onClick={() => setOpen((current) => ({ ...current, [unit.id]: !unitOpen }))}
                                >
                                  {unitOpen ? "−" : "+"}
                                </button>
                              ) : (
                                <span className="twist ghost" />
                              )}
                              <button type="button" className="tree-name" onClick={() => toggleUnit(unit)} onDoubleClick={() => focusFeature(unit.id)}>
                                <em className="rank">{levelName}</em>
                                <b>{unit.name}</b>
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <p className="empty">这个阵营还没有部队。</p>
                )
              ) : null}
            </section>
          );
        })}
        </div>
      </div>
      <div className="board-data">
        <header className="board-who">
          <span>{compare.ids.length ? (compare.kind === "factions" ? "派系" : "部队") : "损失与状态"}</span>
          <h2>{subject}</h2>
        </header>
        <div className="ov-stats">
          <article>
            <span>现有人数</span>
            <strong>{stats.now}</strong>
            <small>原 {stats.orig}</small>
          </article>
          <article>
            <span>伤亡</span>
            <strong>{stats.loss}</strong>
          </article>
          <article>
            <span>现有装备</span>
            <strong>{stats.gearNow}</strong>
            <small>原 {stats.gearOrig}</small>
          </article>
        </div>
        {stats.rows.length ? (
          <ul className="ov-rows">
            {stats.rows.map((row) => (
              <li key={row.id}>
                <span>
                  <GearMark id={row.id} />
                  {row.label}
                </span>
                <b>
                  {row.now}/{row.orig}
                </b>
                <small className={row.loss > 0 ? "loss" : ""}>{row.loss > 0 ? `损 ${row.loss}` : "无损"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">左边点一个阵营或部队，这里显示它的人数和装备。</p>
        )}
      </div>
    </div>
  );
}

export function SideOrg() {
  const scenario = useSandbox(activeScenario);
  const patchScenario = useSandbox((state) => state.patchScenario);
  const setFaction = useSandbox((state) => state.setFaction);
  return (
    <div className="overview">
      <OrgEditor
        factions={scenario.factions}
        levels={scenario.levels}
        features={scenario.features}
        onFaction={(factions, features) => patchScenario(features ? { factions, features } : { factions })}
        onBrush={setFaction}
        onLevels={(levels, features) => patchScenario({ levels, features })}
      />
    </div>
  );
}

type Compare = { kind: "factions"; ids: string[] } | { kind: "units"; faction: string; ids: string[] };

function unitsFor(compare: Compare, units: UnitFeature[]): UnitFeature[] {
  if (!compare.ids.length) return [];
  if (compare.kind === "factions") return units.filter((unit) => compare.ids.includes(unit.faction));
  const ids = new Set<string>();
  for (const id of compare.ids) for (const item of descendantIds(units, id)) ids.add(item);
  return units.filter((unit) => ids.has(unit.id));
}

function treeOf(group: UnitFeature[], levels: LevelDef[]) {
  const rank = (unit: UnitFeature) => levelRank(levels, unit.levelId);
  const sort = (list: UnitFeature[]) => list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "zh"));
  const rows: ({ kind: "head"; service: ServiceId } | { kind: "unit"; unit: UnitFeature; depth: number; children: boolean })[] = [];
  for (const service of ["land", "sea", "air"] as const) {
    const slice = group.filter((unit) => unit.service === service);
    if (!slice.length) continue;
    rows.push({ kind: "head", service });
    const ids = new Set(slice.map((unit) => unit.id));
    const children = new Map<string, UnitFeature[]>();
    const tops: UnitFeature[] = [];
    for (const unit of slice) {
      if (unit.parentId && ids.has(unit.parentId)) {
        const list = children.get(unit.parentId) ?? [];
        list.push(unit);
        children.set(unit.parentId, list);
      } else tops.push(unit);
    }
    sort(tops);
    for (const list of children.values()) sort(list);
    const walk = (unit: UnitFeature, depth: number) => {
      const kids = children.get(unit.id) ?? [];
      rows.push({ kind: "unit", unit, depth, children: kids.length > 0 });
      for (const child of kids) walk(child, depth + 1);
    };
    tops.forEach((unit) => walk(unit, 0));
  }
  return rows;
}

function OrgEditor({
  factions,
  levels,
  features,
  onFaction,
  onBrush,
  onLevels,
}: {
  factions: FactionDef[];
  levels: LevelDef[];
  features: Feature[];
  onFaction: (factions: FactionDef[], features?: Feature[]) => void;
  onBrush: (id: string) => void;
  onLevels: (levels: LevelDef[], features: Feature[]) => void;
}) {
  return (
    <>
      <details className="help org-edit">
        <summary>编辑阵营</summary>
        <ul className="org-list">
          {factions.map((faction) => (
            <li key={faction.id}>
              <input
                className="color-input"
                type="color"
                aria-label={`${faction.name || "阵营"}颜色`}
                value={factionColor([faction], faction.id)}
                onChange={(event) =>
                  onFaction(factions.map((item) => (item.id === faction.id ? { ...item, color: event.target.value } : item)))
                }
              />
              <input
                className="color-input"
                type="color"
                title="底板"
                aria-label={`${faction.name || "阵营"}底板`}
                value={faction.plate || iconColors(factionColor([faction], faction.id), "sat").plate}
                onChange={(event) =>
                  onFaction(factions.map((item) => (item.id === faction.id ? { ...item, plate: event.target.value } : item)))
                }
              />
              <input
                className="color-input"
                type="color"
                title="线框"
                aria-label={`${faction.name || "阵营"}线框`}
                value={faction.ink || iconColors(factionColor([faction], faction.id), "sat").ink}
                onChange={(event) =>
                  onFaction(factions.map((item) => (item.id === faction.id ? { ...item, ink: event.target.value } : item)))
                }
              />
              <NameField
                label="阵营名称"
                value={faction.name}
                onCommit={(name) => {
                  if (name === faction.name) return;
                  onFaction(factions.map((item) => (item.id === faction.id ? { ...item, name } : item)));
                }}
              />
              <button
                type="button"
                className="nudge danger"
                disabled={factions.length <= 1}
                onClick={() => {
                  const next = factions.filter((item) => item.id !== faction.id);
                  const fallback = next[0]!.id;
                  onFaction(
                    next,
                    features.map((feature) => (feature.faction === faction.id ? { ...feature, faction: fallback } : feature)),
                  );
                  onBrush(fallback);
                }}
              >
                删
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="text-btn wide"
          disabled={factions.length >= 8}
          onClick={() => {
            const id = uid("side");
            const tone = TONES[factions.length % TONES.length]!;
            onFaction([...factions, { id, name: "新阵营", tone, color: FACTION_PALETTE[factions.length % FACTION_PALETTE.length] }]);
            onBrush(id);
          }}
        >
          增加阵营
        </button>
      </details>
      <details className="help org-edit">
        <summary>编辑层级</summary>
        <ul className="org-list levels">
          {levels.map((level, index) => (
            <li key={level.id}>
              <NameField
                label="层级名称"
                value={level.name}
                onCommit={(name) => {
                  if (name === level.name) return;
                  onLevels(
                    levels.map((item) => (item.id === level.id ? { ...item, name } : item)),
                    features,
                  );
                }}
              />
              <button
                type="button"
                className="nudge"
                disabled={index === 0}
                onClick={() => {
                  const next = levels.slice();
                  const [item] = next.splice(index, 1);
                  next.splice(index - 1, 0, item!);
                  onLevels(next, retie(features, next));
                }}
              >
                上
              </button>
              <button
                type="button"
                className="nudge"
                disabled={index === levels.length - 1}
                onClick={() => {
                  const next = levels.slice();
                  const [item] = next.splice(index, 1);
                  next.splice(index + 1, 0, item!);
                  onLevels(next, retie(features, next));
                }}
              >
                下
              </button>
              <button
                type="button"
                className="nudge danger"
                disabled={levels.length <= 1}
                onClick={() => {
                  const next = levels.filter((item) => item.id !== level.id);
                  const fallback = next[Math.max(0, index - 1)]!.id;
                  const moved = features.map((feature) =>
                    feature.kind === "unit" && feature.levelId === level.id ? { ...feature, levelId: fallback } : feature,
                  );
                  onLevels(next, retie(moved, next));
                }}
              >
                删
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="text-btn wide"
          disabled={levels.length >= 12}
          onClick={() => onLevels([...levels, { id: uid("lv"), name: "新层级" }], features)}
        >
          增加层级
        </button>
      </details>
    </>
  );
}

function NameField({ value, label, onCommit }: { value: string; label: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      className="field"
      aria-label={label}
      value={draft}
      placeholder="可留空"
      onChange={(event) => setDraft(event.target.value.slice(0, 24))}
      onBlur={() => {
        const next = draft.trim().slice(0, 24);
        if (next !== value) onCommit(next);
        else setDraft(value);
      }}
    />
  );
}

const GEAR_MARK: Record<string, string> = {
  vehicle: "M2.5 11h11M4 11V8h8v3M5.2 8 6.4 5.2h3.4L11 8",
  truck: "M1.5 11h13M3 11V7.2h7V11M10 11V6.2h3.2L15 9v2",
  apc: "M2 12h12M3.2 12V7.2h9.6V12M6 7.2V5.4h4V7.2",
  ifv: "M2 12h12M3 12V8h10v4M8 8V5.2M6.2 6.4h3.6",
  amphib: "M2.2 9.5h11.6M3.2 9.5V6.8h9.6v2.7M3 12.2c1.2.8 2 .8 3.2 0s2-.8 3.2 0 2 .8 3.2 0",
  lightTank: "M2.4 11.5h11.2M3.4 11.5V8.2h9.2v3.3M8 8.2V5.6",
  mbt: "M1.6 12h12.8M2.6 12V8h10.8v4M8 8V4.6M5.6 6.2h4.8",
  spg: "M3 12h10M4 12V8.4h8V12M8 8.4V3.2",
  mlrs: "M2.4 12h11.2M3.4 12V7h9.2v5M5 7V4.2M8 7V3.4M11 7V4.2",
  spaag: "M3 12h10M4 12V8h8v4M8 8V5.2M4.8 4.2a4 4 0 0 1 6.4 0",
  transHeli: "M3 6.2h10M8 6.2v1.4M4.4 9.2h7.2v2.4H4.4zM2.8 12.4h3.2",
  attackHeli: "M2.6 5.6h10.8M8 5.6v1.6M3.6 8.6 12.4 10.2 11.2 12.2H5.2L3.6 10.4z",
  smallBoat: "M3 10.5 8 6.8 13 10.5M4.2 10.5h7.6l-.8 2.2H5z",
  patrol: "M2.4 10.2 8 6.2 13.6 10.2M3.6 10.2h8.8l-1 2.4H4.6zM8 6.2V4",
  gunboat: "M2 10 8 5.6 14 10M3.2 10h9.6l-1.1 2.6H4.3zM8 5.6V3.4",
  coastal: "M1.6 10.4 8 5 14.4 10.4M2.8 10.4h10.4L12 13H4zM8 5V2.8",
  frigate: "M1.4 10.6 8 4.4 14.6 10.6M2.4 10.6h11.2L12.2 13.4H3.8zM6.4 7.2h3.2M8 4.4V2.4",
  destroyer: "M1.2 11 8 4 14.8 11M2.2 11h11.6L12.4 13.6H3.6zM5.6 8h4.8M8 4V2",
  cruiser: "M1 11.2 8 3.6 15 11.2M2 11.2h12l-1.4 2.6H3.4zM5.2 8h5.6M8 3.6V1.8",
  carrier: "M1 10.4h14L13.2 13.4H2.8zM3.2 10.4V7.2h9.6v3.2M6 7.2V5h4v2.2",
  fighter: "M2 8.6 8 5.2 14 8.6M8 5.2v6.2M5.2 9.4 8 11.4 10.8 9.4",
  strike: "M1.6 9.2 8 4.6 14.4 9.2M8 4.6v6.6M4.4 10.4 8 12.2 11.6 10.4",
  bomber: "M1.2 9.6h13.6M8 9.6V4.2M4.6 7.2h6.8M5 11.4h6",
  airlift: "M1.4 8.8h13.2M3.2 8.8v3.2h9.6V8.8M6.4 8.8V6.2h3.2v2.6",
};

function GearMark({ id }: { id: string }) {
  return (
    <svg className="gear-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d={GEAR_MARK[id] ?? "M3 8h10"} />
    </svg>
  );
}

function retie(features: Feature[], levels: LevelDef[]): Feature[] {
  return features.map((feature) => {
    if (feature.kind !== "unit" || !feature.parentId) return feature;
    const parent = features.find((item) => item.id === feature.parentId && item.kind === "unit");
    if (!parent || parent.kind !== "unit") return { ...feature, parentId: null };
    if (levelRank(levels, parent.levelId) >= levelRank(levels, feature.levelId)) return { ...feature, parentId: null };
    return feature;
  });
}
