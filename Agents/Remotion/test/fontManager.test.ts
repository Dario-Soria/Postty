import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  localFontPath,
  normalizeFamilyForPath,
  normalizeStyle,
  normalizeWeight,
  resolveFontPath,
} from "../src/fontManager";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "postty-fonts-"));
}

describe("fontManager", () => {
  it("normalizes family for path", () => {
    expect(normalizeFamilyForPath("  Roboto Slab  ")).toBe("roboto-slab");
  });

  it("normalizes weight/style defaults", () => {
    expect(normalizeWeight(undefined)).toBe(400);
    expect(normalizeWeight("regular")).toBe(400);
    expect(normalizeWeight("700")).toBe(700);
    expect(normalizeStyle(undefined)).toBe("normal");
    expect(normalizeStyle("ITALIC")).toBe("italic");
  });

  it("returns cached local font immediately (no fetch)", async () => {
    const fontsDir = makeTmpDir();
    const family = "Roboto";
    const local = localFontPath({ fontsDir, family, weight: 700, style: "normal" });
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.from([1, 2, 3]));

    const res = await resolveFontPath(
      { fontsDir, fontFamily: family, fontWeight: 700, fontStyle: "normal" },
      {
        apiKey: "x",
        fetchFn: async () => {
          throw new Error("should not fetch");
        },
        logger: { warn() {}, error() {} },
      } as any,
    );

    expect(res?.localPath).toBe(local);
  });

  it("downloads missing font and writes file, then subsequent resolve hits disk", async () => {
    const fontsDir = makeTmpDir();
    const family = "Roboto";

    const fakeList = {
      items: [
        {
          family: "Roboto",
          files: {
            regular: "https://fonts.gstatic.com/s/roboto/v1/roboto-regular.ttf",
            "700": "https://fonts.gstatic.com/s/roboto/v1/roboto-700.ttf",
          },
        },
      ],
    };

    let listCalls = 0;
    let dlCalls = 0;
    const fetchFn = async (url: string) => {
      if (url.includes("webfonts/v1/webfonts")) {
        listCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => fakeList,
        } as any;
      }
      dlCalls++;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
      } as any;
    };

    const res1 = await resolveFontPath(
      { fontsDir, fontFamily: family, fontWeight: 700, fontStyle: "normal" },
      { apiKey: "k", fetchFn: fetchFn as any, logger: { warn() {}, error() {} } },
    );
    expect(res1).not.toBeNull();
    expect(fs.existsSync(res1!.localPath)).toBe(true);
    expect(fs.statSync(res1!.localPath).size).toBeGreaterThan(0);
    expect(listCalls).toBe(1);
    expect(dlCalls).toBe(1);

    const res2 = await resolveFontPath(
      { fontsDir, fontFamily: family, fontWeight: 700, fontStyle: "normal" },
      { apiKey: "k", fetchFn: fetchFn as any, logger: { warn() {}, error() {} } },
    );
    expect(res2!.localPath).toBe(res1!.localPath);
    // no new downloads
    expect(listCalls).toBe(1);
    expect(dlCalls).toBe(1);
  });

  it("uses most similar family when exact not found (deterministic)", async () => {
    const fontsDir = makeTmpDir();
    const fakeList = {
      items: [
        { family: "Roboto", files: { regular: "https://fonts.gstatic.com/x.ttf" } },
        { family: "Inter", files: { regular: "https://fonts.gstatic.com/y.ttf" } },
      ],
    };

    const fetchFn = async (url: string) => {
      if (url.includes("webfonts/v1/webfonts")) {
        return { ok: true, status: 200, json: async () => fakeList } as any;
      }
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer } as any;
    };

    const res = await resolveFontPath(
      { fontsDir, fontFamily: "Robotto", fontWeight: 400, fontStyle: "normal" },
      { apiKey: "k", fetchFn: fetchFn as any, logger: { warn() {}, error() {} } },
    );
    expect(res?.familyUsed).toBe("Roboto");
  });

  it("returns null (no crash) when API key missing", async () => {
    const fontsDir = makeTmpDir();
    const res = await resolveFontPath(
      { fontsDir, fontFamily: "Roboto", fontWeight: 400, fontStyle: "normal" },
      { apiKey: "", fetchFn: async () => ({ ok: false, status: 401 } as any), logger: { warn() {}, error() {} } },
    );
    expect(res).toBeNull();
  });
});


