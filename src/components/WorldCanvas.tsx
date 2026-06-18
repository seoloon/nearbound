import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent, WheelEvent } from "react";
import { Room, Track } from "livekit-client";
import { loadOfficeImages, type ImageMap } from "../game/assets";
import { drawWorld } from "../game/renderer";
import { getZoneAt, isBlocked, type OfficeMap } from "../game/map";
import type { PlayerPresence } from "../types";

interface WorldCanvasProps {
  map: OfficeMap;
  local: PlayerPresence;
  remotes: PlayerPresence[];
  room: Room | null;
  mediaVersion: number;
  onLocalChange: (presence: PlayerPresence) => void;
}

interface Size {
  width: number;
  height: number;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
  initialized: boolean;
}

interface PanDragState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

interface TrackLike {
  attach: (element: HTMLMediaElement) => unknown;
  detach: (element: HTMLMediaElement) => unknown;
}

interface PublicationLike {
  source?: Track.Source;
  track?: TrackLike;
  trackSid?: string;
  isSubscribed?: boolean;
}

interface ParticipantLike {
  identity?: string;
  trackPublications: Map<string, PublicationLike>;
}

const PLAYER_SPEED = 88;
const FOOT_W = 10;
const FOOT_H = 7;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.12;
const REMOTE_SMOOTHING = 11;

