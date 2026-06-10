import type { CorridorId, PrisonMap, Vector } from "./types";

export const tileSize = 1;

export const prisonMap: PrisonMap = {
  width: 12,
  height: 8,
  tiles: [
    "############",
    "#..........#",
    "#..........#",
    "#.##.......#",
    "#.##.......#",
    "#..........#",
    "#..........#",
    "############",
  ],
  corridors: {
    west_corridor: { minX: 1, maxX: 3, minY: 1, maxY: 6 },
    central_corridor: { minX: 4, maxX: 6, minY: 1, maxY: 6 },
    east_corridor: { minX: 7, maxX: 10, minY: 1, maxY: 6 },
    security_room: { minX: 8, maxX: 10, minY: 1, maxY: 3 },
    exit_hall: { minX: 8, maxX: 10, minY: 4, maxY: 6 },
  },
  key: { id: "security_key", position: { x: 9.5, y: 2.5 } },
  exit: { id: "locked_exit", position: { x: 10.5, y: 5.5 } },
  hidingSpots: [
    { id: "locker_alpha", type: "locker", position: { x: 6.5, y: 2.5 } },
    { id: "locker_bravo", type: "locker", position: { x: 8.5, y: 5.5 } },
    { id: "shadow_nook", type: "shadow", position: { x: 1.5, y: 5.5 } },
  ],
  patrolRoutes: [
    {
      id: "west_loop",
      points: [
        { x: 3.5, y: 2.5, corridor: "central_corridor" },
        { x: 6.5, y: 2.5, corridor: "central_corridor" },
        { x: 6.5, y: 5.5, corridor: "central_corridor" },
        { x: 3.5, y: 5.5, corridor: "central_corridor" },
      ],
    },
    {
      id: "east_loop",
      points: [
        { x: 7.5, y: 2.5, corridor: "east_corridor" },
        { x: 9.5, y: 2.5, corridor: "security_room" },
        { x: 9.5, y: 5.5, corridor: "exit_hall" },
        { x: 7.5, y: 5.5, corridor: "east_corridor" },
      ],
    },
  ],
  reserveGuardSpawn: { x: 9.5, y: 5.5 },
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
