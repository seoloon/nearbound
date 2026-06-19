from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "textures"
OUT = ROOT / "public" / "assets" / "office"


@dataclass(frozen=True)
class TextureSpec:
    id: str
    source: str
    category: str
    description: str
    crop: tuple[int, int, int, int] | None = None
    scale: float | None = None
    soften_dark_pixels: bool = False


@dataclass(frozen=True)
class AssetInfo:
    id: str
    file: str
    category: str
    source: str
    description: str
    width: int
    height: int


TEXTURES: tuple[TextureSpec, ...] = (
    TextureSpec(
        "floor_wood",
        "sol_chene_bois.png",
        "floor",
        "warm wood 16x16 floor tile cropped from source",
        crop=(0, 0, 16, 16),
        soften_dark_pixels=True,
    ),
    TextureSpec(
        "floor_blue",
        "sol_carreaux_bleu.png",
        "floor",
        "blue office 16x16 floor tile cropped from source",
        crop=(0, 0, 16, 16),
    ),
    TextureSpec(
        "floor_checker",
        "sol_checkerboard.png",
        "floor",
        "checker 16x16 floor tile cropped from source",
        crop=(0, 0, 16, 16),
    ),
    TextureSpec("desk_simple", "bureau.png", "furniture", "wooden office desk"),
    TextureSpec("chair_wood", "white_chair.png", "furniture", "white office chair"),
    TextureSpec("bookcase_small", "bookshelf4.png", "furniture", "small shelf"),
    TextureSpec("armchair_green", "royal_chair.png", "furniture", "green armchair"),
    TextureSpec("fireplace", "furnace_close.png", "furniture", "closed fireplace"),
    TextureSpec("writing_desk", "working_table.png", "furniture", "working table"),
    TextureSpec("meeting_table", "wooden_table2.png", "furniture", "small wooden table"),
    TextureSpec("stool_small", "dracula_chair.png", "furniture", "small dark stool"),
    TextureSpec("office_chair", "white_chair.png", "furniture", "white office chair"),
    TextureSpec("wardrobe_brown", "commode.png", "furniture", "round wooden cabinet"),
    TextureSpec("dresser_brown", "chest_of_drawers.png", "furniture", "wooden drawers"),
    TextureSpec("conference_table", "bureau.png", "furniture", "large meeting desk"),
    TextureSpec("bookcase_brown", "bibliotheque.png", "furniture", "large bookcase"),
    TextureSpec("coffee_table", "wooden_table.png", "furniture", "wooden coffee table"),
    TextureSpec("side_table", "DIY_table.png", "furniture", "small side table"),
    TextureSpec("chair_red", "fauteuil_rouge.png", "furniture", "red lounge chair"),
    TextureSpec("chair_blue", "blue_medieval_chair.png", "furniture", "blue lounge chair"),
    TextureSpec("bookshelf_lounge", "bookshelf6.png", "furniture", "filled lounge shelf"),
    TextureSpec("tv_console", "TV.png", "furniture", "television"),
    TextureSpec("couch_red_small", "leather_sofa.png", "furniture", "red leather sofa"),
    TextureSpec("round_table", "wooden_table2.png", "furniture", "small round table"),
    TextureSpec("window_blue", "fen*.png", "decor", "blue window"),
    TextureSpec("fridge", "server_rack.png", "furniture", "server rack used as utility cabinet"),
    TextureSpec("kitchen_counter", "chest_of_drawers.png", "furniture", "wooden service counter"),
    TextureSpec("presentation_screen", "old_fashioned_TV.png", "interactive", "presentation screen"),
    TextureSpec("wall_clock", "wall_clock.png", "decor", "wall clock"),
    TextureSpec("cozy_sofa", "aquarium_sofa.png", "furniture", "aquarium sofa"),
    TextureSpec("plant_arch", "flower_pot.png", "decor", "indoor plant"),
    TextureSpec("cabinet_big", "commode_face.png", "furniture", "front-facing cabinet"),
    TextureSpec("coffee_machine", "cooking_robot.png", "interactive", "coffee machine"),
    TextureSpec("water_feature", "mana_pool.png", "decor", "small water feature"),
    TextureSpec("rug_red", "tapis_rouge.png", "decor", "red rug"),
    TextureSpec("rug_blue", "tapis_bleu.png", "decor", "blue rug"),
    TextureSpec("rug_green", "tapis_vert.png", "decor", "green rug"),
    TextureSpec("rug_white", "tapis_blanc.png", "decor", "white rug"),
    TextureSpec("server_rack", "server_rack.png", "furniture", "server rack"),
    TextureSpec("sci_fi_console", "sci-fi_console.png", "furniture", "sci-fi console"),
    TextureSpec("sci_fi_desk", "sci-fi_desk.png", "furniture", "sci-fi desk"),
    TextureSpec("microscope", "microscope.png", "decor", "microscope"),
    TextureSpec("portable_camera", "portable_video_camera.png", "decor", "portable video camera", scale=0.65),
    TextureSpec("vital_monitor", "vital_signs_monitor.png", "decor", "vital signs monitor", scale=0.72),
    TextureSpec("loot_chest", "loot_chest2.png", "decor", "loot chest"),
    TextureSpec("chemistry_flasks", "chemistry_flasks.png", "decor", "chemistry flasks"),
    TextureSpec("mana_pool", "mana_pool.png", "decor", "mana pool"),
)


