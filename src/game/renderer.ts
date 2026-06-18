import type { ImageMap } from "./assets";
import type { OfficeMap } from "./map";
import { TILE } from "./map";
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
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  map: OfficeMap,
  images: ImageMap,
  options: RenderOptions
) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, options.viewportWidth, options.viewportHeight);
  ctx.save();
  ctx.translate(-Math.floor(options.cameraX), -Math.floor(options.cameraY));

  drawFloors(ctx, map, images);
  drawZones(ctx, map);
  drawWalls(ctx, map, images);

  const drawables = [
    ...map.objects.map((object) => ({
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
      drawPlayer(ctx, item.player, options.now, item.local);
    }
  }

  ctx.restore();
}

function drawFloors(ctx: CanvasRenderingContext2D, map: OfficeMap, images: ImageMap) {
  for (let y = 0; y < map.height; y += TILE) {
    for (let x = 0; x < map.width; x += TILE) {
      const area = map.floorAreas.find(
        (zone) => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h
      );
      const image = images[area?.asset || "floor_wood"];
      ctx.drawImage(image, x, y);
    }
  }
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
  isLocal: boolean
) {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const bob = player.moving ? Math.floor(Math.sin(now / 90) * 1) : 0;
  const top = y - 24 + bob;
  const left = x - 8;
  const color = player.color || "#2fbf71";

  ctx.save();
  ctx.globalAlpha = isLocal ? 1 : Math.max(0.45, 1 - (Date.now() - player.lastSeen) / 8000);

  ctx.fillStyle = "rgba(18, 22, 24, 0.36)";
  ctx.fillRect(x - 7, y - 3, 14, 4);

  ctx.fillStyle = "#1d2428";
  ctx.fillRect(left + 3, top + 6, 10, 12);
  ctx.fillStyle = color;
  ctx.fillRect(left + 4, top + 8, 8, 8);
  ctx.fillStyle = shade(color, -24);
  ctx.fillRect(left + 3, top + 12, 2, 5);
  ctx.fillRect(left + 11, top + 12, 2, 5);

  ctx.fillStyle = "#f2c98c";
  ctx.fillRect(left + 4, top + 2, 8, 7);
  ctx.fillStyle = "#4a2a1a";
  ctx.fillRect(left + 3, top + 1, 10, 3);

  ctx.fillStyle = "#263238";
  if (player.direction === "left") {
    ctx.fillRect(left + 4, top + 5, 1, 1);
  } else if (player.direction === "right") {
    ctx.fillRect(left + 11, top + 5, 1, 1);
  } else if (player.direction === "up") {
    ctx.fillRect(left + 4, top + 2, 8, 2);
  } else {
    ctx.fillRect(left + 5, top + 5, 1, 1);
    ctx.fillRect(left + 10, top + 5, 1, 1);
  }

  ctx.fillStyle = "#20272b";
  const step = player.moving ? Math.sign(Math.sin(now / 90)) : 0;
  ctx.fillRect(left + 4 + step, top + 18, 3, 4);
  ctx.fillRect(left + 9 - step, top + 18, 3, 4);

  drawNameTag(ctx, isLocal ? "You" : player.name, player.status, x, top - 13);
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
  roundRect(ctx, left, top, width, height, 7);
  ctx.fill();
  ctx.fillStyle = statusColor(status);
  ctx.beginPath();
  ctx.arc(left + 8, top + height / 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4f0e8";
  ctx.fillText(text, left + 14, top + height / 2 + 0.5);
  ctx.fillStyle = "rgba(19, 21, 24, 0.88)";
  ctx.beginPath();
  ctx.moveTo(x - 4, top + height - 1);
  ctx.lineTo(x + 4, top + height - 1);
  ctx.lineTo(x, top + height + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
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

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const num = Number.parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}
