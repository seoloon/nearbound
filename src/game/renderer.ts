import type { ImageMap } from "./assets";
import type { OfficeMap } from "./map";
import { TILE } from "./map";
import { drawAvatarSprite } from "../avatar";
import type { PlayerPresence } from "../types";

const NAME_FONT = "7px 'Trebuchet MS', Arial, sans-serif";

export interface RenderOptions {
  local: PlayerPresence;
  remotes: PlayerPresence[];
  now: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  videoIdentities?: Set<string>;
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  map: OfficeMap,
  images: ImageMap,
  options: RenderOptions
) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(-Math.floor(options.cameraX), -Math.floor(options.cameraY));

  drawFloors(ctx, map, images);
  drawZones(ctx, map);
  drawFloorObjects(ctx, map, images);
  drawWalls(ctx, map, images);

  const drawables = [
    ...map.objects
      .filter((object) => object.layer !== "floor")
      .map((object) => ({
        kind: "object" as const,
        y: object.y + images[object.asset].height,
        object
      })),
    { kind: "player" as const, y: options.local.y, player: options.local, local: true },
    ...options.remotes.map((player) => ({ kind: "player" as const, y: player.y, player, local: false }))
  ].sort((a, b) => a.y - b.y);

  for (const item of drawables) {
    if (item.kind === "object") {
      const image = images[item.object.asset];
      ctx.drawImage(image, Math.round(item.object.x), Math.round(item.object.y));
    } else {
      drawPlayer(
        ctx,
        item.player,
        options.now,
        item.local,
        !(options.videoIdentities?.has(item.player.identity) ?? false)
      );
    }
  }

  ctx.restore();
}

function drawFloorObjects(ctx: CanvasRenderingContext2D, map: OfficeMap, images: ImageMap) {
  for (const object of map.objects) {
    if (object.layer !== "floor") continue;
    const image = images[object.asset];
    ctx.drawImage(image, Math.round(object.x), Math.round(object.y));
  }
}

function drawFloors(ctx: CanvasRenderingContext2D, map: OfficeMap, images: ImageMap) {
  for (let y = 0; y < map.height; y += TILE) {
    for (let x = 0; x < map.width; x += TILE) {
      const area = floorAreaAt(map, x, y);
      const image = images[area?.asset || "floor_wood"];
      ctx.drawImage(image, x, y);
    }
  }
}

function floorAreaAt(map: OfficeMap, x: number, y: number) {
  for (let index = map.floorAreas.length - 1; index >= 0; index -= 1) {
    const area = map.floorAreas[index];
    if (x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h) {
      return area;
    }
  }
  return undefined;
}

function drawZones(ctx: CanvasRenderingContext2D, map: OfficeMap) {
  for (const zone of map.zones) {
    if (zone.kind === "open") continue;
    ctx.save();
    ctx.globalAlpha = zone.kind === "private" ? 0.2 : 0.12;
    ctx.fillStyle = zone.kind === "private" ? "#4356a6" : "#2f9667";
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.restore();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, map: OfficeMap, images: ImageMap) {
  for (const wall of map.walls) {
    ctx.drawImage(images[wall.asset], wall.x * TILE, wall.y * TILE);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerPresence,
  now: number,
  isLocal: boolean,
  showNameTag: boolean
) {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const bob = player.moving ? Math.floor(Math.sin(now / 90) * 1) : 0;
  const top = y - 24 + bob;

  ctx.save();
  ctx.globalAlpha = isLocal ? 1 : Math.max(0.45, 1 - (Date.now() - player.lastSeen) / 8000);

  drawAvatarSprite(ctx, player.avatar, {
    x,
    y,
    direction: player.direction,
    moving: player.moving,
    now
  });
  if (showNameTag) {
    drawNameTag(ctx, isLocal ? "You" : player.name, player.status, x, top - 13);
  }
  ctx.restore();
}

function drawNameTag(ctx: CanvasRenderingContext2D, name: string, status: PlayerPresence["status"], x: number, y: number) {
  const text = name.slice(0, 14);
  ctx.font = NAME_FONT;
  ctx.textBaseline = "middle";
  const width = Math.ceil(ctx.measureText(text).width) + 17;
  const height = 14;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  ctx.save();
  ctx.fillStyle = "rgba(19, 21, 24, 0.88)";
  nameTagBubblePath(ctx, left, top, width, height, 7, x);
  ctx.fill();
  ctx.fillStyle = statusColor(status);
  ctx.beginPath();
  ctx.arc(left + 8, top + height / 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4f0e8";
  ctx.fillText(text, left + 14, top + height / 2 + 0.5);
  ctx.restore();
}

function nameTagBubblePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  tailX: number
) {
  const tailHalf = 5;
  const tailHeight = 6;
  const tailLeft = Math.max(x + r + 1, Math.min(x + w - r - tailHalf * 2 - 1, tailX - tailHalf));
  const tailRight = tailLeft + tailHalf * 2;
  const tailTip = tailLeft + tailHalf;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(tailRight, y + h);
  ctx.lineTo(tailTip, y + h + tailHeight);
  ctx.lineTo(tailLeft, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function statusColor(status: PlayerPresence["status"]) {
  if (status === "dnd") return "#ed4245";
  if (status === "inactive") return "#faa61a";
  return "#23a55a";
}
