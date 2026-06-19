import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  AVATAR_PART_KEYS,
  AVATAR_PART_LABELS,
  AVATAR_PART_OPTIONS,
  DEFAULT_AVATAR_STYLE,
  avatarDnaParts,
  isAvatarDna,
  normalizeAvatarStyle,
  randomAvatarStyle,
  updateAvatarDna,
  updateAvatarPart
} from "../avatar";
import type { AppConfig, AvatarPartKey, AvatarStyle, Session } from "../types";
import { PixelAvatar } from "./PixelAvatar";

interface LoginScreenProps {
  config: AppConfig | null;
  onJoin: (session: Session) => void;
}

export function LoginScreen({ config, onJoin }: LoginScreenProps) {
  const [avatar, setAvatar] = useState<AvatarStyle>(() => normalizeAvatarStyle(DEFAULT_AVATAR_STYLE));
  const [dnaDraft, setDnaDraft] = useState(avatar.dna);
  const [previewDirection, setPreviewDirection] = useState<"down" | "up">("down");
  const dnaParts = useMemo(() => avatarDnaParts(avatar), [avatar]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim() || "Guest";
    const room = String(data.get("room") || "").trim() || config?.defaultRoom || "nearbound-open-space";
    const identity = `user-${crypto.randomUUID()}`;
    onJoin({ identity, name, room, color: avatar.topColor, avatar });
  }

  function commitAvatar(next: AvatarStyle) {
    setAvatar(next);
    setDnaDraft(next.dna);
  }

  function patchPart(key: AvatarPartKey, value: number) {
    commitAvatar(updateAvatarPart(avatar, key, value));
  }

  function randomizeAvatar() {
    commitAvatar(randomAvatarStyle());
  }

  function handleDnaChange(value: string) {
    setDnaDraft(value);
    if (isAvatarDna(value)) {
      setAvatar(updateAvatarDna(avatar, value));
    }
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
              <button className="secondary-action" type="button" onClick={randomizeAvatar}>
                Randomize avatar
              </button>
            </div>
          </section>

          <section className="character-builder" aria-label="Character">
            <div className="character-options">
              <label className={`field avatar-dna-field ${dnaDraft && !isAvatarDna(dnaDraft) ? "has-error" : ""}`}>
                <span>DNA</span>
                <input
                  value={dnaDraft}
                  spellCheck={false}
                  placeholder="0-1-0-0-0-0"
                  onChange={(event) => handleDnaChange(event.target.value)}
                />
              </label>

              {AVATAR_PART_KEYS.map((key) => (
                <PartGroup
                  key={key}
                  partKey={key}
                  value={dnaParts[key]}
                  onChange={(value) => patchPart(key, value)}
                />
              ))}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

function PartGroup({
  partKey,
  value,
  onChange
}: {
  partKey: AvatarPartKey;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="character-group">
      <legend>{AVATAR_PART_LABELS[partKey]}</legend>
      <div className="option-grid is-dense">
        {AVATAR_PART_OPTIONS[partKey].map((option) => (
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
