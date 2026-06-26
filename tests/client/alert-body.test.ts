import { describe, expect, it } from "vitest";
import {
  addBody,
  createBodyState,
  discoverBody,
  wakeGuard,
} from "../../client/src/game/BodySystem";
import {
  createAlertState,
  registerBodyDiscovery,
  registerNoise,
  tickAlert,
  withPressure,
} from "../../client/src/game/AlertSystem";

describe("body system", () => {
  it("keeps a knocked out guard down until another guard wakes them", () => {
    const body = {
      guardId: "guard-1",
      bodyState: "knocked_out" as const,
      position: { x: 4, y: 6 },
    };
    const bodies = addBody(createBodyState(), body);
    const discovered = discoverBody(bodies, { ...body, discoveredBy: "guard-2" });

    body.position.x = 99;

    expect(discovered.bodies["guard-1"]).toEqual({
      guardId: "guard-1",
      bodyState: "knocked_out",
      position: { x: 4, y: 6 },
      discoveredBy: "guard-2",
    });
    expect(wakeGuard(discovered, "guard-1", "guard-2").bodies["guard-1"]).toBeUndefined();
    expect(discovered.bodies["guard-1"]).toBeDefined();
  });

  it("does not remove dead bodies when another guard tries to wake them", () => {
    const bodies = addBody(createBodyState(), {
      guardId: "guard-1",
      bodyState: "dead",
      position: { x: 2, y: 3 },
    });
    const woken = wakeGuard(bodies, "guard-1", "guard-2");

    expect(woken.bodies["guard-1"]).toEqual({
      guardId: "guard-1",
      bodyState: "dead",
      position: { x: 2, y: 3 },
    });
    expect(woken).not.toBe(bodies);
    expect(woken.bodies["guard-1"]).not.toBe(bodies.bodies["guard-1"]);
  });
});

describe("alert system", () => {
  it("raises alert more for dead bodies than knockouts", () => {
    const initial = createAlertState();
    const afterKnockout = registerBodyDiscovery(initial, "knocked_out");
    const afterDead = registerBodyDiscovery(initial, "dead");

    expect(afterKnockout.pressure).toBe(18);
    expect(afterDead.pressure).toBe(35);
    expect(afterDead.pressure).toBeGreaterThan(afterKnockout.pressure);
    expect(afterDead.level).toBe("suspicious");
    expect(afterKnockout.level).toBe("suspicious");
  });

  it("escalates repeated gunfire through stages without instant lockdown", () => {
    const first = registerNoise(createAlertState(), 70);
    const second = registerNoise(first, 70);
    const third = registerNoise(second, 70);

    expect(first.level).toBe("suspicious");
    expect(second.level).toBe("alert");
    expect(third.level).toBe("armed_response");
    expect(third.pressure).toBe(100);
    expect(third.level).not.toBe("lockdown_pressure");
  });

  it("does not promote staged armed response to lockdown on a cooling tick", () => {
    const armed = registerNoise(registerNoise(registerNoise(createAlertState(), 70), 70), 70);
    const sameFrame = tickAlert(armed, 0);
    const nextFrame = tickAlert(armed, 100);

    expect(armed.level).toBe("armed_response");
    expect(sameFrame.pressure).toBe(100);
    expect(sameFrame.level).toBe("armed_response");
    expect(nextFrame.pressure).toBe(99.6);
    expect(nextFrame.level).toBe("armed_response");
  });

  it("stages dead body discovery from high pressure without jumping straight to lockdown", () => {
    const alert = withPressure(createAlertState(), 55);
    const discovered = registerBodyDiscovery(alert, "dead");

    expect(alert.level).toBe("alert");
    expect(discovered.pressure).toBe(90);
    expect(discovered.level).toBe("armed_response");
    expect(discovered.level).not.toBe("lockdown_pressure");
  });

  it("cools down when avoiding trouble", () => {
    const alerted = registerBodyDiscovery(createAlertState(), "dead");
    const cooled = tickAlert(alerted, 5_000);

    expect(cooled.pressure).toBe(15);
    expect(cooled.level).toBe("suspicious");
  });

  it("keeps armed response marked after pressure cools below armed response", () => {
    const armed = registerNoise(registerNoise(registerNoise(createAlertState(), 70), 70), 70);
    const cooled = tickAlert(armed, 20_000);

    expect(armed.level).toBe("armed_response");
    expect(armed.armedResponseTriggered).toBe(true);
    expect(cooled.pressure).toBe(20);
    expect(cooled.level).toBe("suspicious");
    expect(cooled.armedResponseTriggered).toBe(true);
  });
});
