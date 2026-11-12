import { describe, expect, it, vi } from "vitest";
import { engines, start } from "./page";

function page(search: string, meta?: string, framed = false) {
  const doc = document.implementation.createHTMLDocument("chat");
  if (meta !== undefined) {
    const m = doc.createElement("meta");
    m.name = "chatbot-engines";
    m.content = meta;
    doc.head.appendChild(m);
  }
  const win = { location: { search }, document: doc } as unknown as Window;
  (win as unknown as { top: unknown }).top = framed ? {} : win;
  const app = document.createElement("div");
  document.body.appendChild(app);
  return { win, app };
}

describe("chat.html", () => {
  it("reads the allowed engines from its meta tag", () => {
    expect(engines(page("", "https://a.example/  https://b.example").win.document)).toEqual(["https://a.example", "https://b.example"]);
    expect(engines(page("", "").win.document)).toEqual([]);
    expect(engines(page("").win.document)).toEqual([]);
  });

  it("opens the chat for its query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ bot: "sample", session: "s", messages: [] }))));
    const { win, app } = page("?engine=https%3A%2F%2Fa.example&bot=sample&close=1&session=app-1");
    start(win, app);
    expect(app.shadowRoot).not.toBeNull();
    expect(app.className).not.toBe("error");
    vi.unstubAllGlobals();
  });

  it("refuses inside an iframe, an engine not on its list, and missing parameters", () => {
    const framed = page("?engine=https%3A%2F%2Fa.example&bot=sample", "", true);
    start(framed.win, framed.app);
    expect(framed.app.textContent).toMatch(/iframe/);
    const other = page("?engine=https%3A%2F%2Fevil.example&bot=sample", "https://a.example");
    start(other.win, other.app);
    expect(other.app.textContent).toBe("채팅을 열 수 없어요: 이 위젯에 등록되지 않은 엔진이에요.");
    const missing = page("?bot=sample");
    start(missing.win, missing.app);
    expect(missing.app.className).toBe("error");
    expect(missing.app.textContent).toMatch(/engine must be an http\(s\) URL/);
  });

  it("with one listed engine the query may leave it out", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const { win, app } = page("?bot=sample", "https://a.example/");
    start(win, app);
    expect(app.className).not.toBe("error");
    vi.unstubAllGlobals();
  });
});
