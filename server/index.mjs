import express from "express";
import { AccessToken } from "livekit-server-sdk";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(root, process.env.NEARBOUND_DATA_DIR || ".nearbound-data");
const roomDir = path.join(dataDir, "rooms");
const PRESENCE_TTL_MS = 15000;
const DISCONNECT_GRACE_MS = 1200;
const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 650;
const MAX_CHAT_MESSAGES = 100;
const MAX_WALLS = 24000;
const MAX_FLOOR_AREAS = 6000;
const MAX_OBJECTS = 6000;
const MAX_ZONES = 2000;
const MAX_MAP_BYTES = 900_000;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const rooms = new Map();

function livekitReady() {
  return Boolean(
    process.env.LIVEKIT_WS_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: process.env.PUBLIC_APP_NAME || "Nearbound Open Space",
    defaultRoom: process.env.DEFAULT_ROOM || "nearbound-open-space",
    livekitConfigured: livekitReady()
  });
});

app.post("/api/livekit-token", async (req, res) => {
  if (!livekitReady()) {
    res.status(503).json({
      error: "LIVEKIT_NOT_CONFIGURED",
      message:
        "LIVEKIT_WS_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be defined on the server."
    });
    return;
  }

  const room =
    typeof req.body?.room === "string" && req.body.room.trim()
      ? req.body.room.trim().slice(0, 96)
      : process.env.DEFAULT_ROOM || "nearbound-open-space";
  const identity =
    typeof req.body?.identity === "string" && req.body.identity.trim()
      ? req.body.identity.trim().slice(0, 96)
      : `guest-${crypto.randomUUID()}`;
  const name =
    typeof req.body?.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 64)
      : identity;
  const color =
    typeof req.body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
      ? req.body.color
      : "#2fbf71";
  const avatar =
    req.body?.avatar && typeof req.body.avatar === "object" && !Array.isArray(req.body.avatar)
      ? req.body.avatar
      : undefined;

  try {
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name,
        metadata: JSON.stringify({ color, avatar })
      }
    );

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: true
    });

    res.json({
      token: await token.toJwt(),
      url: process.env.LIVEKIT_WS_URL,
      room
    });
  } catch (error) {
    console.error("LiveKit token error", error);
    res.status(500).json({ error: "TOKEN_ERROR" });
  }
});

app.get("/api/sync/:room/events", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const identity = sanitizeIdentity(req.query.identity);
  const state = await getRoomState(roomName);
  touchRoom(state);
  clearDisconnectTimer(state, identity);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 1200\n\n");

  const client = { identity, res };
  state.clients.add(client);
  sendSse(client, snapshotPacket(state, identity));

  req.on("close", () => {
    state.clients.delete(client);
    schedulePresenceDisconnect(state, identity);
  });
});

app.post("/api/sync/:room/presence", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const presence = sanitizePresence(req.body?.presence);
  if (!presence) {
    res.status(400).json({ error: "INVALID_PRESENCE" });
    return;
  }

  touchRoom(state);
  const claim = state.claimsByIdentity.get(presence.identity);
  const nextPresence = {
    ...presence,
    claimedOfficeId: claim?.zoneId,
    claimedOfficeName: claim?.zoneName,
    lastSeen: Date.now()
  };
  clearDisconnectTimer(state, nextPresence.identity);
  state.presences.set(nextPresence.identity, nextPresence);
  broadcast(state, { type: "presence", presence: nextPresence }, nextPresence.identity);
  res.json({ ok: true, serverTime: nextPresence.lastSeen });
});

app.post("/api/sync/:room/presence/leave", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const identity = sanitizeIdentity(req.body?.identity);
  if (!identity) {
    res.status(400).json({ error: "INVALID_IDENTITY" });
    return;
  }
  clearDisconnectTimer(state, identity);
  if (state.presences.delete(identity)) {
    broadcast(state, { type: "presence-left", identity }, identity);
  }
  touchRoom(state);
  res.json({ ok: true });
});

