import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// dist/chatbot.js: one self-contained script (global ChatbotWidget) a site adds with a <script> tag.
export default defineConfig({
  plugins: [preact()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: false, // next to chat.html
    lib: { entry: "src/sdk.tsx", name: "ChatbotWidget", formats: ["iife"], fileName: () => "chatbot.js" },
  },
});
