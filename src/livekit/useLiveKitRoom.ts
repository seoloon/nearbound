import {
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, LiveKitTokenResponse, PlayerPresence, Session, UserStatus } from "../types";
import { getAudibility, type OfficeMap, TILE } from "../game/map";

type ConnectionStatus = "preview" | "connecting" | "connected" | "error";

interface LocalMediaState {
  mic: boolean;
  deafened: boolean;
  camera: boolean;
  screen: boolean;
}

interface PresencePacket {
  type: "presence";
  identity: string;
  name: string;
  color: string;
  status: UserStatus;
  bio: string;
  x: number;
  y: number;
  direction: PlayerPresence["direction"];
  moving: boolean;
  zoneId?: string;
  t: number;
}

interface ChatPacket {
  type: "chat";
  id: string;
  text: string;
  sentAt: number;
}

export interface LiveKitBridge {
  room: Room | null;
  status: ConnectionStatus;
  error?: string;
  mediaError?: string;
  media: LocalMediaState;
  remotePresences: Record<string, PlayerPresence>;
  chatMessages: ChatMessage[];
  mediaVersion: number;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function useLiveKitRoom(
  session: Session | null,
  local: PlayerPresence | null,
  map: OfficeMap,
  enabled: boolean
): LiveKitBridge {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? "connecting" : "preview");
  const [error, setError] = useState<string | undefined>();
  const [mediaError, setMediaError] = useState<string | undefined>();
  const [media, setMedia] = useState<LocalMediaState>({ mic: false, deafened: false, camera: false, screen: false });
  const [remotePresences, setRemotePresences] = useState<Record<string, PlayerPresence>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [mediaVersion, setMediaVersion] = useState(0);
  const localRef = useRef<PlayerPresence | null>(local);
  const lastPublishedRef = useRef(0);

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    if (!session || !enabled) {
      setStatus(enabled ? "connecting" : "preview");
      return;
    }

    let cancelled = false;
    const currentSession = session;
    const nextRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    const bumpMedia = () => setMediaVersion((version) => version + 1);
    const upsertParticipantPresence = (participant: RemoteParticipant) => {
      setRemotePresences((previous) => {
        if (previous[participant.identity]) return previous;
        return {
          ...previous,
          [participant.identity]: fallbackPresence(participant, map)
        };
      });
    };

