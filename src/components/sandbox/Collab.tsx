import { useSyncExternalStore } from "react";
import { useSandbox } from "@/map/store";
import { setCollabWrite } from "@/lib/multiplayer/gate";
import { P2PRoom } from "@/lib/multiplayer/p2p";
import { normalizeRoomCode, startRoomCode, type Person, type RoomLink } from "@/lib/multiplayer/room-code";
import type { Scenario } from "@/map/types";

const DRAFT_KEY = "zhentu-collab-draft";

type Status = "idle" | "connecting" | "live";
type Role = "host" | "guest";
type Via = "code" | "address" | null;

type Snap = {
  status: Status;
  role: Role | null;
  via: Via;
  room: string;
  address: string;
  peers: number;
  error: string;
  selfId: string;
  ownerId: string;
  canEdit: boolean;
  people: Person[];
  allow: Record<string, boolean>;
};

type Draft = { room: string; address: string };

function loadDraft(): Draft {
  if (typeof localStorage === "undefined") return { room: "", address: "" };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return { room: "", address: "" };
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      room: typeof parsed.room === "string" ? parsed.room : "",
      address: typeof parsed.address === "string" ? parsed.address : "",
    };
  } catch {
    return { room: "", address: "" };
  }
}

function saveDraft(draft: Draft) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The in-memory session still holds the same values.
  }
}

const draft = loadDraft();
let snap: Snap = {
  status: "idle",
  role: null,
  via: null,
  room: draft.room,
  address: draft.address,
  peers: 0,
  error: "",
  selfId: "",
  ownerId: "",
  canEdit: true,
  people: [],
  allow: {},
};

const listeners = new Set<() => void>();
let lanRoom: P2PRoom | null = null;
let codeLink: RoomLink | null = null;
let wired = false;
let applying = false;
let allowSend = false;
let lastSent = 0;
let pushed = false;

