import type {
  AvatarAccessory,
  AvatarBottom,
  AvatarGender,
  AvatarHair,
  AvatarShoes,
  AvatarStyle,
  AvatarTop,
  Direction
} from "./types";

export const AVATAR_GENDERS: Array<{ id: AvatarGender; label: string }> = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" }
];

export const AVATAR_HAIR: Array<{ id: AvatarHair; label: string }> = [
  { id: "short", label: "Short" },
  { id: "bob", label: "Bob" },
  { id: "long", label: "Long" },
  { id: "curly", label: "Curly" }
];

export const AVATAR_TOPS: Array<{ id: AvatarTop; label: string }> = [
  { id: "tee", label: "T-shirt" },
  { id: "hoodie", label: "Hoodie" },
  { id: "jacket", label: "Jacket" }
];

export const AVATAR_BOTTOMS: Array<{ id: AvatarBottom; label: string }> = [
  { id: "pants", label: "Pants" },
  { id: "shorts", label: "Shorts" },
  { id: "skirt", label: "Skirt" }
];

export const AVATAR_SHOES: Array<{ id: AvatarShoes; label: string }> = [
  { id: "sneakers", label: "Sneakers" },
  { id: "boots", label: "Boots" },
  { id: "slipons", label: "Slip-ons" }
];

export const AVATAR_ACCESSORIES: Array<{ id: AvatarAccessory; label: string }> = [
  { id: "none", label: "None" },
  { id: "glasses", label: "Glasses" },
  { id: "cap", label: "Cap" },
  { id: "headset", label: "Headset" }
];

export const SKIN_COLORS = ["#f2c98c", "#d99b67", "#b8754b", "#7b4f3a", "#f0b6a4"];
export const HAIR_COLORS = ["#232832", "#4a2a1a", "#8a4a2f", "#c96038", "#e2c15f", "#f1f1ed"];
export const TOP_COLORS = ["#2fbf71", "#3478f6", "#e34f4f", "#f15bb5", "#e7a92f", "#9b5de5", "#f4f0e8", "#242a31"];
export const BOTTOM_COLORS = ["#263238", "#345a93", "#5b6570", "#65412d", "#8b4f8f", "#1f6f62"];
export const SHOE_COLORS = ["#20272b", "#f4f0e8", "#5b6570", "#7a4a33", "#263b67"];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = {
  gender: "male",
  skin: SKIN_COLORS[0],
  hair: "short",
  hairColor: HAIR_COLORS[0],
  top: "tee",
  topColor: TOP_COLORS[0],
  bottom: "pants",
  bottomColor: BOTTOM_COLORS[0],
  shoes: "sneakers",
  shoeColor: SHOE_COLORS[0],
  accessory: "none"
};

export function normalizeAvatarStyle(value: unknown, fallbackColor?: string): AvatarStyle {
  const input = isObject(value) ? value : {};
  const fallbackTop = isHex(fallbackColor) ? fallbackColor : DEFAULT_AVATAR_STYLE.topColor;
  return {
    gender: option(input.gender, AVATAR_GENDERS, DEFAULT_AVATAR_STYLE.gender),
    skin: color(input.skin, DEFAULT_AVATAR_STYLE.skin),
    hair: option(input.hair, AVATAR_HAIR, DEFAULT_AVATAR_STYLE.hair),
    hairColor: color(input.hairColor, DEFAULT_AVATAR_STYLE.hairColor),
    top: option(input.top, AVATAR_TOPS, DEFAULT_AVATAR_STYLE.top),
    topColor: color(input.topColor, fallbackTop),
    bottom: option(input.bottom, AVATAR_BOTTOMS, DEFAULT_AVATAR_STYLE.bottom),
    bottomColor: color(input.bottomColor, DEFAULT_AVATAR_STYLE.bottomColor),
    shoes: option(input.shoes, AVATAR_SHOES, DEFAULT_AVATAR_STYLE.shoes),
    shoeColor: color(input.shoeColor, DEFAULT_AVATAR_STYLE.shoeColor),
    accessory: option(input.accessory, AVATAR_ACCESSORIES, DEFAULT_AVATAR_STYLE.accessory)
  };
}

