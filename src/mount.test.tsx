import { fireEvent, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type MountOptions } from "./mount";
import { autoMount } from "./sdk";

const LOOK = { bot: "sample", title: "날씨봇", color: "#10B981", placeholder: "날씨를 물어보세요" };
const WELCOME = { response: "welcome", type: "text", text: "어서 오세요", quick_replies: [] };

function engineFetch() {
  return vi.fn(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/web") ? LOOK : { bot: "sample", session: "s", messages: [WELCOME] })));
}

const shadowOf = (host: Element) => within(host.shadowRoot as unknown as HTMLElement);
const widgetHost = () => document.querySelector("[data-chatbot-widget]") as HTMLElement;

function start(options: Partial<MountOptions> = {}) {
  const fetch = engineFetch();
  const handle = mount({ engine: "https://e.example", bot: "sample", fetch: fetch as unknown as typeof window.fetch, ...options });
  return { handle, fetch };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).ReactNativeWebView;
});

describe("mount: launcher", () => {
  it("adds a button in a shadow root; the chat opens on click and only then talks to the engine", async () => {
    const { fetch } = start();
    const host = widgetHost();
    expect(host.parentElement).toBe(document.body);
    const ui = shadowOf(host);
    expect(host.shadowRoot?.querySelector("style")?.textContent).toContain(".cb-launcher");
    const button = ui.getByRole("button", { name: "챗봇 열기" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(await ui.findByText("어서 오세요")).toBeInTheDocument();
    expect(await ui.findByRole("button", { name: "날씨봇 닫기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens, closes, toggles and Escape closes; the conversation stays while closed", async () => {
    const { handle } = start({ open: true });
    const ui = shadowOf(widgetHost());
    await ui.findByText("어서 오세요");
    handle.close();
    await waitFor(() => expect(widgetHost().shadowRoot?.querySelector(".cb-panel")).toHaveAttribute("hidden"));
    handle.toggle();
    await waitFor(() => expect(widgetHost().shadowRoot?.querySelector(".cb-panel")).not.toHaveAttribute("hidden"));
    expect(ui.getByText("어서 오세요")).toBeInTheDocument();
    fireEvent.keyDown(ui.getByRole("textbox", { name: "메시지" }), { key: "Escape" });
    await waitFor(() => expect(widgetHost().shadowRoot?.querySelector(".cb-panel")).toHaveAttribute("hidden"));
    handle.open();
    await waitFor(() => expect(widgetHost().shadowRoot?.querySelector(".cb-panel")).not.toHaveAttribute("hidden"));
    await userEvent.click(ui.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(widgetHost().shadowRoot?.querySelector(".cb-panel")).toHaveAttribute("hidden"));
  });

  it("a second script for the same bot does not add a second launcher", async () => {
    const first = start();
    const second = start();
    expect(second.handle).toBe(first.handle);
    expect(document.querySelectorAll("[data-chatbot-widget]")).toHaveLength(1);
    first.handle.destroy();
    const third = start();
    expect(third.handle).not.toBe(first.handle);
    expect(document.querySelectorAll("[data-chatbot-widget]")).toHaveLength(1);
  });

  it("Escape closes only from inside the widget, not while composing or after the page used it", async () => {
    start({ open: true });
    const host = widgetHost();
    const ui = shadowOf(host);
    const input = await ui.findByRole("textbox", { name: "메시지" });
    input.focus();
    const panel = () => host.shadowRoot?.querySelector(".cb-panel");
    fireEvent.keyDown(document.body, { key: "Escape" }); // focus elsewhere on the page
    fireEvent.keyDown(input, { key: "Escape", isComposing: true, bubbles: true, composed: true });
    const pageUsesIt = (e: Event) => e.preventDefault(); // e.g. the page's own dialog closes first
    window.addEventListener("keydown", pageUsesIt, { capture: true });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    window.removeEventListener("keydown", pageUsesIt, { capture: true });
    expect(panel()).not.toHaveAttribute("hidden");
    fireEvent.keyDown(input, { key: "Escape", bubbles: true, composed: true });
    await waitFor(() => expect(panel()).toHaveAttribute("hidden"));
    expect(host.shadowRoot?.activeElement).toBe(await ui.findByRole("button", { name: /열기$/ })); // focus is not lost
  });

  it("destroy removes everything, once", async () => {
    const { handle } = start({ open: true });
    await shadowOf(widgetHost()).findByText("어서 오세요");
    handle.destroy();
    handle.destroy();
    expect(document.querySelector("[data-chatbot-widget]")).toBeNull();
  });
});

describe("mount: inline and page", () => {
  it("draws into the given element and leaves it there on destroy", async () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const events: string[] = [];
    const { handle } = start({ mode: "inline", container: box, onEvent: (e) => events.push(e.type) });
    expect(await shadowOf(box).findByText("어서 오세요")).toBeInTheDocument();
    expect(shadowOf(box).queryByRole("button", { name: "닫기" })).toBeNull();
    expect(events).toEqual(["ready", "message"]);
    handle.destroy();
    expect(box.isConnected).toBe(true);
    expect(box.shadowRoot?.childNodes.length).toBe(0);
  });

  it("a page with a close button tells the app, and every event reaches the app bridge", async () => {
    const posted: string[] = [];
    (window as unknown as Record<string, unknown>).ReactNativeWebView = { postMessage: (d: string) => posted.push(d) };
    const box = document.createElement("div");
    document.body.appendChild(box);
    start({ mode: "page", container: box, showClose: true });
    const ui = shadowOf(box);
    await ui.findByText("어서 오세요");
    await userEvent.click(ui.getByRole("button", { name: "닫기" }));
    expect(posted.map((p) => JSON.parse(p).type)).toEqual(["ready", "message", "close"]);
  });

  it("inside an app a link goes to the app, not the browser", async () => {
    const posted: string[] = [];
    (window as unknown as Record<string, unknown>).ReactNativeWebView = { postMessage: (d: string) => posted.push(d) };
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/web") ? LOOK : {
      bot: "sample", session: "s", messages: [{ response: "c", text: "카드", quick_replies: [], type: "basic_card",
        basic_card: { title: "안내", buttons: [{ label: "열기", action: "web_link", web_link_url: "https://a.example/x" }] } }] })));
    const box = document.createElement("div");
    document.body.appendChild(box);
    mount({ engine: "https://e.example", bot: "sample", mode: "inline", container: box, fetch: fetch as unknown as typeof window.fetch });
    const link = await shadowOf(box).findByRole("link", { name: "열기" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(posted.map((p) => JSON.parse(p))).toContainEqual({ type: "link", url: "https://a.example/x" });
  });

  it("mounting again into the same element replaces the first widget", async () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const first = start({ mode: "inline", container: box });
    await shadowOf(box).findByText("어서 오세요");
    const removed = vi.spyOn(window, "removeEventListener");
    const second = start({ mode: "inline", container: box, title: "두 번째" });
    await waitFor(() => expect(removed).toHaveBeenCalledWith("storage", expect.any(Function))); // the first chat was taken down
    removed.mockRestore();
    expect(await shadowOf(box).findByRole("heading", { name: "두 번째" })).toBeInTheDocument();
    first.handle.destroy(); // already replaced: leaves the second alone
    expect(shadowOf(box).getByRole("heading", { name: "두 번째" })).toBeInTheDocument();
    second.handle.destroy();
    expect(box.shadowRoot?.childNodes.length).toBe(0);
  });

  it("an onEvent that throws does not break the chat", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const box = document.createElement("div");
    document.body.appendChild(box);
    start({ mode: "inline", container: box, onEvent: () => { throw new Error("host bug"); } });
    expect(await shadowOf(box).findByText("어서 오세요")).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("mount: options", () => {
  it.each([
    [{ engine: "ftp://e.example" }, /http\(s\)/],
    [{ bot: "Sample" }, /bot ID/],
    [{ color: "red" }, /#RRGGBB/],
    [{ session: "has space" }, /session/],
    [{ session: "a".repeat(64) }, /session/],
  ])("refuses %j", (bad, message) => {
    expect(() => start(bad as Partial<MountOptions>)).toThrow(message);
    expect(document.querySelector("[data-chatbot-widget]")).toBeNull();
  });
});

describe("autoMount", () => {
  function script(data: Record<string, string>) {
    const s = document.createElement("script");
    Object.assign(s.dataset, data);
    return s;
  }

  it("mounts a launcher from the script's data attributes", async () => {
    const fetch = engineFetch();
    vi.stubGlobal("fetch", fetch);
    const handle = autoMount(script({ engine: "https://e.example", bot: "sample", open: "true", title: "도움말", color: "#123456" }));
    expect(handle).not.toBeNull();
    const ui = shadowOf(widgetHost());
    expect(await ui.findByRole("heading", { name: "도움말" })).toBeInTheDocument();
    expect(await ui.findByText("어서 오세요")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does nothing without a script or its data, says which is missing, and logs bad options instead of throwing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(autoMount(null)).toBeNull();
    expect(autoMount(script({}))).toBeNull(); // loaded for mount() only
    expect(error).not.toHaveBeenCalled();
    expect(autoMount(script({ bot: "sample" }))).toBeNull();
    expect(autoMount(script({ engine: "https://e.example" }))).toBeNull();
    expect(error).toHaveBeenCalledWith("chatbot-widget: the script tag needs both data-engine and data-bot");
    expect(autoMount(script({ engine: "https://e.example", bot: "BAD" }))).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
