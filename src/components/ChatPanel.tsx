import { LogOut, MessageSquare, PanelRightClose, Send } from "lucide-react";
import { RemoteParticipant, RemoteTrackPublication, Room, Track } from "livekit-client";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAudibility, type OfficeMap } from "../game/map";
import type { ChatMessage, PlayerPresence } from "../types";

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
        <LeaveButton onLeave={onLeave} />
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

        {nearby.length > 0 && (
          <div className="nearby-strip">
            {nearby.map(({ participant, presence, gain, distanceTiles }) => (
              <RemoteMediaTile
                key={participant.identity}
                participant={participant}
                presence={presence}
                gain={gain}
                deafened={deafened}
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
            messages.map((message) => (
              <article className={`chat-message ${message.local ? "is-local" : ""}`} key={message.id}>
                <span className="chat-avatar" style={{ "--avatar-color": message.color } as CSSProperties} />
                <div>
                  <header>
                    <strong>{message.local ? "You" : message.name}</strong>
                    <time>{formatTime(message.sentAt)}</time>
                  </header>
                  <p>{message.text}</p>
                </div>
              </article>
            ))
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
      <LeaveButton onLeave={onLeave} />
    </>
  );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
  return (
    <button className="leave-space-button" type="button" onClick={onLeave}>
      <LogOut size={17} />
      <span>Leave space</span>
    </button>
  );
}

function RemoteMediaTile({
  participant,
  presence,
  gain,
  deafened,
  distanceTiles,
  mediaVersion
}: NearbyParticipant & { deafened: boolean; mediaVersion: number }) {
  const camera = publicationFor(participant, Track.Source.Camera);
  const microphone = publicationFor(participant, Track.Source.Microphone);
  const screenAudio = publicationFor(participant, Track.Source.ScreenShareAudio);

  return (
    <div className="nearby-tile">
      <div className="nearby-video" style={{ "--avatar-color": presence.color } as CSSProperties}>
        {camera?.isSubscribed && camera.track ? (
          <VideoSink publication={camera} mediaVersion={mediaVersion} />
        ) : (
          <span />
        )}
      </div>
      <div>
        <strong>{presence.name}</strong>
        <small>{distanceTiles < 1 ? "very close" : `${distanceTiles.toFixed(1)} tiles`}</small>
      </div>
      {microphone?.track && <AudioSink publication={microphone} gain={deafened ? 0 : gain} mediaVersion={mediaVersion} />}
      {screenAudio?.track && <AudioSink publication={screenAudio} gain={deafened ? 0 : gain} mediaVersion={mediaVersion} />}
    </div>
  );
}

function VideoSink({
  publication,
  mediaVersion
}: {
  publication?: RemoteTrackPublication;
  mediaVersion: number;
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

  return <video ref={ref} autoPlay playsInline muted={false} />;
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
    element.volume = gain;
    return () => {
      track.detach(element);
    };
  }, [publication.trackSid, publication.track, mediaVersion]);

  useEffect(() => {
    if (ref.current) ref.current.volume = gain;
  }, [gain]);

  return <audio ref={ref} autoPlay playsInline />;
}

function publicationFor(participant: RemoteParticipant, source: Track.Source) {
  return Array.from(participant.trackPublications.values()).find(
    (publication) => publication.source === source
  ) as RemoteTrackPublication | undefined;
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}
