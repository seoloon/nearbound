import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent, WheelEvent } from "react";
import { Room, Track } from "livekit-client";
import { loadOfficeImages, type AssetId, type ImageMap } from "../game/assets";
import {
  isFloorAsset,
  isFloorLayerProp,
  isWallAsset,
  type MapEditorTool,
  zoneTypeConfig
} from "../game/editor";
import { drawWorld } from "../game/renderer";
import {
  getAudibility,
  getLocalMediaAccess,
  getPrimaryZoneAt,
  getZoneAt,
  getZoneType,
  isBlocked,
  isBroadcastZone,
  TILE,
  withRebuiltCollision,
  type ObjectPlacement,
  type OfficeMap,
  type Rect,
  type Zone
} from "../game/map";
import type { PlayerPresence } from "../types";

interface WorldCanvasProps {
  map: OfficeMap;
  local: PlayerPresence;
  remotes: PlayerPresence[];
  room: Room | null;
  cameraActive: boolean;
  mediaVersion: number;
  showEditorGrid?: boolean;
  editorTool?: MapEditorTool;
  onEditorToolChange?: (tool: MapEditorTool) => void;
  onMapChange?: (updater: (current: OfficeMap) => OfficeMap) => void;
  onClaimOffice?: (zone: Zone) => void;
  onReleaseOffice?: () => void;
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

interface TilePoint {
  x: number;
  y: number;
}

interface EditorDragState {
  pointerId: number;
  start: TilePoint;
  current: TilePoint;
}

type EditorCanvasPreview =
  | { kind: "asset"; asset: AssetId; rect: Rect; erase?: boolean }
  | { kind: "build"; asset?: AssetId; rect: Rect; erase: boolean }
  | { kind: "zone"; rect: Rect; zoneType: MapEditorTool["selectedZoneType"]; zoneSubType?: Zone["subType"]; erase: boolean }
  | { kind: "object-delete"; object: ObjectPlacement; rect: Rect }
  | { kind: "zone-delete"; zone: Zone };

interface TrackLike {
  attach: (element: HTMLMediaElement) => unknown;
  detach: (element: HTMLMediaElement) => unknown;
}

interface PublicationLike {
  source?: Track.Source;
  track?: TrackLike;
  trackSid?: string;
  isSubscribed?: boolean;
  isMuted?: boolean;
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
const VIDEO_BUBBLE_ANCHOR_OFFSET = 35;

export function WorldCanvas({
  map,
  local,
  remotes,
  room,
  cameraActive,
  mediaVersion,
  showEditorGrid = false,
  editorTool,
  onEditorToolChange,
  onMapChange,
  onClaimOffice,
  onReleaseOffice,
  onLocalChange
}: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localRef = useRef(local);
  const remotesRef = useRef(remotes);
  const roomRef = useRef(room);
  const cameraActiveRef = useRef(cameraActive);
  const smoothRemotesRef = useRef(new Map<string, PlayerPresence>());
  const keysRef = useRef(new Set<string>());
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 2.35, initialized: false });
  const panDragRef = useRef<PanDragState | null>(null);
  const editorDragRef = useRef<EditorDragState | null>(null);
  const editorPreviewRef = useRef<EditorCanvasPreview | null>(null);
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
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    editorDragRef.current = null;
    editorPreviewRef.current = null;
  }, [
    showEditorGrid,
    editorTool?.activeTab,
    editorTool?.action,
    editorTool?.selectedAsset,
    editorTool?.selectedZoneType,
    editorTool?.pendingBroadcastFor
  ]);

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
      const videoIdentities = visibleCameraIdentities(
        roomRef.current,
        localRef.current,
        smoothRemotes,
        cameraActiveRef.current,
        map
      );
      render(
        ctx,
        canvas,
        size,
        map,
        images,
        localRef.current,
        smoothRemotes,
        now,
        cameraRef.current,
        videoIdentities,
        showEditorGrid,
        editorTool?.selectedZoneType,
        editorPreviewRef.current
      );

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
  }, [editorTool?.pendingBroadcastFor, editorTool?.selectedZoneType, images, map, onLocalChange, showEditorGrid, size]);

  const overlayText = useMemo(() => {
    const zone = getPrimaryZoneAt(map, local.x, local.y);
    return zone ? zone.name : "Open-space";
  }, [map, local.x, local.y]);

  const activeOffice = useMemo(() => {
    const zone = getPrimaryZoneAt(map, local.x, local.y);
    return getZoneType(zone) === "office" ? zone : undefined;
  }, [map, local.x, local.y]);

  const activeOfficeClaim = useMemo(
    () => (activeOffice ? officeClaimFor([local, ...remotes], activeOffice.id) : undefined),
    [activeOffice, local, remotes]
  );

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

    if (showEditorGrid && event.button === 0) {
      event.preventDefault();
      targetRef.current = null;
      handleEditorPointerDown(event);
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
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      const camera = cameraRef.current;
      camera.x -= (event.clientX - drag.lastX) / camera.zoom;
      camera.y -= (event.clientY - drag.lastY) / camera.zoom;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }

    if (showEditorGrid) {
      updateEditorPreview(event);
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    const drag = panDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      panDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    const editorDrag = editorDragRef.current;
    if (editorDrag && editorDrag.pointerId === event.pointerId) {
      event.preventDefault();
      editorDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      commitEditorRect(tileRect(editorDrag.start, editorDrag.current));
      updateEditorPreview(event);
    }
  }

  function handlePointerLeave() {
    if (!editorDragRef.current) {
      editorPreviewRef.current = null;
    }
  }

  function handleEditorPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!editorTool || !onMapChange || !images) return;
    const world = pointerWorld(event);
    const tile = worldToTile(world, map);
    if (!tile) return;
    updateEditorPreview(event);

    if (editorTool.activeTab === "props") {
      if (editorTool.action === "erase") {
        const object = findObjectAt(map, world.x, world.y, images);
        if (object) {
          onMapChange((current) =>
            withRebuiltCollision({
              ...current,
              objects: current.objects.filter((entry) => entry.id !== object.id)
            })
          );
          editorPreviewRef.current = null;
        }
        return;
      }

      const image = images[editorTool.selectedAsset];
      if (!image) return;
      const rect = assetRectAtTile(tile, image, map);
      onMapChange((current) =>
        withRebuiltCollision({
          ...current,
          objects: [...current.objects, createEditorObject(editorTool.selectedAsset, rect)]
        })
      );
      return;
    }

    if (editorTool.activeTab === "zone" && editorTool.action === "erase" && editorTool.zoneMode === "simple") {
      const zone = findZoneAtPoint(map, world.x, world.y, editorTool.selectedZoneType);
      if (zone) {
        onMapChange((current) => eraseZonesById(current, new Set([zone.id])));
      }
      return;
    }

    const mode = editorTool.activeTab === "build" ? editorTool.buildMode : editorTool.zoneMode;
    if (mode === "draw") {
      editorDragRef.current = {
        pointerId: event.pointerId,
        start: tile,
        current: tile
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    commitEditorRect(tileRect(tile, tile));
  }

  function updateEditorPreview(event: PointerEvent<HTMLCanvasElement>) {
    if (!editorTool || !images) {
      editorPreviewRef.current = null;
      return;
    }

    const world = pointerWorld(event);
    const tile = worldToTile(world, map);
    if (!tile) {
      editorPreviewRef.current = null;
      return;
    }

    const drag = editorDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      drag.current = tile;
    }

    const rect = drag && drag.pointerId === event.pointerId ? tileRect(drag.start, drag.current) : tileRect(tile, tile);
    editorPreviewRef.current = previewForEditorTool(editorTool, map, images, world, tile, rect);
  }

  function commitEditorRect(rect: Rect) {
    if (!editorTool || !onMapChange) return;

    if (editorTool.activeTab === "build") {
      onMapChange((current) => applyBuildEdit(current, editorTool, rect));
      return;
    }

    if (editorTool.activeTab === "zone") {
      if (editorTool.action === "erase") {
        onMapChange((current) => applyZoneErase(current, editorTool, rect));
        if (editorTool.pendingBroadcastFor) {
          onEditorToolChange?.({
            ...editorTool,
            pendingBroadcastFor: undefined,
            pendingBroadcastName: undefined
          });
        }
        return;
      }

      const zone = createEditorZone(map, editorTool, rect);
      onMapChange((current) =>
        withRebuiltCollision({
          ...current,
          zones: [...current.zones, zone]
        })
      );

      if (editorTool.selectedZoneType === "meeting") {
        onEditorToolChange?.(
          editorTool.pendingBroadcastFor
            ? {
                ...editorTool,
                pendingBroadcastFor: undefined,
                pendingBroadcastName: undefined
              }
            : {
                ...editorTool,
                pendingBroadcastFor: zone.id,
                pendingBroadcastName: zone.name
              }
        );
      }
    }
  }

  function pointerWorld(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorld(event.clientX - rect.left, event.clientY - rect.top, cameraRef.current);
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
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
      <VideoBubbles
        map={map}
        room={room}
        local={local}
        remotes={Array.from(smoothRemotesRef.current.values())}
        camera={cameraRef.current}
        size={size}
        cameraActive={cameraActive}
        mediaVersion={mediaVersion}
        tick={overlayTick}
      />
      <div className="world-badge">{overlayText}</div>
      {activeOffice && (
        <OfficeClaimPanel
          zone={activeOffice}
          claim={activeOfficeClaim}
          local={local}
          onClaim={onClaimOffice}
          onRelease={onReleaseOffice}
        />
      )}
      {!images && <div className="world-loading">Loading textures...</div>}
    </div>
  );
}

