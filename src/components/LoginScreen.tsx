import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";
import {
  AVATAR_ACCESSORIES,
  AVATAR_BOTTOMS,
  AVATAR_GENDERS,
  AVATAR_HAIR,
  AVATAR_SHOES,
  AVATAR_TOPS,
  BOTTOM_COLORS,
  DEFAULT_AVATAR_STYLE,
  HAIR_COLORS,
  SHOE_COLORS,
  SKIN_COLORS,
  TOP_COLORS,
  normalizeAvatarStyle
} from "../avatar";
import type {
  AppConfig,
  AvatarAccessory,
  AvatarBottom,
  AvatarGender,
  AvatarHair,
  AvatarShoes,
  AvatarStyle,
  AvatarTop,
  Session
} from "../types";
import { PixelAvatar } from "./PixelAvatar";

interface LoginScreenProps {
  config: AppConfig | null;
  onJoin: (session: Session) => void;
}

export function LoginScreen({ config, onJoin }: LoginScreenProps) {
  const [avatar, setAvatar] = useState<AvatarStyle>(() => normalizeAvatarStyle(DEFAULT_AVATAR_STYLE));
  const [previewDirection, setPreviewDirection] = useState<"down" | "up">("down");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim() || "Guest";
    const room = String(data.get("room") || "").trim() || config?.defaultRoom || "nearbound-open-space";
    const identity = `user-${crypto.randomUUID()}`;
    onJoin({ identity, name, room, color: avatar.topColor, avatar });
  }

  function patchAvatar(next: Partial<AvatarStyle>) {
    setAvatar((current) => normalizeAvatarStyle({ ...current, ...next }));
  }

  return (
    <div className="login-shell">
      <div className="login-layout">
        <form className="login-panel" onSubmit={submit}>
          <div className="login-title">
            <span className="brand-pixel" />
            <div>
              <h1>{config?.appName || "Nearbound Open Space"}</h1>
              <p>2D pixel office with proximity voice, camera, and screen sharing.</p>
            </div>
          </div>

          <div className="login-fields">
            <label className="field">
              <span>Name</span>
              <input name="name" autoFocus maxLength={64} placeholder="Antoine" />
            </label>

            <label className="field">
              <span>Space</span>
              <input name="room" maxLength={96} defaultValue={config?.defaultRoom || "nearbound-open-space"} />
            </label>

            {!config?.livekitConfigured && (
              <p className="config-note">
                LiveKit is not configured on the server yet. The space will open in local preview mode.
              </p>
            )}

            <button className="primary-action" type="submit">
              Enter the open space
            </button>
          </div>
        </form>

        <section className="customization-panel" aria-label="Character customization">
          <section className="avatar-preview-panel" aria-label="Character preview">
            <div className="avatar-preview-stage">
              <PixelAvatar avatar={avatar} direction={previewDirection} size="showcase" />
            </div>
            <div className="avatar-preview-meta">
              <strong>{previewDirection === "down" ? "Front view" : "Back view"}</strong>
              <div className="preview-direction-toggle" role="group" aria-label="Preview direction">
                <button
                  className={previewDirection === "down" ? "is-active" : ""}
                  type="button"
                  onClick={() => setPreviewDirection("down")}
                >
                  Front
                </button>
                <button
                  className={previewDirection === "up" ? "is-active" : ""}
                  type="button"
                  onClick={() => setPreviewDirection("up")}
                >
                  Back
                </button>
              </div>
            </div>
          </section>

          <section className="character-builder" aria-label="Character">
            <div className="character-options">
              <OptionGroup
                label="Sex"
                value={avatar.gender}
                options={AVATAR_GENDERS}
                onChange={(gender) => patchAvatar({ gender })}
              />

              <ColorGroup
                label="Skin"
                value={avatar.skin}
                colors={SKIN_COLORS}
                onChange={(skin) => patchAvatar({ skin })}
              />

              <OptionGroup
                label="Hair"
                value={avatar.hair}
                options={AVATAR_HAIR}
                onChange={(hair) => patchAvatar({ hair })}
              />

              <ColorGroup
                label="Hair color"
                value={avatar.hairColor}
                colors={HAIR_COLORS}
                onChange={(hairColor) => patchAvatar({ hairColor })}
              />

              <OptionGroup
                label="Top"
                value={avatar.top}
                options={AVATAR_TOPS}
                onChange={(top) => patchAvatar({ top })}
              />

              <ColorGroup
                label="Top color"
                value={avatar.topColor}
                colors={TOP_COLORS}
                onChange={(topColor) => patchAvatar({ topColor })}
              />

              <OptionGroup
                label="Bottom"
                value={avatar.bottom}
                options={AVATAR_BOTTOMS}
                onChange={(bottom) => patchAvatar({ bottom })}
              />

              <ColorGroup
                label="Bottom color"
                value={avatar.bottomColor}
                colors={BOTTOM_COLORS}
                onChange={(bottomColor) => patchAvatar({ bottomColor })}
              />

              <OptionGroup
                label="Shoes"
                value={avatar.shoes}
                options={AVATAR_SHOES}
                onChange={(shoes) => patchAvatar({ shoes })}
              />

              <ColorGroup
                label="Shoe color"
                value={avatar.shoeColor}
                colors={SHOE_COLORS}
                onChange={(shoeColor) => patchAvatar({ shoeColor })}
              />

              <OptionGroup
                label="Accessory"
                value={avatar.accessory}
                options={AVATAR_ACCESSORIES}
                onChange={(accessory) => patchAvatar({ accessory })}
              />
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

function OptionGroup<T extends AvatarGender | AvatarHair | AvatarTop | AvatarBottom | AvatarShoes | AvatarAccessory>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="character-group">
      <legend>{label}</legend>
      <div className="option-grid">
        {options.map((option) => (
          <button
            key={option.id}
            className={option.id === value ? "is-active" : ""}
            type="button"
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColorGroup({
  label,
  value,
  colors,
  onChange
}: {
  label: string;
  value: string;
  colors: string[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="character-group">
      <legend>{label}</legend>
      <div className="color-grid">
        {colors.map((color) => (
          <button
            key={color}
            className={color === value ? "is-active" : ""}
            type="button"
            style={{ "--swatch": color } as CSSProperties}
            onClick={() => onChange(color)}
            aria-label={`${label} ${color}`}
          >
            <span />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
