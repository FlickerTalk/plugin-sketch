// The plugin's own tests (Plan §53): the line the finger leaves, and what the drawing is called.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pathOf, penName, strokeAt } from "./dist/index.js";
import source from "./dist/index.js?raw";
import manifest from "./module.json";

// The app's languages (plugin-sdk, module.schema.json): English is the top level.
const languages = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];

// The schema counts characters, not UTF-16 units.
const length = (text) => [...text].length;

describe("manifest", () => {
  it("names and sums itself up in every language of the app", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(languages);
    for (const code of languages) {
      const { name, summary, ...rest } = manifest.locales[code];
      expect(rest, code).toEqual({});
      expect(name?.trim(), code).toBeTruthy();
      expect(length(name), code).toBeLessThanOrEqual(64);
      expect(summary?.trim(), code).toBeTruthy();
      expect(length(summary), code).toBeLessThanOrEqual(200);
    }
  });

  // What it makes goes to the chat through ft.send or ft.say, which the core refuses without the
  // send permission (A2): the manifest has to ask for it, or the main action does nothing.
  it("asks to write in the chat, since it puts its result there", () => {
    expect(source).toMatch(/\bft\??\.(send|say)\(/);
    expect(manifest.permissions.send).toBe("propose");
  });
});

describe("sketch", () => {
  // A line drawn through the middle of each pair of points is round where the finger was quick.
  it("rounds the line between the points of a stroke", () => {
    const path = pathOf([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(path[0]).toEqual({ to: { x: 0, y: 0 } });
    expect(path[1]).toEqual({ control: { x: 10, y: 0 }, to: { x: 10, y: 5 } });
    expect(path[path.length - 1]).toEqual({ control: { x: 10, y: 10 }, to: { x: 10, y: 10 } });
  });

  it("is a dot when the finger did not move", () => {
    expect(pathOf([{ x: 4, y: 4 }])).toEqual([{ to: { x: 4, y: 4 } }]);
    expect(pathOf([])).toEqual([]);
  });

  it("finds a point in the drawing from where the finger is", () => {
    const box = { left: 100, top: 50, width: 200 };
    expect(strokeAt({ clientX: 200, clientY: 100 }, box, 400)).toEqual({ x: 200, y: 100 });
  });

  it("names the drawing after the day it was made", () => {
    expect(penName(new Date(2026, 8, 22, 16, 5, 9))).toBe("sketch-20260922-160509.png");
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