function OfficeClaimPanel({
  zone,
  claim,
  local,
  onClaim,
  onRelease
}: {
  zone: Zone;
  claim?: PlayerPresence;
  local: PlayerPresence;
  onClaim?: (zone: Zone) => void;
  onRelease?: () => void;
}) {
  const claimedBySelf = claim?.identity === local.identity;
  const localHasOtherOffice = Boolean(local.claimedOfficeId && local.claimedOfficeId !== zone.id);
  const status = claim ? (claimedBySelf ? "Your office" : `Claimed by ${claim.name}`) : "Unclaimed office";

  return (
    <div className="office-claim-panel">
      <span>
        <strong>{zone.name}</strong>
        <small>{status}</small>
      </span>
      {claimedBySelf ? (
        <button type="button" onClick={onRelease} disabled={!onRelease}>
          Release
        </button>
      ) : (
        <button type="button" onClick={() => onClaim?.(zone)} disabled={!onClaim || Boolean(claim && !claimedBySelf)}>
          {localHasOtherOffice ? "Move claim" : "Claim"}
        </button>
      )}
    </div>
  );
}

function officeClaimFor(presences: PlayerPresence[], zoneId: string) {
  return presences.find((presence) => presence.claimedOfficeId === zoneId);
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
  camera: CameraState,
  videoIdentities: Set<string>,
  showEditorGrid: boolean,
  zoneFilter: MapEditorTool["selectedZoneType"] | undefined,
  editorPreview: EditorCanvasPreview | null
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
    viewportHeight: size.height / camera.zoom,
    videoIdentities
  });
  if (showEditorGrid) {
    drawEditorGrid(ctx, map, camera, size, dpr, zoneFilter);
    drawEditorPreview(ctx, images, editorPreview, camera);
  }
}

