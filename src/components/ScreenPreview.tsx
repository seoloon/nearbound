import { Room, Track } from "livekit-client";
import { useEffect, useRef } from "react";

interface TrackLike {
  attach: (element: HTMLMediaElement) => unknown;
  detach: (element: HTMLMediaElement) => unknown;
}

interface PublicationLike {
  source?: Track.Source;
  track?: TrackLike;
  trackSid?: string;
}

interface ParticipantLike {
  trackPublications: Map<string, PublicationLike>;
}

export function LocalScreenPreview({
  room,
  active,
  mediaVersion
}: {
  room: Room | null;
  active: boolean;
  mediaVersion: number;
}) {
  if (!active || !room) return null;
  const publication = publicationFor(room.localParticipant as unknown as ParticipantLike, Track.Source.ScreenShare);

  return (
    <aside className="local-stream-preview">
      <header>Screen preview</header>
      {publication?.track ? (
        <AttachedVideo publication={publication} muted mediaVersion={mediaVersion} />
      ) : (
        <div className="stream-placeholder">Starting stream...</div>
      )}
    </aside>
  );
}

function AttachedVideo({
  publication,
  muted,
  mediaVersion
}: {
  publication: PublicationLike;
  muted?: boolean;
  mediaVersion: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    const track = publication.track;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication.trackSid, publication.track, mediaVersion]);

  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

function publicationFor(participant: ParticipantLike | undefined, source: Track.Source) {
  if (!participant) return undefined;
  return Array.from(participant.trackPublications.values()).find((publication) => publication.source === source);
}