app.post("/api/sync/:room/map", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const map = sanitizeMap(req.body?.map);
  if (!map) {
    res.status(400).json({ error: "INVALID_MAP" });
    return;
  }

  const size = Buffer.byteLength(JSON.stringify(map), "utf8");
  if (size > MAX_MAP_BYTES) {
    res.status(413).json({ error: "MAP_TOO_LARGE", maxBytes: MAX_MAP_BYTES });
    return;
  }

  state.revision += 1;
  state.map = map;
  touchRoom(state);
  scheduleSave(state);
  broadcast(state, { type: "map", revision: state.revision, map }, sanitizeIdentity(req.body?.identity));
  res.json({ ok: true, revision: state.revision });
});

app.post("/api/sync/:room/claim", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const identity = sanitizeIdentity(req.body?.identity);
  const name = sanitizeText(req.body?.name, 64);
  const zoneId = sanitizeText(req.body?.zoneId, 128);
  const zoneName = sanitizeText(req.body?.zoneName, 96);
  if (!identity || !name || !zoneId || !zoneName) {
    res.status(400).json({ error: "INVALID_CLAIM" });
    return;
  }

  const zone = state.map.zones.find((item) => item.id === zoneId && item.type === "office");
  if (!zone) {
    res.status(404).json({ error: "OFFICE_NOT_FOUND" });
    return;
  }

  const existing = state.claimsByZone.get(zoneId);
  if (existing && existing.identity !== identity) {
    res.status(409).json({ error: "OFFICE_ALREADY_CLAIMED", claim: existing });
    return;
  }

  releaseClaimForIdentity(state, identity);
  const claim = { identity, name, zoneId, zoneName, claimedAt: Date.now() };
  state.claimsByZone.set(zoneId, claim);
  state.claimsByIdentity.set(identity, claim);
  applyClaimToPresence(state, identity);
  touchRoom(state);
  scheduleSave(state);
  broadcastClaimState(state, identity);
  res.json({ ok: true, claim });
});

app.post("/api/sync/:room/claim/release", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const identity = sanitizeIdentity(req.body?.identity);
  if (!identity) {
    res.status(400).json({ error: "INVALID_IDENTITY" });
    return;
  }
  releaseClaimForIdentity(state, identity);
  applyClaimToPresence(state, identity);
  touchRoom(state);
  scheduleSave(state);
  broadcastClaimState(state, identity);
  res.json({ ok: true });
});

app.post("/api/sync/:room/chat", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const identity = sanitizeIdentity(req.body?.identity);
  const name = sanitizeText(req.body?.name, 64);
  const color = sanitizeColor(req.body?.color);
  const text = sanitizeText(req.body?.text, 500);
  if (!identity || !name || !text) {
    res.status(400).json({ error: "INVALID_CHAT" });
    return;
  }

  const message = {
    id: crypto.randomUUID(),
    identity,
    name,
    color,
    text,
    sentAt: Date.now()
  };
  state.messages.push(message);
  if (state.messages.length > MAX_CHAT_MESSAGES) {
    state.messages.splice(0, state.messages.length - MAX_CHAT_MESSAGES);
  }
  touchRoom(state);
  broadcast(state, { type: "chat", message });
  res.json({ ok: true, message });
});

app.post("/api/sync/:room/settings", async (req, res) => {
  const roomName = sanitizeRoom(req.params.room);
  const state = await getRoomState(roomName);
  const identity = sanitizeIdentity(req.body?.identity);
  if (!identity) {
    res.status(400).json({ error: "INVALID_IDENTITY" });
    return;
  }
  const settings = sanitizeVoiceSettings(req.body?.settings);
  state.settingsByIdentity.set(identity, settings);
  touchRoom(state);
  scheduleSave(state);
  res.json({ ok: true, settings });
});

