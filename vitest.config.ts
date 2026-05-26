import { defineConfig } from "vitest/config";
import path from "path";

const projectRoot = path.resolve(__dirname);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    server: {
      deps: {
        inline: ["@asktree/core"],
      },
    },
  },
  resolve: {
    alias: {
      "@asktree/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
});
