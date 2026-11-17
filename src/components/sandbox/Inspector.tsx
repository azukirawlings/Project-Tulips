import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { compressImage } from "./Chrome";
import { formatDistance, pathLength } from "@/map/geo";
import { activeScenario, useSandbox } from "@/map/store";
import type { CountPair, Dash, Feature, PathFeature, Scenario, ServiceId, UnitFeature } from "@/map/types";
import {
  FORT_TYPES,
  GEAR,
  GROUPS,
  SERVICES,
  UNIT_TYPES,
  factionColor,
  factionTone,
  labelOf,
} from "@/map/types";
import { parentChoices, unitStock, unitsOf, fitPair } from "@/map/order";
import { Overview } from "./Overview";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="stack">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Inspector() {
  const board = useSandbox((state) => state.board);
  const scenario = useSandbox(activeScenario);
  const selectedId = useSandbox((state) => state.selectedId);
  const feature = scenario.features.find((item) => item.id === selectedId) ?? null;
  const toggleGroup = useSandbox((state) => state.toggleGroup);
  const focusFeature = useSandbox((state) => state.focusFeature);
  const patchFeature = useSandbox((state) => state.patchFeature);
  const deleteFeature = useSandbox((state) => state.deleteFeature);
  const duplicateFeature = useSandbox((state) => state.duplicateFeature);
  const viewSplit = useSandbox((state) => state.viewSplit);
  const setViewSplit = useSandbox((state) => state.setViewSplit);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const text = query.trim();
    const list = [...scenario.features].reverse();
    if (!text) return list;
    return list.filter((item) => `${item.name} ${"callsign" in item ? item.callsign : ""}`.includes(text));
  }, [scenario.features, query]);

  if (board) {
    return (
      <aside className="panel">
        <Overview />
      </aside>
    );
  }
  if (scenario.mode === "view") {
    return (
      <aside className="panel viewing">
        <div className="view-top" style={{ flexBasis: `${Math.round(viewSplit * 100)}%` }}>
          {feature ? <Dossier feature={feature} scenario={scenario} /> : <p className="empty">点地图上的标绘，查看图片、简介和兵力。</p>}
        </div>
        <div
          className="splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整单位信息和名单的高度"
          onPointerDown={(event) => {
            const panel = event.currentTarget.parentElement;
            if (!panel) return;
            const move = (pointer: PointerEvent) => {
              const rect = panel.getBoundingClientRect();
              if (rect.height < 1) return;
              setViewSplit((pointer.clientY - rect.top) / rect.height);
            };
            const stop = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
          }}
        />
        <FeatureList shown={shown} selectedId={selectedId} scenario={scenario} onFocus={focusFeature} />
      </aside>
    );
  }
  return (
    <aside className="panel">
      <div className="group-row" role="group" aria-label="图层">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={scenario.groups[group.id] ? "chip on" : "chip"}
            onClick={() => toggleGroup(group.id)}
          >
            {group.label}
          </button>
        ))}
      </div>
      {feature ? <Properties feature={feature} onPatch={patchFeature} onDelete={deleteFeature} onCopy={duplicateFeature} /> : null}
      <div className="list-head">
        <input
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="筛选标绘"
          aria-label="筛选标绘"
        />
      </div>
      <ul className="feat-list">
        {shown.length === 0 ? <li className="empty">这一层还是空的。从左侧选一个工具，直接画在地图上。</li> : null}
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === selectedId ? "row on" : "row"}
              data-side={factionTone(scenario.factions, item.faction)}
              style={{ boxShadow: `inset 2px 0 0 ${factionColor(scenario.factions, item.faction)}` }}
              onClick={() => focusFeature(item.id)}
            >
              <span>
                <b>{item.name || "未命名"}</b>
                <small>{kindLabel(item, scenario)}</small>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={item.hidden ? "显示" : "隐藏"}
              onClick={() => patchFeature(item.id, { hidden: !item.hidden })}
            >
              {item.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button type="button" className="icon-btn" aria-label="删除" onClick={() => deleteFeature(item.id)}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      <details className="help">
        <summary>快捷键</summary>
        <p>V 选择 · U 部队 · F 工事 · T 地名</p>
        <p>P 多边形 · C 曲线 · H 手绘 · A 箭头 · O 圆 · M 测距</p>
        <p>Enter 完成 · Esc 取消 · Delete 删除</p>
        <p>Ctrl+Z 撤销 · Ctrl+Shift+Z 重做</p>
        <p>[ ] 旋转朝向 · 方向键微移 · Alt+点击顶点可删点</p>
      </details>
    </aside>
  );
}

