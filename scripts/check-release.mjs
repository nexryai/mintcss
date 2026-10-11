import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(process.env.RELEASE_TAG, `v${version}`, "Release tag must match v<package.json version>");
assert.ok(["true", "false"].includes(process.env.RELEASE_PRERELEASE), "Release prerelease flag must be true or false");
assert.equal(process.env.RELEASE_PRERELEASE === "true", version.includes("-"), "Release prerelease flag must match the package version");
console.log(`Verified release v${version}.`);
