export type CSSValue = string | number;
export type CSSObject = {
    [key: string]: CSSValue | CSSObject | undefined;
};

export type CSSDeclarations = Record<string, CSSValue | undefined>;

const STYLE_ATTRIBUTE = "data-mintcss";
let styleElement: HTMLStyleElement | undefined;
const unitlessProperties = new Set([
    "animationIterationCount",
    "aspectRatio",
    "columnCount",
    "flex",
    "flexGrow",
    "flexShrink",
    "fontWeight",
    "gridArea",
    "gridColumn",
    "gridColumnEnd",
    "gridColumnStart",
    "gridRow",
    "gridRowEnd",
    "gridRowStart",
    "lineHeight",
    "opacity",
    "order",
    "orphans",
    "scale",
    "tabSize",
    "widows",
    "zIndex",
    "zoom",
]);

const hyphenate = (property: string) => {
    if (property.startsWith("--")) return property;
    return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^ms-/, "-ms-");
};

const assertSafe = (value: string, kind: string) => {
    if (/[;{}]/.test(value) || /<\/style|\/\*|javascript:|expression\s*\(/i.test(value)) throw new Error(`Unsafe CSS ${kind}`);
};

const assertConditionalRule = (rule: string) => {
    if (!/^@(media|supports)\s+[^;{}]+$/.test(rule)) throw new Error(`Invalid CSS at-rule: ${rule}`);
    assertSafe(rule, "at-rule");
};

const declaration = (property: string, value: CSSValue) => {
    if (!/^(--[a-zA-Z0-9_-]+|[a-zA-Z][a-zA-Z0-9]*)$/.test(property)) throw new Error(`Invalid CSS property: ${property}`);
    const serialized = typeof value === "number" && value !== 0 && !property.startsWith("--") && !unitlessProperties.has(property) ? `${value}px` : String(value);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid CSS number: ${value}`);
    assertSafe(serialized, "value");
    return `${hyphenate(property)}:${serialized};`;
};

const serializeRule = (selector: string, object: CSSObject): string => {
    assertSafe(selector, "selector");
    let declarations = "";
    let nested = "";

    for (const key of Object.keys(object).sort()) {
        const value = object[key];
        if (value === undefined) continue;
        if (value === null) throw new Error(`Invalid CSS object: ${key}`);
        if (typeof value !== "object") {
            declarations += declaration(key, value);
            continue;
        }
        if (key.startsWith("@media") || key.startsWith("@supports")) {
            assertConditionalRule(key);
            nested += `${key}{${serializeRule(selector, value)}}`;
            continue;
        }
        if (!key.includes("&")) throw new Error(`Nested selector must contain &: ${key}`);
        assertSafe(key, "selector");
        nested += serializeRule(key.replaceAll("&", selector), value);
    }

    return `${declarations ? `${selector}{${declarations}}` : ""}${nested}`;
};

const canonicalize = (object: CSSObject): string =>
    Object.keys(object)
        .sort()
        .map((key) => {
            const value = object[key];
            return `${JSON.stringify(key)}:${typeof value === "object" && value !== null ? `{${canonicalize(value)}}` : JSON.stringify(value)}`;
        })
        .join(",");

const hash = (value: string) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
};

const registry = (nonce?: string) => {
    if (typeof document === "undefined") throw new Error("mintcss requires a browser document");
    if (styleElement?.isConnected && styleElement.ownerDocument === document) return styleElement;
    const existing = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`);
    styleElement = existing ?? document.createElement("style");
    if (!existing) {
        styleElement.setAttribute(STYLE_ATTRIBUTE, "");
        if (nonce !== undefined) styleElement.nonce = nonce;
        document.head.append(styleElement);
    }
    return styleElement;
};

