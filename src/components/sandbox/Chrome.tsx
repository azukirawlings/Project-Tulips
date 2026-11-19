import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Castle,
  Circle,
  FolderOpen,
  LocateFixed,
  Minus,
  MousePointer2,
  MoveRight,
  Pencil,
  Pentagon,
  Redo2,
  Ruler,
  Settings,
  Spline,
  Tag,
  Undo2,
  Users,
  Plus,
  PanelRight,
  LayoutList,
  X,
} from "lucide-react";
import { formatPair } from "@/map/geo";
import { getHud, getHudServer, mapApi, subscribeHud } from "@/map/hud";
import { downloadScenario, parseScenarioFile } from "@/map/io";
import { activeScenario, canRedo, canUndo, useSandbox } from "@/map/store";
import { CollabMenu, useCollabSession } from "./Collab";
import type { Tool } from "@/map/types";
import { BASEMAPS, FORT_TYPES, SERVICES, TOOLS, UNIT_TYPES, factionColor } from "@/map/types";

const ICONS: Record<Tool, typeof MousePointer2> = {
  select: MousePointer2,
  unit: Users,
  fort: Castle,
  label: Tag,
  polygon: Pentagon,
  curve: Spline,
  freehand: Pencil,
  arrow: MoveRight,
  circle: Circle,
  measure: Ruler,
};

export function TopBar() {
  const scenario = useSandbox(activeScenario);
  const menu = useSandbox((state) => state.menu);
  const setMenu = useSandbox((state) => state.setMenu);
  const rename = useSandbox((state) => state.renameScenario);
  const undo = useSandbox((state) => state.undo);
  const redo = useSandbox((state) => state.redo);
  const undoOk = useSandbox(canUndo);
  const redoOk = useSandbox(canRedo);
  const panelOpen = useSandbox((state) => state.panelOpen);
  const setPanel = useSandbox((state) => state.setPanel);
  const board = useSandbox((state) => state.board);
  const setBoard = useSandbox((state) => state.setBoard);
  const collab = useCollabSession();

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Project Tulip</strong>
        <span>战术沙盘</span>
      </div>
      <input
        className="name-input"
        aria-label="沙盘名称"
        value={scenario.name}
        placeholder="未命名沙盘"
        onChange={(event) => rename(event.target.value)}
      />
      <Search />
      <div className="top-actions">
        <button type="button" className="icon-btn" aria-label="撤销" title="撤销" disabled={!undoOk} onClick={undo}>
          <Undo2 size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="重做" title="重做" disabled={!redoOk} onClick={redo}>
          <Redo2 size={18} />
        </button>
        <div className="pop" data-menu-root>
          <button
            type="button"
            className={menu === "map" ? "text-btn on" : "text-btn"}
            aria-expanded={menu === "map"}
            onClick={() => setMenu(menu === "map" ? null : "map")}
          >
            <Settings size={16} />
            设置
          </button>
          {menu === "map" ? <MapMenu /> : null}
        </div>
        <div className="pop" data-menu-root>
          <button
            type="button"
            className={menu === "file" ? "text-btn on" : "text-btn"}
            aria-expanded={menu === "file"}
            onClick={() => setMenu(menu === "file" ? null : "file")}
          >
            <FolderOpen size={16} />
            沙盘
          </button>
          {menu === "file" ? <FileMenu /> : null}
        </div>
        <div className="pop" data-menu-root>
          <button
            type="button"
            className={menu === "collab" || collab.status !== "idle" ? "text-btn on" : "text-btn"}
            aria-expanded={menu === "collab"}
            onClick={() => setMenu(menu === "collab" ? null : "collab")}
          >
            <Users size={16} />
            协作
          </button>
          {menu === "collab" ? <CollabMenu /> : null}
        </div>
        <button
          type="button"
          className={panelOpen && !board ? "text-btn on" : "text-btn"}
          aria-pressed={panelOpen && !board}
          onClick={() => {
            setMenu(null);
            if (board) {
              setBoard(false);
              setPanel(true);
              return;
            }
            setPanel(!panelOpen);
          }}
        >
          <PanelRight size={16} />
          清单
        </button>
      </div>
    </header>
  );
}

