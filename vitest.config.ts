import { defineConfig } from "vitest/config";

import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        alias: {
            "#core": fileURLToPath(new URL("./src/core.ts", import.meta.url)),
            "#mintcss": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
            "#testing": fileURLToPath(new URL("./src/testing.ts", import.meta.url)),
            "#next": fileURLToPath(new URL("./src/next.ts", import.meta.url)),
        },
    },
    test: { environment: "jsdom" },
});
