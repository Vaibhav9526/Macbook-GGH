import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { resolveSuperJargonPath } from "../src/main/superjargon";

describe("resolveSuperJargonPath", () => {
  it("resolves the per-user install on Windows", () => {
    const localAppData = "C:\\Users\\Ada\\AppData\\Local";
    expect(resolveSuperJargonPath({ LOCALAPPDATA: localAppData }, "win32")).toBe(
      join(localAppData, "Programs", "SuperJargon", "SuperJargon.exe"),
    );
  });

  it("reads a differently cased environment name on Windows", () => {
    const localAppData = "C:\\Users\\Ada\\AppData\\Local";
    expect(resolveSuperJargonPath({ LocalAppData: localAppData }, "win32")).toBe(
      join(localAppData, "Programs", "SuperJargon", "SuperJargon.exe"),
    );
  });

  it("has no path on another platform", () => {
    expect(resolveSuperJargonPath({ LOCALAPPDATA: "/tmp/local" }, "darwin")).toBeNull();
    expect(resolveSuperJargonPath({ LOCALAPPDATA: "/tmp/local" }, "linux")).toBeNull();
  });

  it("has no path without a local app data root", () => {
    expect(resolveSuperJargonPath({}, "win32")).toBeNull();
    expect(resolveSuperJargonPath({ LOCALAPPDATA: "   " }, "win32")).toBeNull();
  });
});
