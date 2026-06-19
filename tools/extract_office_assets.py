from __future__ import annotations

import json
import hashlib
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets"
OUT = ROOT / "public" / "assets" / "office"
ASSETS_TS = ROOT / "src" / "game" / "assets.ts"
MAX_AUTO_DIMENSION = 128


@dataclass(frozen=True)
class TextureSpec:
    id: str
    source: str
    category: str
    description: str
    crop: tuple[int, int, int, int] | None = None
    scale: float | None = None


@dataclass(frozen=True)
class AssetInfo:
    id: str
    file: str
    category: str
    group: str
    label: str
    source: str
    description: str
    width: int
    height: int


CORE_ALIASES: tuple[TextureSpec, ...] = (
    TextureSpec("floor_wood", "building/oak_planks.png", "floor", "stable alias for oak plank floor", crop=(0, 0, 16, 16)),
    TextureSpec("floor_blue", "building/sol_carreaux_bleu.png", "floor", "stable alias for blue tile floor", crop=(0, 0, 16, 16)),
    TextureSpec("floor_checker", "building/sol_checkerboard.png", "floor", "stable alias for checkerboard floor", crop=(0, 0, 16, 16)),
    TextureSpec("wall_brick", "building/bricks.png", "wall", "stable alias for brick wall", crop=(0, 0, 16, 16)),
    TextureSpec("wall_tan", "building/acacia_planks.png", "wall", "stable alias for tan wall", crop=(0, 0, 16, 16)),
    TextureSpec("wall_stone", "building/stone_bricks.png", "wall", "stable alias for stone wall", crop=(0, 0, 16, 16)),
    TextureSpec("desk_simple", "props/desk/bureau.png", "furniture", "office desk"),
    TextureSpec("chair_wood", "props/living_room/white_chair.png", "furniture", "white chair"),
    TextureSpec("bookcase_small", "props/living_room/bookshelf4.png", "furniture", "small bookcase"),
    TextureSpec("armchair_green", "props/living_room/royal_chair.png", "furniture", "royal armchair"),
    TextureSpec("fireplace", "props/living_room/furnace_close.png", "furniture", "closed fireplace"),
    TextureSpec("writing_desk", "props/living_room/working_table.png", "furniture", "working table"),
    TextureSpec("meeting_table", "props/living_room/wooden_table2.png", "furniture", "small meeting table"),
    TextureSpec("stool_small", "props/living_room/dracula_chair.png", "furniture", "small dark stool"),
    TextureSpec("office_chair", "props/living_room/white_chair.png", "furniture", "office chair"),
    TextureSpec("wardrobe_brown", "props/living_room/commode.png", "furniture", "round wooden cabinet"),
    TextureSpec("dresser_brown", "props/living_room/chest_of_drawers.png", "furniture", "wooden drawers"),
    TextureSpec("conference_table", "props/desk/bureau.png", "furniture", "large meeting desk"),
    TextureSpec("bookcase_brown", "props/living_room/bibliotheque.png", "furniture", "large bookcase"),
    TextureSpec("coffee_table", "props/living_room/wooden_table.png", "furniture", "wooden coffee table"),
    TextureSpec("side_table", "props/living_room/DIY_table.png", "furniture", "small side table"),
    TextureSpec("chair_red", "props/living_room/fauteuil_rouge.png", "furniture", "red lounge chair"),
    TextureSpec("chair_blue", "props/living_room/blue_medieval_chair.png", "furniture", "blue lounge chair"),
    TextureSpec("bookshelf_lounge", "props/universal/bookshelf6.png", "furniture", "filled lounge shelf"),
    TextureSpec("tv_console", "props/living_room/TV.png", "furniture", "television"),
    TextureSpec("couch_red_small", "props/living_room/leather_sofa.png", "furniture", "red leather sofa"),
    TextureSpec("round_table", "props/living_room/wooden_table2.png", "furniture", "small round table"),
    TextureSpec("window_blue", "props/universal/fenêtre.png", "decor", "blue window"),
    TextureSpec("fridge", "props/desk/server_rack.png", "furniture", "server rack used as utility cabinet"),
    TextureSpec("kitchen_counter", "props/living_room/chest_of_drawers.png", "furniture", "wooden service counter"),
    TextureSpec("presentation_screen", "props/living_room/old_fashioned_TV.png", "interactive", "presentation screen"),
    TextureSpec("wall_clock", "props/living_room/wall_clock.png", "decor", "wall clock"),
    TextureSpec("cozy_sofa", "props/living_room/aquarium_sofa.png", "furniture", "aquarium sofa"),
    TextureSpec("plant_arch", "props/living_room/flower_pot.png", "decor", "indoor plant"),
    TextureSpec("cabinet_big", "props/living_room/commode_face.png", "furniture", "front-facing cabinet"),
    TextureSpec("coffee_machine", "props/kitchen/cooking_robot.png", "interactive", "coffee machine"),
    TextureSpec("water_feature", "props/universal/mana_pool.png", "decor", "small water feature"),
    TextureSpec("rug_red", "props/living_room/tapis_rouge.png", "decor", "red rug"),
    TextureSpec("rug_blue", "props/living_room/tapis_bleu.png", "decor", "blue rug"),
    TextureSpec("rug_green", "props/living_room/tapis_vert.png", "decor", "green rug"),
    TextureSpec("rug_white", "props/living_room/tapis_blanc.png", "decor", "white rug"),
    TextureSpec("server_rack", "props/desk/server_rack.png", "furniture", "server rack"),
    TextureSpec("sci_fi_console", "props/desk/sci-fi_console.png", "furniture", "sci-fi console"),
    TextureSpec("sci_fi_desk", "props/desk/sci-fi_desk.png", "furniture", "sci-fi desk"),
    TextureSpec("microscope", "props/universal/microscope.png", "decor", "microscope"),
    TextureSpec("portable_camera", "props/universal/portable_video_camera.png", "decor", "portable video camera"),
    TextureSpec("vital_monitor", "props/universal/vital_signs_monitor.png", "decor", "vital signs monitor"),
    TextureSpec("loot_chest", "props/universal/loot_chest2.png", "decor", "loot chest"),
    TextureSpec("chemistry_flasks", "props/universal/chemistry_flasks.png", "decor", "chemistry flasks"),
    TextureSpec("mana_pool", "props/universal/mana_pool.png", "decor", "mana pool"),
)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    clear_generated_outputs()

    specs = list(CORE_ALIASES)
    specs.extend(building_specs())
    specs.extend(prop_specs(specs))

    assets: dict[str, AssetInfo] = {}
    for spec in specs:
        if spec.id in assets:
            continue
        assets[spec.id] = write_texture(spec)

    ordered_assets = sorted(assets.values(), key=lambda item: item.id)
    write_manifest(ordered_assets)
    write_assets_ts(ordered_assets, asset_digest(ordered_assets))
    print(f"Generated {len(ordered_assets)} office assets in {OUT}")


