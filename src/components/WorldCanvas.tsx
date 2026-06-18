import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent, WheelEvent } from "react";
import { loadOfficeImages, type ImageMap } from "../game/assets";
import { drawWorld } from "../game/renderer";
import { getZoneAt, isBlocked, type OfficeMap } from "../game/map";
import type { PlayerPresence } from "../types";

interface WorldCanvasProps {
  map: OfficeMap;
  local: PlayerPresence;
  remotes: PlayerPresence[];
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
  panX: number;
  panY: number;
}

interface PanDragState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

const PLAYER_SPEED = 88;
const FOOT_W = 10;
const FOOT_H = 7;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.12;

export function WorldCanvas({ map, local, remotes, onLocalChange }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localRef = useRef(local);
  const remotesRef = useRef(remotes);
  const keysRef = useRef(new Set<string>());
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 2.35, panX: 0, panY: 0 });
  const panDragRef = useRef<PanDragState | null>(null);
  const lastEmitRef = useRef(0);
  const [images, setImages] = useState<ImageMap | null>(null);
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });

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
      updateCamera(localRef.current, size, cameraRef.current);
      render(ctx, canvas, size, map, images, localRef.current, remotesRef.current, now, cameraRef.current);

      if (now - lastEmitRef.current > 70) {
        lastEmitRef.current = now;
        onLocalChange(localRef.current);
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
    camera.panX -= (event.clientX - drag.lastX) / camera.zoom;
    camera.panY -= (event.clientY - drag.lastY) / camera.zoom;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    updateCamera(localRef.current, size, camera);
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
      camera.panY += delta / camera.zoom;
      updateCamera(localRef.current, size, camera);
      return;
    }

    if (event.altKey) {
      camera.panX += delta / camera.zoom;
      updateCamera(localRef.current, size, camera);
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
    updateCamera(localRef.current, size, camera);
    const after = screenToWorld(pointer.x, pointer.y, camera);
    camera.panX += before.x - after.x;
    camera.panY += before.y - after.y;
    updateCamera(localRef.current, size, camera);
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

function updateCamera(player: PlayerPresence, size: Size, camera: CameraState) {
  const viewportW = size.width / camera.zoom;
  const viewportH = size.height / camera.zoom;
  camera.x = player.x - viewportW / 2 + camera.panX;
  camera.y = player.y - viewportH / 2 + camera.panY;
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

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.scale(camera.zoom, camera.zoom);
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

function screenToWorld(x: number, y: number, camera: CameraState) {
  return {
    x: camera.x + x / camera.zoom,
    y: camera.y + y / camera.zoom
  };
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
