"use client";

import { useServerInsertedHTML } from "next/navigation.js";
import { createContext, createElement, type ReactNode, useContext, useState } from "react";

import { createStyleRegistry, type StyleApi, type StyleRegistry } from "#core";

const MintContext = createContext<StyleRegistry | null>(null);

export type MintStyleRegistryProps = {
    children?: ReactNode;
    nonce?: string;
};

/** Collect styles for each server render and flush them before streamed content. */
export function MintStyleRegistry({ children, nonce }: MintStyleRegistryProps) {
    const [registry] = useState(() => createStyleRegistry({ nonce }));
    useServerInsertedHTML(() => {
        const styles = registry.flush();
        if (!styles.ids.length) return null;
        return createElement("style", {
            "data-mintcss": styles.ids.join(" "),
            nonce,
            dangerouslySetInnerHTML: { __html: styles.css },
        });
    });
    return createElement(MintContext.Provider, { value: registry }, children);
}

/** Use inside a Client Component wrapped in MintStyleRegistry. */
export function useMintcss(): StyleApi {
    const registry = useContext(MintContext);
    if (!registry) throw new Error("useMintcss must be used inside MintStyleRegistry");
    return registry;
}
