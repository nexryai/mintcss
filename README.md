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

The initial `0.1.0` release was published manually. Future releases use
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) through
`.github/workflows/publish.yml`. No npm token or GitHub secret is needed by the
workflow; GitHub Actions authenticates to npm with OIDC.

### One-time npm setup

In the [mintcss package settings](https://www.npmjs.com/package/mintcss/access),
add a GitHub Actions Trusted Publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `nexryai` |
| Repository | `mintcss` |
| Workflow filename | `publish.yml` |
| Environment name | Leave empty |
| Allowed actions | Enable direct publishing with `npm publish` |

You can also configure it using an authenticated npm CLI session with account
2FA enabled (npm 11.15.0 or newer):

```sh
npm trust github mintcss --repo nexryai/mintcss --file publish.yml --allow-publish
```

Tokens with the bypass-2FA option cannot configure Trusted Publishers. If the
configuration requires interactive authentication, complete it on npmjs.com.
New Trusted Publisher configurations must successfully publish within two days,
so configure it when the next release is ready.

### Release procedure

1. Increment the version in `package.json` and `package-lock.json` (for example,
   `npm version 0.1.1 --no-git-tag-version`).
2. Run the development checks, create a signed commit, push it, and wait for CI.
3. Create and push a signed tag matching the version, such as `v0.1.1`.
4. Publish a GitHub Release for that tag. The `release: published` event triggers
   the npm publishing workflow; saving a draft does not.

The workflow checks out the release tag, verifies it matches `package.json`,
installs dependencies, and publishes using OIDC. `prepublishOnly` runs lint,
type checks, tests, and the packed-consumer test before publication; `prepack`
builds `dist`. Only compiled JavaScript, declarations, README, LICENSE, and
package metadata are shipped. A push to `main` only runs CI.

Stable releases publish to the npm `latest` dist-tag. For a prerelease, use a
version such as `0.2.0-beta.1` and mark the GitHub Release as a prerelease; it
publishes to `next`. The release's prerelease flag must agree with the version.
Never reuse an already published package version. Ensure the release tag
includes the publishing workflow and release validation script.
