import { useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { ControlsBar } from "./components/ControlsBar";
import { LoginScreen } from "./components/LoginScreen";
import { LocalScreenPreview } from "./components/ScreenPreview";
import { avatarAccent } from "./avatar";
import { WorldCanvas } from "./components/WorldCanvas";
import { DEFAULT_MAP_EDITOR_TOOL, type MapEditorTool } from "./game/editor";
import { getLocalMediaAccess, getZoneAt, type OfficeMap, type Zone } from "./game/map";
import { useLiveKitRoom } from "./livekit/useLiveKitRoom";
import { useServerSync } from "./sync/useServerSync";
import type { AppConfig, PlayerPresence, Session, UserStatus } from "./types";

const DEFAULT_CONFIG: AppConfig = {
  appName: "Nearbound Open Space",
  defaultRoom: "nearbound-open-space",
  livekitConfigured: false
};

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [local, setLocal] = useState<PlayerPresence | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTool, setEditorTool] = useState<MapEditorTool>(DEFAULT_MAP_EDITOR_TOOL);
  const sync = useServerSync(session, local);
  const map = sync.map;

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

  const livekit = useLiveKitRoom(session, local, sync.remotePresences, map, Boolean(config?.livekitConfigured));

  const handleJoin = useCallback(
    (nextSession: Session) => {
      const spawn = map.spawn;
      const zone = getZoneAt(map, spawn.x, spawn.y);
      setSession(nextSession);
      setLocal({
        identity: nextSession.identity,
        name: nextSession.name,
        color: nextSession.color || avatarAccent(nextSession.avatar),
        avatar: nextSession.avatar,
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

  const handleMapChange = useCallback((updater: (current: OfficeMap) => OfficeMap) => {
    sync.updateMap(updater);
  }, [sync]);

  const handleLeave = useCallback(() => {
    if (local) sync.leave(local.identity);
    setEditorOpen(false);
    setSession(null);
    setLocal(null);
  }, [local, sync]);

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

  const handleClaimOffice = useCallback(
    (zone: Zone) => {
      const currentLocal = local;
      if (!currentLocal) return;
      void sync.claimOffice(zone, currentLocal).then((claim) => {
        if (!claim) return;
        setLocal((current) =>
          current
            ? {
                ...current,
                claimedOfficeId: claim.zoneId,
                claimedOfficeName: claim.zoneName,
                lastSeen: Date.now()
              }
            : current
        );
      });
    },
    [local, sync]
  );

  const handleReleaseOffice = useCallback(() => {
    const currentLocal = local;
    if (!currentLocal) return;
    void sync.releaseOffice(currentLocal).then(() => {
      setLocal((current) =>
        current
          ? {
              ...current,
              claimedOfficeId: undefined,
              claimedOfficeName: undefined,
              lastSeen: Date.now()
            }
          : current
      );
    });
  }, [local, sync]);

  useEffect(() => {
    if (!local?.claimedOfficeId) return;
    if (map.zones.some((zone) => zone.id === local.claimedOfficeId)) return;
    setLocal((current) =>
      current
        ? {
            ...current,
            claimedOfficeId: undefined,
            claimedOfficeName: undefined,
            lastSeen: Date.now()
          }
        : current
    );
  }, [local?.claimedOfficeId, map]);

  useEffect(() => {
    if (!local || sync.mapRevision === 0) return;
    const claim = sync.officeClaims.find((item) => item.identity === local.identity);
    if (claim?.zoneId === local.claimedOfficeId && claim?.zoneName === local.claimedOfficeName) return;
    if (!claim && !local.claimedOfficeId) return;
    setLocal({
      ...local,
      claimedOfficeId: claim?.zoneId,
      claimedOfficeName: claim?.zoneName,
      lastSeen: Date.now()
    });
  }, [local, sync.mapRevision, sync.officeClaims]);

  if (!session || !local) {
    return <LoginScreen config={config} onJoin={handleJoin} />;
  }

  const remotes = Object.values(sync.remotePresences);
  const connected = livekit.status === "connected";
  const preview = livekit.status === "preview";
  const mediaAccess = getLocalMediaAccess(local, map);

  return (
    <main className="app-shell">
      <WorldCanvas
        map={map}
        local={local}
        remotes={remotes}
        room={livekit.room}
        cameraActive={livekit.media.camera}
        mediaVersion={livekit.mediaVersion}
        showEditorGrid={editorOpen}
        editorTool={editorTool}
        officeClaims={sync.officeClaims}
        onEditorToolChange={setEditorTool}
        onMapChange={handleMapChange}
        onClaimOffice={handleClaimOffice}
        onReleaseOffice={handleReleaseOffice}
        onLocalChange={handleLocalChange}
      />
      <LocalScreenPreview room={livekit.room} active={livekit.media.screen} mediaVersion={livekit.mediaVersion} />
      <ChatPanel
        room={livekit.room}
        map={map}
        local={local}
        remotePresences={sync.remotePresences}
        messages={sync.chatMessages}
        mediaVersion={livekit.mediaVersion}
        deafened={livekit.media.deafened}
        status={livekit.status}
        error={livekit.error || sync.error}
        mediaError={livekit.mediaError}
        editorOpen={editorOpen}
        editorTool={editorTool}
        voiceVolumes={sync.voiceVolumes}
        onVoiceVolumesChange={sync.updateVoiceVolumes}
        onEditorToolChange={setEditorTool}
        onSendMessage={(text) => void sync.sendChat(local, text)}
        onLeave={handleLeave}
        onEditorToggle={() => setEditorOpen((value) => !value)}
      />
      <ControlsBar
        connected={connected}
        preview={preview}
        profile={local}
        mic={livekit.media.mic}
        deafened={livekit.media.deafened}
        camera={livekit.media.camera}
        screen={livekit.media.screen}
        canPublishMedia={mediaAccess.canPublish}
        mediaBlockedReason={mediaAccess.reason}
        onToggleMic={() => void livekit.toggleMic()}
        onToggleDeafen={livekit.toggleDeafen}
        onToggleCamera={() => void livekit.toggleCamera()}
        onToggleScreen={() => void livekit.toggleScreen()}
        onProfileChange={handleProfileChange}
      />
    </main>
  );
}
