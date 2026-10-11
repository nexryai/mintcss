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

const registry = () => {
    if (typeof document === "undefined") throw new Error("mintcss requires a browser document");
    if (styleElement?.isConnected && styleElement.ownerDocument === document) return styleElement;
    const existing = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`);
    styleElement = existing ?? document.createElement("style");
    if (!existing) {
        styleElement.setAttribute(STYLE_ATTRIBUTE, "");
        document.head.append(styleElement);
    }
    return styleElement;
};

const insert = (id: string, rule: string) => {
    const target = registry();
    // The DOM is authoritative across module reloads and stylesheet replacement.
    const registeredInDOM = new Set((target.dataset.mintcss ?? "").split(" ").filter(Boolean));
    if (registeredInDOM.has(id)) return;
    registeredInDOM.add(id);
    target.dataset.mintcss = [...registeredInDOM].join(" ");
    target.append(document.createTextNode(rule));
};

export const css = (object: CSSObject) => {
    const id = `mint-${hash(canonicalize(object))}`;
    insert(id, serializeRule(`.${id}`, object));
    return id;
};

export const keyframes = (frames: Record<string, CSSDeclarations>) => {
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
};

export const globalCss = (rules: Record<string, CSSObject>) => {
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
};

export const __resetCssForTests = () => {
    document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)?.remove();
    styleElement = undefined;
};
