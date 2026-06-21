import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../.."), "");
  const proxyTarget = env.LLM_PROXY_TARGET;

  const proxy = proxyTarget ? {
    "^/llm-": {
      target: proxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/llm-[^/]*/, ""),
      configure: (proxy: any) => {
        proxy.on("proxyReq", (proxyReq: any) => {
          proxyReq.removeHeader("origin");
          proxyReq.removeHeader("referer");
        });
      },
    },
  } : undefined;

  return {
    base: "/askTree/",
    plugins: [react()],
    resolve: {
      alias: {
        "@asktree/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      },
    },
    server: proxy ? { proxy } : {},
  };
});
