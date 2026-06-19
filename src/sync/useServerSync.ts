import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { createOfficeMap, hydrateMap, serializeMap, type OfficeMap, type SyncedOfficeMap, type Zone } from "../game/map";
import type { ChatMessage, OfficeClaim, PlayerPresence, Session, VoiceVolumeSettings } from "../types";

type SyncStatus = "idle" | "connecting" | "connected" | "error";

type ServerPacket =
  | {
      type: "snapshot";
      revision: number;
      serverTime: number;
      map: SyncedOfficeMap;
      presences: PlayerPresence[];
      messages: ChatMessage[];
      claims?: OfficeClaim[];
      settings?: VoiceVolumeSettings;
    }
  | { type: "map"; revision: number; map: SyncedOfficeMap }
  | { type: "presence"; presence: PlayerPresence }
  | { type: "presence-left"; identity: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "claims"; claims: OfficeClaim[] }
  | { type: "ping"; serverTime: number };

export interface ServerSyncBridge {
  status: SyncStatus;
  error?: string;
  map: OfficeMap;
  mapRevision: number;
  remotePresences: Record<string, PlayerPresence>;
  chatMessages: ChatMessage[];
  officeClaims: OfficeClaim[];
  voiceVolumes: VoiceVolumeSettings;
  updateVoiceVolumes: (settings: SetStateAction<VoiceVolumeSettings>) => void;
  updateMap: (updater: (current: OfficeMap) => OfficeMap) => void;
  claimOffice: (zone: Zone, local: PlayerPresence) => Promise<OfficeClaim | undefined>;
  releaseOffice: (local: PlayerPresence) => Promise<void>;
  sendChat: (local: PlayerPresence, text: string) => Promise<void>;
  leave: (identity: string) => void;
}

const PRESENCE_POST_MIN_MS = 90;
const PRESENCE_HEARTBEAT_MS = 2500;