export function avatarAccent(avatar: AvatarStyle | undefined) {
  return normalizeAvatarStyle(avatar).topColor;
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
  const x = Math.round(options.x);
  const y = Math.round(options.y);
  const bob = options.moving ? Math.floor(Math.sin((options.now || 0) / 90) * 1) : 0;
  const left = x - 8;
  const top = y - 25 + bob;
  const direction = options.direction || "down";
  const step = options.moving ? Math.sign(Math.sin((options.now || 0) / 90)) : 0;

  ctx.save();
  if (options.shadow !== false) {
    fillEllipse(ctx, x, y - 1, 7.3, 2.2, "rgba(18, 22, 24, 0.36)");
  }

  drawHairBack(ctx, avatar, left, top, direction);
  drawBody(ctx, avatar, left, top, direction, step);
  drawHead(ctx, avatar, left, top, direction);
  drawAccessory(ctx, avatar, left, top, direction);
  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarStyle,
  left: number,
  top: number,
  direction: Direction,
  step: number
) {
  const slim = avatar.gender === "female";
  const torsoLeft = left + (slim ? 5 : 4);
  const torsoWidth = slim ? 6 : 8;
  const torsoY = top + 10;

  fillRoundRect(ctx, left + 2, top + 11, 2.8, 7.5, 1.4, avatar.skin);
  fillRoundRect(ctx, left + 11.2, top + 11, 2.8, 7.5, 1.4, avatar.skin);

  const sleeve = shade(avatar.topColor, avatar.top === "jacket" ? -44 : -18);
  fillRoundRect(ctx, left + 1.8, top + 9.6, 3.7, 5.4, 1.5, sleeve);
  fillRoundRect(ctx, left + 10.5, top + 9.6, 3.7, 5.4, 1.5, sleeve);

  if (avatar.top === "jacket") {
    fillRoundRect(ctx, torsoLeft - 1, torsoY - 1.5, torsoWidth + 2, 9.8, 2.2, "#1e252b");
    fillRoundRect(ctx, left + 7.2, torsoY - 0.5, 1.6, 7.6, 0.8, avatar.topColor);
    fillRoundRect(ctx, torsoLeft + 0.6, torsoY, 2, 7, 0.8, shade("#1e252b", 26));
  } else {
    fillRoundRect(ctx, torsoLeft, torsoY - 1.2, torsoWidth, 9.2, 2.1, avatar.topColor);
    if (avatar.top === "hoodie") {
      fillRoundRect(ctx, left + 4, top + 7.8, 8, 3.8, 2, shade(avatar.topColor, -30));
      fillRoundRect(ctx, left + 6.9, top + 12, 2.2, 4.2, 1, shade(avatar.topColor, -42));
      ctx.fillStyle = "#f4f0e8";
      ctx.fillRect(left + 6.1, top + 12.2, 0.7, 2.8);
      ctx.fillRect(left + 9.2, top + 12.2, 0.7, 2.8);
    } else {
      fillRoundRect(ctx, torsoLeft + 1, torsoY - 0.4, Math.max(1, torsoWidth - 2), 1.1, 0.5, shade(avatar.topColor, 28));
      ctx.fillStyle = shade(avatar.topColor, -36);
      ctx.fillRect(left + 7.6, top + 10.6, 0.8, 5.5);
    }
  }

  if (direction === "up") {
    fillRoundRect(ctx, torsoLeft, torsoY - 1.2, torsoWidth, 9.2, 2.1, shade(avatar.topColor, -22));
    fillRoundRect(ctx, torsoLeft + 1.2, torsoY, torsoWidth - 2.4, 2.1, 1, shade(avatar.topColor, -38));
  }

  drawBottom(ctx, avatar, left, top, step);
}

