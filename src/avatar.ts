import type { AvatarDNA, PixelVariant } from "./vendor/pixel-avatar-lib/types";
import { characterParts } from "./vendor/pixel-avatar-lib/data/character-parts";
import { formatDNA, generateRandomDNA, parseDNA } from "./vendor/pixel-avatar-lib/utils/dna";
import type { AvatarPartKey, AvatarStyle, Direction } from "./types";

const GRID_SIZE = 24;
const LIB_OFFSET_X = -4;
const LIB_OFFSET_Y = 0;
const DEFAULT_DNA = "0-1-0-0-0-0";
const DEFAULT_BACKGROUND = "#2b3034";
const DRAW_ORDER: AvatarPartKey[] = ["neck", "clothing", "hands", "hair", "face", "item"];
const BACK_DRAW_ORDER: AvatarPartKey[] = ["neck", "clothing", "hands", "hair", "item"];
const SKIN_TONES = ["#ffc8a0", "#e5a36f", "#c47a4f", "#8d5a42", "#f0b6a4"];
const LIB_SKIN_COLORS = new Set(["#ffc8a0", "#ffcca0"]);

export const AVATAR_PART_LABELS: Record<AvatarPartKey, string> = {
  hair: "Hair",
  face: "Face",
  neck: "Neck",
  clothing: "Clothing",
  hands: "Hands",
  item: "Item"
};

export const AVATAR_PART_OPTIONS: Record<AvatarPartKey, Array<{ id: number; label: string }>> = {
  hair: [
    { id: 0, label: "Short brown" },
    { id: 1, label: "Long blond" },
    { id: 2, label: "Spiky" },
    { id: 3, label: "Headband" },
    { id: 4, label: "Mohawk" },
    { id: 5, label: "Curly" },
    { id: 6, label: "Ponytail" },
    { id: 7, label: "Afro" },
    { id: 8, label: "Dreadlocks" },
    { id: 9, label: "Buzz cut" }
  ],
  face: [
    { id: 0, label: "Classic" },
    { id: 1, label: "Smile" },
    { id: 2, label: "Surprised" },
    { id: 3, label: "Angry" },
    { id: 4, label: "Sunglasses" },
    { id: 5, label: "Wink" },
    { id: 6, label: "Sleepy" },
    { id: 7, label: "Crying" },
    { id: 8, label: "Laughing" },
    { id: 9, label: "Masked" }
  ],
  neck: [
    { id: 0, label: "Simple" },
    { id: 1, label: "Collar" },
    { id: 2, label: "Bowtie" },
    { id: 3, label: "Necklace" },
    { id: 4, label: "Scarf" },
    { id: 5, label: "Chain" },
    { id: 6, label: "Tattoo" },
    { id: 7, label: "Bandana" },
    { id: 8, label: "Choker" },
    { id: 9, label: "High collar" }
  ],
  clothing: [
    { id: 0, label: "T-shirt" },
    { id: 1, label: "Hoodie" },
    { id: 2, label: "Suit" },
    { id: 3, label: "Tank top" },
    { id: 4, label: "Armor" },
    { id: 5, label: "Vest" },
    { id: 6, label: "Jacket" },
    { id: 7, label: "Dress shirt" },
    { id: 8, label: "Sweater" },
    { id: 9, label: "Polo" }
  ],
  hands: [
    { id: 0, label: "Simple" },
    { id: 1, label: "Gloves" },
    { id: 2, label: "Robot" },
    { id: 3, label: "Claws" },
    { id: 4, label: "Paws" },
    { id: 5, label: "Fingerless" },
    { id: 6, label: "Mittens" },
    { id: 7, label: "Bandaged" },
    { id: 8, label: "Cybernetic" },
    { id: 9, label: "Gauntlets" }
  ],
  item: [
    { id: 0, label: "Sword" },
    { id: 1, label: "Shield" },
    { id: 2, label: "Staff" },
    { id: 3, label: "Potion" },
    { id: 4, label: "Bow" },
    { id: 5, label: "Axe" },
    { id: 6, label: "Hammer" },
    { id: 7, label: "Spear" },
    { id: 8, label: "Orb" },
    { id: 9, label: "Book" }
  ]
};

export const AVATAR_PART_KEYS = Object.keys(AVATAR_PART_LABELS) as AvatarPartKey[];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = normalizeAvatarStyle({
  dna: DEFAULT_DNA,
  backgroundColor: DEFAULT_BACKGROUND
});

export function normalizeAvatarStyle(value: unknown, fallbackColor?: string): AvatarStyle {
  const input = isObject(value) ? value : {};
  const dna = normalizeDna(input.dna) || legacyAvatarToDna(input) || DEFAULT_DNA;
  const accent = clothingAccent(dna);

  return {
    dna,
    topColor: color(input.topColor, color(fallbackColor, accent)),
    backgroundColor: color(input.backgroundColor, DEFAULT_BACKGROUND)
  };
}

