// @vitest-environment node

import { createElement } from "react";

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createStyleRegistry } from "#mintcss";
import { MintStyleRegistry, useMintcss } from "#next";

const { callbacks } = vi.hoisted(() => ({ callbacks: [] as (() => unknown)[] }));
vi.mock("next/navigation.js", () => ({ useServerInsertedHTML: (callback: () => unknown) => callbacks.push(callback) }));

function Button({ color }: { color: string }) {
    const { css, keyframes, globalCss } = useMintcss();
    globalCss({ body: { margin: 0 } });
    const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
    return createElement("button", { type: "button", className: css({ color, animation: `${fade} 1s` }) }, "Hello");
}

describe("server registries", () => {
    it("collects CSS without a document, preserving IDs and cascade order", () => {
        const registry = createStyleRegistry();
        registry.globalCss({ body: { color: "red" }, "body a": { color: "blue" } });
        const name = registry.css({ width: 12, "@media (width < 40rem)": { width: 6 } });
        registry.css({ width: 12, "@media (width < 40rem)": { width: 6 } });
        const styles = registry.getStyles();
        expect(styles.ids).toHaveLength(2);
        expect(styles.css).toBe(`body{color:red;}body a{color:blue;}.${name}{width:12px;}@media (width < 40rem){.${name}{width:6px;}}`);
    });

    it("flushes only new rules while retaining deduplication", () => {
        const registry = createStyleRegistry();
        registry.css({ color: "red" });
        expect(registry.flush().ids).toHaveLength(1);
        registry.css({ color: "red" });
        expect(registry.flush()).toEqual({ ids: [], css: "" });
        registry.css({ color: "blue" });
        expect(registry.flush().css).toContain("color:blue;");
        expect(registry.getStyles().ids).toHaveLength(2);
    });

    it("keeps requests independent and rejects unsafe CSS before collection", () => {
        const first = createStyleRegistry();
        const second = createStyleRegistry();
        first.css({ color: "red" });
        second.css({ color: "blue" });
        expect(first.getStyles().css).not.toContain("blue");
        expect(second.getStyles().css).not.toContain("red");
        expect(() => second.css({ content: '"</STYLE><script>alert(1)</script>"' })).toThrow("Unsafe CSS value");
        expect(() => second.globalCss({ "<": { "&/style>": { color: "red" } } })).toThrow("Unsafe CSS selector");
        expect(second.getStyles().ids).toHaveLength(1);
    });
});

describe("Next.js registry", () => {
    it("renders without a DOM and emits styles with a nonce for each request", () => {
        for (const color of ["red", "blue"]) {
            callbacks.length = 0;
            const html = renderToString(createElement(MintStyleRegistry, { nonce: "test-nonce" }, createElement(Button, { color })));
            expect(html).toContain('class="mint-');
            const callback = callbacks[0];
            const styles = renderToString(callback() as ReturnType<typeof createElement>);
            expect(styles).toContain('data-mintcss="mint-global-');
            expect(styles).toContain('nonce="test-nonce"');
            expect(styles).toContain(`color:${color};`);
            expect(styles).toContain("@keyframes");
            expect(styles).not.toContain(color === "red" ? "color:blue;" : "color:red;");
            expect(callback()).toBeNull();
        }
    });

    it("explains missing registry setup", () => {
        expect(() => renderToString(createElement(Button, { color: "red" }))).toThrow("useMintcss must be used inside MintStyleRegistry");
    });
});
