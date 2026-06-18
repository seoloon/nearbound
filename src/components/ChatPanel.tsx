import { LogOut, Maximize2, MessageSquare, PanelRightClose, Send, Settings, X } from "lucide-react";
import { RemoteParticipant, RemoteTrackPublication, Room, Track } from "livekit-client";
import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAudibility, type OfficeMap } from "../game/map";
import type { ChatMessage, PlayerPresence } from "../types";
import { PixelAvatar } from "./PixelAvatar";

interface ChatPanelProps {
  room: Room | null;
  map: OfficeMap;
  local: PlayerPresence;
  remotePresences: Record<string, PlayerPresence>;
  messages: ChatMessage[];
  mediaVersion: number;
  deafened: boolean;
  status: "preview" | "connecting" | "connected" | "error";
  error?: string;
  mediaError?: string;
  onSendMessage: (text: string) => void;
  onLeave: () => void;
}

interface NearbyParticipant {
  participant: RemoteParticipant;
  presence: PlayerPresence;
  gain: number;
  distanceTiles: number;
}

interface VoiceVolumeSettings {
  master: number;
  users: Record<string, number>;
}

const VOICE_VOLUME_KEY = "nearbound.voiceVolumes.v1";
const DEFAULT_VOICE_VOLUMES: VoiceVolumeSettings = {
  master: 1,
  users: {}
};

function defaultVoiceVolumes(): VoiceVolumeSettings {
  return { master: DEFAULT_VOICE_VOLUMES.master, users: {} };
}

