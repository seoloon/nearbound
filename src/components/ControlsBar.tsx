import { Camera, CameraOff, Headphones, Mic, MicOff, MonitorUp, ScreenShareOff, VolumeX } from "lucide-react";
import { useState } from "react";
import type { PlayerPresence, UserStatus } from "../types";
import { IconButton } from "./IconButton";
import { PixelAvatar } from "./PixelAvatar";

interface ControlsBarProps {
  connected: boolean;
  preview: boolean;
  profile: PlayerPresence;
  mic: boolean;
  deafened: boolean;
  camera: boolean;
  screen: boolean;
  canPublishMedia: boolean;
  mediaBlockedReason?: string;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onProfileChange: (profile: { status?: UserStatus; bio?: string }) => void;
}

const STATUS_LABELS: Record<UserStatus, string> = {
  available: "Available",
  dnd: "Do Not Disturb",
  inactive: "Inactive"
};

export function ControlsBar({
  connected,
  preview,
  profile,
  mic,
  deafened,
  camera,
  screen,
  canPublishMedia,
  mediaBlockedReason,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreen,
  onProfileChange
}: ControlsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const mediaDisabled = !connected || !canPublishMedia;
  const disabledMediaLabel = canPublishMedia ? undefined : mediaBlockedReason || "Broadcast zone required";

  return (
    <div className="dock-wrap">
      {expanded && (
        <ProfilePopover
          profile={profile}
          connected={connected}
          preview={preview}
          onProfileChange={onProfileChange}
        />
      )}
      <div className="controls-bar">
        <button
          className="dock-profile"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          title="Profile"
        >
          <Avatar profile={profile} />
          <span>
            <strong>{profile.name}</strong>
            <small>{STATUS_LABELS[profile.status]}</small>
          </span>
        </button>
        <div className="control-group">
          <IconButton
            label={disabledMediaLabel || (mic ? "Mute" : "Unmute")}
            active={mic}
            onClick={onToggleMic}
            disabled={mediaDisabled}
          >
            {mic ? <Mic size={20} /> : <MicOff size={20} />}
          </IconButton>
          <IconButton label={deafened ? "Undeafen" : "Deafen"} active={deafened} onClick={onToggleDeafen}>
            {deafened ? <VolumeX size={20} /> : <Headphones size={20} />}
          </IconButton>
          <IconButton
            label={disabledMediaLabel || (camera ? "Turn camera off" : "Turn camera on")}
            active={camera}
            onClick={onToggleCamera}
            disabled={mediaDisabled}
          >
            {camera ? <Camera size={20} /> : <CameraOff size={20} />}
          </IconButton>
          <IconButton
            label={disabledMediaLabel || (screen ? "Stop streaming" : "Stream")}
            active={screen}
            onClick={onToggleScreen}
            disabled={mediaDisabled}
          >
            {screen ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function ProfilePopover({
  profile,
  connected,
  preview,
  onProfileChange
}: {
  profile: PlayerPresence;
  connected: boolean;
  preview: boolean;
  onProfileChange: (profile: { status?: UserStatus; bio?: string }) => void;
}) {
  return (
    <section className="profile-popover">
      <div className="profile-hero">
        <Avatar profile={profile} large />
        <div>
          <h2>{profile.name}</h2>
          <p>{preview ? "Local preview" : connected ? "Connected" : "Connecting"}</p>
        </div>
      </div>

      <label className="profile-field">
        <span>Status</span>
        <select
          value={profile.status}
          onChange={(event) => onProfileChange({ status: event.target.value as UserStatus })}
        >
          <option value="available">Available</option>
          <option value="dnd">Do Not Disturb</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <label className="profile-field">
        <span>Bio</span>
        <textarea
          value={profile.bio}
          maxLength={180}
          placeholder="Write a short bio..."
          onChange={(event) => onProfileChange({ bio: event.target.value })}
        />
      </label>
    </section>
  );
}

function Avatar({ profile, large = false }: { profile: PlayerPresence; large?: boolean }) {
  return <PixelAvatar avatar={profile.avatar} status={profile.status} size={large ? "large" : "small"} />;
}
