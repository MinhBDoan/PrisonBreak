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
  ],
  weaponPickups: [
    { id: "security_pistol", weaponId: "pistol", position: { x: 21.5, y: 2.5 } },
  ],
  healingPickups: [
    { id: "bandages_alpha", position: { x: 6.5, y: 9.5 }, amount: 1 },
  ],
  doors: [
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
  ],
  coverObjects: [
    { id: "crate_central_alpha", position: { x: 9.65, y: 4.5 }, width: 0.9, height: 0.55 },
    { id: "security_room_west_wall", position: { x: 16.5, y: 2.5 }, width: 0.24, height: 3.0 },
    { id: "security_room_north_wall", position: { x: 20.75, y: 0.95 }, width: 7.5, height: 0.24 },
    { id: "security_room_south_wall_left", position: { x: 19.75, y: 3.95 }, width: 3.6, height: 0.24 },
    { id: "security_room_south_wall_right", position: { x: 23.5, y: 3.95 }, width: 3.0, height: 0.24 },
    { id: "central_service_wall_left", position: { x: 12.95, y: 5.95 }, width: 2.1, height: 0.24 },
    { id: "central_service_wall_right", position: { x: 16.05, y: 5.95 }, width: 2.1, height: 0.24 },
  ],
  patrolRoutes: [
    {
      id: "west_loop",
      points: [
        { x: 8.5, y: 4.5, corridor: "central_corridor" },
        { x: 14.5, y: 4.5, corridor: "central_corridor" },
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
