import mqtt, { type MqttClient } from "mqtt";

const BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://mqtt-dashboard.com:8884/mqtt"];

export function normalizeRoomCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

export type Person = { id: string; name: string };

export type RoomLink = {
  selfId: string;
  send: (data: unknown) => void;
  setAllow: (allow: Record<string, boolean>) => void;
  close: () => void;
};

export function startRoomCode(
  code: string,
  handlers: {
    onUp: (selfId: string) => void;
    onPeers: (others: number) => void;
    onData: (data: unknown) => void;
    onDown: (reason: string) => void;
    onAnnounce: () => void;
    onRoster: (info: { selfId: string; ownerId: string; people: Person[]; allow: Record<string, boolean> }) => void;
  },
): RoomLink {
  const room = normalizeRoomCode(code);
  if (room.length < 4) throw new Error("房间码至少 4 位字母或数字");
  const self = Math.random().toString(36).slice(2, 10);
  const stateTopic = `zhentu/v1/${room}/state`;
  const beatTopic = `zhentu/v1/${room}/beat`;
  const permTopic = `zhentu/v1/${room}/perm`;
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  let allow: Record<string, boolean> = {};
  let ownerId = "";
  let client: MqttClient | null = null;
  let closed = false;
  let announced = false;
  let sawState = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let announceTimer: ReturnType<typeof setTimeout> | null = null;

  const others = () => {
    const now = Date.now();
    for (const [id, at] of seen) {
      if (id !== self && now - at > 10000) seen.delete(id);
    }
    let count = 0;
    for (const id of seen.keys()) if (id !== self) count += 1;
    return count;
  };

  const roster = () => {
    const people = [...seen.keys()].map((id) => ({ id, name: names.get(id) || id.slice(-4) }));
    handlers.onRoster({ selfId: self, ownerId, people, allow: { ...allow } });
    handlers.onPeers(others());
  };

  const publishPerm = () => {
    if (!client?.connected || !ownerId) return;
    client.publish(permTopic, JSON.stringify({ ownerId, allow }), { retain: true });
  };

  const beat = () => {
    if (!client?.connected) return;
    seen.set(self, Date.now());
    names.set(self, self.slice(-4));
    client.publish(beatTopic, JSON.stringify({ id: self, name: self.slice(-4), t: Date.now() }));
    roster();
  };

  const attach = (next: MqttClient) => {
    client = next;
    next.on("message", (topic, payload) => {
      if (closed) return;
      try {
        const data = JSON.parse(payload.toString()) as { id?: string; name?: string; ownerId?: string; allow?: Record<string, boolean> };
        if (topic === beatTopic && data.id) {
          seen.set(data.id, Date.now());
          if (data.name) names.set(data.id, data.name);
          roster();
          return;
        }
        if (topic === permTopic && data.ownerId) {
          ownerId = data.ownerId;
          allow = data.allow && typeof data.allow === "object" ? data.allow : {};
          roster();
          return;
        }
        if (topic === stateTopic) {
          sawState = true;
          handlers.onData(data);
        }
      } catch {
        // ignore malformed payloads from other clients
      }
    });
    next.on("connect", () => {
      if (closed) return;
      next.subscribe([stateTopic, beatTopic, permTopic]);
      beat();
    });
  };

  const connect = async () => {
    let last = "公共中继连不上";
    for (const url of BROKERS) {
      if (closed) return;
      try {
        const next = await mqtt.connectAsync(url, {
          clientId: `zt${self}`,
          protocolVersion: 4,
          reconnectPeriod: 2000,
          connectTimeout: 8000,
          clean: true,
        });
        if (closed) {
          next.end(true);
          return;
        }
        attach(next);
        await next.subscribeAsync([stateTopic, beatTopic, permTopic]);
        handlers.onUp(self);
        beat();
        announceTimer = setTimeout(() => {
          if (closed || sawState || announced) return;
          announced = true;
          if (!ownerId) {
            ownerId = self;
            publishPerm();
            roster();
          }
          handlers.onAnnounce();
        }, 1600);
        timer = setInterval(beat, 3000);
        return;
      } catch (error) {
        last = error instanceof Error ? error.message : last;
      }
    }
    if (!closed) handlers.onDown(last);
  };

  void connect();

  return {
    selfId: self,
    send(data) {
      if (!client?.connected) return;
      client.publish(stateTopic, JSON.stringify(data));
    },
    setAllow(next) {
      if (ownerId !== self) return;
      allow = { ...next };
      publishPerm();
      roster();
    },
    close() {
      closed = true;
      if (timer) clearInterval(timer);
      if (announceTimer) clearTimeout(announceTimer);
      try {
        client?.end(true);
      } catch {
        // already gone
      }
      client = null;
    },
  };
}