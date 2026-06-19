import type { AssetId } from "./assets";
import type { PlayerPresence } from "../types";

export const TILE = 16;
export const HEARING_RADIUS_TILES = 7;
export const HEARING_RADIUS_PX = HEARING_RADIUS_TILES * TILE;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallTile {
  x: number;
  y: number;
  asset: AssetId;
}

export interface FloorArea extends Rect {
  asset: AssetId;
  editorPlaced?: boolean;
}

export interface ObjectPlacement {
  id: string;
  asset: AssetId;
  x: number;
  y: number;
  layer?: "floor" | "object";
  solid?: Rect;
  interactive?: {
    label: string;
    hint: string;
  };
}

export interface Zone extends Rect {
  id: string;
  name: string;
  kind: "open" | "private" | "social";
  type?: "office" | "living" | "meeting" | "hitbox";
  blocks?: boolean;
}

export interface OfficeMap {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  floorAreas: FloorArea[];
  walls: WallTile[];
  objects: ObjectPlacement[];
  zones: Zone[];
  collision: boolean[][];
}

function markTiles(collision: boolean[][], rect: Rect) {
  const sx = Math.max(0, Math.floor(rect.x / TILE));
  const sy = Math.max(0, Math.floor(rect.y / TILE));
  const ex = Math.min(collision[0].length - 1, Math.ceil((rect.x + rect.w) / TILE) - 1);
  const ey = Math.min(collision.length - 1, Math.ceil((rect.y + rect.h) / TILE) - 1);

  for (let y = sy; y <= ey; y += 1) {
    for (let x = sx; x <= ex; x += 1) {
      collision[y][x] = true;
    }
  }
}

function addWall(
  walls: WallTile[],
  collision: boolean[][],
  x: number,
  y: number,
  asset: AssetId
) {
  walls.push({ x, y, asset });
  collision[y][x] = true;
}

export function rebuildCollision(map: Pick<OfficeMap, "width" | "height" | "walls" | "objects" | "zones">) {
  const tileWidth = Math.ceil(map.width / TILE);
  const tileHeight = Math.ceil(map.height / TILE);
  const collision = Array.from({ length: tileHeight }, () =>
    Array.from({ length: tileWidth }, () => false)
  );

  for (const wall of map.walls) {
    if (wall.y >= 0 && wall.y < tileHeight && wall.x >= 0 && wall.x < tileWidth) {
      collision[wall.y][wall.x] = true;
    }
  }

  for (const object of map.objects) {
    if (!object.solid) continue;
    markTiles(collision, {
      x: object.x + object.solid.x,
      y: object.y + object.solid.y,
      w: object.solid.w,
      h: object.solid.h
    });
  }

  for (const zone of map.zones) {
    if (zone.blocks) markTiles(collision, zone);
  }

  return collision;
}

export function withRebuiltCollision(map: OfficeMap): OfficeMap {
  return {
    ...map,
    collision: rebuildCollision(map)
  };
}

export function createOfficeMap(): OfficeMap {
  const tileWidth = 64;
  const tileHeight = 40;
  const collision = Array.from({ length: tileHeight }, () =>
    Array.from({ length: tileWidth }, () => false)
  );
  const walls: WallTile[] = [];

  for (let x = 0; x < tileWidth; x += 1) {
    addWall(walls, collision, x, 0, "wall_brick");
    if (x < 29 || x > 34) addWall(walls, collision, x, tileHeight - 1, "wall_brick");
  }
  for (let y = 1; y < tileHeight - 1; y += 1) {
    addWall(walls, collision, 0, y, "wall_brick");
    addWall(walls, collision, tileWidth - 1, y, "wall_brick");
  }

  return {
    width: tileWidth * TILE,
    height: tileHeight * TILE,
    spawn: { x: 32 * TILE, y: 34 * TILE },
    floorAreas: [],
    walls,
    objects: [],
    zones: [],
    collision
  };
}

export function getZoneAt(map: OfficeMap, x: number, y: number): Zone | undefined {
  return map.zones.find(
    (zone) => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h
  );
}

export function isBlocked(map: OfficeMap, x: number, y: number): boolean {
  if (x < TILE || y < TILE || x >= map.width - TILE || y >= map.height - TILE) return true;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return Boolean(map.collision[ty]?.[tx]);
}

export function getAudibility(local: PlayerPresence, remote: PlayerPresence, map: OfficeMap) {
  const localZone = getZoneAt(map, local.x, local.y);
  const remoteZone = getZoneAt(map, remote.x, remote.y);
  const localPrivate = localZone?.kind === "private";
  const remotePrivate = remoteZone?.kind === "private";
  const samePrivate = localPrivate && remotePrivate && localZone?.id === remoteZone?.id;
  const distancePx = Math.hypot(local.x - remote.x, local.y - remote.y);

  if ((localPrivate || remotePrivate) && !samePrivate) {
    return {
      audible: false,
      distancePx,
      distanceTiles: distancePx / TILE,
      gain: 0,
      label: localPrivate ? localZone?.name : remoteZone?.name
    };
  }

  if (samePrivate) {
    return {
      audible: true,
      distancePx,
      distanceTiles: distancePx / TILE,
      gain: 1,
      label: localZone?.name
    };
  }

  const audible = distancePx <= HEARING_RADIUS_PX;
  const distanceTiles = distancePx / TILE;
  const falloffStart = 3 * TILE;
  const falloffRange = HEARING_RADIUS_PX - falloffStart;
  const falloff = Math.max(0, Math.min(1, (distancePx - falloffStart) / falloffRange));
  const gain = audible ? Math.max(0.35, 1 - falloff * 0.65) : 0;

  return {
    audible,
    distancePx,
    distanceTiles,
    gain,
    label: remoteZone?.name || localZone?.name
  };
}