export function WorldCanvas({ map, local, remotes, room, mediaVersion, onLocalChange }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localRef = useRef(local);
  const remotesRef = useRef(remotes);
  const smoothRemotesRef = useRef(new Map<string, PlayerPresence>());
  const keysRef = useRef(new Set<string>());
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 2.35, initialized: false });
  const panDragRef = useRef<PanDragState | null>(null);
  const lastEmitRef = useRef(0);
  const lastOverlayRef = useRef(0);
  const [images, setImages] = useState<ImageMap | null>(null);
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [overlayTick, setOverlayTick] = useState(0);

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    remotesRef.current = remotes;
  }, [remotes]);

  useEffect(() => {
    let cancelled = false;
    void loadOfficeImages().then((loaded) => {
      if (!cancelled) setImages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "z", "q"].includes(event.key)) {
        event.preventDefault();
        keysRef.current.add(event.key.toLowerCase());
        targetRef.current = null;
      }
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !images) return;

    let animation = 0;
    let previous = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      stepPlayer(map, localRef, keysRef.current, targetRef, dt);
      followCamera(localRef.current, size, cameraRef.current);
      const smoothRemotes = smoothRemotePresences(remotesRef.current, smoothRemotesRef.current, dt);
      render(ctx, canvas, size, map, images, localRef.current, smoothRemotes, now, cameraRef.current);

      if (now - lastEmitRef.current > 70) {
        lastEmitRef.current = now;
        onLocalChange(localRef.current);
      }
      if (now - lastOverlayRef.current > 80) {
        lastOverlayRef.current = now;
        setOverlayTick((value) => (value + 1) % 100000);
      }
      animation = requestAnimationFrame(frame);
    };

    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [images, map, onLocalChange, size]);

  const overlayText = useMemo(() => {
    const zone = getZoneAt(map, local.x, local.y);
    return zone ? zone.name : "Open-space";
  }, [map, local.x, local.y]);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button === 1) {
      event.preventDefault();
      panDragRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = cameraRef.current;
    targetRef.current = {
      x: camera.x + (event.clientX - rect.left) / camera.zoom,
      y: camera.y + (event.clientY - rect.top) / camera.zoom
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const camera = cameraRef.current;
    camera.x -= (event.clientX - drag.lastX) / camera.zoom;
    camera.y -= (event.clientY - drag.lastY) / camera.zoom;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  }

  function handlePointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const camera = cameraRef.current;
    const delta = event.deltaY || event.deltaX;

    if (event.shiftKey) {
      camera.y += delta / camera.zoom;
      return;
    }

    if (event.altKey) {
      camera.x += delta / camera.zoom;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const before = screenToWorld(pointer.x, pointer.y, camera);
    const factor = delta > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = screenToWorld(pointer.x, pointer.y, camera);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
  }

  return (
    <div className="world-stage">
      <canvas
        ref={canvasRef}
        onAuxClick={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      />
      <VideoBubbles
        room={room}
        local={local}
        remotes={Array.from(smoothRemotesRef.current.values())}
        camera={cameraRef.current}
        size={size}
        mediaVersion={mediaVersion}
        tick={overlayTick}
      />
      <div className="world-badge">{overlayText}</div>
      {!images && <div className="world-loading">Loading textures...</div>}
    </div>
  );
}

function stepPlayer(
  map: OfficeMap,
  localRef: MutableRefObject<PlayerPresence>,
  keys: Set<string>,
  targetRef: MutableRefObject<{ x: number; y: number } | null>,
  dt: number
) {
  const current = localRef.current;
  let dx = 0;
  let dy = 0;

  if (keys.has("arrowup") || keys.has("w") || keys.has("z")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (keys.has("arrowleft") || keys.has("a") || keys.has("q")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;

  if (dx === 0 && dy === 0 && targetRef.current) {
    const target = targetRef.current;
    dx = target.x - current.x;
    dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      targetRef.current = null;
      dx = 0;
      dy = 0;
    } else {
      dx /= distance;
      dy /= distance;
    }
  }

  const length = Math.hypot(dx, dy);
  const moving = length > 0;
  if (moving && length > 1) {
    dx /= length;
    dy /= length;
  }

  const distance = PLAYER_SPEED * dt;
  let nextX = current.x;
  let nextY = current.y;
  if (moving) {
    const proposedX = current.x + dx * distance;
    if (!footBlocked(map, proposedX, current.y)) nextX = proposedX;
    const proposedY = current.y + dy * distance;
    if (!footBlocked(map, nextX, proposedY)) nextY = proposedY;
  }

  const direction =
    Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? "left"
        : dx > 0
          ? "right"
          : current.direction
      : dy < 0
        ? "up"
        : dy > 0
          ? "down"
          : current.direction;
  const zone = getZoneAt(map, nextX, nextY);

  localRef.current = {
    ...current,
    x: nextX,
    y: nextY,
    direction,
    moving,
    zoneId: zone?.id,
    lastSeen: Date.now()
  };
}

function footBlocked(map: OfficeMap, x: number, y: number) {
  const left = x - FOOT_W / 2;
  const right = x + FOOT_W / 2;
  const top = y - FOOT_H;
  const bottom = y;
  return (
    isBlocked(map, left, top) ||
    isBlocked(map, right, top) ||
    isBlocked(map, left, bottom) ||
    isBlocked(map, right, bottom)
  );
}

function followCamera(player: PlayerPresence, size: Size, camera: CameraState) {
  const viewportW = size.width / camera.zoom;
  const viewportH = size.height / camera.zoom;
  if (!camera.initialized) {
    camera.x = player.x - viewportW / 2;
    camera.y = player.y - viewportH / 2;
    camera.initialized = true;
    return;
  }

  const marginX = Math.min(260, Math.max(96, viewportW * 0.34));
  const marginY = Math.min(190, Math.max(72, viewportH * 0.32));
  const left = camera.x + marginX;
  const right = camera.x + viewportW - marginX;
  const top = camera.y + marginY;
  const bottom = camera.y + viewportH - marginY;

  if (player.x < left) camera.x = player.x - marginX;
  if (player.x > right) camera.x = player.x - (viewportW - marginX);
  if (player.y < top) camera.y = player.y - marginY;
  if (player.y > bottom) camera.y = player.y - (viewportH - marginY);
}

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  size: Size,
  map: OfficeMap,
  images: ImageMap,
  local: PlayerPresence,
  remotes: PlayerPresence[],
  now: number,
  camera: CameraState
) {
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(size.width * dpr);
  const targetHeight = Math.floor(size.height * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, 0, 0);
  drawWorld(ctx, map, images, {
    local,
    remotes,
    now,
    cameraX: camera.x,
    cameraY: camera.y,
    viewportWidth: size.width / camera.zoom,
    viewportHeight: size.height / camera.zoom
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothRemotePresences(
  targets: PlayerPresence[],
  cache: Map<string, PlayerPresence>,
  dt: number
) {
  const targetIds = new Set(targets.map((target) => target.identity));
  for (const id of cache.keys()) {
    if (!targetIds.has(id)) cache.delete(id);
  }

  const factor = 1 - Math.exp(-REMOTE_SMOOTHING * dt);
  return targets.map((target) => {
    const current = cache.get(target.identity);
    if (!current) {
      cache.set(target.identity, target);
      return target;
    }

    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    const next =
      distance > 96
        ? target
        : {
            ...target,
            x: current.x + (target.x - current.x) * factor,
            y: current.y + (target.y - current.y) * factor
          };
    cache.set(target.identity, next);
    return next;
  });
}

function screenToWorld(x: number, y: number, camera: CameraState) {
  return {
    x: camera.x + x / camera.zoom,
    y: camera.y + y / camera.zoom
  };
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function VideoBubbles({
  room,
  local,
  remotes,
  camera,
  size,
  mediaVersion,
  tick
}: {
  room: Room | null;
  local: PlayerPresence;
  remotes: PlayerPresence[];
  camera: CameraState;
  size: Size;
  mediaVersion: number;
  tick: number;
}) {
  void tick;
  if (!room) return null;

  const localPublication = publicationFor(room.localParticipant as unknown as ParticipantLike, Track.Source.Camera);
  const bubbles = [
    {
      id: local.identity,
      presence: local,
      publication: localPublication,
      muted: true
    },
    ...remotes.map((presence) => ({
      id: presence.identity,
      presence,
      publication: publicationFor(
        room.remoteParticipants.get(presence.identity) as unknown as ParticipantLike | undefined,
        Track.Source.Camera
      ),
      muted: false
    }))
  ].filter((bubble) => Boolean(bubble.publication?.track));

  return (
    <div className="video-bubble-layer">
      {bubbles.map((bubble) => {
        const position = worldToScreen(bubble.presence.x, bubble.presence.y - 70, camera);
        if (
          position.x < -120 ||
          position.y < -100 ||
          position.x > size.width + 120 ||
          position.y > size.height + 120
        ) {
          return null;
        }

        return (
          <div
            className="video-bubble"
            key={bubble.id}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
          >
            <VideoTrack publication={bubble.publication} muted={bubble.muted} mediaVersion={mediaVersion} />
          </div>
        );
      })}
    </div>
  );
}

function VideoTrack({
  publication,
  muted,
  mediaVersion
}: {
  publication?: PublicationLike;
  muted: boolean;
  mediaVersion: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    const track = publication?.track;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication?.trackSid, publication?.track, mediaVersion]);

  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

function publicationFor(participant: ParticipantLike | undefined, source: Track.Source) {
  if (!participant) return undefined;
  return Array.from(participant.trackPublications.values()).find((publication) => publication.source === source);
}

function worldToScreen(x: number, y: number, camera: CameraState) {
  return {
    x: (x - camera.x) * camera.zoom,
    y: (y - camera.y) * camera.zoom
  };
}
