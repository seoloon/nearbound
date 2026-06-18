import type { CSSProperties, FormEvent } from "react";
import type { AppConfig, Session } from "../types";

const COLORS = ["#2fbf71", "#e34f4f", "#3478f6", "#e7a92f", "#9b5de5", "#00a7a5", "#f15bb5", "#6b8e23"];

interface LoginScreenProps {
  config: AppConfig | null;
  onJoin: (session: Session) => void;
}

export function LoginScreen({ config, onJoin }: LoginScreenProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim() || "Guest";
    const room = String(data.get("room") || "").trim() || config?.defaultRoom || "nearbound-open-space";
    const color = String(data.get("color") || COLORS[0]);
    const identity = `user-${crypto.randomUUID()}`;
    onJoin({ identity, name, room, color });
  }

  return (
    <div className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-title">
          <span className="brand-pixel" />
          <div>
            <h1>{config?.appName || "Nearbound Open Space"}</h1>
            <p>2D pixel office with proximity voice, camera, and screen sharing.</p>
          </div>
        </div>

        <label className="field">
          <span>Name</span>
          <input name="name" autoFocus maxLength={64} placeholder="Antoine" />
        </label>

        <label className="field">
          <span>Space</span>
          <input name="room" maxLength={96} defaultValue={config?.defaultRoom || "nearbound-open-space"} />
        </label>

        <fieldset className="swatches">
          <legend>Sprite color</legend>
          <div>
            {COLORS.map((color, index) => (
              <label key={color} className="swatch" style={{ "--swatch": color } as CSSProperties}>
                <input type="radio" name="color" value={color} defaultChecked={index === 0} />
                <span />
              </label>
            ))}
          </div>
        </fieldset>

        {!config?.livekitConfigured && (
          <p className="config-note">
            LiveKit is not configured on the server yet. The space will open in local preview mode.
          </p>
        )}

        <button className="primary-action" type="submit">
          Enter the open space
        </button>
      </form>
    </div>
  );
}
