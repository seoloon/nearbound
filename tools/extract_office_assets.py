from __future__ import annotations

import json
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "office"

INK = "#2b211b"
INK_SOFT = "#4a3527"
WOOD = "#a96b38"
WOOD_DARK = "#704226"
WOOD_LIGHT = "#d08a4c"
GOLD = "#d5a64a"
METAL = "#737b82"
METAL_DARK = "#3e464b"
FABRIC_RED = "#b84b4b"
FABRIC_BLUE = "#4d76b8"
FABRIC_GREEN = "#5f9b63"
FABRIC_PURPLE = "#8f5aa8"


@dataclass
class AssetInfo:
    id: str
    file: str
    category: str
    source: str
    description: str
    width: int
    height: int


def rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str | None = None) -> None:
    draw.rectangle(box, fill=fill, outline=outline)


def asset(
    asset_id: str,
    size: tuple[int, int],
    category: str,
    description: str,
    painter: Callable[[ImageDraw.ImageDraw], None],
) -> AssetInfo:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    painter(ImageDraw.Draw(image))
    file_name = f"{asset_id}.png"
    image.save(OUT / file_name)
    return AssetInfo(
        id=asset_id,
        file=file_name,
        category=category,
        source="generated temporary pixel art",
        description=description,
        width=size[0],
        height=size[1],
    )


def floor(asset_id: str, base: str, accent: str, dark: str, pattern: str) -> AssetInfo:
    def paint(draw: ImageDraw.ImageDraw) -> None:
        rect(draw, (0, 0, 15, 15), base)
        if pattern == "wood":
            for y in (4, 9, 14):
                draw.line((0, y, 15, y), fill=dark)
            for x, y1, y2 in ((6, 0, 4), (11, 5, 9), (4, 10, 14)):
                draw.line((x, y1, x, y2), fill=dark)
            draw.point([(2, 2), (13, 7), (8, 12)], fill=accent)
        elif pattern == "carpet":
            for x in range(0, 16, 4):
                draw.line((x, 0, x, 15), fill=dark)
            for y in range(0, 16, 4):
                draw.line((0, y, 15, y), fill=dark)
            rect(draw, (1, 1, 14, 14), base)
            draw.point([(3, 4), (10, 2), (12, 11), (5, 13)], fill=accent)
        elif pattern == "checker":
            for y in range(0, 16, 8):
                for x in range(0, 16, 8):
                    rect(draw, (x, y, x + 7, y + 7), accent if (x + y) % 16 == 0 else dark)
            draw.line((0, 0, 15, 0), fill=base)
            draw.line((0, 15, 15, 15), fill=base)

    return asset(asset_id, (16, 16), "floor", f"{pattern} 16x16 floor tile", paint)


def wall(asset_id: str, base: str, mortar: str, shade: str, description: str) -> AssetInfo:
    def paint(draw: ImageDraw.ImageDraw) -> None:
        rect(draw, (0, 0, 15, 15), base)
        for y in (4, 9, 14):
            draw.line((0, y, 15, y), fill=mortar)
        for y, offset in ((0, 0), (5, 5), (10, 0)):
            for x in range(offset, 16, 8):
                draw.line((x, y, x, min(15, y + 4)), fill=mortar)
        draw.line((0, 15, 15, 15), fill=shade)

    return asset(asset_id, (16, 16), "wall", description, paint)


def draw_table(draw: ImageDraw.ImageDraw, w: int, h: int, color: str = WOOD) -> None:
    rect(draw, (2, 4, w - 3, h - 8), color, INK)
    rect(draw, (4, 2, w - 5, 5), WOOD_LIGHT)
    for x in (5, w - 9):
        rect(draw, (x, h - 8, x + 4, h - 2), WOOD_DARK)
    draw.line((3, h - 7, w - 4, h - 7), fill=WOOD_DARK)


def draw_chair(draw: ImageDraw.ImageDraw, fabric: str, side: bool = False) -> None:
    if side:
        rect(draw, (4, 5, 10, 20), fabric, INK)
        rect(draw, (8, 16, 15, 24), fabric, INK)
        rect(draw, (5, 24, 8, 28), WOOD_DARK)
        rect(draw, (13, 24, 15, 28), WOOD_DARK)
    else:
        rect(draw, (4, 3, 19, 14), fabric, INK)
        rect(draw, (2, 13, 21, 22), fabric, INK)
        rect(draw, (5, 22, 8, 27), WOOD_DARK)
        rect(draw, (16, 22, 19, 27), WOOD_DARK)
        rect(draw, (6, 5, 17, 8), "#ffffff55")


