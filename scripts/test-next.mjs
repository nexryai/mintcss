import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(root, ".mintcss-next-"));
const next = join(root, "node_modules/next/dist/bin/next");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
let server;
try {
    const [packed] = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", temporary], { cwd: root, encoding: "utf8" }));
    writeFileSync(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, packed.filename)], { cwd: temporary, stdio: "pipe" });
    for (const name of ["next", "react", "react-dom"]) symlinkSync(join(root, "node_modules", name), join(temporary, "node_modules", name), "dir");
    mkdirSync(join(temporary, "app"));
    writeFileSync(join(temporary, "next.config.mjs"), `export default { experimental: { cpus: 2 }, turbopack: { root: ${JSON.stringify(root)} } };\n`);
    writeFileSync(
        join(temporary, "app/layout.jsx"),
        `
import { MintStyleRegistry } from 'mintcss/next';
export default function Layout({children}) {
    return <html><head /><body><MintStyleRegistry nonce="integration-nonce">{children}</MintStyleRegistry></body></html>;
}
`,
    );
    writeFileSync(
        join(temporary, "app/button.jsx"),
        `
'use client';
import { useMintcss } from 'mintcss/next';
export default function Button({color, late = false}) {
    const { css, keyframes, globalCss } = useMintcss();
    globalCss({ body: { margin: 0 } });
    const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
    return <button type="button" className={css({ color, width: late ? 80 : 40, animation: fade + ' 1s', '@media (width < 40rem)': { padding: 4 } })}>{late ? 'Late' : 'Hello'}</button>;
}
`,
    );
    writeFileSync(
        join(temporary, "app/page.jsx"),
        `
import { Suspense } from 'react';
import Button from './button';
export const dynamic = 'force-dynamic';
async function Late({color}) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return <Button color={color} late />;
}
export default async function Page({searchParams}) {
    const {color = 'red'} = await searchParams;
    return <><Button color={color} /><Suspense fallback={<p>Loading</p>}><Late color={color} /></Suspense></>;
}
`,
    );
    execFileSync(process.execPath, [next, "build", ...(process.argv.includes("--webpack") ? ["--webpack"] : [])], { cwd: temporary, env, stdio: "inherit", timeout: 120_000 });
    const port = await new Promise((resolve, reject) => {
        const listener = createServer();
        listener.on("error", reject);
        listener.listen(0, "127.0.0.1", () => {
            const { port } = listener.address();
            listener.close(() => resolve(port));
        });
    });
    server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "";
    server.stdout.on("data", (chunk) => {
        logs += chunk;
    });
    server.stderr.on("data", (chunk) => {
        logs += chunk;
    });
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (server.exitCode !== null) throw new Error(logs);
        try {
            if ((await fetch(url)).ok) {
                ready = true;
                break;
            }
        } catch {}
        await delay(100);
    }
    assert.ok(ready, `Next.js failed to start: ${logs}`);
    await Promise.all(
        ["red", "blue"].map(async (color) => {
            const response = await fetch(`${url}/?color=${color}`);
            assert.equal(response.status, 200);
            const html = await response.text();
            const styles = [...html.matchAll(/<style[^>]*data-mintcss="([^"]*)"[^>]*>(.*?)<\/style>/gs)];
            assert.ok(styles.length >= 2, "Expected initial and suspended styles in separate streaming flushes");
            const css = styles.map((match) => match[2]).join("");
            assert.ok(css.includes(`color:${color};`));
            assert.ok(!css.includes(`color:${color === "red" ? "blue" : "red"};`), "Styles leaked between requests");
            assert.ok(css.includes("width:40px;") && css.includes("width:80px;"));
            assert.ok(css.includes("@media (width < 40rem)"));
            assert.ok(css.includes("@keyframes mint-kf-"));
            assert.equal(css.match(/body\{margin:0;\}/g).length, 1);
            assert.ok(styles.every(([tag]) => tag.includes('nonce="integration-nonce"')));
            const ids = styles.flatMap((match) => match[1].split(" "));
            assert.equal(new Set(ids).size, ids.length);
        }),
    );
    console.log("Verified Next.js App Router: production build, SSR, streaming, nonce, and request isolation.");
} finally {
    if (server && server.exitCode === null) {
        server.kill("SIGTERM");
        await new Promise((resolve) => server.once("exit", resolve));
    }
    rmSync(temporary, { recursive: true, force: true });
}