function emit(next: Snap) {
  snap = next;
  setCollabWrite(next.status !== "live" || next.canEdit);
  saveDraft({ room: next.room, address: next.address });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnap() {
  return snap;
}

function signalingOf(address: string) {
  const trimmed = address.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return trimmed.includes("/api/rtc") ? trimmed : `${trimmed}/api/rtc`;
}

function sendOut(data: unknown) {
  if (codeLink) codeLink.send(data);
  else lanRoom?.broadcast(data);
}

function wireStore() {
  if (wired) return;
  wired = true;
  useSandbox.subscribe((state) => {
    if (applying || !allowSend || snap.status === "idle") return;
    if (!codeLink && !lanRoom) return;
    const current = state.scenarios.find((item) => item.id === state.activeId);
    if (!current) return;
    const stamp = current.updatedAt || 0;
    if (stamp === lastSent) return;
    lastSent = stamp;
    sendOut({
      type: "scenario",
      scenario: current,
      updatedAt: stamp,
      activeId: state.activeId,
    });
  });
}

function pushNow() {
  if (!allowSend) return;
  const state = useSandbox.getState();
  const current = state.scenarios.find((item) => item.id === state.activeId);
  if (!current) return;
  pushed = true;
  lastSent = current.updatedAt || Date.now();
  sendOut({
    type: "scenario",
    scenario: current,
    updatedAt: lastSent,
    activeId: state.activeId,
  });
}

function keepView(local: Scenario, remote: Scenario): Scenario {
  const moments = remote.moments?.length ? remote.moments : local.moments;
  const activeMomentId = moments.some((moment) => moment.id === local.activeMomentId)
    ? local.activeMomentId
    : moments.some((moment) => moment.id === remote.activeMomentId)
      ? remote.activeMomentId
      : moments[0]?.id || local.activeMomentId;
  const moment = moments.find((item) => item.id === activeMomentId);
  return {
    ...remote,
    basemap: local.basemap,
    mode: local.mode,
    showLabels: local.showLabels,
    showGrid: local.showGrid,
    showRelief: local.showRelief,
    showLinks: local.showLinks,
    groups: local.groups,
    center: local.center,
    zoom: local.zoom,
    home: local.home,
    activeMomentId,
    compareIds: local.compareIds.filter((id) => moments.some((item) => item.id === id)),
    moments,
    features: moment ? moment.features : local.features,
  };
}

function applyPerm(ownerId: string, allow: Record<string, boolean>) {
  const canEdit = !ownerId || ownerId === snap.selfId || allow[snap.selfId] !== false;
  emit({ ...snap, ownerId: ownerId || snap.ownerId, allow, canEdit });
}

function applyRemote(data: unknown) {
  if (!data || typeof data !== "object" || !("type" in data)) return;
  const kind = (data as { type?: string }).type;
  if (kind === "perm") {
    const msg = data as { ownerId?: string; allow?: Record<string, boolean> };
    applyPerm(msg.ownerId || snap.ownerId, msg.allow || {});
    return;
  }
  if (kind !== "scenario") return;
  const remote = data as { scenario?: Scenario; updatedAt?: number };
  if (!remote.scenario?.id) return;
  const incoming = remote.updatedAt || remote.scenario.updatedAt || 0;
  applying = true;
  try {
    const state = useSandbox.getState();
    const local = state.scenarios.find((item) => item.id === remote.scenario!.id);
    const previous = local ?? state.scenarios.find((item) => item.id === state.activeId);
    const takeRoom = snap.via === "code" && !pushed;
    const firstGuestSync = snap.role === "guest" && !allowSend;
    if (!takeRoom && !firstGuestSync && local && incoming <= (local.updatedAt || 0)) return;
    const merged = previous ? keepView(previous, remote.scenario) : remote.scenario;
    const scenarios = local
      ? state.scenarios.map((item) => (item.id === remote.scenario!.id ? merged : item))
      : [...state.scenarios, merged];
    useSandbox.setState({
      scenarios,
      activeId: local ? state.activeId : remote.scenario.id,
    });
    lastSent = incoming;
    allowSend = true;
  } finally {
    applying = false;
  }
}

function resetLink() {
  lanRoom?.close();
  lanRoom = null;
  codeLink?.close();
  codeLink = null;
  allowSend = false;
  lastSent = 0;
  pushed = false;
}

function connectLan(role: Role, room: string, signaling: string) {
  wireStore();
  resetLink();
  allowSend = role === "host";
  const selfId = `p-${Math.random().toString(36).slice(2, 10)}`;
  const handle = new P2PRoom({
    room,
    selfId,
    name: selfId.slice(-4),
    signalingBase: signaling,
    onPeersChanged: (peers) => {
      const people = peers
        .filter((peer) => peer.connectionState === "connected")
        .map((peer) => ({ id: peer.id, name: peer.name || peer.id.slice(-4) }));
      emit({ ...snap, peers: people.length, people, error: "" });
      if (people.length > 0 && role === "host") pushNow();
    },
    onMessage: (_from, data) => applyRemote(data),
    onConnected: () => {
      emit({ ...snap, status: "live", selfId, ownerId: role === "host" ? selfId : snap.ownerId, canEdit: role === "host" || snap.canEdit, error: "" });
      if (role === "host") sendOut({ type: "perm", ownerId: selfId, allow: snap.allow });
      pushNow();
    },
  });
  lanRoom = handle;
  emit({
    ...snap,
    status: "connecting",
    role,
    via: "address",
    room,
    peers: 0,
    error: "",
    selfId,
    ownerId: role === "host" ? selfId : "",
    canEdit: true,
    people: [],
    allow: {},
  });
  void handle.join();
}

export function collabDraft(partial: Partial<Pick<Snap, "room" | "address">>) {
  if (snap.status !== "idle") return;
  emit({
    ...snap,
    room: partial.room !== undefined ? partial.room.toUpperCase() : snap.room,
    address: partial.address !== undefined ? partial.address : snap.address,
    error: "",
  });
}

/** Same room code on both sides. First peer hosts on the public broker; the next joins it. */
export function collabByCode() {
  const room = normalizeRoomCode(snap.room);
  if (room.length < 4) {
    emit({ ...snap, room, error: "房间码至少 4 位字母或数字" });
    return;
  }
  wireStore();
  resetLink();
  emit({ ...snap, status: "connecting", role: null, via: "code", room, peers: 0, error: "" });
  try {
    codeLink = startRoomCode(room, {
      onUp: (selfId) => {
        allowSend = true;
        emit({ ...snap, status: "live", role: "guest", via: "code", selfId, error: "" });
      },
      onAnnounce: () => pushNow(),
      onPeers: (peers) => emit({ ...snap, peers }),
      onRoster: (info) => {
        const canEdit = !info.ownerId || info.ownerId === info.selfId || info.allow[info.selfId] !== false;
        emit({
          ...snap,
          selfId: info.selfId,
          ownerId: info.ownerId,
          people: info.people,
          allow: info.allow,
          canEdit,
          peers: info.people.filter((person) => person.id !== info.selfId).length,
        });
      },
      onData: (data) => applyRemote(data),
      onDown: (reason) => {
        resetLink();
        emit({ ...snap, status: "idle", role: null, via: null, peers: 0, error: reason, selfId: "", ownerId: "", canEdit: true, people: [], allow: {} });
      },
    });
  } catch (error) {
    emit({
      ...snap,
      status: "idle",
      role: null,
      via: null,
      error: error instanceof Error ? error.message : "连不上信令",
    });
  }
}

export function collabOpen() {
  const room = snap.room.trim() || Math.random().toString(36).slice(2, 8).toUpperCase();
  connectLan("host", room, `${window.location.origin}/api/rtc`);
}

export function collabJoin() {
  const room = snap.room.trim();
  const signaling = signalingOf(snap.address);
  if (!room || !signaling) {
    emit({ ...snap, error: "直接加入需要房间码和对方地址" });
    return;
  }
  connectLan("guest", room, signaling);
}

export function collabGrant(id: string, on: boolean) {
  if (!snap.ownerId || snap.ownerId !== snap.selfId) return;
  const allow = { ...snap.allow, [id]: on };
  if (codeLink) codeLink.setAllow(allow);
  else sendOut({ type: "perm", ownerId: snap.selfId, allow });
  emit({ ...snap, allow, canEdit: true });
}

export function collabStop() {
  resetLink();
  emit({ ...snap, status: "idle", role: null, via: null, peers: 0, error: "", selfId: "", ownerId: "", canEdit: true, people: [], allow: {} });
}

export function useCollabSession() {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}

export function CollabMenu() {
  const session = useCollabSession();
  const live = session.status !== "idle";

  return (
    <div className="pop-panel file-panel collab-panel">
      <div className="stack">
        {live ? (
          <>
            <p>
              房间 <strong>{session.room}</strong>
            </p>
            <p>
              {session.via === "code"
                ? session.peers > 0
                  ? `已在房间 · ${session.peers} 人`
                  : "已在房间"
                : `${session.status === "live" ? "已连上" : "正在连接"}${session.role === "host" ? " · 本机开房" : " · 已加入"} · ${session.peers} 人`}
            </p>
            {session.people.length ? (
              <ul className="feat-list">
                {session.people
                  .filter((person) => person.id !== session.selfId)
                  .map((person) => (
                    <li key={person.id}>
                      <label className="check">
                        {person.name}
                        {session.ownerId === session.selfId ? (
                          <>
                            可改
                            <input
                              type="checkbox"
                              aria-label="可改"
                              checked={session.allow[person.id] !== false}
                              onChange={(event) => collabGrant(person.id, event.target.checked)}
                            />
                          </>
                        ) : (
                          <span>{session.allow[person.id] === false ? "只看" : "可改"}</span>
                        )}
                      </label>
                    </li>
                  ))}
              </ul>
            ) : null}
            {session.status === "live" && !session.canEdit ? <p className="warn">现在只能看，不能改图。</p> : null}
            <button type="button" className="text-btn wide" onClick={collabStop}>
              停止协作
            </button>
          </>
        ) : (
          <>
            <span>房间码</span>
            <input
              className="field"
              value={session.room}
              placeholder="两边填同一个，至少 4 位"
              onChange={(event) => collabDraft({ room: event.target.value })}
            />
            <button type="button" className="text-btn wide" onClick={collabByCode}>
              用房间码连接
            </button>
            <p className="hint">房间码两边填成一样。</p>
            <span>同一网络时才填对方地址</span>
            <input
              className="field"
              value={session.address}
              placeholder="http://192.168.x.x:39241"
              onChange={(event) => collabDraft({ address: event.target.value })}
            />
            <div className="row-actions">
              <button type="button" className="text-btn" onClick={collabOpen}>
                本机开房
              </button>
              <button type="button" className="text-btn" onClick={collabJoin}>
                连这个地址
              </button>
            </div>
            {session.error ? <p className="warn">{session.error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