export function useServerSync(session: Session | null, local: PlayerPresence | null): ServerSyncBridge {
  const [status, setStatus] = useState<SyncStatus>(session ? "connecting" : "idle");
  const [error, setError] = useState<string | undefined>();
  const [map, setMap] = useState<OfficeMap>(() => createOfficeMap());
  const [mapRevision, setMapRevision] = useState(0);
  const [remotePresences, setRemotePresences] = useState<Record<string, PlayerPresence>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [officeClaims, setOfficeClaims] = useState<OfficeClaim[]>([]);
  const [voiceVolumes, setVoiceVolumes] = useState<VoiceVolumeSettings>(() => defaultVoiceVolumes());
  const mapRef = useRef(map);
  const revisionRef = useRef(mapRevision);
  const sessionRef = useRef(session);
  const localRef = useRef(local);
  const lastPresencePostRef = useRef(0);
  const lastPresenceDigestRef = useRef("");
  const presenceTimerRef = useRef<number | undefined>();
  const queuedMapRef = useRef<SyncedOfficeMap | null>(null);
  const mapPostInFlightRef = useRef(false);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    revisionRef.current = mapRevision;
  }, [mapRevision]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    if (!session) {
      setStatus("idle");
      setRemotePresences({});
      setChatMessages([]);
      setOfficeClaims([]);
      setVoiceVolumes(defaultVoiceVolumes());
      return;
    }

    setStatus("connecting");
    setError(undefined);
    const url = `/api/sync/${encodeURIComponent(session.room)}/events?identity=${encodeURIComponent(session.identity)}`;
    const source = new EventSource(url);

    source.onopen = () => {
      setStatus("connected");
      setError(undefined);
    };

    source.onerror = () => {
      setStatus((current) => (current === "connected" ? current : "error"));
      setError("Server sync is reconnecting.");
    };

    source.onmessage = (event) => {
      try {
        applyPacket(JSON.parse(event.data) as ServerPacket, session.identity);
      } catch {
        setError("Unable to read a server sync packet.");
      }
    };

    return () => {
      source.close();
      setRemotePresences({});
    };
  }, [session?.identity, session?.room]);

  useEffect(() => {
    if (!session || !local) return;
    schedulePresencePost(session, local);
  }, [
    session,
    local?.identity,
    local?.name,
    local?.color,
    local?.avatar,
    local?.status,
    local?.bio,
    local?.x,
    local?.y,
    local?.direction,
    local?.moving,
    local?.zoneId,
    local?.claimedOfficeId,
    local?.claimedOfficeName
  ]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const currentLocal = localRef.current;
      if (currentLocal) void postPresence(session, currentLocal);
    }, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [session?.identity, session?.room]);

  const updateMap = useCallback((updater: (current: OfficeMap) => OfficeMap) => {
    const currentSession = sessionRef.current;
    setMap((current) => {
      const next = updater(current);
      mapRef.current = next;
      if (currentSession) {
        queuedMapRef.current = serializeMap(next);
        void flushMapPost(currentSession.room, currentSession.identity);
      }
      return next;
    });
  }, []);

  const claimOffice = useCallback(async (zone: Zone, localPresence: PlayerPresence) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return undefined;
    const body = await postJson(`/api/sync/${encodeURIComponent(currentSession.room)}/claim`, {
      identity: localPresence.identity,
      name: localPresence.name,
      zoneId: zone.id,
      zoneName: zone.name
    });
    return body?.claim as OfficeClaim | undefined;
  }, []);

  const releaseOffice = useCallback(async (localPresence: PlayerPresence) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    await postJson(`/api/sync/${encodeURIComponent(currentSession.room)}/claim/release`, {
      identity: localPresence.identity
    });
  }, []);

  const sendChat = useCallback(async (localPresence: PlayerPresence, text: string) => {
    const currentSession = sessionRef.current;
    const body = text.trim();
    if (!currentSession || !body) return;
    await postJson(`/api/sync/${encodeURIComponent(currentSession.room)}/chat`, {
      identity: localPresence.identity,
      name: localPresence.name,
      color: localPresence.color,
      text: body
    });
  }, []);

  const updateVoiceVolumes = useCallback((settings: SetStateAction<VoiceVolumeSettings>) => {
    const currentSession = sessionRef.current;
    setVoiceVolumes((current) => {
      const next = normalizeVoiceVolumes(typeof settings === "function" ? settings(current) : settings);
      if (currentSession) {
        void postJson(`/api/sync/${encodeURIComponent(currentSession.room)}/settings`, {
          identity: currentSession.identity,
          settings: next
        }).catch((postError) => {
          setError(postError instanceof Error ? postError.message : "Unable to sync voice settings.");
        });
      }
      return next;
    });
  }, []);

  const leave = useCallback((identity: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession || !identity) return;
    const payload = JSON.stringify({ identity });
    const url = `/api/sync/${encodeURIComponent(currentSession.room)}/presence/leave`;
    if (!navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }))) {
      void postJson(url, { identity }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const notifyLeave = () => {
      leave(localRef.current?.identity || session.identity);
    };
    window.addEventListener("pagehide", notifyLeave);
    window.addEventListener("beforeunload", notifyLeave);
    return () => {
      window.removeEventListener("pagehide", notifyLeave);
      window.removeEventListener("beforeunload", notifyLeave);
    };
  }, [leave, session?.identity, session?.room]);

  function applyPacket(packet: ServerPacket, localIdentity: string) {
    if (packet.type === "snapshot") {
      if (packet.revision >= revisionRef.current) {
        const nextMap = hydrateMap(packet.map);
        mapRef.current = nextMap;
        revisionRef.current = packet.revision;
        setMap(nextMap);
        setMapRevision(packet.revision);
      }
      setRemotePresences(
        Object.fromEntries(packet.presences.filter((presence) => presence.identity !== localIdentity).map((presence) => [presence.identity, presence]))
      );
      setChatMessages(packet.messages || []);
      setOfficeClaims(packet.claims || []);
      setVoiceVolumes(normalizeVoiceVolumes(packet.settings));
      return;
    }

    if (packet.type === "map") {
      if (packet.revision < revisionRef.current) return;
      const nextMap = hydrateMap(packet.map);
      mapRef.current = nextMap;
      revisionRef.current = packet.revision;
      setMap(nextMap);
      setMapRevision(packet.revision);
      return;
    }

    if (packet.type === "presence") {
      if (packet.presence.identity === localIdentity) return;
      setRemotePresences((current) => ({
        ...current,
        [packet.presence.identity]: packet.presence
      }));
      return;
    }

    if (packet.type === "presence-left") {
      setRemotePresences((current) => {
        const next = { ...current };
        delete next[packet.identity];
        return next;
      });
      return;
    }

    if (packet.type === "chat") {
      setChatMessages((current) =>
        current.some((message) => message.id === packet.message.id)
          ? current
          : [...current.slice(-99), { ...packet.message, local: packet.message.identity === localIdentity }]
      );
      return;
    }

    if (packet.type === "claims") {
      setOfficeClaims(packet.claims);
      setRemotePresences((current) => applyClaims(current, packet.claims, localIdentity));
    }
  }

  function schedulePresencePost(currentSession: Session, currentLocal: PlayerPresence) {
    const digest = presenceDigest(currentLocal);
    if (digest === lastPresenceDigestRef.current) return;
    lastPresenceDigestRef.current = digest;

    const elapsed = Date.now() - lastPresencePostRef.current;
    if (elapsed >= PRESENCE_POST_MIN_MS) {
      void postPresence(currentSession, currentLocal);
      return;
    }

    if (presenceTimerRef.current) window.clearTimeout(presenceTimerRef.current);
    presenceTimerRef.current = window.setTimeout(() => {
      void postPresence(currentSession, localRef.current);
    }, PRESENCE_POST_MIN_MS - elapsed);
  }

  async function postPresence(currentSession: Session, currentLocal: PlayerPresence | null) {
    if (!currentLocal) return;
    lastPresencePostRef.current = Date.now();
    await postJson(`/api/sync/${encodeURIComponent(currentSession.room)}/presence`, {
      presence: presencePayload(currentLocal)
    }).catch((postError) => {
      setError(postError instanceof Error ? postError.message : "Unable to sync presence.");
    });
  }

  async function flushMapPost(room: string, identity: string) {
    if (mapPostInFlightRef.current || !queuedMapRef.current) return;

    const mapPayload = queuedMapRef.current;
    queuedMapRef.current = null;
    mapPostInFlightRef.current = true;

    try {
      const body = await postJson(`/api/sync/${encodeURIComponent(room)}/map`, {
        identity,
        baseRevision: revisionRef.current,
        map: mapPayload
      });
      if (typeof body?.revision === "number") {
        revisionRef.current = body.revision;
        setMapRevision(body.revision);
      }
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Unable to sync the map.");
    } finally {
      mapPostInFlightRef.current = false;
      const currentSession = sessionRef.current;
      if (queuedMapRef.current && currentSession) {
        void flushMapPost(currentSession.room, currentSession.identity);
      }
    }
  }

  return {
    status,
    error,
    map,
    mapRevision,
    remotePresences,
    chatMessages,
    officeClaims,
    voiceVolumes,
    updateVoiceVolumes,
    updateMap,
    claimOffice,
    releaseOffice,
    sendChat,
    leave
  };
}

