import type { CorridorId, CoverObject, PrisonMap, Vector } from "./types";

export const tileSize = 1;

export const prisonMap: PrisonMap = {
  width: 26,
  height: 12,
  tiles: [
    "##########################",
    "#..........##............#",
    "#..........##............#",
    "#..........##............#",
    "#........................#",
    "#........................#",
    "#..........##............#",
    "#..........##............#",
    "#..........##............#",
    "#........................#",
    "#........................#",
    "##########################",
  ],
  corridors: {
    cell_block: { minX: 1, maxX: 8, minY: 1, maxY: 10 },
    central_corridor: { minX: 9, maxX: 16, minY: 4, maxY: 10 },
    storage_room: { minX: 13, maxX: 16, minY: 6, maxY: 8 },
    east_corridor: { minX: 17, maxX: 24, minY: 4, maxY: 10 },
    security_room: { minX: 17, maxX: 24, minY: 1, maxY: 3 },
    exit_hall: { minX: 17, maxX: 24, minY: 7, maxY: 10 },
  },
  key: { id: "master_key", position: { x: 22.5, y: 2.5 } },
  exit: { id: "locked_exit", position: { x: 24.5, y: 9.5 } },
  pebbles: [
    { id: "pebble_alpha", position: { x: 3.5, y: 5.5 } },
    { id: "pebble_bravo", position: { x: 12.5, y: 9.5 } },
    { id: "pebble_charlie", position: { x: 18.5, y: 6.5 } },
    { id: "pebble_storage", position: { x: 15.55, y: 7.25 } },
  ],
  weaponPickups: [
    { id: "security_pistol", weaponId: "pistol", position: { x: 21.5, y: 2.5 } },
  ],
  healingPickups: [
    { id: "bandages_alpha", position: { x: 6.5, y: 9.5 }, amount: 1 },
    { id: "bandages_storage", position: { x: 13.4, y: 7.35 }, amount: 1 },
  ],
  doors: [
    { id: "starter_cell_door", position: { x: 2.55, y: 3.95 }, width: 0.9, height: 0.22, locked: false },
    { id: "security_room_door", position: { x: 17.5, y: 3.95 }, width: 0.95, height: 0.22, locked: true, keyId: "general_key" },
    { id: "central_service_door", position: { x: 14.5, y: 5.95 }, width: 0.95, height: 0.22, locked: false },
  ],
  doorKeyCarriers: [
    { guardId: "guard-1", keyId: "general_key" },
  ],
  hidingSpots: [
    { id: "locker_alpha", type: "locker", position: { x: 10.5, y: 4.5 } },
    { id: "locker_bravo", type: "locker", position: { x: 20.5, y: 8.5 } },
    { id: "shadow_nook", type: "shadow", position: { x: 2.5, y: 9.5 } },
    { id: "open_cell_shadow", type: "shadow", position: { x: 5.5, y: 2.5 } },
  ],
  coverObjects: [
    { id: "crate_central_alpha", position: { x: 9.65, y: 4.5 }, width: 0.9, height: 0.55 },
    { id: "security_room_west_wall", position: { x: 16.5, y: 2.5 }, width: 0.24, height: 3.0 },
    { id: "security_room_north_wall", position: { x: 20.75, y: 0.95 }, width: 7.5, height: 0.24 },
    { id: "security_room_south_wall_left", position: { x: 19.75, y: 3.95 }, width: 3.6, height: 0.24 },
    { id: "security_room_south_wall_right", position: { x: 23.5, y: 3.95 }, width: 3.0, height: 0.24 },
    { id: "cell_row_back_wall", position: { x: 5.0, y: 1.05 }, width: 7.9, height: 0.18 },
    { id: "starter_cell_left_wall", position: { x: 0.95, y: 2.5 }, width: 0.18, height: 2.9 },
    { id: "starter_prisoner_shared_wall", position: { x: 4.05, y: 2.5 }, width: 0.18, height: 2.9 },
    { id: "prisoner_cells_shared_wall", position: { x: 6.7, y: 2.5 }, width: 0.18, height: 2.9 },
    { id: "prisoner_cell_b_right_wall", position: { x: 8.95, y: 2.5 }, width: 0.18, height: 2.9 },
    { id: "starter_cell_front_wall_left", position: { x: 1.58, y: 3.95 }, width: 1.05, height: 0.18 },
    { id: "starter_cell_front_wall_right", position: { x: 3.55, y: 3.95 }, width: 1.0, height: 0.18 },
    { id: "prisoner_cell_a_front_wall", position: { x: 5.38, y: 3.95 }, width: 2.65, height: 0.18 },
    { id: "prisoner_cell_b_front_wall", position: { x: 7.83, y: 3.95 }, width: 2.25, height: 0.18 },
    { id: "central_service_wall_left", position: { x: 13.53, y: 5.95 }, width: 0.95, height: 0.24 },
    { id: "central_service_wall_right", position: { x: 15.95, y: 5.95 }, width: 1.95, height: 0.24 },
    { id: "central_low_cover", position: { x: 10.35, y: 8.55 }, width: 1.15, height: 0.42 },
    { id: "east_route_barrier", position: { x: 19.4, y: 7.45 }, width: 0.42, height: 1.15 },
    { id: "storage_room_west_wall", position: { x: 13.1, y: 7.35 }, width: 0.18, height: 2.55 },
    { id: "storage_room_east_wall", position: { x: 17.05, y: 7.35 }, width: 0.24, height: 2.55 },
    { id: "storage_room_south_wall", position: { x: 15.08, y: 8.65 }, width: 3.95, height: 0.24 },
    { id: "storage_room_crate", position: { x: 15.05, y: 7.35 }, width: 0.82, height: 0.56 },
  ],
  setDressingObjects: [
    { id: "starter_cell_bars", kind: "bars", position: { x: 2.55, y: 3.95 }, width: 0.9, height: 0.1 },
    { id: "prisoner_cell_a_bars", kind: "bars", position: { x: 5.38, y: 3.95 }, width: 2.65, height: 0.1 },
    { id: "prisoner_cell_b_bars", kind: "bars", position: { x: 7.83, y: 3.95 }, width: 2.25, height: 0.1 },
    { id: "starter_cell_cot", kind: "cot", position: { x: 2.05, y: 2.05 }, width: 1.2, height: 0.42 },
    { id: "starter_cell_toilet", kind: "toilet", position: { x: 3.45, y: 3.0 }, width: 0.38, height: 0.38 },
    { id: "prisoner_cell_a_cot", kind: "cot", position: { x: 5.25, y: 2.05 }, width: 1.0, height: 0.42 },
    { id: "prisoner_cell_a_toilet", kind: "toilet", position: { x: 6.2, y: 3.0 }, width: 0.38, height: 0.38 },
    { id: "prisoner_cell_a_prisoner", kind: "prisoner", position: { x: 5.55, y: 2.75 }, width: 0.34, height: 0.46 },
    { id: "prisoner_cell_b_cot", kind: "cot", position: { x: 7.55, y: 2.05 }, width: 1.0, height: 0.42 },
    { id: "prisoner_cell_b_toilet", kind: "toilet", position: { x: 8.45, y: 3.0 }, width: 0.38, height: 0.38 },
    { id: "prisoner_cell_b_prisoner", kind: "prisoner", position: { x: 7.95, y: 2.75 }, width: 0.34, height: 0.46 },
    { id: "security_desk", kind: "desk", position: { x: 20.2, y: 2.55 }, width: 1.25, height: 0.52 },
    { id: "security_monitor_bank", kind: "monitor", position: { x: 20.2, y: 2.1 }, width: 1.05, height: 0.18 },
    { id: "security_weapon_rack", kind: "weapon_rack", position: { x: 22.85, y: 1.55 }, width: 0.85, height: 0.22 },
  ],
  patrolRoutes: [
    {
      id: "west_loop",
      points: [
        { x: 8.5, y: 4.5, corridor: "central_corridor" },
        { x: 14.5, y: 4.5, corridor: "central_corridor" },
        { x: 14.5, y: 5.95, corridor: "central_corridor" },
        { x: 14.5, y: 6.45, corridor: "storage_room" },
        { x: 16.2, y: 6.45, corridor: "storage_room" },
        { x: 14.5, y: 6.45, corridor: "storage_room" },
        { x: 14.5, y: 5.95, corridor: "central_corridor" },
        { x: 14.5, y: 5.45, corridor: "central_corridor" },
        { x: 17.5, y: 5.45, corridor: "east_corridor" },
        { x: 17.5, y: 9.5, corridor: "east_corridor" },
        { x: 14.5, y: 9.5, corridor: "central_corridor" },
        { x: 8.5, y: 9.5, corridor: "central_corridor" },
      ],
    },
    {
      id: "east_loop",
      points: [
        { x: 17.5, y: 4.5, corridor: "east_corridor" },
        { x: 22.5, y: 4.5, corridor: "east_corridor" },
        { x: 22.5, y: 9.5, corridor: "exit_hall" },
        { x: 17.5, y: 9.5, corridor: "east_corridor" },
      ],
    },
  ],
  stationaryGuards: [
    { id: "guard-3", position: { x: 18.5, y: 5.5 }, facing: { x: -1, y: 0 }, corridor: "east_corridor" },
  ],
  reserveGuardSpawn: { x: 22.5, y: 9.5 },
};