export function avatarAccent(avatar: AvatarStyle | undefined) {
  return normalizeAvatarStyle(avatar).topColor;
}

export function randomAvatarStyle() {
  return normalizeAvatarStyle({ dna: formatDNA(generateRandomDNA()) });
}

export function avatarDnaParts(avatarInput: AvatarStyle | undefined): AvatarDNA {
  return parseAvatarDna(normalizeAvatarStyle(avatarInput).dna);
}

export function updateAvatarPart(
  avatarInput: AvatarStyle | undefined,
  key: AvatarPartKey,
  value: number
): AvatarStyle {
  const avatar = normalizeAvatarStyle(avatarInput);
  const dna = avatarDnaParts(avatar);
  const next: AvatarDNA = {
    ...dna,
    [key]: normalizePartValue(value)
  };
  return normalizeAvatarStyle({ ...avatar, dna: formatDNA(next) });
}

export function updateAvatarDna(avatarInput: AvatarStyle | undefined, dna: string): AvatarStyle {
  const avatar = normalizeAvatarStyle(avatarInput);
  return normalizeAvatarStyle({ ...avatar, dna });
}

export function isAvatarDna(value: string) {
  return Boolean(normalizeDna(value));
}

export function drawAvatarSprite(
  ctx: CanvasRenderingContext2D,
  avatarInput: AvatarStyle | undefined,
  options: {
    x: number;
    y: number;
    direction: Direction;
    moving?: boolean;
    now?: number;
    shadow?: boolean;
  }
) {
  const avatar = normalizeAvatarStyle(avatarInput);
  const dna = parseAvatarDna(avatar.dna);
  const x = Math.round(options.x);
  const y = Math.round(options.y);
  const bob = options.moving ? Math.floor(Math.sin((options.now || 0) / 90) * 1) : 0;
  const step = options.moving ? Math.sign(Math.sin((options.now || 0) / 90)) : 0;
  const direction = options.direction || "down";
  const left = x - GRID_SIZE / 2;
  const top = y - 24 + bob;
  const skin = skinTone(dna);

  ctx.save();
  if (options.shadow !== false) {
    fillEllipse(ctx, x, y - 1, 8.2, 2.2, "rgba(18, 22, 24, 0.36)");
  }

  if (direction === "left") {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  drawBaseBody(ctx, avatar, dna, left, top, skin, direction);
  drawGeneratedLegs(ctx, avatar, dna, left, top, step);
  drawAvatarPixels(ctx, dna, left, top, skin, direction === "up" ? BACK_DRAW_ORDER : DRAW_ORDER);
  ctx.restore();
}

function drawAvatarPixels(
  ctx: CanvasRenderingContext2D,
  dna: AvatarDNA,
  left: number,
  top: number,
  skin: string,
  drawOrder: AvatarPartKey[]
) {
  for (const partKey of drawOrder) {
    const partData = characterParts[partKey];
    const partIndex = dna[partKey];
    if (partIndex < 0 || partIndex >= partData.variants.length) continue;
    drawVariant(ctx, partData.variants[partIndex], left, top, skin);
  }
}

function drawVariant(ctx: CanvasRenderingContext2D, variant: PixelVariant, left: number, top: number, skin: string) {
  for (const [x, y, fillStyle] of variant) {
    const adjustedX = x + LIB_OFFSET_X;
    const adjustedY = y + LIB_OFFSET_Y;
    if (adjustedX < 0 || adjustedX >= GRID_SIZE || adjustedY < 0 || adjustedY >= GRID_SIZE) continue;
    ctx.fillStyle = normalizePartColor(fillStyle, skin);
    ctx.fillRect(left + adjustedX, top + adjustedY, 1, 1);
  }
}

function drawBaseBody(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarStyle,
  dna: AvatarDNA,
  left: number,
  top: number,
  skin: string,
  direction: Direction
) {
  const skinShade = shade(skin, -18);
  const skinLight = shade(skin, 18);
  const undershirt = shade(avatar.topColor, -42);

  if (direction === "up") {
    fillPixelRect(ctx, left, top, 6, 8, 2, 3, skinShade);
    fillPixelRect(ctx, left, top, 16, 8, 2, 3, skinShade);
    fillPixelRect(ctx, left, top, 8, 5, 8, 1, skinLight);
    fillPixelRect(ctx, left, top, 7, 6, 10, 5, skin);
    fillPixelRect(ctx, left, top, 8, 11, 8, 2, skin);
    fillPixelRect(ctx, left, top, 10, 13, 4, 2, skinShade);
    fillPixelRect(ctx, left, top, 7, 14, 10, 4, undershirt);
    fillPixelRect(ctx, left, top, 5, 15, 3, 4, skinShade);
    fillPixelRect(ctx, left, top, 16, 15, 3, 4, skinShade);
    return;
  }

  fillPixelRect(ctx, left, top, 6, 8, 2, 3, skinShade);
  fillPixelRect(ctx, left, top, 16, 8, 2, 3, skinShade);
  fillPixelRect(ctx, left, top, 8, 5, 8, 1, skinLight);
  fillPixelRect(ctx, left, top, 7, 6, 10, 6, skin);
  fillPixelRect(ctx, left, top, 8, 12, 8, 2, skin);
  fillPixelRect(ctx, left, top, 10, 13, 4, 2, skinShade);
  fillPixelRect(ctx, left, top, 9, 6, 3, 1, skinLight);
  fillPixelRect(ctx, left, top, 7, 14, 10, 4, undershirt);

  const sleeve = shade(avatar.topColor, dna.clothing === 4 ? -18 : -30);
  fillPixelRect(ctx, left, top, 5, 15, 3, 3, sleeve);
  fillPixelRect(ctx, left, top, 16, 15, 3, 3, sleeve);
  fillPixelRect(ctx, left, top, 5, 18, 2, 2, skin);
  fillPixelRect(ctx, left, top, 17, 18, 2, 2, skin);
}

function drawGeneratedLegs(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarStyle,
  dna: AvatarDNA,
  left: number,
  top: number,
  step: number
) {
  const pants = shade(avatar.topColor, dna.clothing === 7 ? -90 : -54);
  const seam = shade(pants, 24);
  const shoe = dna.clothing % 2 === 0 ? "#f4f0e8" : "#20272b";
  const leftStep = step > 0 ? 1 : 0;
  const rightStep = step < 0 ? 1 : 0;

  fillPixelRect(ctx, left, top, 9, 18, 3, 5 + leftStep, pants);
  fillPixelRect(ctx, left, top, 13, 18, 3, 5 + rightStep, pants);
  fillPixelRect(ctx, left, top, 10, 19, 1, 3, seam);
  fillPixelRect(ctx, left, top, 14, 19, 1, 3, seam);
  fillPixelRect(ctx, left, top, 8, 22 + leftStep, 5, 2, shoe);
  fillPixelRect(ctx, left, top, 13, 22 + rightStep, 5, 2, shoe);
  if (shoe !== "#20272b") {
    fillPixelRect(ctx, left, top, 9, 23 + leftStep, 3, 1, "#20272b");
    fillPixelRect(ctx, left, top, 14, 23 + rightStep, 3, 1, "#20272b");
  }
}

function fillPixelRect(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string
) {
  ctx.fillStyle = fillStyle;
  ctx.fillRect(left + x, top + y, width, height);
}

function parseAvatarDna(value: string): AvatarDNA {
  try {
    return parseDNA(value);
  } catch {
    return parseDNA(DEFAULT_DNA);
  }
}

function normalizeDna(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^[0-9](?:-[0-9]){5}$/.test(trimmed)) return undefined;
  try {
    return formatDNA(parseDNA(trimmed));
  } catch {
    return undefined;
  }
}

