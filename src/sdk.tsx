import { mount, type MountOptions, type WidgetHandle } from "./mount";

export { mount };
export type { MountOptions, WidgetHandle };
export const version = "0.1.0";

/** `<script src="chatbot.js" data-engine="…" data-bot="…">`: a launcher appears without any code.
 * Optional: data-color, data-title, data-open="true". */
export function autoMount(script: HTMLScriptElement | null): WidgetHandle | null {
  const engine = script?.dataset.engine;
  const bot = script?.dataset.bot;
  if (!script || (!engine && !bot)) return null; // loaded for ChatbotWidget.mount() only
  if (!engine || !bot) {
    console.error("chatbot-widget: the script tag needs both data-engine and data-bot");
    return null;
  }
  const options: MountOptions = { engine, bot, mode: "launcher", open: script.dataset.open === "true" };
  if (script.dataset.color) options.color = script.dataset.color;
  if (script.dataset.title) options.title = script.dataset.title;
  const start = () => {
    try {
      return mount(options);
    } catch (error) {
      console.error("chatbot-widget:", error);
      return null;
    }
  };
  if (document.body) return start();
  document.addEventListener("DOMContentLoaded", start, { once: true });
  return null;
}

autoMount(document.currentScript as HTMLScriptElement | null);
