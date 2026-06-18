export const ASSET_BASE = "/assets/office";

export const OFFICE_ASSETS = {
  floor_wood: "floor_wood.png",
  floor_blue: "floor_blue.png",
  floor_checker: "floor_checker.png",
  wall_brick: "wall_brick.png",
  wall_tan: "wall_tan.png",
  wall_stone: "wall_stone.png",
  desk_simple: "desk_simple.png",
  chair_wood: "chair_wood.png",
  bookcase_small: "bookcase_small.png",
  armchair_green: "armchair_green.png",
  fireplace: "fireplace.png",
  writing_desk: "writing_desk.png",
  meeting_table: "meeting_table.png",
  stool_small: "stool_small.png",
  office_chair: "office_chair.png",
  wardrobe_brown: "wardrobe_brown.png",
  dresser_brown: "dresser_brown.png",
  conference_table: "conference_table.png",
  bookcase_brown: "bookcase_brown.png",
  coffee_table: "coffee_table.png",
  side_table: "side_table.png",
  chair_red: "chair_red.png",
  chair_blue: "chair_blue.png",
  bookshelf_lounge: "bookshelf_lounge.png",
  tv_console: "tv_console.png",
  couch_red_small: "couch_red_small.png",
  round_table: "round_table.png",
  window_blue: "window_blue.png",
  fridge: "fridge.png",
  kitchen_counter: "kitchen_counter.png",
  presentation_screen: "presentation_screen.png",
  wall_clock: "wall_clock.png",
  cozy_sofa: "cozy_sofa.png",
  plant_arch: "plant_arch.png",
  cabinet_big: "cabinet_big.png",
  coffee_machine: "coffee_machine.png",
  water_feature: "water_feature.png"
} as const;

export type AssetId = keyof typeof OFFICE_ASSETS;
export type ImageMap = Record<AssetId, HTMLImageElement>;

export async function loadOfficeImages(): Promise<ImageMap> {
  const entries = Object.entries(OFFICE_ASSETS) as [AssetId, string][];
  const loaded = await Promise.all(
    entries.map(([id, file]) => {
      return new Promise<[AssetId, HTMLImageElement]>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([id, image]);
        image.onerror = () => reject(new Error(`Unable to load ${file}`));
        image.src = `${ASSET_BASE}/${file}`;
      });
    })
  );

  return Object.fromEntries(loaded) as ImageMap;
}
