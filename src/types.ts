export type Direction = "down" | "up" | "left" | "right";
export type UserStatus = "available" | "dnd" | "inactive";

export interface Session {
  identity: string;
  name: string;
  color: string;
  room: string;
}

export interface PlayerPresence {
  identity: string;
  name: string;
  color: string;
  status: UserStatus;
  bio: string;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  zoneId?: string;
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
