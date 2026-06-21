import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Reusable origin-stripping proxy hook for internal gateways */
function stripOriginHeaders(proxy: any) {
  proxy.on("proxyReq", (proxyReq: any) => {
    proxyReq.removeHeader("origin");
    proxyReq.removeHeader("referer");
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../.."), "");
  const llmProxyTarget = env.LLM_PROXY_TARGET;
  const gleanProxyTarget = env.GLEAN_PROXY_TARGET;

  const proxy: Record<string, any> = {};

  if (llmProxyTarget) {
    proxy["^/llm-"] = {
      target: llmProxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/llm-[^/]*/, ""),
      configure: stripOriginHeaders,
    };
  }

  if (gleanProxyTarget) {
    proxy["^/glean-proxy"] = {
      target: gleanProxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/glean-proxy/, ""),
      configure: stripOriginHeaders,
    };
  }

  return {
    base: "/askTree/",
    plugins: [react()],
    resolve: {
      alias: {
        "@asktree/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      },
    },
    server: Object.keys(proxy).length > 0 ? { proxy } : {},
  };
});