function kindLabel(feature: Feature, scenario: { levels: { id: string; name: string }[] }): string {
  if (feature.kind === "unit") {
    const level = scenario.levels.find((item) => item.id === feature.levelId)?.name ?? "";
    const branch = feature.service === "land" ? labelOf(UNIT_TYPES, feature.unitType) : labelOf(SERVICES, feature.service);
    return `${branch}${level} · ${feature.personnel.now}/${feature.personnel.orig}`;
  }
  if (feature.kind === "fort") return labelOf(FORT_TYPES, feature.fortType);
  if (feature.kind === "label") return "地名";
  if (feature.kind === "circle") return `圆域 · ${formatDistance(feature.radiusM)}`;
  if (feature.kind === "arrow") return `轴线 · ${formatDistance(pathLength(feature.points))}`;
  return `${feature.closed || feature.kind === "polygon" ? "区域" : "线条"} · ${formatDistance(pathLength(feature.points))}`;
}

function Properties({
  feature,
  onPatch,
  onDelete,
  onCopy,
}: {
  feature: Feature;
  onPatch: (id: string, partial: object, coalesceKey?: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
}) {
  const [name, setName] = useState(feature.name);
  const [notes, setNotes] = useState(feature.notes);
  const [callsign, setCallsign] = useState("callsign" in feature ? feature.callsign : "");
  const [subtitle, setSubtitle] = useState("subtitle" in feature ? feature.subtitle : "");
  const nameFocus = useRef(false);
  const notesFocus = useRef(false);
  const callsignFocus = useRef(false);
  const subtitleFocus = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scenario = useSandbox(activeScenario);
  const storedCallsign = "callsign" in feature ? feature.callsign : "";
  const storedSubtitle = "subtitle" in feature ? feature.subtitle : "";

  useEffect(() => {
    if (!nameFocus.current) setName(feature.name);
  }, [feature.id, feature.name]);
  useEffect(() => {
    if (!notesFocus.current) setNotes(feature.notes);
  }, [feature.id, feature.notes]);
  useEffect(() => {
    if (!callsignFocus.current) setCallsign(storedCallsign);
  }, [feature.id, storedCallsign]);
  useEffect(() => {
    if (!subtitleFocus.current) setSubtitle(storedSubtitle);
  }, [feature.id, storedSubtitle]);

  return (
    <div className="props">
      <Field label="名称">
        <input
          className="field"
          value={name}
          placeholder="可留空"
          onFocus={() => {
            nameFocus.current = true;
          }}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            nameFocus.current = false;
            if (name !== feature.name) onPatch(feature.id, { name });
          }}
        />
      </Field>
      <Field label="阵营">
        <div className="seg wrap">
          {scenario.factions.map((item) => (
            <button
              key={item.id}
              type="button"
              className={feature.faction === item.id ? "on" : ""}
              onClick={() => onPatch(feature.id, { faction: item.id })}
            >
              <i className="swatch" style={{ background: factionColor(scenario.factions, item.id) }} />
              {item.name}
            </button>
          ))}
        </div>
      </Field>
      {feature.kind === "unit" ? (
        <UnitFields
          feature={feature}
          scenario={scenario}
          onPatch={onPatch}
          callsign={callsign}
          setCallsign={setCallsign}
          callsignFocus={callsignFocus}
        />
      ) : null}
      {feature.kind === "fort" ? (
        <Field label="工事">
          <select className="field" value={feature.fortType} onChange={(event) => onPatch(feature.id, { fortType: event.target.value })}>
            {FORT_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {feature.kind === "unit" || feature.kind === "fort" ? (
        <Field label={`朝向 ${Math.round(feature.heading)}°`}>
          <input
            className="range"
            type="range"
            min={0}
            max={359}
            value={feature.heading}
            onChange={(event) => onPatch(feature.id, { heading: Number(event.target.value) }, `heading:${feature.id}`)}
          />
        </Field>
      ) : null}
      {feature.kind === "label" ? (
        <Field label="副题">
          <input
            className="field"
            value={subtitle}
            placeholder="可留空"
            onFocus={() => {
              subtitleFocus.current = true;
            }}
            onChange={(event) => setSubtitle(event.target.value)}
            onBlur={() => {
              subtitleFocus.current = false;
              if (feature.kind === "label" && subtitle !== feature.subtitle) onPatch(feature.id, { subtitle });
            }}
          />
        </Field>
      ) : null}
      {feature.kind === "circle" ? (
        <Field label="半径（米）">
          <input
            className="field"
            type="number"
            min={8}
            value={Math.round(feature.radiusM)}
            onChange={(event) => onPatch(feature.id, { radiusM: Math.max(8, Number(event.target.value) || 8) }, `radius:${feature.id}`)}
          />
        </Field>
      ) : null}
      {"dash" in feature && feature.kind !== "arrow" ? (
        <Field label="线型">
          <div className="seg wrap">
            {(
              [
                ["solid", "实线"],
                ["dash", "虚线"],
                ["dot", "点线"],
                ["cross", "叉线"],
                ["defense", "防御线"],
              ] as [Dash, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className={feature.dash === id ? "on" : ""} onClick={() => onPatch(feature.id, { dash: id })}>
                {label}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      {feature.kind === "arrow" ? (
        <Field label="箭身宽度（米）">
          <input
            className="field"
            type="number"
            min={12}
            value={Math.round(feature.widthM ?? 480)}
            onChange={(event) =>
              onPatch(feature.id, { widthM: Math.max(12, Number(event.target.value) || 12) }, `width:${feature.id}`)
            }
          />
        </Field>
      ) : null}
      {isPath(feature) ? (
        <div className="seg">
          <button type="button" className={feature.smooth ? "on" : ""} onClick={() => onPatch(feature.id, { smooth: !feature.smooth })}>
            {feature.kind === "arrow" ? "弯曲" : "平滑"}
          </button>
          {feature.kind !== "polygon" && feature.kind !== "arrow" ? (
            <button type="button" className={feature.closed ? "on" : ""} onClick={() => onPatch(feature.id, { closed: !feature.closed })}>
              闭合
            </button>
          ) : null}
        </div>
      ) : null}
      <Field label="图片">
        {feature.image ? <img className="shot" src={feature.image} alt="" /> : null}
        <div className="row-actions">
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
            上传图片
          </button>
          {feature.image ? (
            <button type="button" className="text-btn" onClick={() => onPatch(feature.id, { image: "" })}>
              去掉
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          className="sr"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void compressImage(file)
              .then((image) => onPatch(feature.id, { image }))
              .catch(() => undefined);
          }}
        />
      </Field>
      <Field label="简介">
        <textarea
          className="field"
          value={notes}
          placeholder="可留空"
          onFocus={() => {
            notesFocus.current = true;
          }}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            notesFocus.current = false;
            if (notes !== feature.notes) onPatch(feature.id, { notes });
          }}
        />
      </Field>
      <div className="row-actions">
        <button type="button" className="text-btn" onClick={() => onCopy(feature.id)}>
          <Copy size={15} />
          复制
        </button>
        <button type="button" className="text-btn danger" onClick={() => onDelete(feature.id)}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </div>
  );
}

function isPath(feature: Feature): feature is PathFeature {
  return feature.kind === "polygon" || feature.kind === "curve" || feature.kind === "freehand" || feature.kind === "arrow";
}

function UnitFields({
  feature,
  scenario,
  onPatch,
  callsign,
  setCallsign,
  callsignFocus,
}: {
  feature: UnitFeature;
  scenario: Scenario;
  onPatch: (id: string, partial: object, coalesceKey?: string) => void;
  callsign: string;
  setCallsign: (value: string) => void;
  callsignFocus: { current: boolean };
}) {
  const units = unitsOf(scenario.features);
  const parents = parentChoices(units, scenario.levels, feature);
  const gear = GEAR.filter((item) => item.service === feature.service);
  const setPair = (partial: object, key: string) => onPatch(feature.id, partial, key);
  return (
    <>
      <Field label="军种">
        <select
          className="field"
          value={feature.service}
          onChange={(event) => onPatch(feature.id, { service: event.target.value as ServiceId })}
        >
          {SERVICES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      {feature.service === "land" ? (
        <Field label="兵种">
          <select className="field" value={feature.unitType} onChange={(event) => onPatch(feature.id, { unitType: event.target.value })}>
            {UNIT_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="层级">
        <select
          className="field"
          value={feature.levelId}
          onChange={(event) => {
            const levelId = event.target.value;
            const parent = units.find((unit) => unit.id === feature.parentId);
            const parentRank = parent ? scenario.levels.findIndex((level) => level.id === parent.levelId) : -1;
            const rank = scenario.levels.findIndex((level) => level.id === levelId);
            const parentOk = parent && parentRank >= 0 && parentRank < rank;
            onPatch(feature.id, { levelId, parentId: parentOk ? feature.parentId : null });
          }}
        >
          {scenario.levels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="上级">
        <select
          className="field"
          value={feature.parentId ?? ""}
          onChange={(event) => onPatch(feature.id, { parentId: event.target.value || null })}
        >
          <option value="">无</option>
          {parents.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="呼号">
        <input
          className="field"
          value={callsign}
          placeholder="可留空"
          onFocus={() => {
            callsignFocus.current = true;
          }}
          onChange={(event) => setCallsign(event.target.value)}
          onBlur={() => {
            callsignFocus.current = false;
            if (callsign !== feature.callsign) onPatch(feature.id, { callsign });
          }}
        />
      </Field>
      <CountRow
        label="人数"
        pair={feature.personnel}
        onChange={(personnel) => setPair({ personnel }, `per:${feature.id}`)}
      />
      <p className="hint">装备为现有 / 原有。伤亡和损失在总览里按原有减现有计算。</p>
      {gear.map((item) => (
        <CountRow
          key={item.id}
          label={item.label}
          pair={feature.equipment[item.id] ?? { now: 0, orig: 0 }}
          onChange={(next) => setPair({ equipment: { ...feature.equipment, [item.id]: next } }, `gear:${feature.id}:${item.id}`)}
        />
      ))}
    </>
  );
}

function CountRow({ label, pair, onChange }: { label: string; pair: CountPair; onChange: (next: CountPair) => void }) {
  const [now, setNow] = useState(String(pair.now));
  const [orig, setOrig] = useState(String(pair.orig));
  const nowFocus = useRef(false);
  const origFocus = useRef(false);
  useEffect(() => {
    if (!nowFocus.current) setNow(String(pair.now));
  }, [pair.now]);
  useEffect(() => {
    if (!origFocus.current) setOrig(String(pair.orig));
  }, [pair.orig]);
  const commit = (key: "now" | "orig", value: string) => {
    const trimmed = value.trim();
    const number = trimmed === "" ? 0 : Math.max(0, Math.min(1_000_000, Math.round(Number(trimmed) || 0)));
    const next = fitPair({ ...pair, [key]: number });
    onChange(next);
    setNow(String(next.now));
    setOrig(String(next.orig));
  };
  return (
    <label className="stock">
      <span>{label}</span>
      <input
        className="field"
        inputMode="numeric"
        aria-label={`${label}现有`}
        value={now}
        onFocus={() => {
          nowFocus.current = true;
        }}
        onChange={(event) => setNow(event.target.value.replace(/[^\d]/g, "").slice(0, 7))}
        onBlur={() => {
          nowFocus.current = false;
          commit("now", now);
        }}
      />
      <span>/</span>
      <input
        className="field"
        inputMode="numeric"
        aria-label={`${label}原有`}
        value={orig}
        onFocus={() => {
          origFocus.current = true;
        }}
        onChange={(event) => setOrig(event.target.value.replace(/[^\d]/g, "").slice(0, 7))}
        onBlur={() => {
          origFocus.current = false;
          commit("orig", orig);
        }}
      />
    </label>
  );
}

function Dossier({ feature, scenario }: { feature: Feature; scenario: Scenario }) {
  const gear = feature.kind === "unit" ? GEAR.filter((item) => item.service === feature.service) : [];
  return (
    <div className="props dossier">
      {feature.image ? <img className="shot" src={feature.image} alt="" /> : null}
      <h2>{feature.name || "未命名"}</h2>
      <p>{feature.notes || "没有简介。"}</p>
      {feature.kind === "unit" ? (
        <>
          <p className="hint">
            {SERVICES.find((item) => item.id === feature.service)?.label}
            {unitStock(feature).text ? ` · ${unitStock(feature).text}` : ""}
          </p>
          <ul className="ov-rows">
            <li>
              <span>人数</span>
              <b>
                {feature.personnel.now}/{feature.personnel.orig}
              </b>
            </li>
            {gear.map((item) => {
              const pair = feature.equipment[item.id] ?? { now: 0, orig: 0 };
              if (!pair.now && !pair.orig) return null;
              return (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <b>
                    {pair.now}/{pair.orig}
                  </b>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <p className="hint">{scenario.factions.find((item) => item.id === feature.faction)?.name}</p>
    </div>
  );
}

function FeatureList({
  shown,
  selectedId,
  scenario,
  onFocus,
}: {
  shown: Feature[];
  selectedId: string | null;
  scenario: Scenario;
  onFocus: (id: string) => void;
}) {
  return (
    <ul className="feat-list">
      {shown.length === 0 ? <li className="empty">这一层还是空的。</li> : null}
      {shown.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={item.id === selectedId ? "row on" : "row"}
            style={{ boxShadow: `inset 2px 0 0 ${factionColor(scenario.factions, item.faction)}` }}
            onClick={() => onFocus(item.id)}
          >
            <span>
              <b>{item.name || "未命名"}</b>
              <small>{kindLabel(item, scenario)}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