export function ChatPanel({
  room,
  map,
  local,
  remotePresences,
  messages,
  mediaVersion,
  deafened,
  status,
  error,
  mediaError,
  onSendMessage,
  onLeave
}: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [expandedStream, setExpandedStream] = useState<RemoteTrackPublication | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceVolumes, setVoiceVolumes] = usePersistentVoiceVolumes();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const nearby = useMemo<NearbyParticipant[]>(() => {
    if (!room) return [];
    return Array.from(room.remoteParticipants.values())
      .map((participant) => {
        const presence = remotePresences[participant.identity];
        if (!presence) return null;
        const audibility = getAudibility(local, presence, map);
        if (!audibility.audible) return null;
        return {
          participant,
          presence,
          gain: audibility.gain,
          distanceTiles: audibility.distanceTiles
        };
      })
      .filter((entry): entry is NearbyParticipant => Boolean(entry))
      .sort((a, b) => a.distanceTiles - b.distanceTiles);
  }, [room, remotePresences, local, map, mediaVersion]);

  const screenShares = useMemo(
    () =>
      nearby
        .map((entry) => ({
          ...entry,
          publication: publicationFor(entry.participant, Track.Source.ScreenShare)
        }))
        .filter((entry): entry is NearbyParticipant & { publication: RemoteTrackPublication } =>
          Boolean(entry.publication?.track)
        ),
    [nearby, mediaVersion]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, collapsed]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    onSendMessage(body);
    setDraft("");
  }

  if (collapsed) {
    return (
      <>
        <button className="chat-tab" type="button" onClick={() => setCollapsed(false)} aria-label="Open chat">
          <MessageSquare size={20} />
          {messages.length > 0 && <span>{messages.length}</span>}
        </button>
        {settingsOpen && (
          <SettingsModal
            presences={Object.values(remotePresences)}
            voiceVolumes={voiceVolumes}
            onVoiceVolumesChange={setVoiceVolumes}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        <CornerActions onLeave={onLeave} onSettingsOpen={() => setSettingsOpen(true)} />
      </>
    );
  }

  return (
    <>
      <aside className="chat-panel">
        <div className="chat-heading">
          <div>
            <h2>Chat</h2>
            <span>{nearby.length} nearby</span>
          </div>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse chat" title="Collapse chat">
            <PanelRightClose size={18} />
          </button>
        </div>

        {status === "error" && <p className="panel-alert">{error}</p>}
        {mediaError && <p className="panel-alert">{mediaError}</p>}
        {status === "preview" && <p className="panel-muted">Local preview: chat and calls need LiveKit to sync.</p>}
        {status === "connecting" && <p className="panel-muted">Connecting to LiveKit...</p>}

        {screenShares.length > 0 && (
          <div className="stream-stack">
            {screenShares.map(({ participant, presence, publication }) => (
              <button
                className="stream-card"
                type="button"
                key={participant.identity}
                onClick={() => setExpandedStream(publication)}
              >
                <VideoSink publication={publication} mediaVersion={mediaVersion} muted />
                <span>
                  <strong>{presence.name}</strong>
                  <small>is streaming</small>
                </span>
                <Maximize2 size={16} />
              </button>
            ))}
          </div>
        )}

        {nearby.length > 0 && (
          <div className="nearby-strip">
            {nearby.map(({ participant, presence, gain, distanceTiles }) => (
              <RemoteMediaTile
                key={participant.identity}
                participant={participant}
                presence={presence}
                gain={gain}
                deafened={deafened}
                volume={voiceVolumes.master * (voiceVolumes.users[presence.identity] ?? 1)}
                distanceTiles={distanceTiles}
                mediaVersion={mediaVersion}
              />
            ))}
          </div>
        )}

        <div className="chat-feed">
          {messages.length === 0 ? (
            <div className="empty-chat">No messages yet.</div>
          ) : (
            messages.map((message) => {
              const profile = message.local ? local : remotePresences[message.identity];
              return (
                <article className={`chat-message ${message.local ? "is-local" : ""}`} key={message.id}>
                  <PixelAvatar avatar={profile?.avatar} status={profile?.status} size="small" />
                  <div>
                    <header>
                      <strong>{message.local ? "You" : message.name}</strong>
                      <time>{formatTime(message.sentAt)}</time>
                    </header>
                    <p>{message.text}</p>
                  </div>
                </article>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-composer" onSubmit={submit}>
          <input
            value={draft}
            maxLength={500}
            placeholder="Message the room"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" aria-label="Send message" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </aside>
      {expandedStream && (
        <StreamModal
          publication={expandedStream}
          mediaVersion={mediaVersion}
          onClose={() => setExpandedStream(null)}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          presences={Object.values(remotePresences)}
          voiceVolumes={voiceVolumes}
          onVoiceVolumesChange={setVoiceVolumes}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <CornerActions onLeave={onLeave} onSettingsOpen={() => setSettingsOpen(true)} />
    </>
  );
}

function CornerActions({
  onLeave,
  onSettingsOpen
}: {
  onLeave: () => void;
  onSettingsOpen: () => void;
}) {
  return (
    <div className="corner-actions">
      <button className="corner-action-button" type="button" onClick={onSettingsOpen} aria-label="Settings" title="Settings">
        <Settings size={18} />
      </button>
      <button className="corner-action-button is-danger" type="button" onClick={onLeave} aria-label="Leave space" title="Leave space">
        <LogOut size={18} />
      </button>
    </div>
  );
}

function RemoteMediaTile({
  participant,
  presence,
  gain,
  deafened,
  volume,
  distanceTiles,
  mediaVersion
}: NearbyParticipant & { deafened: boolean; volume: number; mediaVersion: number }) {
  const microphone = publicationFor(participant, Track.Source.Microphone);
  const screenAudio = publicationFor(participant, Track.Source.ScreenShareAudio);

  return (
    <div className="nearby-tile">
      <PixelAvatar avatar={presence.avatar} status={presence.status} size="small" />
      <div>
        <strong>{presence.name}</strong>
        <small>{distanceTiles < 1 ? "very close" : `${distanceTiles.toFixed(1)} tiles`}</small>
      </div>
      {microphone?.track && <AudioSink publication={microphone} gain={deafened ? 0 : gain * volume} mediaVersion={mediaVersion} />}
      {screenAudio?.track && <AudioSink publication={screenAudio} gain={deafened ? 0 : gain * volume} mediaVersion={mediaVersion} />}
    </div>
  );
}

function SettingsModal({
  presences,
  voiceVolumes,
  onVoiceVolumesChange,
  onClose
}: {
  presences: PlayerPresence[];
  voiceVolumes: VoiceVolumeSettings;
  onVoiceVolumesChange: Dispatch<SetStateAction<VoiceVolumeSettings>>;
  onClose: () => void;
}) {
  const sortedPresences = [...presences].sort((a, b) => a.name.localeCompare(b.name));

  function setMaster(value: number) {
    onVoiceVolumesChange((current) => ({ ...current, master: value }));
  }

  function setUser(identity: string, value: number) {
    onVoiceVolumesChange((current) => ({
      ...current,
      users: {
        ...current.users,
        [identity]: value
      }
    }));
  }

  function resetVolumes() {
    onVoiceVolumesChange(defaultVoiceVolumes());
  }

  return (
    <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <section className="settings-panel">
        <header className="settings-header">
          <div>
            <h2>Settings</h2>
            <span>Proximity</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" title="Close settings">
            <X size={19} />
          </button>
        </header>

        <div className="settings-tabs" role="tablist">
          <button type="button" className="is-active">
            Proximity
          </button>
        </div>

        <div className="settings-section">
          <VolumeRow
            label="Voice chat"
            value={voiceVolumes.master}
            onChange={setMaster}
          />
          <div className="user-volume-list">
            {sortedPresences.length === 0 ? (
              <p>No remote users yet.</p>
            ) : (
              sortedPresences.map((presence) => (
                <VolumeRow
                  key={presence.identity}
                  label={presence.name}
                  color={presence.color}
                  value={voiceVolumes.users[presence.identity] ?? 1}
                  onChange={(value) => setUser(presence.identity, value)}
                />
              ))
            )}
          </div>
          <button className="settings-reset" type="button" onClick={resetVolumes}>
            Reset volumes
          </button>
        </div>
      </section>
    </div>
  );
}

function VolumeRow({
  label,
  color,
  value,
  onChange
}: {
  label: string;
  color?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="volume-row">
      <span className="volume-label">
        {color && <i style={{ "--avatar-color": color } as CSSProperties} />}
        <strong>{label}</strong>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <em>{percent}%</em>
    </label>
  );
}

function StreamModal({
  publication,
  mediaVersion,
  onClose
}: {
  publication: RemoteTrackPublication;
  mediaVersion: number;
  onClose: () => void;
}) {
  return (
    <div className="stream-modal" role="dialog" aria-modal="true">
      <div className="stream-modal-panel">
        <button type="button" onClick={onClose} aria-label="Close stream" title="Close stream">
          <X size={20} />
        </button>
        <VideoSink publication={publication} mediaVersion={mediaVersion} muted />
      </div>
    </div>
  );
}

function VideoSink({
  publication,
  mediaVersion,
  muted = false
}: {
  publication?: RemoteTrackPublication;
  mediaVersion: number;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    const track = publication?.track;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication?.trackSid, publication?.track, mediaVersion]);

  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

function AudioSink({
  publication,
  gain,
  mediaVersion
}: {
  publication: RemoteTrackPublication;
  gain: number;
  mediaVersion: number;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    const track = publication.track;
    if (!element || !track) return;
    track.attach(element);
    element.volume = clampVolume(gain);
    return () => {
      track.detach(element);
    };
  }, [publication.trackSid, publication.track, mediaVersion]);

  useEffect(() => {
    if (ref.current) ref.current.volume = clampVolume(gain);
  }, [gain]);

  return <audio ref={ref} autoPlay playsInline />;
}

function publicationFor(participant: RemoteParticipant, source: Track.Source) {
  return Array.from(participant.trackPublications.values()).find(
    (publication) => publication.source === source
  ) as RemoteTrackPublication | undefined;
}

function usePersistentVoiceVolumes() {
  const [settings, setSettings] = useState<VoiceVolumeSettings>(() => {
    try {
      const stored = window.localStorage.getItem(VOICE_VOLUME_KEY);
      if (!stored) return defaultVoiceVolumes();
      const parsed = JSON.parse(stored) as Partial<VoiceVolumeSettings>;
      return {
        master: clampVolume(parsed.master),
        users: Object.fromEntries(
          Object.entries(parsed.users || {}).map(([identity, value]) => [identity, clampVolume(value)])
        )
      };
    } catch {
      return defaultVoiceVolumes();
    }
  });

  useEffect(() => {
    window.localStorage.setItem(VOICE_VOLUME_KEY, JSON.stringify(settings));
  }, [settings]);

  return [settings, setSettings] as const;
}

function clampVolume(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}
