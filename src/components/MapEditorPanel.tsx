import { Box, Grid3X3, Hammer, Layers, MousePointer2, PanelRightClose } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { OFFICE_ASSETS, OFFICE_ASSET_META, officeAssetUrl, type AssetId } from "../game/assets";
import {
  BUILD_ASSETS,
  BUILD_ASSET_SET,
  type MapEditorAction,
  type MapEditorMode,
  type MapEditorTab,
  type MapEditorTool,
  type MapEditorZoneType,
  ZONE_TYPE_OPTIONS,
  isBuildAsset
} from "../game/editor";
import { getZoneType, TILE, type OfficeMap } from "../game/map";

const EDITOR_TABS: Array<{ id: MapEditorTab; label: string; icon: typeof Layers }> = [
  { id: "zone", label: "Zone", icon: Layers },
  { id: "build", label: "Build", icon: Hammer },
  { id: "props", label: "Props", icon: Box }
];
const ASSET_GROUP_ORDER = [
  "floor",
  "wall",
  "desk",
  "living_room",
  "kitchen",
  "bathroom",
  "bedroom",
  "universal",
  "misc"
];
const ASSET_GROUP_LABELS: Record<string, string> = {
  floor: "Floors",
  wall: "Walls",
  desk: "Desks",
  living_room: "Living Room",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  universal: "Universal",
  misc: "Misc"
};

interface MapEditorPanelProps {
  map: OfficeMap;
  tool: MapEditorTool;
  onToolChange: (tool: MapEditorTool) => void;
  onClose: () => void;
}

