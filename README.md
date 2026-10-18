# mintcss

Small, dependency-free CSS-in-JS with optional Next.js App Router integration.

## Install

```sh
npm install mintcss
```

mintcss is an ESM package with bundled TypeScript declarations. It targets modern
browsers with `String.replaceAll` support. Importing it does not touch the DOM;
the top-level styling functions require a browser `document` with a `head`.
For server rendering, use `createStyleRegistry` or the Next.js integration below.

## Usage
```tsx
import { css } from "mintcss";

const button = css({ backgroundColor: "#f4bd36", borderRadius: 8 });

export function Button() {
    return <button className={button}>Hello</button>;
}
```

```tsx
"use client";
import { type ButtonHTMLAttributes, useRef, useState } from "react";

import type { CSSDeclarations, CSSObject } from "mintcss";
import { useMintcss } from "mintcss/next";

import { mergeStyles } from "mintcss";

export function Button({ children, className = "", onClick, onPointerDown, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { css, keyframes } = useMintcss();
    const buttonClass = css(mergeStyles(buttonStyles, className.split(" ").includes("button-quiet") ? quietStyles : undefined));
    const rippleClass = css({ ...rippleStyles, animation: `${keyframes(rippleFrames)} .65s ease-out forwards` });
    const labelClass = css(labelStyles);
    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
    const sequence = useRef(0);
    function ripple(button: HTMLButtonElement, clientX?: number, clientY?: number) {
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        setRipples((values) => [...values, { id: sequence.current++, x: (clientX === undefined ? rect.width / 2 : clientX - rect.left) - size / 2, y: (clientY === undefined ? rect.height / 2 : clientY - rect.top) - size / 2, size }]);
    }
    return (
        <button
            {...props}
            type={type}
            className={`button ${className} ${buttonClass}`}
            onPointerDown={(event) => {
                ripple(event.currentTarget, event.clientX, event.clientY);
                onPointerDown?.(event);
            }}
            onClick={(event) => {
                if (event.detail === 0) ripple(event.currentTarget);
                onClick?.(event);
            }}
        >
            <span className={`button-label ${labelClass}`}>{children}</span>
            {ripples.map((value) => (
                <span aria-hidden="true" key={value.id} className={`ripple ${rippleClass}`} style={{ left: value.x, top: value.y, width: value.size, height: value.size }} onAnimationEnd={() => setRipples((values) => values.filter((item) => item.id !== value.id))} />
            ))}
        </button>
    );
}

const buttonStyles = {
    position: "relative",
    overflow: "hidden",
    border: "0",
    borderRadius: "10px",
    background: "var(--accent)",
    color: "white",
    padding: "12px 19px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    isolation: "isolate",
    whiteSpace: "nowrap",
    transition: "background .15s,transform .15s",
    "&:hover": {
        background: "#4358cf",
    },
    "&:active": {
        transform: "translateY(1px)",
    },
    "&:focus-visible": {
        outline: "3px solid #a3aff7",
        outlineOffset: "3px",
    },
    "&:disabled": {
        opacity: ".5",
        cursor: "wait",
    },
} satisfies CSSObject;

const quietStyles = {
    background: "#ebeffb",
    color: "var(--accent)",
    padding: "10px 14px",
    "&:hover": {
        background: "#e0e6fa",
    },
} satisfies CSSObject;

const labelStyles = {
    position: "relative",
    zIndex: "1",
} satisfies CSSObject;

const rippleStyles = {
    position: "absolute",
    pointerEvents: "none",
    borderRadius: "50%",
    background: "currentColor",
    opacity: ".18",
    zIndex: "0",
    "@media (prefers-reduced-motion:reduce)": {
        animationDuration: "1ms",
    },
} satisfies CSSObject;

const rippleFrames = {
    from: {
        transform: "scale(0)",
        opacity: ".22",
    },
    to: {
        transform: "scale(1)",
        opacity: "0",
    },
} satisfies Record<string, CSSDeclarations>;
```

## Composing styles

`mergeStyles(...styles)` is a pure helper that works in browsers and on the server,
without a document or style registry. Later declarations win; nested selectors,
`@media`, and `@supports` objects merge recursively without modifying the inputs.
Optional `undefined` arguments are ignored. An explicit `undefined` property
replaces an earlier value, so the serializer omits that declaration.

```ts
import { mergeStyles } from "mintcss";

const card = {
    padding: 26,
    "@media (width < 40rem)": { padding: 20, borderRadius: 18 },
};
const hero = mergeStyles(card, {
    padding: "34px 40px",
    "@media (width < 40rem)": { padding: 25 },
});
// The small-screen hero keeps borderRadius: 18 and uses padding: 25.
```

The helper merges matching object keys; it does not reorder CSS cascade rules or
resolve shorthand/longhand conflicts. The serializer's key-order rules still apply.

## Next.js App Router

The optional `mintcss/next` entry point supports Next.js 14–16 with React 18.2 or
19. React and Next.js are optional peer dependencies; the core entry point does
not import either framework.

