import { useEffect, useMemo, useState } from "react";
import { activeScenario, useSandbox } from "@/map/store";
import type { FactionDef, FactionTone, Feature, LevelDef, ServiceId, UnitFeature } from "@/map/types";
import { FACTION_PALETTE, SERVICES, factionColor, iconColors, uid } from "@/map/types";
import { descendantIds, levelRank, tally, unitStock, unitsOf } from "@/map/order";

const TONES: FactionTone[] = ["friend", "foe", "neutral", "unknown"];

export function Overview() {
  const scenario = useSandbox(activeScenario);
  const patchScenario = useSandbox((state) => state.patchScenario);
  const setFaction = useSandbox((state) => state.setFaction);
  const focusFeature = useSandbox((state) => state.focusFeature);
  const [side, setSide] = useState("all");
  const [root, setRoot] = useState<string | null>(null);
  const units = useMemo(() => unitsOf(scenario.features), [scenario.features]);
  const sided = side === "all" ? units : units.filter((unit) => unit.faction === side);
  const scoped = useMemo(() => {
    if (!root || !sided.some((unit) => unit.id === root)) return sided;
    const ids = descendantIds(sided, root);
    return sided.filter((unit) => ids.has(unit.id));
  }, [sided, root]);
  const stats = tally(scoped);
  const rootName = units.find((unit) => unit.id === root)?.name;

  const tree = useMemo(() => {
    const rank = (unit: UnitFeature) => levelRank(scenario.levels, unit.levelId);
    const sort = (list: UnitFeature[]) => list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "zh"));
    const rows: ({ kind: "head"; service: ServiceId } | { kind: "gap"; key: string } | { kind: "unit"; unit: UnitFeature; depth: number })[] = [];
    for (const service of ["land", "sea", "air"] as const) {
      const group = sided.filter((unit) => unit.service === service);
      if (!group.length) continue;
      rows.push({ kind: "head", service });
      const ids = new Set(group.map((unit) => unit.id));
      const children = new Map<string, UnitFeature[]>();
      const tops: UnitFeature[] = [];
      for (const unit of group) {
        if (unit.parentId && ids.has(unit.parentId)) {
          const list = children.get(unit.parentId) ?? [];
          list.push(unit);
          children.set(unit.parentId, list);
        } else tops.push(unit);
      }
      sort(tops);
      for (const list of children.values()) sort(list);
      const walk = (unit: UnitFeature, depth: number) => {
        rows.push({ kind: "unit", unit, depth });
        for (const child of children.get(unit.id) ?? []) walk(child, depth + 1);
      };
      tops.forEach((unit, index) => {
        if (index > 0) rows.push({ kind: "gap", key: `${service}-${unit.id}` });
        walk(unit, 0);
      });
    }
    return rows;
  }, [sided, scenario.levels]);

  return (
    <div className="overview">
      <div className="seg wrap">
        <button type="button" className={side === "all" ? "on" : ""} onClick={() => { setSide("all"); setRoot(null); }}>
          全部
        </button>
        {scenario.factions.map((faction) => (
          <button
            key={faction.id}
            type="button"
            className={side === faction.id ? "on" : ""}
            onClick={() => { setSide(faction.id); setRoot(null); }}
          >
            <i className="swatch" style={{ background: factionColor(scenario.factions, faction.id) }} />
            {faction.name || "未命名"}
          </button>
        ))}
      </div>
      <p className="hint">{rootName ? `范围：${rootName} 及其下级` : "范围：当前筛选下的全部单位"}</p>
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
      <div className="list-head">
        <span>损失清单</span>
      </div>
      {stats.rows.some((row) => row.loss > 0) ? (
        <ul className="ov-rows">
          {stats.rows
            .filter((row) => row.loss > 0)
            .map((row) => (
              <li key={row.id}>
                <span>
                  {SERVICES.find((item) => item.id === row.service)?.label} · {row.label}
                </span>
                <b className="loss">{row.loss}</b>
                <small>
                  现 {row.now} / 原 {row.orig}
                </small>
              </li>
            ))}
        </ul>
      ) : (
        <p className="empty">这个范围没有装备损失。</p>
      )}
      {stats.rows.length ? (
        <>
          <div className="list-head">
            <span>装备存量</span>
          </div>
          <ul className="ov-rows">
            {stats.rows.map((row) => (
              <li key={`stock-${row.id}`}>
                <span>{row.label}</span>
                <b>
                  {row.now}/{row.orig}
                </b>
                <small>{row.loss > 0 ? `损 ${row.loss}` : "无损"}</small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty">还没有装备数量。选中部队后可填写。</p>
      )}
      <div className="list-head">
        <span>编制</span>
        {root ? (
          <button type="button" className="text-btn" onClick={() => setRoot(null)}>
            看全部
          </button>
        ) : null}
      </div>
      <ul className="feat-list">
        {tree.length === 0 ? <li className="empty">这个阵营还没有部队。</li> : null}
        {tree.map((row) => {
          if (row.kind === "head") {
            return (
              <li key={row.service} className="svc-head">
                {SERVICES.find((item) => item.id === row.service)?.label}
              </li>
            );
          }
          if (row.kind === "gap") return <li key={row.key} className="org-gap" />;
          const { unit, depth } = row;
          return (
          <li key={unit.id}>
            <button
              type="button"
              className={unit.id === root ? "row on" : "row"}
              style={{
                paddingLeft: 8 + depth * 14,
                boxShadow: `inset 2px 0 0 ${factionColor(scenario.factions, unit.faction)}`,
              }}
              onClick={() => setRoot(unit.id === root ? null : unit.id)}
              onDoubleClick={() => focusFeature(unit.id)}
            >
              <span>
                <b>{unit.name}</b>
                <small>
                  {scenario.levels.find((level) => level.id === unit.levelId)?.name ?? "层级"}
                  {unitStock(unit).text ? ` · ${unitStock(unit).text}` : ""}
                </small>
              </span>
            </button>
          </li>
          );
        })}
      </ul>
      <p className="hint">单击统计该节点和下级，双击在地图上打开。</p>
      <OrgEditor
        factions={scenario.factions}
        levels={scenario.levels}
        features={scenario.features}
        onFaction={(factions, features) => {
          patchScenario(features ? { factions, features } : { factions });
          if (!factions.some((item) => item.id === side) && side !== "all") setSide("all");
        }}
        onBrush={setFaction}
        onLevels={(levels, features) => {
          patchScenario({ levels, features });
          if (root && !features.some((feature) => feature.id === root)) setRoot(null);
        }}
      />
    </div>
  );
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
      <details className="help">
        <summary>阵营</summary>
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
      <details className="help">
        <summary>层级（上为上级）</summary>
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