export function MapEditorPanel({ map, tool, onToolChange, onClose }: MapEditorPanelProps) {
  const propAssets = useMemo(
    () => (Object.keys(OFFICE_ASSETS) as AssetId[]).filter((id) => !BUILD_ASSET_SET.has(id)),
    []
  );

  function updateTool(patch: Partial<MapEditorTool>) {
    onToolChange({ ...tool, ...patch });
  }

  function setActiveTab(activeTab: MapEditorTab) {
    let selectedAsset = tool.selectedAsset;
    if (activeTab === "build" && !isBuildAsset(selectedAsset)) selectedAsset = BUILD_ASSETS[0];
    if (activeTab === "props" && isBuildAsset(selectedAsset)) selectedAsset = propAssets[0];
    updateTool({
      activeTab,
      selectedAsset,
      pendingBroadcastFor: activeTab === "zone" ? tool.pendingBroadcastFor : undefined,
      pendingBroadcastName: activeTab === "zone" ? tool.pendingBroadcastName : undefined
    });
  }

  return (
    <aside className="map-editor-panel">
      <header className="map-editor-heading">
        <div>
          <h2>Map Editor</h2>
          <span>{map.width / TILE} x {map.height / TILE} tiles</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close map editor" title="Close map editor">
          <PanelRightClose size={18} />
        </button>
      </header>

      <div className="map-editor-tabs" role="tablist" aria-label="Map editor tools">
        {EDITOR_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={tool.activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={tool.activeTab === tab.id}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="map-editor-body">
        {tool.activeTab === "zone" && <ZoneTab map={map} tool={tool} onToolChange={updateTool} />}
        {tool.activeTab === "build" && (
          <BuildTab tool={tool} onToolChange={updateTool} />
        )}
        {tool.activeTab === "props" && (
          <PropsTab assets={propAssets} tool={tool} onToolChange={updateTool} />
        )}
      </div>
    </aside>
  );
}

function ZoneTab({
  map,
  tool,
  onToolChange
}: {
  map: OfficeMap;
  tool: MapEditorTool;
  onToolChange: (patch: Partial<MapEditorTool>) => void;
}) {
  const selectedZoneLabel =
    ZONE_TYPE_OPTIONS.find((zoneType) => zoneType.id === tool.selectedZoneType)?.label || "Zone";
  const filteredZones = map.zones.filter((zone) => zoneTypeForList(zone) === tool.selectedZoneType);
  const placingBroadcast = tool.selectedZoneType === "meeting" && tool.action === "place" && tool.pendingBroadcastFor;

  return (
    <div className="editor-section">
      <ToggleRow
        options={ZONE_TYPE_OPTIONS.map((zoneType) => ({ id: zoneType.id, label: zoneType.label }))}
        value={tool.selectedZoneType}
        onChange={(selectedZoneType) =>
          onToolChange({
            selectedZoneType,
            pendingBroadcastFor: undefined,
            pendingBroadcastName: undefined
          })
        }
        columns={2}
      />
      <ModeRow value={tool.zoneMode} onChange={(zoneMode) => onToolChange({ zoneMode })} />
      <ActionRow
        value={tool.action}
        onChange={(action) =>
          onToolChange({
            action,
            pendingBroadcastFor: action === "place" ? tool.pendingBroadcastFor : undefined,
            pendingBroadcastName: action === "place" ? tool.pendingBroadcastName : undefined
          })
        }
      />
      {placingBroadcast && (
        <div className="editor-hint">
          Place the Broadcast area for {tool.pendingBroadcastName || "this meeting"}.
        </div>
      )}
      <div className="zone-editor-list">
        {filteredZones.length === 0 ? (
          <div className="empty-chat">No {selectedZoneLabel.toLowerCase()} zones yet.</div>
        ) : (
          filteredZones.map((zone) => (
            <article className="zone-editor-item" key={zone.id}>
              <span className={`zone-kind is-${zone.kind}`} />
              <div>
                <strong>{zone.name}</strong>
                <small>{zone.subType === "broadcast" ? "broadcast" : zone.kind} - {zone.w / TILE} x {zone.h / TILE}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function BuildTab({
  tool,
  onToolChange
}: {
  tool: MapEditorTool;
  onToolChange: (patch: Partial<MapEditorTool>) => void;
}) {
  return (
    <div className="editor-section">
      <ModeRow value={tool.buildMode} onChange={(buildMode) => onToolChange({ buildMode })} />
      <ActionRow value={tool.action} onChange={(action) => onToolChange({ action })} />
      <AssetGrid
        assets={BUILD_ASSETS}
        selectedAsset={tool.selectedAsset}
        onSelectAsset={(selectedAsset) => onToolChange({ selectedAsset })}
      />
    </div>
  );
}

function PropsTab({
  assets,
  tool,
  onToolChange
}: {
  assets: AssetId[];
  tool: MapEditorTool;
  onToolChange: (patch: Partial<MapEditorTool>) => void;
}) {
  return (
    <div className="editor-section">
      <ActionRow value={tool.action} onChange={(action) => onToolChange({ action })} />
      <AssetGrid
        assets={assets}
        selectedAsset={tool.selectedAsset}
        onSelectAsset={(selectedAsset) => onToolChange({ selectedAsset })}
      />
    </div>
  );
}

function ModeRow({
  value,
  onChange
}: {
  value: MapEditorMode;
  onChange: (value: MapEditorMode) => void;
}) {
  return (
    <ToggleRow
      options={[
        { id: "simple", label: "Simple", icon: MousePointer2 },
        { id: "draw", label: "Draw", icon: Grid3X3 }
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function ActionRow({
  value,
  onChange
}: {
  value: MapEditorAction;
  onChange: (value: MapEditorAction) => void;
}) {
  return (
    <ToggleRow
      options={[
        { id: "place", label: "Place", icon: Hammer },
        { id: "erase", label: "Delete", icon: MousePointer2 }
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function ToggleRow<T extends string>({
  options,
  value,
  onChange,
  columns = options.length
}: {
  options: Array<{ id: T; label: string; icon?: typeof Layers }>;
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div className="editor-tool-row" style={{ "--editor-columns": columns } as CSSProperties}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "is-active" : ""}
            onClick={() => onChange(option.id)}
          >
            {Icon && <Icon size={16} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AssetGrid({
  assets,
  selectedAsset,
  onSelectAsset
}: {
  assets: readonly AssetId[];
  selectedAsset: AssetId;
  onSelectAsset: (asset: AssetId) => void;
}) {
  const groups = useMemo(() => groupAssets(assets), [assets]);

  return (
    <div className="asset-palette">
      {groups.map((group) => (
        <section className="asset-group" key={group.id}>
          <h3>
            <span>{group.label}</span>
            <small>{group.assets.length}</small>
          </h3>
          <div className="asset-grid">
            {group.assets.map((asset) => (
              <button
                key={asset}
                type="button"
                className={selectedAsset === asset ? "is-selected" : ""}
                onClick={() => onSelectAsset(asset)}
                title={assetLabel(asset)}
                aria-label={assetLabel(asset)}
              >
                <span className={`asset-thumb ${isBuildAsset(asset) ? "is-tile" : "is-prop"}`}>
                  <img src={officeAssetUrl(asset)} alt="" draggable={false} />
                </span>
                <span>{assetLabel(asset)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function assetLabel(asset: AssetId) {
  return OFFICE_ASSET_META[asset]?.label || asset.replace(/_/g, " ");
}

function groupAssets(assets: readonly AssetId[]) {
  const groups = new Map<string, AssetId[]>();
  for (const asset of assets) {
    const group = OFFICE_ASSET_META[asset]?.group || "misc";
    groups.set(group, [...(groups.get(group) || []), asset]);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => groupRank(left) - groupRank(right) || left.localeCompare(right))
    .map(([id, groupAssets]) => ({
      id,
      label: ASSET_GROUP_LABELS[id] || assetLabel(id as AssetId),
      assets: groupAssets
    }));
}

function groupRank(group: string) {
  const index = ASSET_GROUP_ORDER.indexOf(group);
  return index === -1 ? ASSET_GROUP_ORDER.length : index;
}

function zoneTypeForList(zone: OfficeMap["zones"][number]): MapEditorZoneType {
  return getZoneType(zone) || "office";
}
