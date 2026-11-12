/// <reference types="vitest/config" />
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// chat.html: the full-screen chat page (app webviews). The embeddable script is vite.sdk.config.ts.
export default defineConfig({
  plugins: [preact()],
  base: "./", // the page works from any folder it is uploaded to
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: { chat: "chat.html" } } },
  test: {
    environment: "jsdom",
    css: true, // the shadow root's stylesheet is real in tests
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/page.tsx", "src/test/**", "src/**/*.test.{ts,tsx}", "src/schema.d.ts"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