function drawEditorGrid(
  ctx: CanvasRenderingContext2D,
  map: OfficeMap,
  camera: CameraState,
  size: Size,
  dpr: number,
  zoneFilter: MapEditorTool["selectedZoneType"] | undefined
) {
  const viewportW = size.width / camera.zoom;
  const viewportH = size.height / camera.zoom;
  const startX = Math.max(0, Math.floor(camera.x / TILE) * TILE);
  const endX = Math.min(map.width, Math.ceil((camera.x + viewportW) / TILE) * TILE);
  const startY = Math.max(0, Math.floor(camera.y / TILE) * TILE);
  const endY = Math.min(map.height, Math.ceil((camera.y + viewportH) / TILE) * TILE);
  const lineWidth = 1.35 / Math.max(1, dpr * camera.zoom);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  ctx.lineWidth = lineWidth;

  for (const zone of map.zones) {
    const zoneType = zoneTypeForPreview(zone);
    if (zoneFilter && zoneType !== zoneFilter) continue;
    const color = zoneColor(zoneType, zone.subType);
    ctx.save();
    ctx.globalAlpha = zone.blocks ? 0.22 : isBroadcastZone(zone) ? 0.22 : 0.13;
    ctx.fillStyle = color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = color;
    ctx.strokeRect(zone.x + lineWidth / 2, zone.y + lineWidth / 2, zone.w - lineWidth, zone.h - lineWidth);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.strokeStyle = "rgba(246, 242, 235, 0.3)";
  for (let x = startX; x <= endX; x += TILE) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += TILE) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "rgba(73, 197, 143, 0.56)";
  for (let x = startX; x <= endX; x += TILE * 4) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += TILE * 4) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(73, 197, 143, 0.88)";
  ctx.strokeRect(0, 0, map.width, map.height);
  ctx.restore();
}

