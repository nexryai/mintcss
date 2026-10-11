import { afterEach, describe, expect, it, vi } from "vitest";

import { css, globalCss, keyframes } from "#mintcss";
import { __resetCssForTests } from "#testing";

afterEach(__resetCssForTests);

const output = () => document.head.querySelector("style[data-mintcss]")?.textContent ?? "";

describe("css", () => {
    it("generates deterministic class names and deduplicates rules", () => {
        const first = css({ color: "red", backgroundColor: "white", width: 10, lineHeight: 1.5 });
        const second = css({ lineHeight: 1.5, width: 10, backgroundColor: "white", color: "red" });

        expect(second).toBe(first);
        expect(output().match(new RegExp(`\\.${first}\\{`, "g"))).toHaveLength(1);
        expect(output()).toContain("background-color:white;");
        expect(output()).toContain("line-height:1.5;");
        expect(output()).toContain("width:10px;");
    });

    it("uses the DOM registry to avoid duplicates after a module reload", () => {
        const className = css({ color: "red" });
        const registry = document.head.querySelector("style[data-mintcss]");
        const before = output();

        __resetCssForTests();
        document.head.append(registry as HTMLStyleElement);
        css({ color: "red" });

        expect(className).toMatch(/^mint-/);
        expect(output()).toBe(before);
    });

    it("serializes nested selectors and conditional rules", () => {
        const className = css({
            "&:hover": { color: "red" },
            "& > svg": { width: "1rem" },
            "@media (width >= 40rem)": { display: "grid" },
            "@supports (display: grid)": { display: "grid" },
        });

        expect(output()).toContain(`.${className}:hover{color:red;}`);
        expect(output()).toContain(`.${className} > svg{width:1rem;}`);
        expect(output()).toContain(`@media (width >= 40rem){.${className}{display:grid;}}`);
        expect(output()).toContain(`@supports (display: grid){.${className}{display:grid;}}`);
    });

    it("registers global rules and keyframes", () => {
        globalCss({ ":root": { "--accent": "#f4bd36" } });
        const animation = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

        expect(output()).toContain(":root{--accent:#f4bd36;}");
        expect(output()).toContain(`@keyframes ${animation}{from{opacity:0;}to{opacity:1;}}`);
    });

    it("rejects unsafe properties, selectors, values, and keyframe steps", () => {
        expect(() => css({ "color:red": "blue" })).toThrow("Invalid CSS property");
        expect(() => css({ "&{}": { color: "red" } })).toThrow("Unsafe CSS selector");
        expect(() => css({ color: "red}</style>" })).toThrow("Unsafe CSS value");
        expect(() => css({ color: "red;background:black" })).toThrow("Unsafe CSS value");
        expect(() => css({ "@media print; @import url(example)": { color: "red" } })).toThrow("Invalid CSS at-rule");
        expect(() => keyframes({ middle: { opacity: 1 } })).toThrow("Invalid keyframe step");
    });
});

describe("standalone package behavior", () => {
    it("shares the stylesheet with a fresh module instance", async () => {
        const first = css({ color: "gold" });
        const before = output();
        vi.resetModules();
        const fresh = await import("#mintcss");
        expect(fresh.css({ color: "gold" })).toBe(first);
        expect(output()).toBe(before);
    });

    it("restores rules after the stylesheet is removed", () => {
        const first = css({ color: "gold" });
        document.head.querySelector("style[data-mintcss]")?.remove();
        expect(css({ color: "gold" })).toBe(first);
        expect(output()).toContain(`.${first}{color:gold;}`);
    });

    it("handles custom properties, zero, undefined, and vendor prefixes", () => {
        css({ "--size": 3, width: 0, color: undefined, WebkitAppearance: "none", msOverflowStyle: "none" });
        expect(output()).toContain("--size:3;");
        expect(output()).toContain("width:0;");
        expect(output()).toContain("-webkit-appearance:none;");
        expect(output()).toContain("-ms-overflow-style:none;");
        expect(output()).not.toContain("undefined");
    });

    it("preserves global cascade order and deduplicates conditional rules", () => {
        const rules = {
            "@media print": { body: { color: "black" }, "body a": { color: "gray" } },
            body: { color: "red" },
        };
        globalCss(rules);
        globalCss(rules);
        expect(output()).toBe("@media print{body{color:black;}body a{color:gray;}}body{color:red;}");
    });

    it("sorts and deduplicates animation steps", () => {
        const name = keyframes({ to: { opacity: 1 }, "50%": { opacity: 0.5 }, from: { opacity: 0 } });
        expect(keyframes({ from: { opacity: 0 }, to: { opacity: 1 }, "50%": { opacity: 0.5 } })).toBe(name);
        expect(output()).toBe(`@keyframes ${name}{from{opacity:0;}50%{opacity:0.5;}to{opacity:1;}}`);
    });

    it("rejects invalid values without registering partial styles", () => {
        expect(() => css({ width: Number.NaN })).toThrow("Invalid CSS number");
        expect(() => css({ width: Number.POSITIVE_INFINITY })).toThrow("Invalid CSS number");
        expect(() => css({ "@supports (display: grid) /*": { display: "grid" } })).toThrow("Unsafe CSS at-rule");
        expect(() => globalCss({ "body{}": { color: "red" } })).toThrow("Unsafe CSS selector");
        expect(() => css({ color: "expression(alert(1))" })).toThrow("Unsafe CSS value");
        expect(() => keyframes({ "101%": { opacity: 1 } })).toThrow("Invalid keyframe step");
        expect(output()).toBe("");
    });
});
