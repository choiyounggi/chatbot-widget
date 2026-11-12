import { mount } from "./mount";

// chat.html?engine=…&bot=…[&session=…][&close=1]: the full-screen chat for app webviews.
// <meta name="chatbot-engines" content="https://api.example.com ...">: the engines this deployment may
// talk to (set it in production, or a link could point the page at someone else's server).
export function engines(doc: Document): string[] {
  const content = doc.querySelector('meta[name="chatbot-engines"]')?.getAttribute("content") ?? "";
  return content.split(/\s+/).filter(Boolean).map((u) => u.replace(/\/+$/, ""));
}

export function start(win: Window, app: HTMLElement): void {
  try {
    if (win.top !== win) throw new Error("이 페이지는 다른 사이트 안(iframe)에서 열 수 없어요. 사이트에는 chatbot.js를 붙여 주세요.");
    const params = new URLSearchParams(win.location.search);
    const allowed = engines(win.document);
    const engine = params.get("engine") ?? allowed[0] ?? "";
    if (allowed.length > 0 && !allowed.includes(engine.replace(/\/+$/, ""))) throw new Error("이 위젯에 등록되지 않은 엔진이에요.");
    const session = params.get("session");
    mount({
      engine, bot: params.get("bot") ?? "", mode: "page", container: app,
      showClose: params.get("close") === "1", ...(session ? { session } : {}),
    });
  } catch (error) {
    app.textContent = `채팅을 열 수 없어요: ${error instanceof Error ? error.message : String(error)}`;
    app.className = "error";
  }
}

if (!import.meta.env.VITEST) start(window, document.getElementById("app") as HTMLElement);