function drawEditorPreview(
  ctx: CanvasRenderingContext2D,
  images: ImageMap,
  preview: EditorCanvasPreview | null,
  camera: CameraState
) {
  if (!preview) return;

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  if (preview.kind === "asset") {
    const image = images[preview.asset];
    if (image) {
      ctx.globalAlpha = preview.erase ? 0.35 : 0.58;
      ctx.drawImage(image, preview.rect.x, preview.rect.y);
    }
    if (preview.erase) drawEraseRect(ctx, preview.rect);
    else drawPlaceRect(ctx, preview.rect);
  } else if (preview.kind === "build") {
    if (preview.erase) {
      drawEraseRect(ctx, preview.rect);
    } else if (preview.asset) {
      const image = images[preview.asset];
      ctx.globalAlpha = 0.56;
      if (image) {
        for (let y = preview.rect.y; y < preview.rect.y + preview.rect.h; y += TILE) {
          for (let x = preview.rect.x; x < preview.rect.x + preview.rect.w; x += TILE) {
            ctx.drawImage(image, x, y);
          }
        }
      }
      ctx.globalAlpha = 1;
      drawPlaceRect(ctx, preview.rect);
    }
  } else if (preview.kind === "zone") {
    if (preview.erase) {
      drawEraseRect(ctx, preview.rect);
    } else {
      const color = zoneColor(preview.zoneType, preview.zoneSubType);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = color;
      ctx.fillRect(preview.rect.x, preview.rect.y, preview.rect.w, preview.rect.h);
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(preview.rect.x + 0.5, preview.rect.y + 0.5, preview.rect.w - 1, preview.rect.h - 1);
    }
  } else if (preview.kind === "object-delete") {
    drawEraseRect(ctx, preview.rect);
  } else {
    drawEraseRect(ctx, preview.zone);
  }

  ctx.restore();
}