if (isProduction) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist, { maxAge: "1h" }));
  app.use((_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Nearbound Open Space listening on:`);
  console.log(`  Local:   http://localhost:${port}`);
  console.log(`  Local:   http://127.0.0.1:${port}`);
  console.log(`  Network: http://<your-local-ip>:${port}`);
});

setInterval(() => {
  const now = Date.now();
  for (const state of rooms.values()) {
    for (const [identity, presence] of state.presences) {
      if (now - presence.lastSeen > PRESENCE_TTL_MS) {
        state.presences.delete(identity);
        broadcast(state, { type: "presence-left", identity }, identity);
      }
    }
    if (state.clients.size === 0 && state.presences.size === 0 && now - state.lastTouched > ROOM_IDLE_TTL_MS) {
      for (const timer of state.disconnectTimers.values()) clearTimeout(timer);
      rooms.delete(state.room);
    }
  }
}, 5000).unref?.();

setInterval(() => {
  for (const state of rooms.values()) {
    broadcast(state, { type: "ping", serverTime: Date.now() });
  }
}, 12000).unref?.();

async function getRoomState(room) {
  const existing = rooms.get(room);
  if (existing) return existing;

  const persisted = await readPersistedRoom(room);
  const state = {
    room,
    revision: persisted?.revision || 1,
    map: persisted?.map || createDefaultMapSnapshot(),
    claimsByZone: new Map(),
    claimsByIdentity: new Map(),
    settingsByIdentity: new Map(),
    messages: Array.isArray(persisted?.messages) ? persisted.messages.slice(-MAX_CHAT_MESSAGES) : [],
    presences: new Map(),
    clients: new Set(),
    disconnectTimers: new Map(),
    saveTimer: undefined,
    lastTouched: Date.now()
  };

  for (const claim of Array.isArray(persisted?.claims) ? persisted.claims : []) {
    if (!claim?.identity || !claim?.zoneId || !claim?.zoneName) continue;
    state.claimsByZone.set(claim.zoneId, claim);
    state.claimsByIdentity.set(claim.identity, claim);
  }
  for (const [identity, settings] of Object.entries(persisted?.settings || {})) {
    const safeIdentity = sanitizeIdentity(identity);
    const safeSettings = sanitizeVoiceSettings(settings);
    if (safeIdentity) state.settingsByIdentity.set(safeIdentity, safeSettings);
  }

  rooms.set(room, state);
  return state;
}

function snapshotPacket(state, identity) {
  return {
    type: "snapshot",
    room: state.room,
    revision: state.revision,
    serverTime: Date.now(),
    map: state.map,
    presences: Array.from(state.presences.values()).filter((presence) => presence.identity !== identity),
    messages: state.messages.slice(-50),
    claims: Array.from(state.claimsByZone.values()),
    settings: state.settingsByIdentity.get(identity) || defaultVoiceSettings()
  };
}

function broadcastClaimState(state, identity) {
  const presence = state.presences.get(identity);
  if (presence) {
    broadcast(state, { type: "presence", presence }, identity);
  }
  broadcast(state, { type: "claims", claims: Array.from(state.claimsByZone.values()) });
}

function clearDisconnectTimer(state, identity) {
  if (!identity) return;
  const timer = state.disconnectTimers.get(identity);
  if (!timer) return;
  clearTimeout(timer);
  state.disconnectTimers.delete(identity);
}

function schedulePresenceDisconnect(state, identity) {
  if (!identity || hasConnectedClient(state, identity) || state.disconnectTimers.has(identity)) return;
  const timer = setTimeout(() => {
    state.disconnectTimers.delete(identity);
    if (hasConnectedClient(state, identity)) return;
    if (state.presences.delete(identity)) {
      touchRoom(state);
      broadcast(state, { type: "presence-left", identity }, identity);
    }
  }, DISCONNECT_GRACE_MS);
  timer.unref?.();
  state.disconnectTimers.set(identity, timer);
}