function Search() {
  const flyTo = useSandbox((state) => state.flyTo);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ label: string; lng: number; lat: number }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const coord = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) {
      const a = Number(coord[1]);
      const b = Number(coord[2]);
      const latFirst = Math.abs(a) <= 90;
      setHits([{ label: "坐标", lat: latFirst ? a : b, lng: latFirst ? b : a }]);
      setOpen(true);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=6&language=zh`,
        { signal: ctrl.signal },
      )
        .then((response) => response.json())
        .then((data: { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] }) => {
          setHits(
            (data.results ?? []).map((item) => ({
              label: [item.name, item.admin1, item.country].filter(Boolean).join(" · "),
              lng: item.longitude,
              lat: item.latitude,
            })),
          );
          setOpen(true);
        })
        .catch(() => undefined);
    }, 280);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="search">
      <input
        value={query}
        placeholder="搜地点，或粘贴 纬度, 经度"
        aria-label="搜索地点"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && hits[0]) {
            flyTo(hits[0].lng, hits[0].lat, 13);
            setOpen(false);
          }
        }}
      />
      {open && hits.length ? (
        <ul>
          {hits.map((hit) => (
            <li key={`${hit.lng},${hit.lat},${hit.label}`}>
              <button
                type="button"
                onClick={() => {
                  flyTo(hit.lng, hit.lat, 13);
                  setQuery(hit.label);
                  setOpen(false);
                }}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MapMenu() {
  const scenario = useSandbox(activeScenario);
  const patch = useSandbox((state) => state.patchScenario);
  return (
    <div className="pop-panel">
      <p className="hint">默认关掉景点、商户和多余地名。需要路名时再打开标注。</p>
      <div className="base-grid">
        {BASEMAPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={scenario.basemap === item.id ? "base on" : "base"}
            onClick={() => patch({ basemap: item.id })}
          >
            <b>{item.label}</b>
            <small>{item.detail}</small>
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={scenario.showLabels} onChange={() => patch({ showLabels: !scenario.showLabels })} />
        地名标注
      </label>
      <label className="check">
        <input type="checkbox" checked={scenario.showGrid} onChange={() => patch({ showGrid: !scenario.showGrid })} />
        坐标网格
      </label>
      <label className="check">
        <input type="checkbox" checked={scenario.showRelief} onChange={() => patch({ showRelief: !scenario.showRelief })} />
        地形晕渲
      </label>
      <label className="check">
        <input type="checkbox" checked={scenario.showLinks} onChange={() => patch({ showLinks: !scenario.showLinks })} />
        隶属连线
      </label>
      <p className="hint">打开后，按部队的上级把集团军和周围单位连起来。</p>
      <ModeSwitch />
      <TimeBook />
      <AppearanceFields />
    </div>
  );
}

function ModeSwitch() {
  const mode = useSandbox((state) => activeScenario(state).mode);
  const setMode = useSandbox((state) => state.setMode);
  return (
    <div className="stack">
      <span>模式</span>
      <div className="seg">
        <button type="button" className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>
          编辑
        </button>
        <button type="button" className={mode === "view" ? "on" : ""} onClick={() => setMode("view")}>
          阅览
        </button>
      </div>
      <p className="hint">阅览时不能改图。点一个标绘，右边只留图片、简介和兵力；没放图片就不显示图片。</p>
    </div>
  );
}

function TimeBook() {
  const scenario = useSandbox(activeScenario);
  const addMoment = useSandbox((state) => state.addMoment);
  const renameMoment = useSandbox((state) => state.renameMoment);
  const deleteMoment = useSandbox((state) => state.deleteMoment);
  const switchMoment = useSandbox((state) => state.switchMoment);
  const toggleCompare = useSandbox((state) => state.toggleCompare);
  const comparing = scenario.compareIds.length >= 2;
  return (
    <div className="stack">
      <span>时间</span>
      <p className="hint">勾选两个以上，这些时间会叠在一张图上。部队换了位置就画出移动；人数或装备变了，在原地标出差额。</p>
      <ul className="time-list">
        {scenario.moments.map((moment) => (
          <li key={moment.id}>
            <input
              type="checkbox"
              aria-label={`比较${moment.name || "时间"}`}
              checked={scenario.compareIds.includes(moment.id)}
              onChange={() => toggleCompare(moment.id)}
            />
            <button
              type="button"
              className={moment.id === scenario.activeMomentId ? "text-btn on" : "text-btn"}
              onClick={() => switchMoment(moment.id)}
            >
              打开
            </button>
            <input
              className="field"
              aria-label="时间名称"
              defaultValue={moment.name}
              key={`${moment.id}:${moment.name}`}
              onBlur={(event) => {
                const name = event.target.value.slice(0, 24);
                if (name !== moment.name) renameMoment(moment.id, name);
              }}
            />
            <button type="button" className="nudge danger" disabled={scenario.moments.length <= 1} onClick={() => deleteMoment(moment.id)}>
              删
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="text-btn wide" onClick={() => addMoment(`时间 ${scenario.moments.length + 1}`)}>
        记下当前为新时间
      </button>
      {comparing ? <p className="warn">正在把勾选的时间叠在一起看。</p> : null}
    </div>
  );
}

function AppearanceFields() {
  const appearance = useSandbox((state) => state.appearance);
  const setAppearance = useSandbox((state) => state.setAppearance);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="stack">
      <span>界面</span>
      <label className="check">
        底色
        <input
          className="color-input"
          type="color"
          aria-label="界面底色"
          value={appearance.color}
          onChange={(event) => setAppearance({ color: event.target.value })}
        />
      </label>
      <div className="row-actions">
        <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
          背景图
        </button>
        {appearance.image ? (
          <button type="button" className="text-btn" onClick={() => setAppearance({ image: "" })}>
            去掉
          </button>
        ) : null}
        <button type="button" className="text-btn" onClick={() => setAppearance({ color: "#0c0e0d", image: "" })}>
          默认
        </button>
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
            .then((image) => {
              setAppearance({ image });
              setError("");
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "无法使用这张图"));
        }}
      />
      {error ? <p className="warn">{error}</p> : null}
    </div>
  );
}

export function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("无法处理图片"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL("image/jpeg", 0.7);
      if (data.length > 480_000) reject(new Error("图片太大，请换一张小一些的"));
      else resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

function FileMenu() {
  const scenarios = useSandbox((state) => state.scenarios);
  const activeId = useSandbox((state) => state.activeId);
  const scenario = useSandbox(activeScenario);
  const create = useSandbox((state) => state.newScenario);
  const duplicate = useSandbox((state) => state.duplicateScenario);
  const remove = useSandbox((state) => state.deleteScenario);
  const switchTo = useSandbox((state) => state.switchScenario);
  const ingest = useSandbox((state) => state.importScenario);
  const setHome = useSandbox((state) => state.setHome);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="pop-panel file-panel">
      <div className="row-actions">
        <button type="button" className="text-btn" onClick={create}>
          新建
        </button>
        <button type="button" className="text-btn" onClick={duplicate}>
          复制
        </button>
        <button type="button" className="text-btn" onClick={() => downloadScenario(scenario)}>
          导出
        </button>
        <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
          导入
        </button>
      </div>
      <input
        ref={fileRef}
        className="sr"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => {
            try {
              ingest(parseScenarioFile(text));
              setError("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "无法读取文件");
            }
          });
        }}
      />
      <button type="button" className="text-btn wide" onClick={setHome}>
        把当前视图记为起点
      </button>
      {error ? <p className="warn">{error}</p> : null}
      <ul className="sc-list">
        {scenarios.map((item) => (
          <li key={item.id}>
            <button type="button" className={item.id === activeId ? "row on" : "row"} onClick={() => switchTo(item.id)}>
              <span>
                <b>{item.name || "未命名"}</b>
                <small>{item.features.length} 个标绘</small>
              </span>
            </button>
            {confirmId === item.id ? (
              <button type="button" className="text-btn danger" onClick={() => remove(item.id)}>
                确认删除
              </button>
            ) : (
              <button type="button" className="icon-btn" aria-label="删除沙盘" onClick={() => setConfirmId(item.id)}>
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="hint">改动自动留在这台设备。导出 JSON 可以拿走或备份。</p>
    </div>
  );
}

export function ToolRail() {
  const tool = useSandbox((state) => state.tool);
  const setTool = useSandbox((state) => state.setTool);
  const board = useSandbox((state) => state.board);
  const setBoard = useSandbox((state) => state.setBoard);
  const setMenu = useSandbox((state) => state.setMenu);
  return (
    <nav className="toolrail" aria-label="标绘工具">
      {TOOLS.map((item) => {
        const Icon = ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            className={tool === item.id && !board ? "tool on" : "tool"}
            aria-label={item.label}
            aria-pressed={tool === item.id}
            title={`${item.label}（${item.key}）`}
            onClick={() => {
              setBoard(false);
              setTool(item.id);
            }}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={board ? "tool on" : "tool"}
        aria-pressed={board}
        title="总览"
        onClick={() => {
          setMenu(null);
          setBoard(!board);
        }}
      >
        <LayoutList size={18} />
        <span>总览</span>
      </button>
    </nav>
  );
}

export function BrushBar() {
  const scenario = useSandbox(activeScenario);
  const tool = useSandbox((state) => state.tool);
  const faction = useSandbox((state) => state.faction);
  const setFaction = useSandbox((state) => state.setFaction);
  const unitType = useSandbox((state) => state.unitType);
  const setUnitType = useSandbox((state) => state.setUnitType);
  const levelId = useSandbox((state) => state.levelId);
  const setLevel = useSandbox((state) => state.setLevel);
  const service = useSandbox((state) => state.service);
  const setService = useSandbox((state) => state.setService);
  const fortType = useSandbox((state) => state.fortType);
  const setFortType = useSandbox((state) => state.setFortType);
  const smooth = useSandbox((state) => state.smoothDraw);
  const setSmooth = useSandbox((state) => state.setSmoothDraw);
  const closed = useSandbox((state) => state.closedDraw);
  const setClosed = useSandbox((state) => state.setClosedDraw);
  const hint = TOOLS.find((item) => item.id === tool)?.hint;
  const level = scenario.levels.some((item) => item.id === levelId) ? levelId : scenario.levels[0]?.id ?? "";
  if (tool === "select") return null;
  return (
    <div className="brush">
      <div className="seg">
        {scenario.factions.map((item) => (
          <button key={item.id} type="button" className={faction === item.id ? "on" : ""} onClick={() => setFaction(item.id)}>
            <i className="swatch" style={{ background: factionColor(scenario.factions, item.id) }} />
            {item.name}
          </button>
        ))}
      </div>
      {tool === "unit" ? (
        <>
          <select className="field slim" aria-label="军种" value={service} onChange={(event) => setService(event.target.value as typeof service)}>
            {SERVICES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {service === "land" ? (
            <select className="field slim" aria-label="兵种" value={unitType} onChange={(event) => setUnitType(event.target.value as typeof unitType)}>
              {UNIT_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}
          <select className="field slim" aria-label="层级" value={level} onChange={(event) => setLevel(event.target.value)}>
            {scenario.levels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {tool === "fort" ? (
        <select className="field slim" aria-label="工事" value={fortType} onChange={(event) => setFortType(event.target.value as typeof fortType)}>
          {FORT_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      {tool === "freehand" || tool === "curve" ? (
        <button type="button" className={closed ? "text-btn on" : "text-btn"} onClick={() => setClosed(!closed)}>
          闭合
        </button>
      ) : null}
      {tool === "freehand" || tool === "arrow" ? (
        <button type="button" className={smooth ? "text-btn on" : "text-btn"} onClick={() => setSmooth(!smooth)}>
          {tool === "arrow" ? "弯曲" : "平滑"}
        </button>
      ) : null}
      <p>{hint}</p>
    </div>
  );
}

export function MapChrome() {
  const coach = useSandbox((state) => state.coach);
  const dismiss = useSandbox((state) => state.dismissCoach);
  const comparing = useSandbox((state) => activeScenario(state).compareIds.length >= 2);
  return (
    <>
      <BrushBar />
      {comparing ? <p className="compare-note">正在比较多个时间。计划箭头和界线也会按时间深浅叠在一起。</p> : null}
      {coach ? (
        <div className="coach">
          <p>底图是干净的。点符号可以改，或用左侧工具放下部队、要塞、曲线和区域。</p>
          <button type="button" className="icon-btn" aria-label="关闭提示" onClick={dismiss}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="zoom">
        <button type="button" className="icon-btn" aria-label="放大" onClick={() => mapApi()?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="缩小" onClick={() => mapApi()?.zoomOut()}>
          <Minus size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="回到起点" onClick={() => mapApi()?.goHome()}>
          <LocateFixed size={18} />
        </button>
      </div>
    </>
  );
}

export function StatusBar() {
  const hud = useSyncExternalStore(subscribeHud, getHud, getHudServer);
  const tool = useSandbox((state) => state.tool);
  const hint = TOOLS.find((item) => item.id === tool)?.hint ?? "";
  const text = hud.lat === null || hud.lng === null ? "移动指针读取坐标" : formatPair(hud.lng, hud.lat);
  return (
    <footer className="statusbar">
      <button
        type="button"
        className="coord"
        onClick={() => {
          if (hud.lat === null || hud.lng === null) return;
          void navigator.clipboard?.writeText(`${hud.lat.toFixed(5)}, ${hud.lng.toFixed(5)}`).catch(() => undefined);
        }}
      >
        {text}
      </button>
      <span className="zoom-read">Z {hud.zoom.toFixed(hud.zoom % 1 ? 1 : 0)}</span>
      <span className="status-hint">{hud.measure ?? hint}</span>
      <span className="save">自动保存</span>
    </footer>
  );
}