function defaultVoiceVolumes(): VoiceVolumeSettings {
  return { master: 1, users: {} };
}

function normalizeVoiceVolumes(value: unknown): VoiceVolumeSettings {
  if (!value || typeof value !== "object") return defaultVoiceVolumes();
  const candidate = value as Partial<VoiceVolumeSettings>;
  return {
    master: clampVolume(candidate.master),
    users: Object.fromEntries(
      Object.entries(candidate.users || {}).map(([identity, volume]) => [identity, clampVolume(volume)])
    )
  };
}

function clampVolume(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(2, value))
    : 1;
}

function presencePayload(local: PlayerPresence) {
  return {
    identity: local.identity,
    name: local.name,
    color: local.color,
    avatar: local.avatar,
    status: local.status,
    bio: local.bio,
    x: Math.round(local.x),
    y: Math.round(local.y),
    direction: local.direction,
    moving: local.moving,
    zoneId: local.zoneId
  };
}

function presenceDigest(local: PlayerPresence) {
  return JSON.stringify({
    ...presencePayload(local),
    claimedOfficeId: local.claimedOfficeId,
    claimedOfficeName: local.claimedOfficeName
  });
}

function applyClaims(
  presences: Record<string, PlayerPresence>,
  claims: OfficeClaim[],
  localIdentity: string
) {
  const claimsByIdentity = new Map(claims.map((claim) => [claim.identity, claim]));
  return Object.fromEntries(
    Object.entries(presences).map(([identity, presence]) => {
      if (identity === localIdentity) return [identity, presence];
      const claim = claimsByIdentity.get(identity);
      return [
        identity,
        {
          ...presence,
          claimedOfficeId: claim?.zoneId,
          claimedOfficeName: claim?.zoneName
        }
      ];
    })
  );
}

async function postJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Server sync request failed.");
  }
  return body;
}
