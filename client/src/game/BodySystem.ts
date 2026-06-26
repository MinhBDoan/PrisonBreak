import type { BodyRecord, BodySystemState, Vector } from "./types";

function cloneVector(position: Vector): Vector {
  return { x: position.x, y: position.y };
}

function cloneBody(body: BodyRecord): BodyRecord {
  return {
    ...body,
    position: cloneVector(body.position),
  };
}

function cloneBodies(bodies: Record<string, BodyRecord>): Record<string, BodyRecord> {
  return Object.fromEntries(Object.entries(bodies).map(([guardId, body]) => [guardId, cloneBody(body)]));
}

export function createBodyState(): BodySystemState {
  return { bodies: {} };
}

export function addBody(state: BodySystemState, body: BodyRecord): BodySystemState {
  return {
    bodies: {
      ...cloneBodies(state.bodies),
      [body.guardId]: cloneBody(body),
    },
  };
}

export function discoverBody(state: BodySystemState, body: BodyRecord): BodySystemState {
  return addBody(state, body);
}

export function wakeGuard(state: BodySystemState, guardId: string, wokenBy: string): BodySystemState {
  const bodies = cloneBodies(state.bodies);
  const body = bodies[guardId];
  void wokenBy;

  if (body?.bodyState === "knocked_out") {
    delete bodies[guardId];
  }

  return { bodies };
}
