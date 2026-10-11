import { act, createElement } from "react";

import { createRoot, hydrateRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { createStyleRegistry, css } from "#mintcss";
import { MintStyleRegistry, useMintcss } from "#next";
import { __resetCssForTests } from "#testing";

vi.mock("next/navigation.js", () => ({ useServerInsertedHTML: () => {} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
    __resetCssForTests();
    document.head.querySelectorAll("style[data-mintcss]").forEach((element) => {
        element.remove();
    });
    document.body.replaceChildren();
});

function Button({ color }: { color: string }) {
    const { css } = useMintcss();
    return createElement("button", { type: "button", className: css({ color }) }, "Hello");
}

it("hydrates streamed style tags without duplicates, then inserts dynamic styles", async () => {
    const red = css({ color: "red" });
    const redStyle = document.head.querySelector("style[data-mintcss]") as HTMLStyleElement;
    const blue = css({ color: "blue" });
    redStyle.dataset.mintcss = red;
    redStyle.textContent = `.${red}{color:red;}`;
    const streamedStyle = document.createElement("style");
    streamedStyle.dataset.mintcss = blue;
    streamedStyle.textContent = `.${blue}{color:blue;}`;
    document.head.append(streamedStyle);
    const before = document.head.innerHTML;
    const container = document.createElement("div");
    container.innerHTML = `<button type="button" class="${blue}">Hello</button>`;
    document.body.append(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(() => {
        root = hydrateRoot(container, createElement(MintStyleRegistry, null, createElement(Button, { color: "blue" })), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(errors).toEqual([]);
    expect(document.head.innerHTML).toBe(before);
    await act(() => root.render(createElement(MintStyleRegistry, null, createElement(Button, { color: "green" }))));
    expect(document.head.textContent).toContain("color:green;");
    await act(() => root.unmount());
});

it("applies the nonce to styles created in the browser", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(createElement(MintStyleRegistry, { nonce: "client-nonce" }, createElement(Button, { color: "purple" }))));
    expect(document.head.querySelector("style[data-mintcss]")?.getAttribute("nonce")).toBe("client-nonce");
    await act(() => root.unmount());
});

it("restores registry styles if the browser stylesheet was removed", () => {
    const registry = createStyleRegistry();
    const name = registry.css({ color: "gold" });
    document.head.querySelector("style[data-mintcss]")?.remove();
    expect(registry.css({ color: "gold" })).toBe(name);
    expect(document.head.textContent).toContain(`.${name}{color:gold;}`);
});