def clear_generated_outputs() -> None:
    for path in OUT.glob("*.png"):
        if path.name.startswith("_"):
            continue
        path.unlink()


def building_specs() -> list[TextureSpec]:
    specs: list[TextureSpec] = []
    for path in sorted((SOURCE / "building").glob("*.png")):
        if should_skip_source(path):
            continue
        material = sanitize_id(path.stem)
        for prefix, category in (("floor", "floor"), ("wall", "wall")):
            specs.append(
                TextureSpec(
                    f"{prefix}_{material}",
                    rel_source(path),
                    category,
                    f"{material.replace('_', ' ')} {category} tile",
                    crop=(0, 0, 16, 16),
                )
            )
    return specs


def prop_specs(existing_specs: list[TextureSpec]) -> list[TextureSpec]:
    used_ids = {spec.id for spec in existing_specs}
    props = [path for path in sorted((SOURCE / "props").rglob("*.png")) if not should_skip_source(path)]
    base_counts: dict[str, int] = {}
    for path in props:
        base_counts[sanitize_id(path.stem)] = base_counts.get(sanitize_id(path.stem), 0) + 1

    specs: list[TextureSpec] = []
    for path in props:
        base_id = sanitize_id(path.stem)
        parent_id = sanitize_id(path.parent.name)
        asset_id = base_id if base_counts[base_id] == 1 else f"{parent_id}_{base_id}"
        if asset_id in used_ids:
            continue
        specs.append(
            TextureSpec(
                asset_id,
                rel_source(path),
                category_for_prop(path),
                f"{asset_id.replace('_', ' ')} prop",
            )
        )
        used_ids.add(asset_id)
    return specs


def should_skip_source(path: Path) -> bool:
    if path.name.startswith("PACK"):
        return True
    if "demo" in path.stem.lower():
        return True
    with Image.open(path) as image:
        return image.width > MAX_AUTO_DIMENSION or image.height > MAX_AUTO_DIMENSION


def write_texture(spec: TextureSpec) -> AssetInfo:
    src = SOURCE / spec.source
    image = Image.open(src).convert("RGBA")
    if spec.crop:
        image = image.crop(spec.crop)
    if spec.scale:
        size = (max(1, round(image.width * spec.scale)), max(1, round(image.height * spec.scale)))
        image = image.resize(size, Image.Resampling.NEAREST)

    file_name = f"{spec.id}.png"
    image.save(OUT / file_name)
    return AssetInfo(
        id=spec.id,
        file=file_name,
        category=spec.category,
        group=group_for_source(spec.source, spec.category),
        label=label_for_id(spec.id),
        source=f"assets/{spec.source}",
        description=spec.description,
        width=image.width,
        height=image.height,
    )


