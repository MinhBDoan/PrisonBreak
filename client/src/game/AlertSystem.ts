import type { AlertLevel, AlertState, BodyState } from "./types";

const minPressure = 0;
const maxPressure = 100;

const alertOrder: AlertLevel[] = ["calm", "suspicious", "alert", "armed_response", "lockdown_pressure"];

function clampPressure(pressure: number): number {
  return Math.min(maxPressure, Math.max(minPressure, pressure));
}

function reachedArmedResponse(level: AlertLevel): boolean {
  return level === "armed_response" || level === "lockdown_pressure";
}

function nextLevel(level: AlertLevel): AlertLevel {
  const index = alertOrder.indexOf(level);
  return alertOrder[Math.min(alertOrder.length - 1, index + 1)];
}

function stageEscalation(currentLevel: AlertLevel, pressure: number): AlertLevel {
  const pressureLevel = levelForPressure(pressure);
  const currentIndex = alertOrder.indexOf(currentLevel);
  const pressureIndex = alertOrder.indexOf(pressureLevel);

  if (pressureIndex <= currentIndex) {
    return currentLevel;
  }

  return pressureIndex > currentIndex + 1 ? nextLevel(currentLevel) : pressureLevel;
}

function stageCooling(currentLevel: AlertLevel, pressure: number): AlertLevel {
  const pressureLevel = levelForPressure(pressure);

  return alertOrder.indexOf(pressureLevel) < alertOrder.indexOf(currentLevel) ? pressureLevel : currentLevel;
}

export function createAlertState(): AlertState {
  return {
    level: "calm",
    pressure: 0,
    armedResponseTriggered: false,
  };
}

export function levelForPressure(pressure: number): AlertLevel {
  if (pressure >= 90) {
    return "lockdown_pressure";
  }
  if (pressure >= 60) {
    return "armed_response";
  }
  if (pressure >= 35) {
    return "alert";
  }
  if (pressure >= 10) {
    return "suspicious";
  }
  return "calm";
}

export function withPressure(state: AlertState, pressure: number): AlertState {
  const clampedPressure = clampPressure(pressure);
  const level = levelForPressure(clampedPressure);

  return {
    level,
    pressure: clampedPressure,
    armedResponseTriggered: state.armedResponseTriggered || reachedArmedResponse(level),
  };
}

export function registerNoise(state: AlertState, noise: number): AlertState {
  const pressure = clampPressure(state.pressure + Math.max(0, noise) / 2);
  const stagedLevel = stageEscalation(state.level, pressure);

  return {
    level: stagedLevel,
    pressure,
    armedResponseTriggered: state.armedResponseTriggered || reachedArmedResponse(stagedLevel),
  };
}

export function registerBodyDiscovery(state: AlertState, bodyState: Exclude<BodyState, "active">): AlertState {
  const pressureIncrease = bodyState === "dead" ? 35 : 18;
  const pressure = clampPressure(state.pressure + pressureIncrease);
  const stagedLevel = stageEscalation(state.level, pressure);

  return {
    level: stagedLevel,
    pressure,
    armedResponseTriggered: state.armedResponseTriggered || reachedArmedResponse(stagedLevel),
  };
}

export function tickAlert(state: AlertState, deltaMs: number): AlertState {
  const pressure = clampPressure(state.pressure - Math.max(0, deltaMs) * 0.004);
  const stagedLevel = stageCooling(state.level, pressure);

  return {
    level: stagedLevel,
    pressure,
    armedResponseTriggered: state.armedResponseTriggered || reachedArmedResponse(stagedLevel),
  };
}
