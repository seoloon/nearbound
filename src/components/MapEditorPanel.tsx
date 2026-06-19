import { Box, Grid3X3, Hammer, Layers, MousePointer2, PanelRightClose } from "lucide-react";
import { useMemo, useState } from "react";
import { ASSET_BASE, OFFICE_ASSETS, type AssetId } from "../game/assets";
import { TILE, type OfficeMap } from "../game/map";

type EditorTab = "zone" | "build" | "props";

const BUILD_ASSETS = [
  "floor_wood",
  "floor_blue",
  "floor_checker",
  "wall_brick",
  "wall_tan",
  "wall_stone"
] satisfies AssetId[];
const BUILD_ASSET_SET: ReadonlySet<AssetId> = new Set(BUILD_ASSETS);

const EDITOR_TABS: Array<{ id: EditorTab; label: string; icon: typeof Layers }> = [
  { id: "zone", label: "Zone", icon: Layers },
  { id: "build", label: "Build", icon: Hammer },
  { id: "props", label: "Props", icon: Box }
];

interface MapEditorPanelProps {
  map: OfficeMap;
  onClose: () => void;
}

export function MapEditorPanel({ map, onClose }: MapEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("props");
  const [selectedAsset, setSelectedAsset] = useState<AssetId>("desk_simple");
  const propAssets = useMemo(
    () => (Object.keys(OFFICE_ASSETS) as AssetId[]).filter((id) => !BUILD_ASSET_SET.has(id)),
    []
  );

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
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="map-editor-body">
        {activeTab === "zone" && <ZoneTab map={map} />}
        {activeTab === "build" && (
          <BuildTab selectedAsset={selectedAsset} onSelectAsset={setSelectedAsset} />
        )}
        {activeTab === "props" && (
          <PropsTab assets={propAssets} selectedAsset={selectedAsset} onSelectAsset={setSelectedAsset} />
        )}
      </div>
    </aside>
  );
}

function ZoneTab({ map }: { map: OfficeMap }) {
  return (
    <div className="editor-section">
      <div className="editor-tool-row">
        <button type="button" className="is-active">
          <MousePointer2 size={16} />
          <span>Select</span>
        </button>
        <button type="button">
          <Grid3X3 size={16} />
          <span>Draw</span>
        </button>
      </div>
      <div className="zone-editor-list">
        {map.zones.map((zone) => (
          <article className="zone-editor-item" key={zone.id}>
            <span className={`zone-kind is-${zone.kind}`} />
            <div>
              <strong>{zone.name}</strong>
              <small>{zone.kind} - {zone.w / TILE} x {zone.h / TILE}</small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function BuildTab({
  selectedAsset,
  onSelectAsset
}: {
  selectedAsset: AssetId;
  onSelectAsset: (asset: AssetId) => void;
}) {
  return (
    <div className="editor-section">
      <div className="editor-tool-row">
        <button type="button" className="is-active">
          <Hammer size={16} />
          <span>Paint</span>
        </button>
        <button type="button">
          <MousePointer2 size={16} />
          <span>Erase</span>
        </button>
      </div>
      <AssetGrid assets={BUILD_ASSETS} selectedAsset={selectedAsset} onSelectAsset={onSelectAsset} />
    </div>
  );
}

function PropsTab({
  assets,
  selectedAsset,
  onSelectAsset
}: {
  assets: AssetId[];
  selectedAsset: AssetId;
  onSelectAsset: (asset: AssetId) => void;
}) {
  return (
    <div className="editor-section">
      <AssetGrid assets={assets} selectedAsset={selectedAsset} onSelectAsset={onSelectAsset} />
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
  return (
    <div className="asset-palette">
      {assets.map((asset) => (
        <button
          key={asset}
          type="button"
          className={selectedAsset === asset ? "is-selected" : ""}
          onClick={() => onSelectAsset(asset)}
          title={assetLabel(asset)}
          aria-label={assetLabel(asset)}
        >
          <span className="asset-thumb">
            <img src={`${ASSET_BASE}/${OFFICE_ASSETS[asset]}`} alt="" draggable={false} />
          </span>
          <span>{assetLabel(asset)}</span>
        </button>
      ))}
    </div>
  );
}

function assetLabel(asset: AssetId) {
  return asset.replace(/_/g, " ");
}
