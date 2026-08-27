import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment configuration", () => {
  it("routes API traffic through the Express Function and publishes the Vite output", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(config.buildCommand).toBe("pnpm build:vercel");
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.functions["api/index.ts"].runtime).toBe("nodejs22.x");
    expect(config.rewrites[0]).toMatchObject({ source: "/api/(.*)", destination: "/api/index" });
  });
});
