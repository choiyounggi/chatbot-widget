# 챗봇 위젯 SDK 계획 (W1, 2026-11-12)

영기 요청: "꼭 카카오로만 쓰지는 않을 건데, 어디든 붙여서 쓸 수 있게 SDK로 사용하는 챗봇 UI를 만들어줘. 웹뷰로 붙여서 쓸 수 있도록."
결정(영기): 새 레포 `chatbot-widget`, 봇마다 허용 도메인. 엔진 규격은 엔진 `docs/engine-core-plan.md` "빌더 단계 E-G".

## 1. 쓰는 법 세 가지

| 어디에 | 어떻게 | 화면 |
|---|---|---|
| 웹사이트 | `<script src="…/chatbot.js" data-engine="https://엔진" data-bot="봇ID" async></script>` | 오른쪽 아래 버튼 → 대화창(좁은 화면은 전체 화면) |
| 웹사이트(직접 제어) | `ChatbotWidget.mount({ engine, bot, mode: "launcher" \| "inline", container })` → `{ open, close, destroy }` | 버튼 또는 지정한 요소 안 |
| 앱 웹뷰 | `https://위젯주소/chat.html?engine=…&bot=…`(선택: `&close=1`, `&session=…`) | 전체 화면 |

- 사이트에 붙이는 위젯은 **그 페이지 안(Shadow DOM)에** 그린다. iframe이 아니라서 엔진이 받는 출처가 붙인 사이트이고, 봇마다 허용 도메인으로 막을 수 있다. 스타일은 Shadow DOM으로 사이트 CSS와 섞이지 않는다.
- 웹뷰는 `chat.html`을 올린 주소(예: `https://chat.example.com`)를 그 봇의 허용 도메인에 넣는다. `file://`로 연 페이지는 출처가 `null`이라 쓸 수 없다(원격 주소로 열 것).

## 2. 엔진과 주고받는 것 (E-G)
- `GET /v1/bots/{bot}/web` → 제목·색·입력칸 안내 문구. 403이면 "이 사이트에서는 쓸 수 없는 챗봇", 404면 "챗봇을 찾을 수 없음".
- `POST /v1/bots/{bot}/sessions/{session}/open` → 웰컴 메시지(새 세션만).
- `POST …/messages` `{text, block_id?}` → 메시지 목록(텍스트·이미지·기본 카드·리스트 카드·캐러셀, 바로연결).
- 요청마다 15초 시간 제한, 실패한 내 메시지는 "다시 보내기".

## 3. 동작
- **세션:** 처음 열 때 무작위 세션 ID(24바이트, base64url 32자)를 만들어 그 기기(`localStorage`)에 엔진·봇별로 둔다. 대화 기록(최근 100개)도 그 기기에만 둔다 — 엔진은 기록을 돌려주지 않는다. 저장소를 못 쓰면(사생활 보호 모드) 그 화면 동안만 기억한다. 앱이 `session`을 주면 그것을 쓴다(앱이 추측할 수 없는 값을 만들 책임).
- **새 대화:** 머리글의 "새 대화" → 기록을 지우고 새 세션으로 웰컴부터.
- **입력:** 1~1000자, Enter 보내기·Shift+Enter 줄바꿈, 한글 조합 중 Enter는 보내지 않음. 보내는 동안 "입력 중" 표시.
- **바로연결·버튼:** 마지막 봇 메시지의 바로연결만 누를 수 있다. message → 그 문구를 보냄, block → 문구를 보이고 `block_id`로 블록 시작, web_link → 새 창(웹뷰는 앱에 `link` 이벤트), phone → `tel:`. http(s)가 아닌 링크·이미지는 그리지 않는다.
- **앱 연동(웹뷰):** `ready`, `message`(봇이 답함), `link`(링크를 누름 — 앱이 열지 정함), `close`(닫기)를 `window.ReactNativeWebView.postMessage`, `window.webkit.messageHandlers.chatbot.postMessage`, `window.ChatbotAndroid.postMessage` 중 있는 것으로 JSON 문자열로 보낸다. 웹 SDK는 `onEvent` 콜백으로 같은 이벤트를 준다.
- **모양:** 엔진의 색을 기본으로(옵션으로 덮어쓰기), 시스템 다크 모드, 휴대폰 안전 영역(노치) 여백, 한국어 문구.
- **접근성:** 대화 목록은 `role="log"` + `aria-live="polite"`, 모든 버튼에 이름, 열면 입력칸에 초점, Esc로 닫기(버튼 모드).

## 4. 만들기
- TypeScript strict, Preact(작은 번들), Vite. 결과물: `dist/chatbot.js`(IIFE, 전역 `ChatbotWidget`, gzip 30KB 이하 목표), `dist/chat.html`(+ 자산).
- 엔진 API 타입은 엔진 `docs/openapi.json`에서 생성(`npm run gen:api`), CI가 고정 엔진과 같은지 확인.
- 외부 CDN·폰트를 쓰지 않는다(붙이는 사이트의 CSP를 덜 건드림).

## 5. 완료 조건
- 단위 테스트(정상·오류·경계): 세션·저장소 실패, 메시지 렌더링(모든 리치 형식), 보내기·실패·다시 보내기, 바로연결·버튼, 403/404, 앱 이벤트, 한글 조합 Enter.
- Playwright E2E(실제 엔진, 해싱 모드): ① 허용된 사이트(다른 포트의 테스트 페이지)에 스크립트 한 줄로 붙여 웰컴 → 질문 → 답 → 바로연결 → 새로고침해도 기록 유지 → 새 대화, ② 허용되지 않은 사이트는 "쓸 수 없음", ③ `chat.html` 전체 화면에서 대화하고 닫기 이벤트가 앱 다리로 감.
- 실제 브라우저 QA(320/375/414/1280px, 가로 스크롤 없음).
