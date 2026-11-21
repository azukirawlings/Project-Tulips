import { useEffect, useMemo, useState } from "react";
import { activeScenario, useSandbox } from "@/map/store";
import type { FactionDef, FactionTone, Feature, LevelDef, ServiceId, UnitFeature } from "@/map/types";
import { FACTION_PALETTE, SERVICES, factionColor, iconColors, uid } from "@/map/types";
import { descendantIds, levelRank, tally, unitsOf } from "@/map/order";

const TONES: FactionTone[] = ["friend", "foe", "neutral", "unknown"];

export function Overview() {
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
      if (current.kind === "units" && current.faction === unit.faction) {
        const ids = current.ids.includes(unit.id) ? current.ids.filter((item) => item !== unit.id) : [...current.ids, unit.id];
        return { kind: "units", faction: unit.faction, ids };
      }
      return { kind: "units", faction: unit.faction, ids: [unit.id] };
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
    <div className="board-window" role="dialog" aria-label="总览">
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
          return (
            <section key={faction.id}>
              <div className={factionOn(faction.id) ? "tree-row on" : "tree-row"}>
                <button type="button" className="twist" aria-label={expanded ? "收起" : "展开"} onClick={() => setOpen((current) => ({ ...current, [id]: !expanded }))}>
                  {expanded ? "−" : "+"}
                </button>
                <button type="button" className="tree-name" onClick={() => toggleFaction(faction.id)}>
                  <i className="swatch" style={{ background: factionColor(scenario.factions, faction.id) }} />
                  <b>{faction.name || "未命名"}</b>
                </button>
              </div>
              {expanded ? (
                rows.length ? (
                  (() => {
                    let hideBelow = -1;
                    return rows.map((row) => {
                      if (row.kind === "head") {
                        hideBelow = -1;
                        return (
                          <p key={`${faction.id}-${row.service}`} className="svc-head">
                            {SERVICES.find((item) => item.id === row.service)?.label}
                          </p>
                        );
                      }
                      if (hideBelow >= 0 && row.depth > hideBelow) return null;
                      const { unit, depth, children } = row;
                      const unitOpen = Boolean(open[unit.id]);
                      hideBelow = unitOpen ? -1 : depth;
                      const own = tally([unit]);
                      const withKids = children ? tally(units.filter((item) => descendantIds(units, unit.id).has(item.id))) : own;
                      return (
                        <div key={unit.id}>
                          <div className={unitOn(unit) ? "tree-row on" : "tree-row"} style={{ paddingLeft: 8 + depth * 14 }}>
                            <button
                              type="button"
                              className="twist"
                              aria-label={unitOpen ? "收起" : "展开"}
                              onClick={() => setOpen((current) => ({ ...current, [unit.id]: !unitOpen }))}
                            >
                              {unitOpen ? "−" : "+"}
                            </button>
                            <button type="button" className="tree-name" onClick={() => toggleUnit(unit)} onDoubleClick={() => focusFeature(unit.id)}>
                              <b>{unit.name}</b>
                              <small>{scenario.levels.find((level) => level.id === unit.levelId)?.name ?? "层级"}</small>
                            </button>
                          </div>
                          {unitOpen ? (
                            <ul className="ov-rows nest" style={{ marginLeft: 28 + depth * 14 }}>
                              <li>
                                <span>本级人数</span>
                                <b>
                                  {own.now}/{own.orig}
                                </b>
                                <small>损 {own.loss}</small>
                              </li>
                              {children ? (
                                <li>
                                  <span>含下级人数</span>
                                  <b>
                                    {withKids.now}/{withKids.orig}
                                  </b>
                                  <small>损 {withKids.loss}</small>
                                </li>
                              ) : null}
                              {own.rows.map((item) => (
                                <li key={item.id}>
                                  <span>{item.label}</span>
                                  <b>
                                    {item.now}/{item.orig}
                                  </b>
                                  <small>{item.loss > 0 ? `损 ${item.loss}` : "无损"}</small>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    });
                  })()
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
                <span>{row.label}</span>
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

function retie(features: Feature[], levels: LevelDef[]): Feature[] {
  return features.map((feature) => {
    if (feature.kind !== "unit" || !feature.parentId) return feature;
    const parent = features.find((item) => item.id === feature.parentId && item.kind === "unit");
    if (!parent || parent.kind !== "unit") return { ...feature, parentId: null };
    if (levelRank(levels, parent.levelId) >= levelRank(levels, feature.levelId)) return { ...feature, parentId: null };
    return feature;
  });
}