const insert = (id: string, rule: string, nonce?: string) => {
    if (typeof document === "undefined") throw new Error("mintcss requires a browser document; use createStyleRegistry for SSR or useMintcss in Next.js");
    // Streaming SSR can emit several style elements. Consult all of them.
    for (const element of document.head.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`)) {
        if ((element.dataset.mintcss ?? "").split(" ").includes(id)) return;
    }
    const target = registry(nonce);
    // The DOM is authoritative across module reloads and stylesheet replacement.
    const registeredInDOM = new Set((target.dataset.mintcss ?? "").split(" ").filter(Boolean));
    if (registeredInDOM.has(id)) return;
    registeredInDOM.add(id);
    target.dataset.mintcss = [...registeredInDOM].join(" ");
    target.append(document.createTextNode(rule));
};

const createStyleApi = (insert: (id: string, rule: string) => void) => ({
    css: (object: CSSObject) => {
        const id = `mint-${hash(canonicalize(object))}`;
        insert(id, serializeRule(`.${id}`, object));
        return id;
    },

    keyframes: (frames: Record<string, CSSDeclarations>) => {
        const object = frames as CSSObject;
        const name = `mint-kf-${hash(canonicalize(object))}`;
        const body = Object.entries(object)
            .sort(([left], [right]) => {
                const position = (step: string) => (step === "from" ? 0 : step === "to" ? 100 : Number.parseInt(step, 10));
                return position(left) - position(right);
            })
            .map(([step, properties]) => {
                if (!/^(from|to|(?:\d|[1-9]\d|100)%)$/.test(step)) throw new Error(`Invalid keyframe step: ${step}`);
                return serializeRule(step, properties as CSSObject);
            })
            .join("");
        insert(name, `@keyframes ${name}{${body}}`);
        return name;
    },

    globalCss: (rules: Record<string, CSSObject>) => {
        const output = Object.entries(rules)
            .map(([selector, object]) => {
                if (selector.startsWith("@media") || selector.startsWith("@supports")) {
                    assertConditionalRule(selector);
                    return `${selector}{${Object.entries(object)
                        .map(([nestedSelector, nestedObject]) => {
                            assertSafe(nestedSelector, "selector");
                            return serializeRule(nestedSelector, nestedObject as CSSObject);
                        })
                        .join("")}}`;
                }
                assertSafe(selector, "selector");
                return serializeRule(selector, object);
            })
            .join("");
        const id = `mint-global-${hash(output)}`;
        insert(id, output);
    },
});

export const { css, keyframes, globalCss } = createStyleApi(insert);

export type StyleSnapshot = { ids: string[]; css: string };
export type StyleApi = ReturnType<typeof createStyleApi>;
export type StyleRegistry = StyleApi & {
    getStyles: () => StyleSnapshot;
    flush: () => StyleSnapshot;
};

/** Create a registry per server render. Browser calls also insert into the DOM. */
export const createStyleRegistry = (options: { nonce?: string } = {}): StyleRegistry => {
    const rules = new Map<string, string>();
    const pending = new Map<string, string>();
    const snapshot = (entries: Map<string, string>): StyleSnapshot => ({
        ids: [...entries.keys()],
        // Rules are validated by the serializer, including closing style tags.
        css: [...entries.values()].join(""),
    });
    return {
        ...createStyleApi((id, rule) => {
            if (typeof document !== "undefined") insert(id, rule, options.nonce);
            if (rules.has(id)) return;
            rules.set(id, rule);
            pending.set(id, rule);
        }),
        getStyles: () => snapshot(rules),
        flush: () => {
            const styles = snapshot(pending);
            pending.clear();
            return styles;
        },
    };
};

export const __resetCssForTests = () => {
    document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)?.remove();
    styleElement = undefined;
};

/** Compose styles from left to right, recursively merging selectors and conditions. */
export function mergeStyles(...objects: (CSSObject | undefined)[]): CSSObject {
    const result: CSSObject = {};
    for (const object of objects) {
        for (const [key, value] of Object.entries(object ?? {})) {
            const previous = Object.getOwnPropertyDescriptor(result, key)?.value as CSSObject[string];
            const merged = typeof value === "object" ? mergeStyles(typeof previous === "object" ? previous : undefined, value) : value;
            // Keep every key as an own property, including names inherited from Object.prototype.
            Object.defineProperty(result, key, { value: merged, writable: true, enumerable: true, configurable: true });
        }
    }
    return result;
}
