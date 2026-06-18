export type Direction = "down" | "up" | "left" | "right";
export type UserStatus = "available" | "dnd" | "inactive";
export type AvatarGender = "male" | "female";
export type AvatarHair = "short" | "bob" | "long" | "curly";
export type AvatarTop = "tee" | "hoodie" | "jacket";
export type AvatarBottom = "pants" | "shorts" | "skirt";
export type AvatarShoes = "sneakers" | "boots" | "slipons";
export type AvatarAccessory = "none" | "glasses" | "cap" | "headset";

export interface AvatarStyle {
  gender: AvatarGender;
  skin: string;
  hair: AvatarHair;
  hairColor: string;
  top: AvatarTop;
  topColor: string;
  bottom: AvatarBottom;
  bottomColor: string;
  shoes: AvatarShoes;
  shoeColor: string;
  accessory: AvatarAccessory;
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