def write_manifest(assets: list[AssetInfo]) -> None:
    with (OUT / "manifest.json").open("w", encoding="utf-8") as fp:
        json.dump([asdict(item) for item in assets], fp, ensure_ascii=False, indent=2)
        fp.write("\n")


def write_assets_ts(assets: list[AssetInfo], asset_version: str) -> None:
    asset_lines = [f'  {json.dumps(asset.id)}: {json.dumps(asset.file)},' for asset in assets]
    meta_lines = [
        f"  {json.dumps(asset.id)}: {json.dumps({'category': asset.category, 'group': asset.group, 'label': asset.label, 'source': asset.source, 'width': asset.width, 'height': asset.height}, ensure_ascii=False)},"
        for asset in assets
    ]
    build_ids = [asset.id for asset in assets if asset.category in {"floor", "wall"}]
    floor_layer_ids = [
        asset.id
        for asset in assets
        if asset.id.startswith("rug_")
        or asset.id.startswith("tapis_")
        or asset.id in {"mana_pool", "water_feature"}
    ]

    text = "\n".join(
        [
            'export const ASSET_BASE = "/assets/office";',
            f"export const ASSET_VERSION = {json.dumps(asset_version)};",
            "",
            "export const OFFICE_ASSETS = {",
            *asset_lines,
            "} as const;",
            "",
            "export type AssetId = keyof typeof OFFICE_ASSETS;",
            "export type ImageMap = Record<AssetId, HTMLImageElement>;",
            "",
            "export interface OfficeAssetMeta {",
            "  category: string;",
            "  group: string;",
            "  label: string;",
            "  source: string;",
            "  width: number;",
            "  height: number;",
            "}",
            "",
            "export const OFFICE_ASSET_META = {",
            *meta_lines,
            "} as const satisfies Record<AssetId, OfficeAssetMeta>;",
            "",
            "export const BUILD_ASSET_IDS = [",
            *[f"  {json.dumps(asset_id)}," for asset_id in build_ids],
            "] satisfies AssetId[];",
            "",
            "export const FLOOR_LAYER_ASSET_IDS = [",
            *[f"  {json.dumps(asset_id)}," for asset_id in floor_layer_ids],
            "] satisfies AssetId[];",
            "",
            "export function officeAssetUrl(asset: AssetId): string {",
            "  return `${ASSET_BASE}/${OFFICE_ASSETS[asset]}?v=${ASSET_VERSION}`;",
            "}",
            "",
            "export async function loadOfficeImages(): Promise<ImageMap> {",
            "  const entries = Object.entries(OFFICE_ASSETS) as [AssetId, string][];",
            "  const loaded = await Promise.all(",
            "    entries.map(([id, file]) => {",
            "      return new Promise<[AssetId, HTMLImageElement]>((resolve, reject) => {",
            "        const image = new Image();",
            "        image.onload = () => resolve([id, image]);",
            "        image.onerror = () => reject(new Error(`Unable to load ${file}`));",
            "        image.src = officeAssetUrl(id);",
            "      });",
            "    })",
            "  );",
            "",
            "  return Object.fromEntries(loaded) as ImageMap;",
            "}",
            "",
        ]
    )
    ASSETS_TS.write_text(text, encoding="utf-8")


def category_for_prop(path: Path) -> str:
    parts = {part.lower() for part in path.parts}
    if "desk" in parts or "bedroom" in parts or "living_room" in parts or "kitchen" in parts or "bathroom" in parts:
        return "furniture"
    return "decor"


def group_for_source(source: str, category: str) -> str:
    parts = source.split("/")
    if category in {"floor", "wall"}:
        return category
    if len(parts) >= 3 and parts[0] == "props":
        return parts[1]
    return "misc"


def label_for_id(asset_id: str) -> str:
    words = asset_id.replace("sci_fi", "sci-fi").replace("tv", "TV").replace("diy", "DIY").split("_")
    return " ".join(word.upper() if word in {"TV", "DIY"} else word.capitalize() for word in words)


def asset_digest(assets: list[AssetInfo]) -> str:
    digest = hashlib.sha256()
    for asset in assets:
        digest.update(asset.id.encode("utf-8"))
        digest.update(asset.file.encode("utf-8"))
        digest.update((OUT / asset.file).read_bytes())
    return digest.hexdigest()[:12]


def rel_source(path: Path) -> str:
    return path.relative_to(SOURCE).as_posix()


def sanitize_id(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", "and")
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise ValueError(f"Unable to create asset id from {value!r}")
    return normalized


if __name__ == "__main__":
    main()
