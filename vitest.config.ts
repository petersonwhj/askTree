import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@asktree/core": resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
  },
});