function normalizePartValue(value: number) {
  return Number.isInteger(value) ? Math.max(0, Math.min(9, value)) : 0;
}

function legacyAvatarToDna(input: Record<string, unknown>) {
  if (!("gender" in input || "hair" in input || "top" in input || "accessory" in input)) return undefined;
  const hair = legacyIndex(input.hair, { short: 0, long: 1, bob: 6, curly: 5 }, 0);
  const face = legacyIndex(input.accessory, { none: 1, glasses: 4, cap: 1, headset: 4 }, 1);
  const neck = legacyIndex(input.accessory, { none: 0, glasses: 0, cap: 7, headset: 5 }, 0);
  const clothing = legacyIndex(input.top, { tee: 0, hoodie: 1, jacket: 6 }, 0);
  const hands = legacyIndex(input.accessory, { none: 0, glasses: 0, cap: 0, headset: 8 }, 0);
  const item = input.gender === "female" ? 3 : 0;
  return formatDNA({ hair, face, neck, clothing, hands, item });
}

function legacyIndex(value: unknown, map: Record<string, number>, fallback: number) {
  return typeof value === "string" && value in map ? map[value] : fallback;
}

function clothingAccent(dna: string) {
  const parsed = parseAvatarDna(dna);
  return firstColor(characterParts.clothing.variants[parsed.clothing]) || "#2fbf71";
}

function skinTone(dna: AvatarDNA) {
  return SKIN_TONES[(dna.face + dna.neck) % SKIN_TONES.length];
}

function normalizePartColor(fillStyle: string, skin: string) {
  return LIB_SKIN_COLORS.has(fillStyle.toLowerCase()) ? skin : fillStyle;
}

function firstColor(variant: PixelVariant | undefined) {
  return variant?.find((pixel) => isHex(pixel[2]))?.[2];
}

function fillEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  fillStyle: string
) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}

function color(value: unknown, fallback: string) {
  return isHex(value) ? value : fallback;
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const num = Number.parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}
