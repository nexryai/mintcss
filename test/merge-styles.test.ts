// @vitest-environment node

import { describe, expect, it } from "vitest";

import { type CSSObject, createStyleRegistry, mergeStyles } from "#mintcss";

const freeze = (object: CSSObject): CSSObject => {
    for (const value of Object.values(object)) if (typeof value === "object") freeze(value);
    return Object.freeze(object);
};

describe("mergeStyles", () => {
    it("works without a DOM and ignores missing optional variants", () => {
        expect(mergeStyles()).toEqual({});
        expect(mergeStyles(undefined, { color: "red" }, undefined)).toEqual({ color: "red" });
        expect(mergeStyles({ color: "red", margin: 4 }, { color: "blue", opacity: 0 })).toEqual({ color: "blue", margin: 4, opacity: 0 });
    });

    it("preserves nested selectors and overlapping responsive conditions", () => {
        expect(mergeStyles({ padding: 26, "&:hover": { color: "red", opacity: 0.5 }, "@media (width < 40rem)": { padding: 20, borderRadius: 18, "& span": { fontSize: 12 } } }, { padding: "34px 40px", "&:hover": { color: "blue" }, "@media (width < 40rem)": { padding: 25, "& span": { color: "white" } } })).toEqual({
            padding: "34px 40px",
            "&:hover": { color: "blue", opacity: 0.5 },
            "@media (width < 40rem)": { padding: 25, borderRadius: 18, "& span": { fontSize: 12, color: "white" } },
        });
    });

    it("does not mutate or retain mutable nested references to inputs", () => {
        const base = freeze({ "&:hover": { color: "red" }, "@supports (display: grid)": { display: "grid" } });
        const variant = freeze({ "&:hover": { opacity: 0.5 } });
        const merged = mergeStyles(base, variant);
        expect(merged["&:hover"]).toEqual({ color: "red", opacity: 0.5 });
        expect(merged["&:hover"]).not.toBe(base["&:hover"]);
        expect(merged["@supports (display: grid)"]).not.toBe(base["@supports (display: grid)"]);
    });

    it("lets explicit undefined declarations remove an earlier value", () => {
        const merged = mergeStyles({ color: "red", "&:hover": { opacity: 0.5, color: "blue" } }, { color: undefined, "&:hover": { color: undefined } });
        expect(merged).toEqual({ color: undefined, "&:hover": { opacity: 0.5, color: undefined } });
        const registry = createStyleRegistry();
        const name = registry.css(merged);
        expect(registry.getStyles().css).toBe(`.${name}:hover{opacity:0.5;}`);
    });

    it("replaces incompatible declaration and selector values with the last value", () => {
        expect(mergeStyles({ value: 1 }, { value: { color: "blue" } }, { value: 0 })).toEqual({ value: 0 });
        expect(mergeStyles({ value: 1 }, { value: { color: "blue" } })).toEqual({ value: { color: "blue" } });
    });

    it("keeps inherited property names as data without changing prototypes", () => {
        const input = JSON.parse('{"__proto__":{"color":"red"},"constructor":{"opacity":0.5}}') as CSSObject;
        const result = mergeStyles(input, { constructor: { color: "blue" } });
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(result, "__proto__")).toBeDefined();
        expect(result.constructor).toEqual({ opacity: 0.5, color: "blue" });
        expect(Object.getPrototypeOf(Object.getOwnPropertyDescriptor(result, "__proto__")?.value)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor({}, "color")).toBeUndefined();
    });
});
