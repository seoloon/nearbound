import { useEffect, useMemo, useRef } from "react";
import { drawAvatarSprite, normalizeAvatarStyle } from "../avatar";
import type { AvatarStyle, Direction, UserStatus } from "../types";

interface PixelAvatarProps {
  avatar?: AvatarStyle;
  direction?: Extract<Direction, "down" | "up">;
  status?: UserStatus;
  size?: "small" | "large" | "hero" | "showcase";
}

export function PixelAvatar({ avatar, direction = "down", status, size = "small" }: PixelAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const normalized = useMemo(() => normalizeAvatarStyle(avatar), [avatar]);
  const signature = JSON.stringify(normalized);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.save();
    context.scale(3, 3);
    drawAvatarSprite(context, normalized, {
      x: 12,
      y: 28,
      direction,
      moving: false,
      now: 0,
      shadow: false
    });
    context.restore();
  }, [direction, signature, normalized]);

  return (
    <span className={`pixel-avatar is-${size}`} aria-hidden="true">
      <canvas ref={canvasRef} width="72" height="90" />
      {status && <i className={`status-dot is-${status}`} />}
    </span>
  );
}