function drawBottom(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, step: number) {
  if (avatar.bottom === "skirt") {
    ctx.fillStyle = avatar.bottomColor;
    ctx.beginPath();
    ctx.moveTo(left + 4.4, top + 17);
    ctx.quadraticCurveTo(left + 8, top + 15.2, left + 11.6, top + 17);
    ctx.lineTo(left + 13, top + 21.2);
    ctx.quadraticCurveTo(left + 8, top + 23, left + 3, top + 21.2);
    ctx.closePath();
    ctx.fill();
    fillRoundRect(ctx, left + 5 + step, top + 21, 2.7, 3.2, 1.1, avatar.skin);
    fillRoundRect(ctx, left + 9 - step, top + 21, 2.7, 3.2, 1.1, avatar.skin);
  } else if (avatar.bottom === "shorts") {
    fillRoundRect(ctx, left + 4, top + 17, 8, 4.4, 1.3, avatar.bottomColor);
    fillRoundRect(ctx, left + 5 + step, top + 20.8, 2.7, 3, 1.1, avatar.skin);
    fillRoundRect(ctx, left + 9 - step, top + 20.8, 2.7, 3, 1.1, avatar.skin);
  } else {
    fillRoundRect(ctx, left + 4 + step, top + 17, 3.2, 7.2, 1.2, avatar.bottomColor);
    fillRoundRect(ctx, left + 8.8 - step, top + 17, 3.2, 7.2, 1.2, avatar.bottomColor);
    ctx.fillStyle = shade(avatar.bottomColor, 22);
    ctx.fillRect(left + 5 + step, top + 17.4, 0.8, 5.8);
    ctx.fillRect(left + 9.7 - step, top + 17.4, 0.8, 5.8);
  }

  drawShoes(ctx, avatar, left, top, step);
}

