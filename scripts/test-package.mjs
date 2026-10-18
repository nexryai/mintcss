import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "mintcss-package-"));
try {
    const result = execFileSync("npm", ["pack", "--dry-run=false", "--json", "--pack-destination", temporary], { cwd: root, encoding: "utf8" });
    const [packed] = JSON.parse(result);
    const files = packed.files.map(({ path }) => path);
    for (const required of ["dist/index.js", "dist/index.d.ts", "dist/core.js", "dist/core.d.ts", "dist/testing.js", "dist/testing.d.ts", "dist/next.js", "dist/next.d.ts", "LICENSE", "README.md"]) {
        assert.ok(files.includes(required), `Missing packed file: ${required}`);
    }
    assert.ok(files.every((path) => path.startsWith("dist/") || ["package.json", "LICENSE", "README.md"].includes(path)));
    writeFileSync(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
    execFileSync("npm", ["install", "--dry-run=false", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, packed.filename)], { cwd: temporary, stdio: "pipe" });
    writeFileSync(
        join(temporary, "consumer.mjs"),
        `
import assert from 'node:assert/strict';
import { createStyleRegistry, css, globalCss, keyframes, mergeStyles } from 'mintcss';
import { __resetCssForTests } from 'mintcss/testing';
assert.deepEqual(mergeStyles({color: 'red'}, undefined, {color: 'blue'}), {color: 'blue'});
const registry = createStyleRegistry();
const serverClass = registry.css({color: 'red'});
assert.equal(registry.getStyles().css, '.' + serverClass + '{color:red;}');
assert.equal(typeof css, 'function');
assert.equal(typeof globalCss, 'function');
assert.equal(typeof keyframes, 'function');
assert.equal(typeof __resetCssForTests, 'function');
assert.throws(() => css({color: 'red'}), /requires a browser document/);
const { createRequire } = await import('node:module');
const require = createRequire(${JSON.stringify(join(root, "package.json"))});
const { JSDOM } = require('jsdom');
globalThis.document = new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document;
const name = css({color: 'red', width: 12});
const animation = keyframes({from: {opacity: 0}, to: {opacity: 1}});
globalCss({body: {margin: 0}});
const output = document.head.querySelector('style[data-mintcss]').textContent;
assert.ok(output.includes('.' + name + '{color:red;width:12px;}'));
assert.ok(output.includes('@keyframes ' + animation));
assert.ok(output.includes('body{margin:0;}'));
__resetCssForTests();
assert.equal(document.head.querySelector('style[data-mintcss]'), null);
`,
    );
    execFileSync(process.execPath, [join(temporary, "consumer.mjs")], { stdio: "inherit" });
    writeFileSync(
        join(temporary, "consumer.mts"),
        `
import {css, globalCss, keyframes, mergeStyles, type CSSObject, type CSSDeclarations} from 'mintcss';
import {__resetCssForTests} from 'mintcss/testing';
const style: CSSObject = mergeStyles({color: 'red'}, undefined, {'&:hover': {opacity: 0.5}});
const frame: CSSDeclarations = {opacity: 1};
const className: string = css(style);
const animation: string = keyframes({from: {opacity: 0}, to: frame});
globalCss({body: style});
__resetCssForTests();
void [className, animation];
`,
    );
    execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--target", "ES2021", join(temporary, "consumer.mts")], { cwd: temporary, stdio: "inherit" });
    const manifest = JSON.parse(readFileSync(join(temporary, "node_modules/mintcss/package.json"), "utf8"));
    assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
    assert.equal(manifest.peerDependenciesMeta.next.optional, true);
    assert.equal(manifest.peerDependenciesMeta.react.optional, true);
    assert.ok(readFileSync(join(temporary, "node_modules/mintcss/dist/next.js"), "utf8").startsWith('"use client";'));
    console.log(`Verified ${packed.filename}: ESM exports, standalone types, and package contents.`);
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
