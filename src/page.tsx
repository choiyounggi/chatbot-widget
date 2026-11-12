import { mount } from "./mount";

// chat.html?engine=…&bot=…[&session=…][&close=1]: the full-screen chat for app webviews.
const params = new URLSearchParams(location.search);
const app = document.getElementById("app") as HTMLElement;
try {
  const session = params.get("session");
  mount({
    engine: params.get("engine") ?? "", bot: params.get("bot") ?? "", mode: "page", container: app,
    showClose: params.get("close") === "1", ...(session ? { session } : {}),
  });
} catch (error) {
  app.textContent = `채팅을 열 수 없어요: ${error instanceof Error ? error.message : String(error)}`;
  app.className = "error";
}
