# chatbot-widget

A chat window for [chatbot-engine](https://github.com/choiyounggi/chatbot-engine) bots that you can put anywhere: a website (one script tag), your own page (`mount()`), or a mobile app's webview (`chat.html`). Plan and decisions: [docs/widget-plan.md](docs/widget-plan.md).

> Status: W1. Text, image, card, list and carousel messages; quick replies and buttons; Korean IME-safe input; the conversation is kept on the device; app bridge events for webviews. `chatbot.js` is about 13 KB gzipped, with no external fonts or CDNs.

## Before you embed: allow the site
The engine only answers browsers on sites listed in the bot's web settings. You can set them in the builder's 웹 채팅 screen, or call `PUT /v1/builder/bots/{bot}/web` with `{"allowed_origins": ["https://shop.example.com"]}`.
- **Websites:** list the site that adds the script.
- **Webviews:** list the address where `chat.html` is hosted.

The same settings give the bot's title, color and input hint.

## Website: one script tag
```html
<script src="https://YOUR-WIDGET-HOST/chatbot.js" data-engine="https://YOUR-ENGINE" data-bot="sample" async></script>
```
A button appears at the bottom right and opens the chat. On narrow screens the chat opens full screen.
- **Options:** `data-title`, `data-color="#0F766E"`, `data-open="true"`.
- **Style isolation:** the widget lives in a shadow root, so the site's CSS does not reach it.

## Your own page: `mount()`
```js
const chat = ChatbotWidget.mount({
  engine: "https://YOUR-ENGINE", bot: "sample",
  mode: "inline",                  // "launcher" (default) | "inline" | "page"
  container: document.getElementById("help-chat"),
  onEvent: (e) => console.log(e),  // {type: "ready" | "message" | "link" | "close", ...}
});
chat.open(); chat.close(); chat.destroy();
```

## Mobile app: webview
Open `https://YOUR-WIDGET-HOST/chat.html?engine=https%3A%2F%2FYOUR-ENGINE&bot=sample&close=1` in a WebView or WKWebView.
- **`close=1`:** shows a close button that sends `close` to the app.
- **`session=…`:** an unguessable key your app makes (for example, an HMAC of the user ID). Without it, a random session is kept on the device.

Events arrive as JSON strings: `{"type":"ready"}`, `{"type":"message","messages":[…]}`, `{"type":"link","url":"…"}`, `{"type":"close"}`.
- **Links:** inside an app, a pressed link is only reported to the app. The app decides how to open it.

| App | Receive with |
|---|---|
| React Native | `<WebView onMessage={(e) => handle(JSON.parse(e.nativeEvent.data))} />` |
| iOS (WKWebView) | `userContentController.add(handler, name: "chatbot")` |
| Android | `webView.addJavascriptInterface(object { @JavascriptInterface fun postMessage(json: String) { … } }, "ChatbotAndroid")` |

Load the page from an https address. A `file://` page or an HTML string has the origin `null`, which cannot be allowed.

**In production**, list your engine in `chat.html`'s `<meta name="chatbot-engines" content="https://YOUR-ENGINE">`; left empty, the page talks to whatever `engine` a link names. The page refuses to open inside another site's iframe. If you can, also serve it with `Content-Security-Policy: frame-ancestors 'none'`.

Scripts on a site that embeds the widget can read its conversation (it is part of that page), so embed it only on sites you trust.

## Develop
```sh
npm ci
npm run check   # tsc + eslint + vitest (coverage gate) — the same as CI
npm run build   # dist/chatbot.js and dist/chat.html
npm run gen:api # src/schema.d.ts from the engine (ENGINE_OPENAPI=path/to/openapi.json)
ENGINE_DIR=../chatbot-engine npm run e2e   # Playwright: a real engine (hashing embedder), a test site, chat.html
```
Upload `dist/` to any static host. Every file uses relative paths.
