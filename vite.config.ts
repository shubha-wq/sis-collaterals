import { fileURLToPath, URL } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Dev only: serves POST /api/expand-image from the same handler the Vercel
 * and Netlify functions use. Server variables (e.g. STABILITY_API_KEY) are
 * read from .env.local here and never exposed to the browser bundle
 * (only VITE_-prefixed variables are).
 */
function expandImageApi(): Plugin {
  return {
    name: "sis-expand-image-api",
    apply: "serve",
    configureServer(server) {
      const env = { ...loadEnv(server.config.mode, process.cwd(), ""), ...process.env };
      server.middlewares.use("/api/expand-image", async (req, res) => {
        try {
          const { handleExpandImage } = (await server.ssrLoadModule("/server/expansion/handler.ts")) as typeof import("./server/expansion/handler");
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          // Read the whole upload first (as the hosting platforms do), so an early reply can't stall the browser.
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
          const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, { method: req.method, headers, body });
          const response = await handleExpandImage(request, env);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "server-error", message: "The dev image endpoint failed." }));
        }
      });
    },
  };
}

// Only files imported from src/ or placed in public/ ship in the build.
// docs/ (including docs/reference/original) is never bundled.
export default defineConfig({
  plugins: [react(), expandImageApi()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