function drawPlaceRect(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = "rgba(169, 240, 205, 0.92)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}

function drawEraseRect(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#ed4245";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

function previewForEditorTool(
  tool: MapEditorTool,
  map: OfficeMap,
  images: ImageMap,
  world: { x: number; y: number },
  tile: TilePoint,
  rect: Rect
): EditorCanvasPreview | null {
  if (tool.activeTab === "props") {
    if (tool.action === "erase") {
      const object = findObjectAt(map, world.x, world.y, images);
      if (!object) return null;
      const image = images[object.asset];
      return {
        kind: "object-delete",
        object,
        rect: { x: object.x, y: object.y, w: image.width, h: image.height }
      };
    }

    const image = images[tool.selectedAsset];
    if (!image) return null;
    return {
      kind: "asset",
      asset: tool.selectedAsset,
      rect: assetRectAtTile(tile, image, map)
    };
  }

  if (tool.activeTab === "build") {
    return {
      kind: "build",
      asset: tool.action === "place" ? tool.selectedAsset : undefined,
      rect,
      erase: tool.action === "erase"
    };
  }

  if (tool.action === "erase" && tool.zoneMode === "simple") {
    const zone = findZoneAtPoint(map, world.x, world.y, tool.selectedZoneType);
    return zone ? { kind: "zone-delete", zone } : null;
  }

  return {
    kind: "zone",
    rect,
    zoneType: tool.selectedZoneType,
    zoneSubType: tool.selectedZoneType === "meeting" && tool.pendingBroadcastFor ? "broadcast" : undefined,
    erase: tool.action === "erase"
  };
}

function applyBuildEdit(map: OfficeMap, tool: MapEditorTool, rect: Rect): OfficeMap {
  if (tool.action === "erase") {
    return withRebuiltCollision({
      ...map,
      walls: map.walls.filter((wall) => !tileInRect(wall.x, wall.y, rect)),
      floorAreas: map.floorAreas.filter((area) => !area.editorPlaced || !rectsIntersect(area, rect))
    });
  }

  if (isFloorAsset(tool.selectedAsset)) {
    return withRebuiltCollision({
      ...map,
      floorAreas: [
        ...map.floorAreas.filter((area) => !area.editorPlaced || !rectsIntersect(area, rect)),
        { ...rect, asset: tool.selectedAsset, editorPlaced: true }
      ]
    });
  }

  if (isWallAsset(tool.selectedAsset)) {
    return withRebuiltCollision({
      ...map,
      walls: [
        ...map.walls.filter((wall) => !tileInRect(wall.x, wall.y, rect)),
        ...wallTilesForRect(rect, tool.selectedAsset)
      ]
    });
  }

  return map;
}

function createEditorZone(map: OfficeMap, tool: MapEditorTool, rect: Rect): Zone {
  const config = zoneTypeConfig(tool.selectedZoneType);
  const isBroadcast = tool.selectedZoneType === "meeting" && Boolean(tool.pendingBroadcastFor);
  const count = map.zones.filter((zone) => zone.type === tool.selectedZoneType && !zone.subType).length + 1;
  return {
    id: `editor-zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: isBroadcast ? `${tool.pendingBroadcastName || "Meeting"} Broadcast` : `${config.label} ${count}`,
    kind: config.kind,
    type: config.id,
    subType: isBroadcast ? "broadcast" : undefined,
    parentId: isBroadcast ? tool.pendingBroadcastFor : undefined,
    blocks: config.blocks,
    ...rect
  };
}

function applyZoneErase(map: OfficeMap, tool: MapEditorTool, rect: Rect): OfficeMap {
  const removedIds = new Set(
    map.zones
      .filter((zone) => zoneTypeForPreview(zone) === tool.selectedZoneType && rectsIntersect(zone, rect))
      .map((zone) => zone.id)
  );
  return eraseZonesById(map, removedIds);
}

function eraseZonesById(map: OfficeMap, removedIds: Set<string>): OfficeMap {
  return withRebuiltCollision({
    ...map,
    zones: map.zones.filter((zone) => !removedIds.has(zone.id) && (!zone.parentId || !removedIds.has(zone.parentId)))
  });
}

function createEditorObject(asset: AssetId, rect: Rect): ObjectPlacement {
  const floorLayer = isFloorLayerProp(asset);
  return {
    id: `editor-prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    asset,
    x: rect.x,
    y: rect.y,
    layer: floorLayer ? "floor" : "object",
    solid: floorLayer
      ? undefined
      : {
          x: 0,
          y: Math.max(0, rect.h - 12),
          w: rect.w,
          h: Math.min(12, rect.h)
        }
  };
}

function wallTilesForRect(rect: Rect, asset: AssetId) {
  const walls = [];
  const startX = Math.floor(rect.x / TILE);
  const endX = Math.ceil((rect.x + rect.w) / TILE);
  const startY = Math.floor(rect.y / TILE);
  const endY = Math.ceil((rect.y + rect.h) / TILE);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      walls.push({ x, y, asset });
    }
  }
  return walls;
}

function findObjectAt(map: OfficeMap, x: number, y: number, images: ImageMap) {
  return [...map.objects]
    .sort((a, b) => b.y + images[b.asset].height - (a.y + images[a.asset].height))
    .find((object) => {
      const image = images[object.asset];
      return x >= object.x && x < object.x + image.width && y >= object.y && y < object.y + image.height;
    });
}

function findZoneAtPoint(
  map: OfficeMap,
  x: number,
  y: number,
  zoneFilter: MapEditorTool["selectedZoneType"]
) {
  return [...map.zones]
    .reverse()
    .find(
      (zone) =>
        zoneTypeForPreview(zone) === zoneFilter &&
        x >= zone.x &&
        x < zone.x + zone.w &&
        y >= zone.y &&
        y < zone.y + zone.h
    );
}

function worldToTile(point: { x: number; y: number }, map: OfficeMap): TilePoint | null {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return null;
  return {
    x: Math.max(0, Math.min(Math.ceil(map.width / TILE) - 1, Math.floor(point.x / TILE))),
    y: Math.max(0, Math.min(Math.ceil(map.height / TILE) - 1, Math.floor(point.y / TILE)))
  };
}