TEMP_WALLS = (
    ("wall_brick", "#9f4f3d", "#d3a085", "#71352d", "red brick wall tile"),
    ("wall_tan", "#c1914b", "#e2c783", "#8b6331", "tan brick wall tile"),
    ("wall_stone", "#87909a", "#c5ccd0", "#5b646d", "gray stone wall tile"),
)


def source_path(file_name: str) -> Path:
    if file_name.startswith("PACK"):
        raise ValueError(f"PACK spritesheets are intentionally excluded: {file_name}")
    if "*" in file_name:
        matches = sorted(path for path in SOURCE.glob(file_name) if not path.name.startswith("PACK"))
        if len(matches) == 1:
            return matches[0]
        raise FileNotFoundError(f"Expected one texture source for pattern {file_name!r}, found {len(matches)}")
    path = SOURCE / file_name
    if path.exists():
        return path
    raise FileNotFoundError(f"Missing texture source: {path}")


def write_texture(spec: TextureSpec) -> AssetInfo:
    src = source_path(spec.source)
    image = Image.open(src).convert("RGBA")
    if spec.crop:
        image = image.crop(spec.crop)
    if spec.scale:
        width = max(1, round(image.width * spec.scale))
        height = max(1, round(image.height * spec.scale))
        image = image.resize((width, height), Image.Resampling.NEAREST)
    if spec.soften_dark_pixels:
        pixels = image.load()
        for y in range(image.height):
            for x in range(image.width):
                red, green, blue, alpha = pixels[x, y]
                if alpha and red < 45 and green < 35 and blue < 30:
                    pixels[x, y] = (92, 52, 28, alpha)

    file_name = f"{spec.id}.png"
    image.save(OUT / file_name)
    return AssetInfo(
        id=spec.id,
        file=file_name,
        category=spec.category,
        source=f"assets/textures/{src.name}",
        description=spec.description,
        width=image.width,
        height=image.height,
    )


def write_wall(asset_id: str, base: str, mortar: str, shade: str, description: str) -> AssetInfo:
    image = Image.new("RGBA", (16, 16), base)
    draw = ImageDraw.Draw(image)
    for y in (4, 9, 14):
        draw.line((0, y, 15, y), fill=mortar)
    for y, offset in ((0, 0), (5, 5), (10, 0)):
        for x in range(offset, 16, 8):
            draw.line((x, y, x, min(15, y + 4)), fill=mortar)
    draw.line((0, 15, 15, 15), fill=shade)

    file_name = f"{asset_id}.png"
    image.save(OUT / file_name)
    return AssetInfo(
        id=asset_id,
        file=file_name,
        category="wall",
        source="generated temporary pixel art",
        description=f"{description}; temporary until PACK wall textures are sliced",
        width=16,
        height=16,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assets = [write_texture(spec) for spec in TEXTURES]
    assets.extend(write_wall(*wall) for wall in TEMP_WALLS)
    assets.sort(key=lambda item: item.id)

    with (OUT / "manifest.json").open("w", encoding="utf-8") as fp:
        json.dump([asdict(item) for item in assets], fp, ensure_ascii=False, indent=2)
        fp.write("\n")

    print(f"Generated {len(assets)} office assets in {OUT}")


if __name__ == "__main__":
    main()