function hasConnectedClient(state, identity) {
  for (const client of state.clients) {
    if (client.identity === identity) return true;
  }
  return false;
}

function broadcast(state, packet, exceptIdentity) {
  for (const client of state.clients) {
    if (exceptIdentity && client.identity === exceptIdentity) continue;
    sendSse(client, packet);
  }
}

function sendSse(client, packet) {
  try {
    client.res.write(`data: ${JSON.stringify(packet)}\n\n`);
  } catch {
    // The close handler will remove broken clients.
  }
}

function touchRoom(state) {
  state.lastTouched = Date.now();
}

function scheduleSave(state) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = undefined;
    void saveRoomState(state);
  }, SAVE_DEBOUNCE_MS);
  state.saveTimer.unref?.();
}

async function readPersistedRoom(room) {
  const file = roomFile(room);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    console.warn(`Unable to read room state ${room}`, error);
    return undefined;
  }
}

async function saveRoomState(state) {
  try {
    await fs.mkdir(roomDir, { recursive: true });
    const payload = {
      version: 1,
      revision: state.revision,
      savedAt: Date.now(),
      map: state.map,
      claims: Array.from(state.claimsByZone.values()),
      settings: Object.fromEntries(state.settingsByIdentity),
      messages: state.messages.slice(-MAX_CHAT_MESSAGES)
    };
    await fs.writeFile(roomFile(state.room), `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.warn(`Unable to save room state ${state.room}`, error);
  }
}

function roomFile(room) {
  return path.join(roomDir, `${safeFilePart(room)}.json`);
}

function safeFilePart(value) {
  return String(value || "default")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "default";
}

function sanitizeRoom(value) {
  return sanitizeText(value, 96) || process.env.DEFAULT_ROOM || "nearbound-open-space";
}

function sanitizeIdentity(value) {
  return sanitizeText(value, 96);
}

function sanitizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#2fbf71";
}

function sanitizePresence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const identity = sanitizeIdentity(value.identity);
  const name = sanitizeText(value.name, 64) || identity;
  if (!identity || !name) return undefined;
  return {
    identity,
    name,
    color: sanitizeColor(value.color),
    avatar: sanitizeObject(value.avatar, 2500),
    status: ["available", "dnd", "inactive"].includes(value.status) ? value.status : "available",
    bio: sanitizeText(value.bio, 180),
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    direction: ["down", "up", "left", "right"].includes(value.direction) ? value.direction : "down",
    moving: Boolean(value.moving),
    zoneId: sanitizeText(value.zoneId, 128) || undefined,
    lastSeen: Date.now()
  };
}

function sanitizeObject(value, maxBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maxBytes) return undefined;
  return JSON.parse(text);
}

function sanitizeMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const width = clampInteger(value.width, 16, 4096, 1024);
  const height = clampInteger(value.height, 16, 4096, 640);
  return {
    width,
    height,
    spawn: sanitizePoint(value.spawn, width / 2, height / 2),
    floorAreas: sanitizeArray(value.floorAreas, MAX_FLOOR_AREAS).map(sanitizeFloorArea).filter(Boolean),
    walls: sanitizeArray(value.walls, MAX_WALLS).map(sanitizeWall).filter(Boolean),
    objects: sanitizeArray(value.objects, MAX_OBJECTS).map(sanitizeObjectPlacement).filter(Boolean),
    zones: sanitizeArray(value.zones, MAX_ZONES).map(sanitizeZone).filter(Boolean)
  };
}

function defaultVoiceSettings() {
  return { master: 1, users: {} };
}

function sanitizeVoiceSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultVoiceSettings();
  const users = {};
  for (const [identity, volume] of Object.entries(value.users || {}).slice(0, 256)) {
    const safeIdentity = sanitizeIdentity(identity);
    if (safeIdentity) users[safeIdentity] = clampVolume(volume);
  }
  return {
    master: clampVolume(value.master),
    users
  };
}

function clampVolume(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(2, value))
    : 1;
}

function sanitizeArray(value, maxLength) {
  return Array.isArray(value) ? value.slice(0, maxLength) : [];
}

function sanitizeFloorArea(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...sanitizeRect(value),
    asset: sanitizeAsset(value.asset, "floor_wood"),
    editorPlaced: Boolean(value.editorPlaced)
  };
}

function sanitizeWall(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    x: clampInteger(value.x, 0, 4095, 0),
    y: clampInteger(value.y, 0, 4095, 0),
    asset: sanitizeAsset(value.asset, "wall_brick")
  };
}

function sanitizeObjectPlacement(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    id: sanitizeText(value.id, 128) || crypto.randomUUID(),
    asset: sanitizeAsset(value.asset, "desk_simple"),
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    layer: value.layer === "floor" ? "floor" : "object",
    solid: value.solid ? sanitizeRect(value.solid) : undefined,
    interactive: value.interactive
      ? {
          label: sanitizeText(value.interactive.label, 64),
          hint: sanitizeText(value.interactive.hint, 120)
        }
      : undefined
  };
}

function sanitizeZone(value) {
  if (!value || typeof value !== "object") return undefined;
  const type = ["office", "living", "meeting", "hitbox"].includes(value.type) ? value.type : undefined;
  return {
    id: sanitizeText(value.id, 128) || crypto.randomUUID(),
    name: sanitizeText(value.name, 96) || "Zone",
    kind: ["open", "private", "social"].includes(value.kind) ? value.kind : "open",
    type,
    subType: value.subType === "broadcast" ? "broadcast" : undefined,
    parentId: sanitizeText(value.parentId, 128) || undefined,
    blocks: Boolean(value.blocks),
    ...sanitizeRect(value)
  };
}

function sanitizeRect(value) {
  return {
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    w: clampInteger(value.w, 1, 4096, 16),
    h: clampInteger(value.h, 1, 4096, 16)
  };
}

function sanitizePoint(value, fallbackX, fallbackY) {
  return {
    x: finiteNumber(value?.x, fallbackX),
    y: finiteNumber(value?.y, fallbackY)
  };
}

function sanitizeAsset(value, fallback) {
  return typeof value === "string" && /^[a-z0-9_/-]+$/i.test(value) ? value.slice(0, 96) : fallback;
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInteger(value, min, max, fallback) {
  const next = Math.round(finiteNumber(value, fallback));
  return Math.max(min, Math.min(max, next));
}

function releaseClaimForIdentity(state, identity) {
  const previous = state.claimsByIdentity.get(identity);
  if (!previous) return;
  state.claimsByIdentity.delete(identity);
  state.claimsByZone.delete(previous.zoneId);
}

function applyClaimToPresence(state, identity) {
  const presence = state.presences.get(identity);
  if (!presence) return;
  const claim = state.claimsByIdentity.get(identity);
  presence.claimedOfficeId = claim?.zoneId;
  presence.claimedOfficeName = claim?.zoneName;
  presence.lastSeen = Date.now();
}

function createDefaultMapSnapshot() {
  const tileWidth = 64;
  const tileHeight = 40;
  const walls = [];
  for (let x = 0; x < tileWidth; x += 1) {
    walls.push({ x, y: 0, asset: "wall_brick" });
    if (x < 29 || x > 34) walls.push({ x, y: tileHeight - 1, asset: "wall_brick" });
  }
  for (let y = 1; y < tileHeight - 1; y += 1) {
    walls.push({ x: 0, y, asset: "wall_brick" });
    walls.push({ x: tileWidth - 1, y, asset: "wall_brick" });
  }
  return {
    width: tileWidth * 16,
    height: tileHeight * 16,
    spawn: { x: 32 * 16, y: 34 * 16 },
    floorAreas: [],
    walls,
    objects: [],
    zones: []
  };
}
