import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, resolveHost } from "../../service/src/server";

describe("service readiness", () => {
  it("reports the initial unavailable dependencies", async () => {
    const response = await request(createApp()).get("/api/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      database: false,
      codex: false,
      ready: false,
    });
  });
});

describe("resolveHost", () => {
  it("binds to localhost by default", () => {
    expect(resolveHost(undefined)).toBe("127.0.0.1");
  });

  it("allows an explicit host override", () => {
    expect(resolveHost("0.0.0.0")).toBe("0.0.0.0");
  });
});