Wrap the app in `MintStyleRegistry` in your root layout. The layout can remain a
Server Component:

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { MintStyleRegistry } from "mintcss/next";

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <MintStyleRegistry>{children}</MintStyleRegistry>
            </body>
        </html>
    );
}
```

In Client Components, obtain the styling functions from `useMintcss` and call
them during rendering:

```tsx
// app/button.tsx
"use client";

import { useMintcss } from "mintcss/next";

export function Button() {
    const { css, globalCss, keyframes } = useMintcss();
    globalCss({ body: { margin: 0 } });
    const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
    const button = css({
        backgroundColor: "#f4bd36",
        borderRadius: 8,
        animation: `${fade} 150ms ease-out`,
        "&:hover": { opacity: 0.8 },
    });
    return <button type="button" className={button}>Hello</button>;
}
```

The registry collects CSS separately for each server render and uses Next.js's
[`useServerInsertedHTML`](https://nextjs.org/docs/app/guides/css-in-js) integration
to emit new rules as content streams. The browser reuses those rules during
hydration and inserts new rules for subsequent renders and navigation. The same
styles produce the same identifiers on the server and client.

Use the hook inside Client Components under the registry. Module-level calls to
the browser-only `css`, `globalCss`, or `keyframes` exports still require a DOM,
even in files with `"use client"`, because Next.js also renders Client Components
on the server. Style objects can be declared at module scope, then passed to the
hook's functions during rendering. Server Components cannot use `useMintcss`.
The automatic integration targets the App Router; Pages Router applications
need their own SSR collection using the API below.

For a nonce-based CSP, pass the request's nonce as
`<MintStyleRegistry nonce={nonce}>`. It is applied to server-generated style tags
and new browser style tags. Configure the corresponding CSP in your app.

## Server rendering

`createStyleRegistry({ nonce? })` provides `css`, `globalCss`, and `keyframes`
without requiring a DOM. Create a separate registry for every server render and
use its functions throughout that render; do not share a mutable registry
between requests.

```ts
import { createStyleRegistry } from "mintcss";

const registry = createStyleRegistry();
const button = registry.css({ color: "red" });
const styles = registry.getStyles();
// styles: { ids: string[], css: string }
// Render a <style data-mintcss={styles.ids.join(" ")}> containing styles.css
// in the document head alongside the HTML using button as its class name.
```

`getStyles()` returns all collected rules in insertion order. `flush()` returns
only the rules collected since the previous flush, retaining deduplication for
later streaming chunks. Include `data-mintcss` with the emitted identifiers so
browser calls can reuse the SSR styles. In the browser, registry styling calls
also insert rules into the document head.

## API

- `mergeStyles(...styles: (CSSObject | undefined)[]): CSSObject` composes style objects without a DOM.

- `css(styles: CSSObject): string` inserts rules and returns a deterministic
  `mint-…` class name. Object key order does not change that name.
- `keyframes(frames: Record<string, CSSDeclarations>): string` inserts an
  animation and returns its `mint-kf-…` name. Steps are `from`, `to`, or integer
  percentages from `0%` through `100%`, emitted in numeric order.
- `globalCss(rules: Record<string, CSSObject>): void` inserts global selector
  rules. Top-level `@media` and `@supports` blocks contain selector objects.
- Types `CSSObject`, `CSSDeclarations`, and `CSSValue` are exported. Properties
  accept strings, numbers, and `undefined`; nested objects represent selectors
  or supported conditional rules. These types do not validate property names
  against a complete CSS specification.

Properties use camelCase (`backgroundColor`, `WebkitAppearance`, `msOverflowStyle`)
except CSS custom properties (`--accent`). Nonzero numeric values receive `px`
unless they are custom properties or supported unitless properties, such as
`opacity`, `lineHeight`, `fontWeight`, `flexGrow`, or `zIndex`. Zero stays `0`.
Use strings for other units and numeric values that must remain unitless.
`undefined` declarations are omitted.

Nested selectors must include `&`, which is replaced by the parent selector.
Only `@media` and `@supports` conditional rules are supported; use `keyframes`
for animations. Declarations and nested keys are emitted in sorted order, so
avoid mixing shorthand and longhand declarations that depend on insertion order.

Rules are appended to a shared `<style data-mintcss>` element. Its DOM registry
avoids duplicate insertion, including across module reloads. Global rules keep
selector insertion order so their cascade is preserved. Generated identifiers
are implementation details and should not be persisted or hard-coded.

## Limits

There is no build-time extraction or automatic vendor prefixing. Styles accumulate
for the lifetime of the document; prefer reusing stable style objects and CSS
variables for continuously changing values. Strict CSP deployments must permit
the generated inline stylesheet, for example with the registry nonce option.

The serializer rejects malformed properties and rules, non-finite numeric
values, and certain injection-like strings. It is **not an untrusted-input
sanitizer**: pass application-authored styles and validate external data before
using it, particularly URLs. It does not enforce an external URL policy.
