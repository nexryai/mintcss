// @vitest-environment node

import { describe, expect, it } from "vitest";

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-release.mjs", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const prerelease = String(version.includes("-"));
const check = (tag: string, flag: string) => spawnSync(process.execPath, [script], { env: { ...process.env, RELEASE_TAG: tag, RELEASE_PRERELEASE: flag }, encoding: "utf8" });

describe("release validation", () => {
    it("accepts the exact package version and matching release status", () => {
        expect(check(`v${version}`, prerelease).status).toBe(0);
    });

    it.each([version, "v999.999.999", "", "v$(echo injected)"])("rejects mismatched tag %s", (tag) => {
        const result = check(tag, prerelease);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("Release tag must match");
    });

    it("rejects a mismatched prerelease flag", () => {
        const result = check(`v${version}`, String(prerelease !== "true"));
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("Release prerelease flag must match");
    });

    it("rejects a missing prerelease flag", () => {
        expect(check(`v${version}`, "").status).not.toBe(0);
    });
});
