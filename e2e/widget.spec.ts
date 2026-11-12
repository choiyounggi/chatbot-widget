import { expect, test, type Page } from "@playwright/test";
import { ENGINE, SITE, WIDGET } from "../playwright.config";

// the engine allows the test site and the widget's own page (webviews); "localhost" is another origin
test.beforeAll(async ({ request }) => {
  const r = await request.put(`${ENGINE}/v1/builder/bots/sample/web`, {
    data: { allowed_origins: [SITE, WIDGET], title: "샘플 상담", color: "#0F766E", placeholder: "무엇이 궁금하세요?" },
  });
  expect(r.ok()).toBe(true);
});

async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "메시지" });
  await box.fill(text);
  await box.press("Enter");
}

test("a site adds one script tag: launcher → chat with the engine → the conversation survives a reload → 새 대화", async ({ page }) => {
  await page.goto(`${SITE}/index.html`);
  const launcher = page.getByRole("button", { name: "챗봇 열기" });
  await expect(launcher).toBeVisible();
  // the site's own CSS does not reach the widget (a shadow root, and every inherited style set again inside)
  await expect(launcher).not.toHaveCSS("background-color", "rgb(255, 105, 180)");
  await launcher.click();
  await expect(page.getByRole("textbox", { name: "메시지" })).toHaveCSS("font-family", /Apple SD Gothic Neo/);

  const chat = page.getByRole("region", { name: "샘플 상담 대화" });
  await expect(chat.getByRole("heading", { name: "샘플 상담" })).toBeVisible();
  await expect(chat.getByText("무엇이든 물어보세요.")).toBeVisible(); // the sample bot has no welcome block
  await expect(chat.getByRole("textbox", { name: "메시지" })).toHaveAttribute("placeholder", "무엇이 궁금하세요?");
  await expect(chat.getByRole("textbox", { name: "메시지" })).toBeFocused();

  await ask(page, "안녕하세요");
  await expect(chat.getByText(/^(안녕하세요! 무엇을 도와드릴까요\?|반가워요! 무엇이든 물어보세요\.)$/)).toBeVisible();
  await ask(page, "오늘 날씨 알려줘");
  await expect(chat.getByText("어느 지역이요?")).toBeVisible();
  const replies = chat.getByRole("group", { name: "바로 답하기" });
  await expect(replies.getByRole("button")).toHaveText(["서울", "부산", "제주"]);
  await ask(page, "지금 몇 시 몇 분이야?");
  await expect(chat.getByText(/^지금은 .+에요\.$/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /열기$/ }).click();
  await expect(chat.getByText("오늘 날씨 알려줘")).toBeVisible(); // kept on this device
  await expect(chat.getByText(/^지금은 .+에요\.$/)).toBeVisible();

  await chat.getByRole("button", { name: "새 대화" }).click();
  await expect(chat.getByText("오늘 날씨 알려줘")).toHaveCount(0);
  await expect(chat.getByText("무엇이든 물어보세요.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
});

test("a site the bot does not allow is told so, and the engine runs no turn for it", async ({ page }) => {
  const turns: number[] = [];
  page.on("response", (r) => { if (r.url().includes("/sessions/")) turns.push(r.status()); });
  await page.goto("http://localhost:5181/index.html"); // same page, an origin that is not on the list
  await page.getByRole("button", { name: "챗봇 열기" }).click();
  await expect(page.getByRole("alert")).toHaveText("이 사이트에서는 쓸 수 없는 챗봇이에요.");
  await expect(page.getByRole("textbox", { name: "메시지" })).toHaveCount(0);
  expect(turns.length).toBeGreaterThan(0);
  expect(turns.every((s) => s === 403)).toBe(true);
});

test("chat.html is a full-screen chat for app webviews and tells the app what happens", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { events: unknown[]; ReactNativeWebView: { postMessage(d: string): void } };
    w.events = [];
    w.ReactNativeWebView = { postMessage: (d) => w.events.push(JSON.parse(d)) };
  });
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(`${WIDGET}/chat.html?engine=${encodeURIComponent(ENGINE)}&bot=sample&close=1&session=app-user-e2e-0001`);
  const chat = page.getByRole("region", { name: "샘플 상담 대화" });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("button", { name: "새 대화" })).toHaveCount(0); // the app owns the session
  await ask(page, "안녕하세요");
  await expect(chat.getByText(/무엇을 도와드릴까요\?|무엇이든 물어보세요\./).last()).toBeVisible();
  await chat.getByRole("button", { name: "닫기" }).click();
  const events = await page.evaluate(() => (window as unknown as { events: { type: string }[] }).events.map((e) => e.type));
  expect(events).toEqual(["ready", "message", "close"]);
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0]).toBe(width[1]); // no horizontal scroll
});

test("chat.html without an engine or a bot says why", async ({ page }) => {
  await page.goto(`${WIDGET}/chat.html?bot=sample`);
  await expect(page.locator("#app")).toHaveText(/채팅을 열 수 없어요: engine must be an http\(s\) URL/);
});

test("mount() inline fills the page's box: the log scrolls inside it, the page around it stays put", async ({ page }) => {
  await page.goto(`${SITE}/inline.html`);
  const chat = page.getByRole("region", { name: "샘플 상담 대화" });
  await expect(chat).toBeVisible();
  expect((await chat.boundingBox())?.height).toBe(400);
  for (let i = 0; i < 6; i++) {
    await ask(page, `안녕하세요 ${i}`);
    await expect(chat.getByText(`안녕하세요 ${i}`)).toBeVisible();
    await expect(chat.getByRole("status")).toHaveCount(0); // the answer came: the next one may be sent
  }
  await expect(chat.getByText("안녕하세요 5")).toBeVisible(); // scrolled to the newest
  expect((await chat.boundingBox())?.height).toBe(400); // grew inside, not the page
  await expect(chat.getByRole("heading", { name: "샘플 상담" })).toHaveCSS("direction", "ltr");
  await expect(chat.getByText("안녕하세요 0")).toHaveCSS("font-family", /Apple SD Gothic Neo/);
});