function tileRect(start: TilePoint, end: TilePoint): Rect {
  const x1 = Math.min(start.x, end.x);
  const x2 = Math.max(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const y2 = Math.max(start.y, end.y);
  return {
    x: x1 * TILE,
    y: y1 * TILE,
    w: (x2 - x1 + 1) * TILE,
    h: (y2 - y1 + 1) * TILE
  };
}

function assetRectAtTile(tile: TilePoint, image: HTMLImageElement, map: OfficeMap): Rect {
  const anchorX = tile.x * TILE + TILE / 2;
  const anchorY = (tile.y + 1) * TILE;
  return {
    x: Math.round(clamp(anchorX - image.width / 2, 0, map.width - image.width)),
    y: Math.round(clamp(anchorY - image.height, 0, map.height - image.height)),
    w: image.width,
    h: image.height
  };
}

function tileInRect(tileX: number, tileY: number, rect: Rect) {
  const x = tileX * TILE;
  const y = tileY * TILE;
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function zoneColor(type: MapEditorTool["selectedZoneType"], subType?: Zone["subType"]) {
  if (subType === "broadcast") return "#d870e8";
  if (type === "hitbox") return "#ed4245";
  if (type === "meeting") return "#6674d8";
  if (type === "living") return "#49c58f";
  return "#e7b84b";
}

function zoneTypeForPreview(zone: Zone): MapEditorTool["selectedZoneType"] {
  return getZoneType(zone) || "office";
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
  map,
  room,
  local,
  remotes,
  camera,
  size,
  cameraActive,
  mediaVersion,
  tick
}: {
  map: OfficeMap;
  room: Room | null;
  local: PlayerPresence;
  remotes: PlayerPresence[];
  camera: CameraState;
  size: Size;
  cameraActive: boolean;
  mediaVersion: number;
  tick: number;
}) {
  void tick;
  if (!room) return null;

  const mediaAccess = getLocalMediaAccess(local, map);
  const localPublication = publicationFor(room.localParticipant as unknown as ParticipantLike, Track.Source.Camera);
  const bubbles = [
    {
      id: local.identity,
      presence: local,
      publication: cameraActive && mediaAccess.canPublish ? localPublication : undefined,
      muted: true,
      local: true
    },
    ...remotes
      .filter((presence) => getAudibility(local, presence, map).audible)
      .map((presence) => ({
        id: presence.identity,
        presence,
        publication: publicationFor(
          room.remoteParticipants.get(presence.identity) as unknown as ParticipantLike | undefined,
          Track.Source.Camera
        ),
        muted: false,
        local: false
      }))
  ].filter((bubble) => isVisibleVideoPublication(bubble.publication));

  return (
    <div className="video-bubble-layer">
      {bubbles.map((bubble) => {
        const position = worldToScreen(
          bubble.presence.x,
          bubble.presence.y - VIDEO_BUBBLE_ANCHOR_OFFSET,
          camera
        );
        if (
          position.x < -220 ||
          position.y < -220 ||
          position.x > size.width + 220 ||
          position.y > size.height + 220
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
            <div className="video-bubble-name">
              <i className={`video-bubble-status is-${bubble.presence.status}`} />
              <span>{bubble.local ? "You" : bubble.presence.name}</span>
            </div>
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

function isVisibleVideoPublication(publication: PublicationLike | undefined) {
  return Boolean(publication?.track && publication.isMuted !== true);
}

function visibleCameraIdentities(
  room: Room | null,
  local: PlayerPresence,
  remotes: PlayerPresence[],
  cameraActive: boolean,
  map: OfficeMap
) {
  const identities = new Set<string>();
  if (!room) return identities;

  const localPublication = publicationFor(room.localParticipant as unknown as ParticipantLike, Track.Source.Camera);
  if (cameraActive && getLocalMediaAccess(local, map).canPublish && isVisibleVideoPublication(localPublication)) {
    identities.add(local.identity);
  }

  for (const presence of remotes) {
    if (!getAudibility(local, presence, map).audible) continue;
    const publication = publicationFor(
      room.remoteParticipants.get(presence.identity) as unknown as ParticipantLike | undefined,
      Track.Source.Camera
    );
    if (isVisibleVideoPublication(publication)) {
      identities.add(presence.identity);
    }
  }

  return identities;
}

function worldToScreen(x: number, y: number, camera: CameraState) {
  return {
    x: (x - camera.x) * camera.zoom,
    y: (y - camera.y) * camera.zoom
  };
}
