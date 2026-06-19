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

function tilesRect(x: number, y: number, w: number, h: number): Rect {
  return { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE };
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

function addObject(
  objects: ObjectPlacement[],
  collision: boolean[][],
  placement: ObjectPlacement
) {
  objects.push(placement);
  if (placement.solid) {
    markTiles(collision, {
      x: placement.x + placement.solid.x,
      y: placement.y + placement.solid.y,
      w: placement.solid.w,
      h: placement.solid.h
    });
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

function addRoomWalls(
  walls: WallTile[],
  collision: boolean[][],
  rect: { x: number; y: number; w: number; h: number },
  asset: AssetId,
  door: { side: "bottom" | "top"; start: number; length: number }
) {
  for (let x = rect.x; x < rect.x + rect.w; x += 1) {
    const inDoor =
      door.side === "top" && x >= rect.x + door.start && x < rect.x + door.start + door.length;
    if (!inDoor) addWall(walls, collision, x, rect.y, asset);
  }

  for (let x = rect.x; x < rect.x + rect.w; x += 1) {
    const inDoor =
      door.side === "bottom" &&
      x >= rect.x + door.start &&
      x < rect.x + door.start + door.length;
    if (!inDoor) addWall(walls, collision, x, rect.y + rect.h - 1, asset);
  }

  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    addWall(walls, collision, rect.x, y, asset);
    addWall(walls, collision, rect.x + rect.w - 1, y, asset);
  }
}

export function createOfficeMap(): OfficeMap {
  const tileWidth = 64;
  const tileHeight = 40;
  const collision = Array.from({ length: tileHeight }, () =>
    Array.from({ length: tileWidth }, () => false)
  );
  const walls: WallTile[] = [];
  const objects: ObjectPlacement[] = [];

  for (let x = 0; x < tileWidth; x += 1) {
    addWall(walls, collision, x, 0, "wall_brick");
    if (x < 29 || x > 34) addWall(walls, collision, x, tileHeight - 1, "wall_brick");
  }
  for (let y = 1; y < tileHeight - 1; y += 1) {
    addWall(walls, collision, 0, y, "wall_brick");
    addWall(walls, collision, tileWidth - 1, y, "wall_brick");
  }

  addRoomWalls(walls, collision, { x: 4, y: 4, w: 15, h: 10 }, "wall_tan", {
    side: "bottom",
    start: 6,
    length: 3
  });
  addRoomWalls(walls, collision, { x: 40, y: 4, w: 19, h: 11 }, "wall_stone", {
    side: "bottom",
    start: 8,
    length: 3
  });
  addRoomWalls(walls, collision, { x: 4, y: 25, w: 15, h: 10 }, "wall_tan", {
    side: "top",
    start: 6,
    length: 3
  });

  const solidFull = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });
  const solidBase = (w: number, h: number): Rect => ({ x: 0, y: Math.max(0, h - 12), w, h: 12 });

  addObject(objects, collision, {
    id: "alpha-rug",
    asset: "rug_blue",
    x: 45 * TILE,
    y: 10 * TILE,
    layer: "floor"
  });
  addObject(objects, collision, {
    id: "alpha-screen",
    asset: "presentation_screen",
    x: 43 * TILE,
    y: 5 * TILE,
    solid: solidBase(32, 30),
    interactive: {
      label: "Alpha screen",
      hint: "A good room for LiveKit screen sharing."
    }
  });
  addObject(objects, collision, {
    id: "alpha-table",
    asset: "conference_table",
    x: 47 * TILE,
    y: 9 * TILE,
    solid: solidBase(53, 37)
  });
  addObject(objects, collision, {
    id: "alpha-chair-1",
    asset: "chair_red",
    x: 45 * TILE,
    y: 9 * TILE,
    solid: solidBase(23, 23)
  });
  addObject(objects, collision, {
    id: "alpha-chair-2",
    asset: "chair_blue",
    x: 53 * TILE,
    y: 9 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "alpha-clock",
    asset: "wall_clock",
    x: 56 * TILE,
    y: 5 * TILE,
    solid: solidBase(23, 22)
  });
  addObject(objects, collision, {
    id: "alpha-console",
    asset: "sci_fi_console",
    x: 50 * TILE,
    y: 5 * TILE,
    solid: solidBase(40, 32)
  });
  addObject(objects, collision, {
    id: "alpha-server",
    asset: "server_rack",
    x: 41 * TILE,
    y: 11 * TILE,
    solid: solidFull(22, 28)
  });
  addObject(objects, collision, {
    id: "alpha-sci-fi-desk",
    asset: "sci_fi_desk",
    x: 54 * TILE,
    y: 11 * TILE,
    solid: solidBase(38, 23)
  });
  addObject(objects, collision, {
    id: "alpha-vital-monitor",
    asset: "vital_monitor",
    x: 55 * TILE,
    y: 9 * TILE,
    solid: solidBase(22, 17)
  });

  addObject(objects, collision, {
    id: "focus-rug",
    asset: "rug_green",
    x: 9 * TILE,
    y: 10 * TILE,
    layer: "floor"
  });
  addObject(objects, collision, {
    id: "focus-bookcase",
    asset: "bookcase_brown",
    x: 6 * TILE,
    y: 5 * TILE,
    solid: solidFull(26, 56)
  });
  addObject(objects, collision, {
    id: "focus-desk",
    asset: "desk_simple",
    x: 11 * TILE,
    y: 8 * TILE,
    solid: solidBase(53, 37)
  });
  addObject(objects, collision, {
    id: "focus-chair",
    asset: "office_chair",
    x: 12 * TILE,
    y: 10 * TILE,
    solid: solidBase(18, 22)
  });
  addObject(objects, collision, {
    id: "focus-plant",
    asset: "plant_arch",
    x: 15 * TILE,
    y: 6 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "focus-microscope",
    asset: "microscope",
    x: 14 * TILE,
    y: 8 * TILE,
    solid: solidBase(22, 30)
  });
  addObject(objects, collision, {
    id: "focus-window",
    asset: "window_blue",
    x: 16 * TILE,
    y: 5 * TILE,
    solid: solidBase(27, 28)
  });
  addObject(objects, collision, {
    id: "focus-side-table",
    asset: "side_table",
    x: 7 * TILE,
    y: 11 * TILE,
    solid: solidBase(24, 24)
  });

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = (23 + col * 5) * TILE;
      const y = (16 + row * 5) * TILE;
      addObject(objects, collision, {
        id: `desk-${row}-${col}`,
        asset: col % 2 === 0 ? "writing_desk" : "meeting_table",
        x,
        y,
        solid: solidBase(24, 24)
      });
      addObject(objects, collision, {
        id: `chair-${row}-${col}`,
        asset: "office_chair",
        x: x + 7,
        y: y + 24,
        solid: solidBase(18, 22)
      });
    }
  }

  addObject(objects, collision, {
    id: "open-bookcase",
    asset: "bookcase_small",
    x: 22 * TILE,
    y: 8 * TILE,
    solid: solidFull(24, 24)
  });
  addObject(objects, collision, {
    id: "open-cabinet",
    asset: "cabinet_big",
    x: 30 * TILE,
    y: 7 * TILE,
    solid: solidBase(26, 26)
  });
  addObject(objects, collision, {
    id: "open-water",
    asset: "water_feature",
    x: 35 * TILE,
    y: 7 * TILE,
    solid: solidBase(29, 16)
  });
  addObject(objects, collision, {
    id: "open-camera",
    asset: "portable_camera",
    x: 37 * TILE,
    y: 16 * TILE,
    solid: solidBase(22, 18)
  });
  addObject(objects, collision, {
    id: "open-loot",
    asset: "loot_chest",
    x: 21 * TILE,
    y: 29 * TILE,
    solid: solidBase(31, 20)
  });

  addObject(objects, collision, {
    id: "kitchen-rug",
    asset: "rug_white",
    x: 50 * TILE,
    y: 23 * TILE,
    layer: "floor"
  });
  addObject(objects, collision, {
    id: "kitchen-fridge",
    asset: "fridge",
    x: 48 * TILE,
    y: 20 * TILE,
    solid: solidFull(22, 28)
  });
  addObject(objects, collision, {
    id: "kitchen-counter",
    asset: "kitchen_counter",
    x: 51 * TILE,
    y: 21 * TILE,
    solid: solidBase(46, 22)
  });
  addObject(objects, collision, {
    id: "coffee-machine",
    asset: "coffee_machine",
    x: 57 * TILE,
    y: 19 * TILE,
    solid: solidBase(22, 21),
    interactive: {
      label: "Coffee machine",
      hint: "A good spot to test proximity conversations."
    }
  });
  addObject(objects, collision, {
    id: "kitchen-flasks",
    asset: "chemistry_flasks",
    x: 53 * TILE,
    y: 23 * TILE,
    solid: solidBase(26, 20)
  });

  addObject(objects, collision, {
    id: "lounge-rug",
    asset: "rug_red",
    x: 46 * TILE,
    y: 32 * TILE,
    layer: "floor"
  });
  addObject(objects, collision, {
    id: "lounge-sofa",
    asset: "cozy_sofa",
    x: 42 * TILE,
    y: 29 * TILE,
    solid: solidBase(61, 32)
  });
  addObject(objects, collision, {
    id: "lounge-table",
    asset: "round_table",
    x: 47 * TILE,
    y: 31 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "lounge-tv",
    asset: "tv_console",
    x: 52 * TILE,
    y: 27 * TILE,
    solid: solidBase(37, 28)
  });
  addObject(objects, collision, {
    id: "lounge-bookcase",
    asset: "bookshelf_lounge",
    x: 58 * TILE,
    y: 28 * TILE,
    solid: solidFull(24, 24)
  });
  addObject(objects, collision, {
    id: "lounge-armchair",
    asset: "armchair_green",
    x: 43 * TILE,
    y: 32 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "lounge-stool",
    asset: "stool_small",
    x: 55 * TILE,
    y: 33 * TILE,
    solid: solidBase(24, 24)
  });

  addObject(objects, collision, {
    id: "lower-rug",
    asset: "rug_blue",
    x: 9 * TILE,
    y: 31 * TILE,
    layer: "floor"
  });
  addObject(objects, collision, {
    id: "lower-couch",
    asset: "couch_red_small",
    x: 7 * TILE,
    y: 29 * TILE,
    solid: solidBase(46, 23)
  });
  addObject(objects, collision, {
    id: "lower-table",
    asset: "coffee_table",
    x: 12 * TILE,
    y: 31 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "lower-fireplace",
    asset: "fireplace",
    x: 5 * TILE,
    y: 26 * TILE,
    solid: solidBase(24, 24)
  });
  addObject(objects, collision, {
    id: "lower-wardrobe",
    asset: "wardrobe_brown",
    x: 15 * TILE,
    y: 26 * TILE,
    solid: solidBase(35, 39)
  });
  addObject(objects, collision, {
    id: "lower-dresser",
    asset: "dresser_brown",
    x: 5 * TILE,
    y: 32 * TILE,
    solid: solidBase(46, 22)
  });
  addObject(objects, collision, {
    id: "lower-chair",
    asset: "chair_wood",
    x: 16 * TILE,
    y: 32 * TILE,
    solid: solidBase(18, 22)
  });

  return {
    width: tileWidth * TILE,
    height: tileHeight * TILE,
    spawn: { x: 32 * TILE, y: 34 * TILE },
    floorAreas: [
      { ...tilesRect(4, 4, 15, 10), asset: "floor_blue" },
      { ...tilesRect(40, 4, 19, 11), asset: "floor_checker" },
      { ...tilesRect(4, 25, 15, 10), asset: "floor_blue" },
      { ...tilesRect(47, 19, 13, 6), asset: "floor_checker" },
      { ...tilesRect(40, 26, 20, 10), asset: "floor_blue" }
    ],
    walls,
    objects,
    zones: [
      { id: "focus", name: "Focus", kind: "private", ...tilesRect(5, 5, 13, 8) },
      { id: "alpha", name: "Alpha Room", kind: "private", ...tilesRect(41, 5, 17, 9) },
      { id: "quiet", name: "Quiet Lounge", kind: "private", ...tilesRect(5, 26, 13, 8) },
      { id: "lounge", name: "Lounge", kind: "social", ...tilesRect(40, 26, 20, 10) },
      { id: "kitchen", name: "Coffee Bar", kind: "social", ...tilesRect(47, 19, 13, 6) }
    ],
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
