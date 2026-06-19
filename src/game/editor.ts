import type { AssetId } from "./assets";
import type { Zone } from "./map";

export type MapEditorTab = "zone" | "build" | "props";
export type MapEditorMode = "simple" | "draw";
export type MapEditorAction = "place" | "erase";
export type MapEditorZoneType = "office" | "living" | "meeting" | "hitbox";

export interface MapEditorTool {
  activeTab: MapEditorTab;
  action: MapEditorAction;
  buildMode: MapEditorMode;
  zoneMode: MapEditorMode;
  selectedAsset: AssetId;
  selectedZoneType: MapEditorZoneType;
  pendingBroadcastFor?: string;
  pendingBroadcastName?: string;
}

export const BUILD_ASSETS = [
  "floor_wood",
  "floor_blue",
  "floor_checker",
  "wall_brick",
  "wall_tan",
  "wall_stone"
] satisfies AssetId[];

export const BUILD_ASSET_SET: ReadonlySet<AssetId> = new Set(BUILD_ASSETS);

export const DEFAULT_MAP_EDITOR_TOOL: MapEditorTool = {
  activeTab: "props",
  action: "place",
  buildMode: "simple",
  zoneMode: "draw",
  selectedAsset: "desk_simple",
  selectedZoneType: "office"
};

export const ZONE_TYPE_OPTIONS: Array<{
  id: MapEditorZoneType;
  label: string;
  kind: Zone["kind"];
  blocks: boolean;
}> = [
  { id: "office", label: "Office", kind: "private", blocks: false },
  { id: "living", label: "Living Area", kind: "social", blocks: false },
  { id: "meeting", label: "Meeting", kind: "private", blocks: false },
  { id: "hitbox", label: "Hitbox", kind: "open", blocks: true }
];

export function zoneTypeConfig(type: MapEditorZoneType) {
  return ZONE_TYPE_OPTIONS.find((option) => option.id === type) || ZONE_TYPE_OPTIONS[0];
}

export function isBuildAsset(asset: AssetId) {
  return BUILD_ASSET_SET.has(asset);
}

export function isFloorAsset(asset: AssetId) {
  return asset.startsWith("floor_");
}

export function isWallAsset(asset: AssetId) {
  return asset.startsWith("wall_");
}

export function isFloorLayerProp(asset: AssetId) {
  return asset.startsWith("rug_") || asset === "mana_pool" || asset === "water_feature";
}
