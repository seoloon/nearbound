import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { ControlsBar } from "./components/ControlsBar";
import { LoginScreen } from "./components/LoginScreen";
import { LocalScreenPreview } from "./components/ScreenPreview";
import { WorldCanvas } from "./components/WorldCanvas";
import { createOfficeMap, getZoneAt } from "./game/map";
import { useLiveKitRoom } from "./livekit/useLiveKitRoom";
import type { AppConfig, PlayerPresence, Session, UserStatus } from "./types";

const DEFAULT_CONFIG: AppConfig = {
  appName: "Nearbound Open Space",
  defaultRoom: "nearbound-open-space",
  livekitConfigured: false
};

export function App() {
  const map = useMemo(() => createOfficeMap(), []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [local, setLocal] = useState<PlayerPresence | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/config")
      .then((response) => response.json())
      .then((nextConfig: AppConfig) => {
        if (!cancelled) setConfig(nextConfig);
      })
      .catch(() => {
        if (!cancelled) setConfig(DEFAULT_CONFIG);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const livekit = useLiveKitRoom(session, local, map, Boolean(config?.livekitConfigured));

  const handleJoin = useCallback(
    (nextSession: Session) => {
      const spawn = map.spawn;
      const zone = getZoneAt(map, spawn.x, spawn.y);
      setSession(nextSession);
      setLocal({
        identity: nextSession.identity,
        name: nextSession.name,
        color: nextSession.color,
        status: "available",
        bio: "",
        x: spawn.x,
        y: spawn.y,
        direction: "down",
        moving: false,
        zoneId: zone?.id,
        lastSeen: Date.now()
      });
    },
    [map]
  );

  const handleLocalChange = useCallback((presence: PlayerPresence) => {
    setLocal(presence);
  }, []);

  const handleLeave = useCallback(() => {
    setSession(null);
    setLocal(null);
  }, []);

  const handleProfileChange = useCallback((profile: { status?: UserStatus; bio?: string }) => {
    setLocal((current) => {
      if (!current) return current;
      return {
        ...current,
        status: profile.status || current.status,
        bio: profile.bio ?? current.bio,
        lastSeen: Date.now()
      };
    });
  }, []);

  if (!session || !local) {
    return <LoginScreen config={config} onJoin={handleJoin} />;
  }

  const remotes = Object.values(livekit.remotePresences);
  const connected = livekit.status === "connected";
  const preview = livekit.status === "preview";

  return (
    <main className="app-shell">
      <WorldCanvas
        map={map}
        local={local}
        remotes={remotes}
        room={livekit.room}
        mediaVersion={livekit.mediaVersion}
        onLocalChange={handleLocalChange}
      />
      <LocalScreenPreview room={livekit.room} active={livekit.media.screen} mediaVersion={livekit.mediaVersion} />
      <ChatPanel
        room={livekit.room}
        map={map}
        local={local}
        remotePresences={livekit.remotePresences}
        messages={livekit.chatMessages}
        mediaVersion={livekit.mediaVersion}
        deafened={livekit.media.deafened}
        status={livekit.status}
        error={livekit.error}
        mediaError={livekit.mediaError}
        onSendMessage={(text) => void livekit.sendChat(text)}
        onLeave={handleLeave}
      />
      <ControlsBar
        connected={connected}
        preview={preview}
        profile={local}
        mic={livekit.media.mic}
        deafened={livekit.media.deafened}
        camera={livekit.media.camera}
        screen={livekit.media.screen}
        onToggleMic={() => void livekit.toggleMic()}
        onToggleDeafen={livekit.toggleDeafen}
        onToggleCamera={() => void livekit.toggleCamera()}
        onToggleScreen={() => void livekit.toggleScreen()}
        onProfileChange={handleProfileChange}
      />
    </main>
  );
}
