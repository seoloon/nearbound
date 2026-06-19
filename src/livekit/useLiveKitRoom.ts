import {
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAvatarStyle } from "../avatar";
import type { AvatarStyle, LiveKitTokenResponse, PlayerPresence, Session, UserStatus } from "../types";
import { getAudibility, getLocalMediaAccess, type OfficeMap, TILE } from "../game/map";

type ConnectionStatus = "preview" | "connecting" | "connected" | "error";

interface LocalMediaState {
  mic: boolean;
  deafened: boolean;
  camera: boolean;
  screen: boolean;
}

export interface LiveKitBridge {
  room: Room | null;
  status: ConnectionStatus;
  error?: string;
  mediaError?: string;
  media: LocalMediaState;
  mediaVersion: number;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
}

export function useLiveKitRoom(
  session: Session | null,
  local: PlayerPresence | null,
  remotePresences: Record<string, PlayerPresence>,
  map: OfficeMap,
  enabled: boolean
): LiveKitBridge {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? "connecting" : "preview");
  const [error, setError] = useState<string | undefined>();
  const [mediaError, setMediaError] = useState<string | undefined>();
  const [media, setMedia] = useState<LocalMediaState>({ mic: false, deafened: false, camera: false, screen: false });
  const [mediaVersion, setMediaVersion] = useState(0);
  const localRef = useRef<PlayerPresence | null>(local);

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

    nextRoom
      .on(RoomEvent.TrackPublished, bumpMedia)
      .on(RoomEvent.TrackUnpublished, bumpMedia)
      .on(RoomEvent.TrackSubscribed, bumpMedia)
      .on(RoomEvent.TrackUnsubscribed, bumpMedia)
      .on(RoomEvent.TrackMuted, bumpMedia)
      .on(RoomEvent.TrackUnmuted, bumpMedia);

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
            avatar: currentSession.avatar,
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
        setRoom(nextRoom);
        setStatus("connected");
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
    };
  }, [session?.identity, session?.room, enabled]);

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

  useEffect(() => {
    if (!room || !local) return;
    const currentRoom = room;
    const access = getLocalMediaAccess(local, map);
    if (access.canPublish) return;
    let cancelled = false;
    async function disableForbiddenMedia() {
      try {
        if (media.mic) await currentRoom.localParticipant.setMicrophoneEnabled(false);
        if (media.camera) await currentRoom.localParticipant.setCameraEnabled(false);
        if (media.screen) await currentRoom.localParticipant.setScreenShareEnabled(false);
        if (!cancelled && (media.mic || media.camera || media.screen)) {
          setMedia((current) => ({ ...current, mic: false, camera: false, screen: false }));
          setMediaError(access.reason);
        }
      } catch (disableError) {
        if (!cancelled) {
          setMediaError(disableError instanceof Error ? disableError.message : access.reason);
        }
      }
    }
    void disableForbiddenMedia();
    return () => {
      cancelled = true;
    };
  }, [room, local?.x, local?.y, local?.zoneId, map, media.mic, media.camera, media.screen]);

  const toggleMic = useCallback(async () => {
    if (!room || !localRef.current) return;
    const access = getLocalMediaAccess(localRef.current, map);
    if (!access.canPublish) {
      setMediaError(access.reason);
      return;
    }
    const next = !media.mic;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMedia((current) => ({ ...current, mic: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Microphone is not available.");
    }
  }, [room, map, media.mic]);

  const toggleDeafen = useCallback(() => {
    setMedia((current) => ({ ...current, deafened: !current.deafened }));
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!room || !localRef.current) return;
    const access = getLocalMediaAccess(localRef.current, map);
    if (!access.canPublish) {
      setMediaError(access.reason);
      return;
    }
    const next = !media.camera;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setMedia((current) => ({ ...current, camera: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Camera is not available.");
    }
  }, [room, map, media.camera]);

  const toggleScreen = useCallback(async () => {
    if (!room || !localRef.current) return;
    const access = getLocalMediaAccess(localRef.current, map);
    if (!access.canPublish) {
      setMediaError(access.reason);
      return;
    }
    const next = !media.screen;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setMedia((current) => ({ ...current, screen: next }));
      setMediaError(undefined);
    } catch (toggleError) {
      setMediaError(toggleError instanceof Error ? toggleError.message : "Screen sharing is not available.");
    }
  }, [room, map, media.screen]);

  return {
    room,
    status,
    error,
    mediaError,
    media,
    mediaVersion,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreen
  };
}

function isMediaPublication(publication: RemoteTrackPublication) {
  return (
    publication.source === Track.Source.Microphone ||
    publication.source === Track.Source.Camera ||
    publication.source === Track.Source.ScreenShare ||
    publication.source === Track.Source.ScreenShareAudio
  );
}

function readProfile(participant: RemoteParticipant) {
  try {
    const metadata = JSON.parse(participant.metadata || "{}") as {
      color?: string;
      avatar?: AvatarStyle;
      status?: UserStatus;
      bio?: string;
    };
    const avatar = normalizeAvatarStyle(metadata.avatar, metadata.color);
    return {
      color: metadata.color || avatar.topColor,
      avatar,
      status: metadata.status || "available",
      bio: metadata.bio || ""
    };
  } catch {
    const avatar = normalizeAvatarStyle(undefined);
    return { color: avatar.topColor, avatar, status: "available" as UserStatus, bio: "" };
  }
}

function fallbackPresence(participant: RemoteParticipant, map: OfficeMap): PlayerPresence {
  const seed = hash(participant.identity);
  const profile = readProfile(participant);
  return {
    identity: participant.identity,
    name: participant.name || participant.identity,
    color: profile.color,
    avatar: profile.avatar,
    status: profile.status,
    bio: profile.bio,
    x: map.spawn.x + ((seed % 9) - 4) * TILE,
    y: map.spawn.y + (((seed >> 4) % 5) - 2) * TILE,
    direction: "down",
    moving: false,
    claimedOfficeId: undefined,
    claimedOfficeName: undefined,
    lastSeen: Date.now()
  };
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}