function drawShoes(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, step: number) {
  const shoeTop = avatar.shoes === "boots" ? top + 22.4 : top + 24;
  const shoeHeight = avatar.shoes === "boots" ? 3.5 : 2.1;
  fillRoundRect(ctx, left + 3.7 + step, shoeTop, 4.5, shoeHeight, 1.1, avatar.shoeColor);
  fillRoundRect(ctx, left + 8.8 - step, shoeTop, 4.5, shoeHeight, 1.1, avatar.shoeColor);
  if (avatar.shoes === "sneakers") {
    ctx.fillStyle = "#f4f0e8";
    ctx.fillRect(left + 4.2 + step, top + 25.3, 3.2, 0.8);
    ctx.fillRect(left + 9.3 - step, top + 25.3, 3.2, 0.8);
  } else if (avatar.shoes === "slipons") {
    ctx.fillStyle = shade(avatar.shoeColor, 32);
    ctx.fillRect(left + 4.6 + step, top + 24.5, 2, 0.8);
    ctx.fillRect(left + 9.7 - step, top + 24.5, 2, 0.8);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, direction: Direction) {
  const skin = avatar.skin;
  const hair = avatar.hairColor;

  if (direction === "up") {
    fillEllipse(ctx, left + 3.1, top + 6.6, 1.2, 1.9, shade(skin, -8));
    fillEllipse(ctx, left + 12.9, top + 6.6, 1.2, 1.9, shade(skin, -8));
    fillRoundRect(ctx, left + 6.3, top + 8.7, 3.4, 3.4, 1.2, skin);
    fillEllipse(ctx, left + 8, top + 5.2, 5.2, 5.2, skin);
    drawHairCap(ctx, avatar, left, top, true);
    return;
  }

  if (direction === "left" || direction === "right") {
    const faceX = direction === "left" ? left + 3 : left + 5;
    const eyeX = direction === "left" ? left + 5 : left + 10;
    const cheekX = direction === "left" ? left + 4 : left + 11;
    fillEllipse(ctx, faceX + 4, top + 5.6, 4.6, 5.1, skin);
    fillRoundRect(ctx, faceX - 0.8, top + 1.6, 9.3, 5.2, 2.6, hair);
    fillRoundRect(ctx, faceX - 1, top + 4.2, 2.3, 5.5, 1.1, hair);
    drawEye(ctx, eyeX, top + 5.8, direction === "left" ? -1 : 1);
    fillEllipse(ctx, cheekX, top + 8.1, 1.1, 0.55, "rgba(218, 116, 103, 0.55)");
    ctx.fillStyle = shade(skin, -42);
    ctx.fillRect(direction === "left" ? left + 5.9 : left + 9.2, top + 8.5, 1.4, 0.7);
    return;
  }

  fillEllipse(ctx, left + 3.2, top + 6.5, 1.4, 2, shade(skin, -8));
  fillEllipse(ctx, left + 12.8, top + 6.5, 1.4, 2, shade(skin, -8));
  ctx.fillStyle = shade(skin, -46);
  ctx.fillRect(left + 2.8, top + 6.5, 0.7, 1.2);
  ctx.fillRect(left + 12.5, top + 6.5, 0.7, 1.2);
  fillEllipse(ctx, left + 8, top + 5.7, 5, 5.4, skin);
  drawHairCap(ctx, avatar, left, top, false);

  drawEye(ctx, left + 5.1, top + 5.8, -1);
  drawEye(ctx, left + 9.4, top + 5.8, 1);
  fillEllipse(ctx, left + 4.8, top + 8.3, 1.3, 0.62, "rgba(218, 116, 103, 0.55)");
  fillEllipse(ctx, left + 11.2, top + 8.3, 1.3, 0.62, "rgba(218, 116, 103, 0.55)");
  ctx.fillStyle = shade(skin, -36);
  ctx.fillRect(left + 7.55, top + 7.7, 0.9, 0.85);
  ctx.fillStyle = shade(skin, -72);
  ctx.fillRect(left + 6.9, top + 9.1, 2.2, 0.75);
  ctx.fillStyle = shade(skin, 30);
  ctx.fillRect(left + 7.25, top + 8.95, 1.5, 0.45);
  if (avatar.gender === "female") {
    ctx.fillStyle = "#263238";
    ctx.fillRect(left + 4.5, top + 5.3, 1, 0.8);
    ctx.fillRect(left + 10.7, top + 5.3, 1, 0.8);
  }
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, side: -1 | 1) {
  fillRoundRect(ctx, x, y, 1.8, 2.2, 0.8, "#f3efe6");
  fillRoundRect(ctx, x + (side < 0 ? 0.15 : 0.35), y + 0.25, 1.1, 1.75, 0.55, "#263238");
  ctx.fillStyle = "#9fb7c8";
  ctx.fillRect(x + (side < 0 ? 0.35 : 0.8), y + 0.45, 0.42, 0.42);
}

function drawHairBack(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, direction: Direction) {
  if (avatar.hair === "short") return;
  const height = avatar.hair === "long" ? 13 : avatar.hair === "bob" ? 9 : 7;
  const y = top + (direction === "up" ? 2.2 : 3.8);
  if (avatar.hair === "curly") {
    fillEllipse(ctx, left + 4, top + 4.2, 2.6, 3.1, avatar.hairColor);
    fillEllipse(ctx, left + 12, top + 4.2, 2.6, 3.1, avatar.hairColor);
    fillEllipse(ctx, left + 8, top + 3.2, 4.7, 3.1, avatar.hairColor);
    return;
  }
  fillRoundRect(ctx, left + 2.8, y, 10.4, height, 4.8, avatar.hairColor);
  ctx.fillStyle = shade(avatar.hairColor, -24);
  ctx.fillRect(left + 4, y + 2, 1, Math.max(3, height - 3));
  ctx.fillRect(left + 11, y + 2, 1, Math.max(3, height - 3));
}

function drawHairCap(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, back: boolean) {
  const hair = avatar.hairColor;
  if (back) {
    fillEllipse(ctx, left + 8, top + 3.8, 6.2, 4.8, hair);
    fillRoundRect(ctx, left + 3.2, top + 4.9, 9.6, 5.6, 3.2, shade(hair, -10));
    fillRoundRect(ctx, left + 5, top + 8.4, 6, 3.1, 1.5, shade(hair, -24));
    fillRoundRect(ctx, left + 4.2, top + 4.4, 2.1, 5.4, 1.3, shade(hair, 8));
    fillRoundRect(ctx, left + 10, top + 4.4, 2, 5.4, 1.3, shade(hair, -6));
    ctx.strokeStyle = shade(hair, 26);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(left + 6.3, top + 2.4);
    ctx.quadraticCurveTo(left + 4.9, top + 5.2, left + 5.4, top + 8.7);
    ctx.moveTo(left + 9.4, top + 2.2);
    ctx.quadraticCurveTo(left + 10.9, top + 5.1, left + 10.4, top + 8.7);
    ctx.stroke();
    return;
  }

  fillEllipse(ctx, left + 8, top + 3.1, 6.1, 4.1, hair);
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(left + 2.8, top + 4.7);
  ctx.quadraticCurveTo(left + 3.7, top + 1.4, left + 7.5, top + 1.1);
  ctx.quadraticCurveTo(left + 11.9, top + 1.2, left + 13.2, top + 4.8);
  ctx.quadraticCurveTo(left + 11.9, top + 5.8, left + 10.6, top + 5.5);
  ctx.quadraticCurveTo(left + 8.4, top + 6.5, left + 7.2, top + 5.3);
  ctx.quadraticCurveTo(left + 5.1, top + 6.2, left + 3.5, top + 5.2);
  ctx.closePath();
  ctx.fill();

  fillEllipse(ctx, left + 4.9, top + 4.1, 2.3, 2.8, shade(hair, -4));
  fillEllipse(ctx, left + 7.2, top + 3.6, 2.2, 3, shade(hair, 14));
  fillEllipse(ctx, left + 10.3, top + 3.8, 2.6, 2.9, shade(hair, -2));
  ctx.strokeStyle = shade(hair, 30);
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(left + 7.7, top + 1.8);
  ctx.quadraticCurveTo(left + 6.3, top + 3.2, left + 6.1, top + 5.3);
  ctx.moveTo(left + 10, top + 2.1);
  ctx.quadraticCurveTo(left + 8.9, top + 3.6, left + 8.6, top + 5.2);
  ctx.stroke();
  if (avatar.hair === "curly") {
    fillEllipse(ctx, left + 3.5, top + 2.7, 2.4, 2.5, shade(hair, 8));
    fillEllipse(ctx, left + 12.3, top + 2.8, 2.3, 2.4, shade(hair, -5));
    fillEllipse(ctx, left + 8, top + 1.7, 3.4, 2.1, shade(hair, 12));
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, avatar: AvatarStyle, left: number, top: number, direction: Direction) {
  if (avatar.accessory === "none") return;

  if (avatar.accessory === "glasses" && direction !== "up") {
    ctx.strokeStyle = "#1d2428";
    ctx.lineWidth = 0.75;
    ctx.strokeRect(left + 4.5, top + 6.1, 3.4, 2.2);
    ctx.strokeRect(left + 8.8, top + 6.1, 3.4, 2.2);
    ctx.fillStyle = "#1d2428";
    ctx.fillRect(left + 7.8, top + 6.8, 1.2, 0.8);
    ctx.fillStyle = "rgba(210, 235, 244, 0.74)";
    ctx.fillRect(left + 5.2, top + 6.5, 1.4, 0.7);
    ctx.fillRect(left + 9.5, top + 6.5, 1.4, 0.7);
    return;
  }

  if (avatar.accessory === "cap") {
    fillEllipse(ctx, left + 8, top + 2.2, 5.9, 3.2, shade(avatar.topColor, -34));
    if (direction !== "up") {
      fillRoundRect(ctx, left + 7, top + 4.2, 6.4, 1.8, 0.9, shade(avatar.topColor, -48));
    }
    return;
  }

  if (avatar.accessory === "headset") {
    ctx.strokeStyle = "#20272b";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(left + 8, top + 6, 5.7, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    fillRoundRect(ctx, left + 1.8, top + 5.5, 2.5, 4.5, 1.2, "#20272b");
    fillRoundRect(ctx, left + 11.7, top + 5.5, 2.5, 4.5, 1.2, "#20272b");
    fillRoundRect(ctx, left + 2.1, top + 6.4, 1.2, 2.4, 0.6, "#8fd4ff");
    fillRoundRect(ctx, left + 12.7, top + 6.4, 1.2, 2.4, 0.6, "#8fd4ff");
  }
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string
) {
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, Math.min(radius, width / 2, height / 2));
  ctx.fill();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
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

function option<T extends string>(value: unknown, options: Array<{ id: T }>, fallback: T): T {
  return typeof value === "string" && options.some((item) => item.id === value) ? (value as T) : fallback;
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