def draw_bookcase(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    rect(draw, (2, 2, w - 3, h - 3), WOOD_DARK, INK)
    rect(draw, (5, 5, w - 6, h - 6), "#3c251a")
    for y in range(12, h - 7, 12):
        draw.line((5, y, w - 6, y), fill=WOOD_LIGHT)
    colors = ["#64b37a", "#d3c65b", "#5d83c5", "#d96f57", "#a46fc3"]
    x = 7
    y = 7
    i = 0
    while y < h - 13:
        rect(draw, (x, y, x + 2, y + 6), colors[i % len(colors)])
        x += 4
        i += 1
        if x > w - 10:
            x = 7
            y += 12


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    assets: list[AssetInfo] = [
        floor("floor_wood", "#b77638", "#e0a25b", "#7b4b28", "warm wood plank floor tile"),
        floor("floor_blue", "#6682b8", "#9db4dd", "#4c6596", "blue office carpet tile"),
        floor("floor_checker", "#2d3030", "#d7d0bd", "#5a6364", "gray checker tile"),
        wall("wall_brick", "#9f4f3d", "#d3a085", "#71352d", "red brick wall tile"),
        wall("wall_tan", "#c1914b", "#e2c783", "#8b6331", "tan brick wall tile"),
        wall("wall_stone", "#87909a", "#c5ccd0", "#5b646d", "gray stone wall tile"),
        asset("desk_simple", (34, 18), "furniture", "simple wooden desk", lambda d: draw_table(d, 34, 18)),
        asset("chair_wood", (18, 28), "furniture", "wooden chair", lambda d: draw_chair(d, "#b87943", True)),
        asset("bookcase_small", (28, 34), "furniture", "small bookcase", lambda d: draw_bookcase(d, 28, 34)),
        asset("armchair_green", (28, 30), "furniture", "green armchair", lambda d: draw_chair(d, FABRIC_GREEN)),
        asset("fireplace", (32, 30), "furniture", "brick fireplace", paint_fireplace),
        asset("writing_desk", (38, 28), "furniture", "writing desk", paint_writing_desk),
        asset("meeting_table", (42, 24), "furniture", "work table", lambda d: draw_table(d, 42, 24)),
        asset("stool_small", (18, 18), "furniture", "small stool", paint_stool),
        asset("office_chair", (24, 28), "furniture", "office chair", paint_office_chair),
        asset("wardrobe_brown", (48, 56), "furniture", "large wooden wardrobe", paint_wardrobe),
        asset("dresser_brown", (48, 38), "furniture", "wooden dresser", paint_dresser),
        asset("conference_table", (64, 36), "furniture", "conference table", paint_conference_table),
        asset("bookcase_brown", (50, 62), "furniture", "large bookcase", lambda d: draw_bookcase(d, 50, 62)),
        asset("coffee_table", (48, 22), "furniture", "coffee table", lambda d: draw_table(d, 48, 22)),
        asset("side_table", (24, 28), "furniture", "side table", paint_side_table),
        asset("chair_red", (18, 30), "furniture", "red side chair", lambda d: draw_chair(d, FABRIC_RED, True)),
        asset("chair_blue", (18, 30), "furniture", "blue side chair", lambda d: draw_chair(d, FABRIC_BLUE, True)),
        asset("bookshelf_lounge", (24, 58), "furniture", "tall lounge shelf", lambda d: draw_bookcase(d, 24, 58)),
        asset("tv_console", (56, 34), "furniture", "TV console", paint_tv_console),
        asset("couch_red_small", (64, 28), "furniture", "red couch", lambda d: paint_sofa(d, FABRIC_RED, 64, 28)),
        asset("round_table", (32, 28), "furniture", "round table", paint_round_table),
        asset("window_blue", (32, 32), "decor", "blue window", paint_window),
        asset("fridge", (24, 56), "furniture", "refrigerator", paint_fridge),
        asset("kitchen_counter", (70, 32), "furniture", "kitchen counter", paint_kitchen_counter),
        asset("presentation_screen", (48, 38), "interactive", "presentation screen", paint_presentation_screen),
        asset("wall_clock", (14, 28), "decor", "wall clock", paint_clock),
        asset("cozy_sofa", (48, 26), "furniture", "cozy sofa", lambda d: paint_sofa(d, "#c66852", 48, 26)),
        asset("plant_arch", (40, 46), "decor", "large indoor plant", paint_plant),
        asset("cabinet_big", (48, 30), "furniture", "wide storage cabinet", paint_cabinet),
        asset("coffee_machine", (22, 30), "interactive", "coffee machine", paint_coffee_machine),
        asset("water_feature", (38, 24), "decor", "small water feature", paint_water_feature),
    ]

    with (OUT / "manifest.json").open("w", encoding="utf-8") as fp:
        json.dump([asdict(item) for item in assets], fp, ensure_ascii=False, indent=2)

    print(f"Generated {len(assets)} temporary office assets in {OUT}")


def paint_fireplace(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (2, 4, 29, 27), "#8f473b", INK)
    rect(draw, (7, 10, 24, 25), "#2d211c", INK)
    rect(draw, (9, 18, 22, 24), "#5d2b1e")
    rect(draw, (12, 14, 15, 22), "#f3c45b")
    rect(draw, (16, 12, 19, 22), "#e05c32")
    for y in (8, 16):
        draw.line((3, y, 28, y), fill="#c97862")


def paint_writing_desk(draw: ImageDraw.ImageDraw) -> None:
    draw_table(draw, 38, 28)
    rect(draw, (5, 10, 16, 23), WOOD_DARK, INK)
    rect(draw, (21, 10, 32, 23), WOOD_DARK, INK)
    for y in (14, 19):
        draw.line((6, y, 15, y), fill=GOLD)
        draw.line((22, y, 31, y), fill=GOLD)


def paint_stool(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (4, 3, 13, 8), WOOD_LIGHT, INK)
    rect(draw, (5, 8, 7, 16), WOOD_DARK)
    rect(draw, (11, 8, 13, 16), WOOD_DARK)


def paint_office_chair(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (6, 2, 17, 14), "#3f454a", INK)
    rect(draw, (3, 13, 20, 22), "#4d555d", INK)
    draw.line((12, 22, 12, 26), fill=METAL_DARK)
    draw.line((7, 26, 17, 26), fill=METAL_DARK)
    draw.point([(5, 27), (19, 27)], fill=INK)


def paint_wardrobe(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (3, 2, 44, 53), WOOD_DARK, INK)
    rect(draw, (7, 8, 23, 48), "#8a5631", INK_SOFT)
    rect(draw, (25, 8, 41, 48), "#8a5631", INK_SOFT)
    rect(draw, (22, 7, 25, 49), WOOD_LIGHT)
    draw.point([(20, 29), (28, 29)], fill=GOLD)


def paint_dresser(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (3, 3, 44, 35), WOOD_DARK, INK)
    for y in (7, 17, 27):
        rect(draw, (7, y, 40, y + 7), "#8e5830", INK_SOFT)
        draw.point((24, y + 4), fill=GOLD)


def paint_conference_table(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (4, 7, 59, 26), "#9b6338", INK)
    rect(draw, (7, 4, 56, 9), WOOD_LIGHT)
    rect(draw, (10, 26, 15, 33), WOOD_DARK)
    rect(draw, (49, 26, 54, 33), WOOD_DARK)
    draw.line((5, 17, 58, 17), fill=WOOD_DARK)


def paint_side_table(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (4, 5, 19, 15), WOOD_LIGHT, INK)
    rect(draw, (7, 15, 10, 25), WOOD_DARK)
    rect(draw, (15, 15, 18, 25), WOOD_DARK)
    rect(draw, (8, 2, 15, 5), "#69b16f")


def paint_tv_console(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (5, 3, 50, 22), "#24292d", INK)
    rect(draw, (9, 7, 46, 18), "#5e7891")
    rect(draw, (14, 24, 42, 30), WOOD_DARK, INK)
    draw.line((28, 22, 28, 24), fill=METAL)


def paint_sofa(draw: ImageDraw.ImageDraw, fabric: str, w: int, h: int) -> None:
    rect(draw, (5, 8, w - 6, h - 4), fabric, INK)
    rect(draw, (1, 13, 9, h - 3), fabric, INK)
    rect(draw, (w - 10, 13, w - 2, h - 3), fabric, INK)
    rect(draw, (9, 5, w - 10, 12), fabric, INK)
    draw.line((w // 2, 11, w // 2, h - 5), fill="#7d3030")


def paint_round_table(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((4, 4, 27, 19), fill=WOOD_LIGHT, outline=INK)
    draw.ellipse((9, 7, 22, 16), outline=WOOD_DARK)
    rect(draw, (13, 18, 18, 25), WOOD_DARK)


def paint_window(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (3, 3, 28, 28), "#7b3f36", INK)
    rect(draw, (6, 6, 15, 15), "#5fd7e6", "#d8f7ff")
    rect(draw, (17, 6, 26, 15), "#5fd7e6", "#d8f7ff")
    rect(draw, (6, 17, 15, 26), "#4bb9d4", "#d8f7ff")
    rect(draw, (17, 17, 26, 26), "#4bb9d4", "#d8f7ff")


def paint_fridge(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (3, 2, 20, 53), "#d4d8d5", INK)
    draw.line((4, 22, 19, 22), fill=METAL)
    rect(draw, (16, 8, 18, 18), METAL_DARK)
    rect(draw, (16, 29, 18, 43), METAL_DARK)
    draw.line((5, 4, 18, 4), fill="#ffffff")


def paint_kitchen_counter(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (2, 6, 67, 28), "#9d653d", INK)
    rect(draw, (2, 4, 67, 8), "#d7d0bd", INK)
    rect(draw, (8, 11, 28, 24), "#b97a4a", INK_SOFT)
    rect(draw, (40, 11, 61, 24), "#b97a4a", INK_SOFT)
    rect(draw, (47, 2, 55, 6), "#5fd7e6")


def paint_presentation_screen(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (2, 2, 45, 28), "#191d1f", INK)
    rect(draw, (5, 5, 42, 25), "#31445d")
    rect(draw, (9, 9, 36, 12), "#8cc7ff")
    rect(draw, (9, 16, 27, 19), "#f2d36b")
    draw.line((24, 29, 24, 35), fill=METAL)
    draw.line((14, 35, 34, 35), fill=METAL_DARK)


def paint_clock(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (5, 2, 8, 25), WOOD_DARK, INK)
    draw.ellipse((2, 1, 11, 10), fill="#f6e8b8", outline=INK)
    draw.line((7, 6, 7, 3), fill=INK)
    draw.line((7, 6, 10, 6), fill=INK)
    draw.ellipse((4, 18, 9, 25), fill=GOLD, outline=INK)


def paint_plant(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (14, 32, 25, 43), "#8f4f38", INK)
    rect(draw, (17, 21, 22, 34), "#3f7e43")
    leaves = [(5, 16, 20, 30), (19, 14, 35, 29), (10, 6, 25, 22), (17, 3, 31, 18)]
    for box in leaves:
        draw.ellipse(box, fill="#5fbf69", outline="#2f6d3c")


def paint_cabinet(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (3, 4, 44, 26), "#af7545", INK)
    rect(draw, (6, 7, 42, 11), WOOD_LIGHT)
    draw.line((24, 12, 24, 25), fill=INK_SOFT)
    draw.point([(20, 18), (28, 18)], fill=GOLD)


def paint_coffee_machine(draw: ImageDraw.ImageDraw) -> None:
    rect(draw, (4, 2, 18, 25), "#2f4858", INK)
    rect(draw, (7, 5, 15, 10), "#7cd0ff")
    rect(draw, (8, 14, 16, 22), "#63a06b", INK)
    rect(draw, (2, 25, 20, 28), "#1d262b")
    draw.point([(6, 12), (9, 12), (12, 12)], fill=GOLD)


def paint_water_feature(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((2, 5, 35, 20), fill="#627176", outline=INK)
    draw.ellipse((6, 7, 31, 18), fill="#2ba6c8", outline="#b7f5ff")
    draw.ellipse((13, 9, 24, 15), fill="#6ee8ff")
    draw.point([(10, 11), (17, 7), (27, 13)], fill="#ffffff")


if __name__ == "__main__":
    main()