    const removeParticipantPresence = (participant: RemoteParticipant) => {
      setRemotePresences((previous) => {
        const next = { ...previous };
        delete next[participant.identity];
        return next;
      });
    };

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string
    ) => {
      if (!participant) return;
      try {
        const packet = JSON.parse(decoder.decode(payload)) as PresencePacket | ChatPacket;
        if (topic === "chat" || packet.type === "chat") {
          if (packet.type !== "chat") return;
          const message: ChatMessage = {
            id: packet.id,
            identity: participant.identity,
            name: participant.name || participant.identity,
            color: readColor(participant),
            text: packet.text,
            sentAt: packet.sentAt
          };
          setChatMessages((previous) => appendMessage(previous, message));
          return;
        }

        if (topic && topic !== "presence") return;
        if (packet.type !== "presence") return;
        setRemotePresences((previous) => ({
          ...previous,
          [participant.identity]: {
            identity: participant.identity,
            name: packet.name || participant.name || participant.identity,
            color: packet.color || readColor(participant),
            status: packet.status || "available",
            bio: packet.bio || "",
            x: packet.x,
            y: packet.y,
            direction: packet.direction || "down",
            moving: Boolean(packet.moving),
            zoneId: packet.zoneId,
            lastSeen: Date.now()
          }
        }));
      } catch {
        // Ignore non-presence app data.
      }
    };

    nextRoom
      .on(RoomEvent.ParticipantConnected, upsertParticipantPresence)
      .on(RoomEvent.ParticipantDisconnected, removeParticipantPresence)
      .on(RoomEvent.TrackPublished, bumpMedia)
      .on(RoomEvent.TrackUnpublished, bumpMedia)
      .on(RoomEvent.TrackSubscribed, bumpMedia)
      .on(RoomEvent.TrackUnsubscribed, bumpMedia)
      .on(RoomEvent.TrackMuted, bumpMedia)
      .on(RoomEvent.TrackUnmuted, bumpMedia)
      .on(RoomEvent.DataReceived, handleDataReceived);

    async function connect() {
      setStatus("connecting");
      setError(undefined);
      try {
        const response = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: currentSession.identity,
            name: currentSession.name,
            color: currentSession.color,
            room: currentSession.room
          })
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "Unable to get a LiveKit token.");
        }

        const tokenResponse = (await response.json()) as LiveKitTokenResponse;
        await nextRoom.connect(tokenResponse.url, tokenResponse.token, { autoSubscribe: false });
        if (cancelled) return;
        nextRoom.remoteParticipants.forEach(upsertParticipantPresence);
        setRoom(nextRoom);
        setStatus("connected");
        publishPresence(nextRoom, localRef.current, true);
      } catch (connectError) {
        if (cancelled) return;
        setStatus("error");
        setError(connectError instanceof Error ? connectError.message : "Unable to connect to LiveKit.");
        await nextRoom.disconnect();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      nextRoom.removeAllListeners();
      void nextRoom.disconnect();
      setRoom((current) => (current === nextRoom ? null : current));
      setMedia({ mic: false, deafened: false, camera: false, screen: false });
      setRemotePresences({});
    };
  }, [session?.identity, session?.room, enabled, map]);

  useEffect(() => {
    if (!room || !local) return;
    const now = Date.now();
    if (now - lastPublishedRef.current < 120) return;
    lastPublishedRef.current = now;
    publishPresence(room, local, false);
  }, [room, local?.x, local?.y, local?.direction, local?.moving, local?.zoneId, local?.status, local?.bio]);

  useEffect(() => {
    if (!room) return;
    const id = window.setInterval(() => publishPresence(room, localRef.current, true), 2500);
    return () => window.clearInterval(id);
  }, [room]);

  useEffect(() => {
    if (!room || !local) return;
    room.remoteParticipants.forEach((participant) => {
      const presence = remotePresences[participant.identity] || fallbackPresence(participant, map);
      const audibility = getAudibility(local, presence, map);
      participant.trackPublications.forEach((publication) => {
        if (!isMediaPublication(publication)) return;
        if (publication.isSubscribed !== audibility.audible) {
          publication.setSubscribed(audibility.audible);
        }
      });
    });
  }, [room, local?.x, local?.y, local?.zoneId, remotePresences, map, mediaVersion]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    const next = !media.mic;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMedia((current) => ({ ...current, mic: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Microphone is not available.");
    }
  }, [room, media.mic]);

  const toggleDeafen = useCallback(() => {
    setMedia((current) => ({ ...current, deafened: !current.deafened }));
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!room) return;
    const next = !media.camera;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setMedia((current) => ({ ...current, camera: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Camera is not available.");
    }
  }, [room, media.camera]);

  const toggleScreen = useCallback(async () => {
    if (!room) return;
    const next = !media.screen;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setMedia((current) => ({ ...current, screen: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Screen sharing is not available.");
    }
  }, [room, media.screen]);

  const sendChat = useCallback(
    async (text: string) => {
      const body = text.trim().slice(0, 500);
      const currentLocal = localRef.current;
      if (!body || !currentLocal) return;
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        identity: currentLocal.identity,
        name: currentLocal.name,
        color: currentLocal.color,
        text: body,
        sentAt: Date.now(),
        local: true
      };
      setChatMessages((previous) => appendMessage(previous, message));

      if (!room || room.state !== "connected") return;
      const packet: ChatPacket = {
        type: "chat",
        id: message.id,
        text: message.text,
        sentAt: message.sentAt
      };
      await room.localParticipant.publishData(encoder.encode(JSON.stringify(packet)), {
        reliable: true,
        topic: "chat"
      });
    },
    [room]
  );

  return {
    room,
    status,
    error,
    mediaError,
    media,
    remotePresences,
    chatMessages,
    mediaVersion,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    sendChat
  };
}

function publishPresence(room: Room, local: PlayerPresence | null, reliable: boolean) {
  if (!local || room.state !== "connected") return;
  const packet: PresencePacket = {
    type: "presence",
    identity: local.identity,
    name: local.name,
    color: local.color,
    status: local.status,
    bio: local.bio,
    x: Math.round(local.x),
    y: Math.round(local.y),
    direction: local.direction,
    moving: local.moving,
    zoneId: local.zoneId,
    t: Date.now()
  };

  void room.localParticipant
    .publishData(encoder.encode(JSON.stringify(packet)), { reliable, topic: "presence" })
    .catch(() => undefined);
}

function isMediaPublication(publication: RemoteTrackPublication) {
  return (
    publication.source === Track.Source.Microphone ||
    publication.source === Track.Source.Camera ||
    publication.source === Track.Source.ScreenShare ||
    publication.source === Track.Source.ScreenShareAudio
  );
}

function readColor(participant: RemoteParticipant) {
  try {
    const metadata = JSON.parse(participant.metadata || "{}") as { color?: string };
    return metadata.color || "#2fbf71";
  } catch {
    return "#2fbf71";
  }
}

function readProfile(participant: RemoteParticipant) {
  try {
    const metadata = JSON.parse(participant.metadata || "{}") as { color?: string; status?: UserStatus; bio?: string };
    return {
      color: metadata.color || "#2fbf71",
      status: metadata.status || "available",
      bio: metadata.bio || ""
    };
  } catch {
    return { color: "#2fbf71", status: "available" as UserStatus, bio: "" };
  }
}

function fallbackPresence(participant: RemoteParticipant, map: OfficeMap): PlayerPresence {
  const seed = hash(participant.identity);
  const profile = readProfile(participant);
  return {
    identity: participant.identity,
    name: participant.name || participant.identity,
    color: profile.color,
    status: profile.status,
    bio: profile.bio,
    x: map.spawn.x + ((seed % 9) - 4) * TILE,
    y: map.spawn.y + (((seed >> 4) % 5) - 2) * TILE,
    direction: "down",
    moving: false,
    lastSeen: Date.now()
  };
}

function appendMessage(messages: ChatMessage[], message: ChatMessage) {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message].slice(-120);
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}
