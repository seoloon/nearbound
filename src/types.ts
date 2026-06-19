export type Direction = "down" | "up" | "left" | "right";
export type UserStatus = "available" | "dnd" | "inactive";
export type AvatarPartKey = "hair" | "face" | "neck" | "clothing" | "hands" | "item";

export interface AvatarStyle {
  dna: string;
  topColor: string;
  backgroundColor: string;
}

export interface Session {
  identity: string;
  name: string;
  color: string;
  avatar: AvatarStyle;
  room: string;
}

export interface PlayerPresence {
  identity: string;
  name: string;
  color: string;
  avatar: AvatarStyle;
  status: UserStatus;
  bio: string;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  zoneId?: string;
  claimedOfficeId?: string;
  claimedOfficeName?: string;
  lastSeen: number;
}

export interface AppConfig {
  appName: string;
  defaultRoom: string;
  livekitConfigured: boolean;
}

export interface LiveKitTokenResponse {
  token: string;
  url: string;
  room: string;
}

export interface ChatMessage {
  id: string;
  identity: string;
  name: string;
  color: string;
  text: string;
  sentAt: number;
  local?: boolean;
}
