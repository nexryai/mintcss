# mintcss

Small, dependency-free CSS-in-JS for browser applications. Extracted from
[Salvia](https://github.com/nexryai/rosmarinus/tree/main/salvia), with no React
runtime or type dependency. MIT licensed.

## Install

```sh
npm install mintcss
```

mintcss is an ESM package with bundled TypeScript declarations. It targets modern
browsers with `String.replaceAll` support. Importing it does not touch the DOM;
calling its styling functions requires a browser `document` with a `head`.

## Usage

```ts
import { css, globalCss, keyframes } from "mintcss";

globalCss({
    ":root": { "--accent": "#f4bd36" },
    body: { margin: 0, fontFamily: "system-ui, sans-serif" },
});

const fade = keyframes({
    from: { opacity: 0 },
    to: { opacity: 1 },
});

const button = css({
    backgroundColor: "var(--accent)",
    borderRadius: 8,
    padding: "8px 16px",
    animation: `${fade} 150ms ease-out`,
    "&:hover": { opacity: 0.8 },
    "& > svg": { width: 16 },
    "@media (width >= 40rem)": { padding: "12px 24px" },
    "@supports (display: grid)": { display: "grid" },
});

document.querySelector("button")?.classList.add(button);
```

In React, pass the result to `className`:

```tsx
import { css } from "mintcss";

const button = css({ backgroundColor: "#f4bd36", borderRadius: 8 });

export function Button() {
    return <button className={button}>Hello</button>;
}
```

## API

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

This is a browser runtime library: there is no SSR stylesheet collection,
hydration API, build-time extraction, automatic vendor prefixing, or CSP nonce
configuration. Styles accumulate for the lifetime of the document; prefer
reusing stable style objects and CSS variables for continuously changing values.
Strict CSP deployments must permit the generated inline stylesheet.

The serializer rejects malformed properties and rules, non-finite numeric
values, and certain injection-like strings. It is **not an untrusted-input
sanitizer**: pass application-authored styles and validate external data before
using it, particularly URLs. It does not enforce an external URL policy.

## Tests

Tests with a DOM environment can reset the shared stylesheet between cases:

```ts
import { afterEach } from "vitest";
import { __resetCssForTests } from "mintcss/testing";

afterEach(__resetCssForTests);
```

This helper removes all mintcss rules in the current document. Use it only in tests.

## Development and publishing

Use Node.js 22.12 or later:

```sh
npm ci
npm run lint
npm run check
npm test
npm run test:package
```

`test:package` builds a real npm tarball, installs it into a temporary consumer,
and checks its ESM exports, TypeScript declarations, and shipped files without
React. CI runs these checks on Node.js 22 and 24. The Biome configuration and
version are copied from Salvia; package-internal `#` imports keep the same rule
against relative imports.

For the first release, verify the package name is still available and sign in
to an npm account authorized to publish it:

```sh
npm view mintcss
npm login
npm publish --dry-run
npm publish
```

The initial version is `0.1.0`. `prepack` builds `dist`; `prepublishOnly` runs the
checks before publishing. Only compiled JavaScript, declarations, README,
LICENSE, and package metadata are shipped. Later releases must increment the
version before publishing. Publishing is manual; a successful CI run does not
publish a release.
