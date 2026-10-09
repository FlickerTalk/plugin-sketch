// The plugin's own tests (Plan §53): the line the finger leaves, and what the drawing is called.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("with the Ionic the app lends", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Ionic moves a button's aria attributes to the native button inside it once it has drawn.
  const aria = (button, name) => button.getAttribute(name) ?? button.shadowRoot?.querySelector("button")?.getAttribute(name);
  let sent = [];
  const mount = async () => {
    sent = [];
    globalThis.ft = { onOpen() {}, send: (...args) => sent.push(args) };
    document.body.innerHTML = "";
    const element = document.createElement("ft-sketch");
    document.body.append(element);
    await tick();
    return element;
  };

  afterEach(() => {
    delete globalThis.Ionicons;
    delete globalThis.ft;
  });

  // Only an app that lends Ionic can show it (app 1.6.0): an older one keeps the version it has.
  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws in the page, not in a shadow root, so Ionic's own styles reach it", async () => {
    const element = await mount();
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector(":scope > ion-header > ion-toolbar")).toBeTruthy();
    expect(element.querySelector(":scope > ion-content canvas")).toBeTruthy();
  });

  it("has every action as an Ionic button in its toolbar, each with a label", async () => {
    const element = await mount();
    const acts = [...element.querySelectorAll("ion-toolbar ion-button")].map((button) => button.dataset.act);
    expect(acts).toEqual(["ink", "ink", "ink", "ink", "nib", "undo", "clear", "send"]);
    for (const button of element.querySelectorAll("ion-toolbar ion-button")) expect(aria(button, "aria-label"), button.dataset.act).toBeTruthy();
    expect(element.querySelector("button")).toBe(null);
  });

  it("shows the colour in use as the pressed one of the swatches", async () => {
    const element = await mount();
    const inks = () => [...element.querySelectorAll('ion-button[data-act="ink"]')];
    const pressed = () => inks().filter((button) => aria(button, "aria-pressed") === "true").map((button) => button.dataset.at);
    expect(pressed()).toEqual(["0"]);
    expect(inks()[0].fill).toBe("solid");
    inks()[2].click();
    await tick();
    expect(element.ink).toBe(2);
    expect(pressed()).toEqual(["2"]);
    expect(inks()[2].fill).toBe("solid");
    expect(inks()[0].fill).toBe(undefined);
  });

  it("changes the line, undoes, starts again and sends from its buttons", async () => {
    const element = await mount();
    const button = (act) => element.querySelector(`ion-button[data-act="${act}"]`);
    button("nib").click();
    expect(element.nib).toBe(2);
    element.strokes.push({ ink: "#111111", nib: 4, points: [{ x: 1, y: 1 }] }, { ink: "#111111", nib: 4, points: [{ x: 2, y: 2 }] });
    button("undo").click();
    expect(element.strokes).toHaveLength(1);
    button("send").click();
    expect(sent).toHaveLength(1);
    button("clear").click();
    expect(element.strokes).toHaveLength(0);
  });

  // The icons are the app's: Ionic's own when the app lent them by name, else the ones it serves.
  it("draws an Ionicon the app lent by name with ion-icon, and the one it serves otherwise", async () => {
    let element = await mount();
    expect(element.querySelector('[data-act="nib"] ion-icon')).toBe(null);
    expect(element.querySelector('[data-act="nib"] [slot="icon-only"]').getAttribute("style")).toContain("./icon/brush-outline.svg");

    globalThis.Ionicons = { map: new Map([["brush-outline", "data:image/svg+xml;utf8,<svg></svg>"]]) };
    element = await mount();
    expect(element.querySelector('[data-act="nib"] ion-icon[slot="icon-only"]').getAttribute("name")).toBe("brush-outline");
  });
});

describe("the package", () => {
  const dist = join(import.meta.dirname, "dist");
  const files = readdirSync(dist);

  // Ionic is the app's, lent to the frame: a copy in the package would be a second one, and heavy.
  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  // The app carries it as a seed on iOS: 128 KiB at most (plugin-sdk).
  it("is small enough to be a seed", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
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
