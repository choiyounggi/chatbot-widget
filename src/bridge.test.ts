import { describe, expect, it, vi } from "vitest";
import { postToApp } from "./bridge";

describe("postToApp", () => {
  it("sends JSON to every app bridge present", () => {
    const rn = vi.fn(), ios = vi.fn(), android = vi.fn();
    const win = { ReactNativeWebView: { postMessage: rn }, webkit: { messageHandlers: { chatbot: { postMessage: ios } } },
                  ChatbotAndroid: { postMessage: android } };
    expect(postToApp({ type: "close" }, win)).toBe(true);
    for (const f of [rn, ios, android]) expect(f).toHaveBeenCalledWith('{"type":"close"}');
  });
  it("returns false outside an app, and survives a bridge that throws", () => {
    expect(postToApp({ type: "ready" }, {})).toBe(false);
    expect(postToApp({ type: "ready" }, { webkit: {} })).toBe(false);
    const broken = { ReactNativeWebView: { postMessage: () => { throw new Error("gone"); } } };
    expect(postToApp({ type: "ready" }, broken)).toBe(false);
  });
});