export function tileAt(map: PrisonMap, position: Vector): string {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return "#";
  }
  return map.tiles[y][x];
}

export function isWall(map: PrisonMap, position: Vector): boolean {
  return tileAt(map, position) === "#";
}

export function lockerCollisionObjects(map: PrisonMap): CoverObject[] {
  return map.hidingSpots
    .filter((spot) => spot.type === "locker")
    .map((spot) => ({
      id: spot.id,
      position: spot.position,
      width: 0.68,
      height: 0.9,
    }));
}

export function overlapsRectangle(
  position: Vector,
  radius: number,
  obstacle: { position: Vector; width: number; height: number },
): boolean {
  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  return (
    position.x + radius > obstacle.position.x - halfWidth &&
    position.x - radius < obstacle.position.x + halfWidth &&
    position.y + radius > obstacle.position.y - halfHeight &&
    position.y - radius < obstacle.position.y + halfHeight
  );
}

export function collidesWithSolidObjects(map: PrisonMap, position: Vector, radius: number): boolean {
  return [...map.coverObjects, ...lockerCollisionObjects(map)].some((obstacle) =>
    overlapsRectangle(position, radius, obstacle),
  );
}

export function corridorAt(map: PrisonMap, position: Vector): CorridorId | null {
  for (const [id, bounds] of Object.entries(map.corridors) as Array<
    [CorridorId, PrisonMap["corridors"][CorridorId]]
  >) {
    if (
      position.x >= bounds.minX &&
      position.x <= bounds.maxX + 1 &&
      position.y >= bounds.minY &&
      position.y <= bounds.maxY + 1
    ) {
      return id;
    }
  }
  return null;
}
