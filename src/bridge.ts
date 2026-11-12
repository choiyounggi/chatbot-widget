import type { BotMessage } from "./types";

/** What the widget tells the page or the app around it (docs/widget-plan.md §3). */
export type WidgetEvent =
  | { type: "ready" }
  | { type: "message"; messages: BotMessage[] }
  | { type: "link"; url: string }
  | { type: "close" };

interface Bridges {
  ReactNativeWebView?: { postMessage(data: string): void };
  webkit?: { messageHandlers?: { chatbot?: { postMessage(data: unknown): void } } };
  ChatbotAndroid?: { postMessage(data: string): void };
}

/** Send an event to the native app hosting this page, if any. True when an app received it. */
export function postToApp(event: WidgetEvent, win: Bridges = window as unknown as Bridges): boolean {
  const data = JSON.stringify(event);
  let sent = false;
  try {
    if (win.ReactNativeWebView) { win.ReactNativeWebView.postMessage(data); sent = true; }
    if (win.webkit?.messageHandlers?.chatbot) { win.webkit.messageHandlers.chatbot.postMessage(data); sent = true; }
    if (win.ChatbotAndroid) { win.ChatbotAndroid.postMessage(data); sent = true; }
  } catch {
    return sent; // an app bridge that throws must not break the chat
  }
  return sent;
}
