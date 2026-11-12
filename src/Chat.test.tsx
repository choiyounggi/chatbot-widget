import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EngineError, type Engine } from "./api";
import { Chat, type ChatProps } from "./Chat";
import { Memory } from "./store";
import type { BotMessage } from "./types";

const LOOK = { bot: "sample", title: "날씨봇", color: "#10B981", placeholder: "날씨를 물어보세요" };
const text = (t: string, extra: Partial<BotMessage> = {}): BotMessage => ({ response: "r", type: "text", text: t, quick_replies: [], ...extra });
const WELCOME = text("안녕하세요! 무엇을 도와드릴까요?", {
  quick_replies: ["날씨", "처음으로"],
  quick_reply_items: [
    { label: "날씨", action: "message", message_text: "오늘 날씨", block_id: null },
    { label: "처음으로", action: "block", message_text: null, block_id: "welcome" },
  ],
});

function fakeEngine(over: Partial<Engine> = {}) {
  const fake = {
    look: vi.fn(async () => LOOK),
    open: vi.fn(async (_session: string) => [WELCOME]),
    send: vi.fn(async (_session: string, t: string, _block?: string) => [text(`답: ${t}`)]),
  };
  return Object.assign(fake, over) as typeof fake;
}

function show(engine: Engine, props: Partial<ChatProps> = {}) {
  const store = new Memory("https://e.example", "sample");
  const events: unknown[] = [];
  const onLink = vi.fn(() => false);
  render(<Chat engine={engine} store={store} active showClose={false} onEvent={(e) => events.push(e)} onLink={onLink} {...props} />);
  return { store, events, onLink };
}

describe("Chat", () => {
  it("opens a new conversation with the welcome block, the bot's look, and remembers it", async () => {
    const engine = fakeEngine();
    const { store, events } = show(engine);
    expect(await screen.findByText("안녕하세요! 무엇을 도와드릴까요?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "날씨봇" })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("날씨를 물어보세요")).toHaveFocus();
    expect(screen.getByRole("region", { name: "날씨봇 대화" })).toHaveStyle({ "--cb-accent": "#10B981" });
    const session = engine.open.mock.calls[0]?.[0] as string;
    expect(session).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(store.load()).toMatchObject({ session, entries: [{ from: "bot", message: WELCOME }] });
    expect(events).toEqual([{ type: "ready" }, { type: "message", messages: [WELCOME] }]);
  });

  it("shows a stored conversation as it was, without opening again", async () => {
    const store = new Memory("https://e.example", "sample");
    store.save({ session: "kept", entries: [{ id: "1", from: "user", text: "예전 질문" }, { id: "2", from: "bot", message: text("예전 답") }] });
    const engine = fakeEngine();
    show(engine, { store });
    expect(screen.getByText("예전 질문")).toBeInTheDocument();
    expect(screen.getByText("예전 답")).toBeInTheDocument();
    await screen.findByPlaceholderText("날씨를 물어보세요");
    expect(engine.open).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "새 질문{Enter}");
    expect(engine.send).toHaveBeenCalledWith("kept", "새 질문", undefined);
  });

  it("sends with Enter, keeps Shift+Enter and Korean composition in the input, and shows the answer", async () => {
    const engine = fakeEngine();
    const { events } = show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    const box = screen.getByRole("textbox", { name: "메시지" });
    await userEvent.type(box, "내일{Shift>}{Enter}{/Shift}비 와?");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(engine.send).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(engine.send).toHaveBeenCalledWith(expect.any(String), "내일\n비 와?", undefined);
    expect(await screen.findByText("답: 내일\n비 와?", { normalizer: (s) => s })).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(events.at(-1)).toEqual({ type: "message", messages: [text("답: 내일\n비 와?")] });
  });

  it("does not send blank text and cuts what is over 1000 characters", async () => {
    const engine = fakeEngine();
    show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    const send = screen.getByRole("button", { name: "보내기" });
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "   ");
    expect(send).toBeDisabled();
    fireEvent.submit(send.closest("form") as HTMLFormElement);
    expect(engine.send).not.toHaveBeenCalled();
    const long = "가".repeat(1000);
    fireEvent.input(screen.getByRole("textbox", { name: "메시지" }), { target: { value: long } });
    expect(screen.getByText("1000/1000")).toBeInTheDocument();
    fireEvent.submit(send.closest("form") as HTMLFormElement);
    await waitFor(() => expect(engine.send).toHaveBeenCalledWith(expect.any(String), long, undefined));
  });

  it("offers the last bot message's quick replies: a message says its text, a block starts the block", async () => {
    const engine = fakeEngine({ send: vi.fn(async () => [text("오늘은 맑아요.")]) });
    show(engine);
    const replies = await screen.findByRole("group", { name: "바로 답하기" });
    await userEvent.click(within(replies).getByRole("button", { name: "날씨" }));
    expect(engine.send).toHaveBeenLastCalledWith(expect.any(String), "오늘 날씨", undefined);
    expect(await screen.findByText("오늘 날씨")).toBeInTheDocument();
    await screen.findByText("오늘은 맑아요.");
    expect(screen.queryByRole("group", { name: "바로 답하기" })).not.toBeInTheDocument(); // the last message has none
  });

  it("a block quick reply shows its label and sends the block ID", async () => {
    const engine = fakeEngine();
    show(engine);
    await userEvent.click(await screen.findByRole("button", { name: "처음으로" }));
    expect(engine.send).toHaveBeenCalledWith(expect.any(String), "처음으로", "welcome");
  });

  it("marks a message that failed and sends it again on 다시 보내기", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new EngineError("network"))
      .mockResolvedValueOnce([text("이제 됐어요")]);
    const engine = fakeEngine({ send });
    const { store } = show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "안녕{Enter}");
    expect(await screen.findByText("보내지 못했어요.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "바로 답하기" })).not.toBeInTheDocument(); // the welcome's are past
    expect(store.load()?.entries.at(-1)).toMatchObject({ from: "user", text: "안녕", failed: true });
    await userEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
    expect(await screen.findByText("이제 됐어요")).toBeInTheDocument();
    expect(screen.queryByText("보내지 못했어요.")).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("안녕")).toHaveLength(1); // the same message, not a copy
  });

  it("says what went wrong when the welcome cannot be fetched, and tries again", async () => {
    const open = vi.fn().mockRejectedValueOnce(new EngineError("timeout")).mockResolvedValueOnce([WELCOME]);
    show(fakeEngine({ open }));
    expect(await screen.findByRole("alert")).toHaveTextContent("답이 늦어지고 있어요");
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(/무엇을 도와드릴까요/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([["forbidden", "이 사이트에서는 쓸 수 없는 챗봇이에요."], ["not_found", "챗봇을 찾을 수 없어요."]] as const)(
    "a %s bot shows only why, with no input", async (failure, message) => {
      show(fakeEngine({ look: vi.fn(async () => { throw new EngineError(failure); }), open: vi.fn(async () => { throw new EngineError(failure); }) }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "새 대화" })).not.toBeInTheDocument();
    });

  it("a site refused in the middle of a conversation stops the conversation", async () => {
    show(fakeEngine({ send: vi.fn(async () => { throw new EngineError("forbidden"); }) }));
    await screen.findByText(/무엇을 도와드릴까요/);
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "안녕{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("이 사이트에서는 쓸 수 없는 챗봇이에요.");
  });

  it("새 대화 forgets the conversation and opens a new session", async () => {
    const engine = fakeEngine();
    const { store } = show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "안녕{Enter}");
    await screen.findByText("답: 안녕");
    const first = store.load()?.session;
    await userEvent.click(screen.getByRole("button", { name: "새 대화" }));
    expect(screen.getByRole("textbox", { name: "메시지" })).toHaveFocus();
    await waitFor(() => expect(engine.open).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("답: 안녕")).not.toBeInTheDocument();
    expect(engine.open.mock.calls[1]?.[0]).not.toBe(first);
    expect(store.load()?.session).toBe(engine.open.mock.calls[1]?.[0]);
  });

  it("an app's session is used as given, and the app decides about new conversations", async () => {
    const engine = fakeEngine();
    const store = new Memory("https://e.example", "sample");
    store.save({ session: "someone-else", entries: [{ id: "1", from: "user", text: "남의 대화" }] });
    show(engine, { store, session: "app-user-7f3a" });
    await screen.findByText(/무엇을 도와드릴까요/);
    expect(engine.open).toHaveBeenCalledWith("app-user-7f3a");
    expect(screen.queryByText("남의 대화")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 대화" })).not.toBeInTheDocument();
  });

  it("options override the bot's title and color, and the close button calls back", async () => {
    const onClose = vi.fn();
    const onLook = vi.fn();
    show(fakeEngine(), { title: "고객센터", color: "#111111", showClose: true, onClose, onLook });
    expect(screen.getByRole("heading", { name: "고객센터" })).toBeInTheDocument();
    await waitFor(() => expect(onLook).toHaveBeenCalledWith({ color: "#111111", title: "고객센터" }));
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a bot without a welcome block starts with a hint", async () => {
    show(fakeEngine({ open: vi.fn(async () => []) }));
    expect(await screen.findByText("무엇이든 물어보세요.")).toBeInTheDocument();
  });

  it("before the bot's look arrives it shows a plain title and the default color", () => {
    show(fakeEngine({ look: () => new Promise(() => undefined), open: () => new Promise(() => undefined) }));
    expect(screen.getByRole("heading", { name: "챗봇" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("답을 쓰는 중");
  });

  it("Enter while a reply is on its way keeps what was typed, and sends it once the reply came", async () => {
    let finish: (m: BotMessage[]) => void = () => undefined;
    const engine = fakeEngine({ open: vi.fn(() => new Promise<BotMessage[]>((r) => { finish = r; })) });
    show(engine);
    const box = screen.getByRole("textbox", { name: "메시지" });
    await userEvent.type(box, "안녕{Enter}");
    expect(box).toHaveValue("안녕");
    expect(engine.send).not.toHaveBeenCalled();
    finish([WELCOME]);
    await screen.findByText(/무엇을 도와드릴까요/);
    await userEvent.type(box, "{Enter}");
    expect(engine.send).toHaveBeenCalledWith(expect.any(String), "안녕", undefined);
    expect(box).toHaveValue("");
  });

  it("a reply that arrives after the chat was closed for good changes nothing", async () => {
    let finish: (m: BotMessage[]) => void = () => undefined;
    const engine = fakeEngine({ open: vi.fn(() => new Promise<BotMessage[]>((r) => { finish = r; })) });
    const { store, events } = show(engine);
    cleanup();
    finish([WELCOME]);
    await new Promise((r) => setTimeout(r, 10));
    expect(store.load()?.entries ?? []).toEqual([]);
    expect(events).toEqual([{ type: "ready" }]);
  });

  it("shows what another tab saved (a message, or 새 대화 there)", async () => {
    const engine = fakeEngine();
    const { store } = show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    const other = { session: "from-other-tab", entries: [{ id: "x", from: "user" as const, text: "다른 탭에서 보낸 말" }] };
    localStorage.setItem(store.key, JSON.stringify(other));
    fireEvent(window, new StorageEvent("storage", { key: store.key }));
    expect(await screen.findByText("다른 탭에서 보낸 말")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "메시지" }), "이어서{Enter}");
    expect(engine.send).toHaveBeenLastCalledWith("from-other-tab", "이어서", undefined);
    fireEvent(window, new StorageEvent("storage", { key: "someone-else" }));
    expect(screen.getByText("다른 탭에서 보낸 말")).toBeInTheDocument();
  });

  it("a quick reply with an empty message text says its label", async () => {
    const engine = fakeEngine({ open: vi.fn(async () => [text("골라 주세요", {
      quick_replies: ["예"], quick_reply_items: [{ label: "예", action: "message", message_text: "", block_id: null }],
    })]) });
    show(engine);
    await userEvent.click(await screen.findByRole("button", { name: "예" }));
    expect(engine.send).toHaveBeenCalledWith(expect.any(String), "예", undefined);
  });

  it("cuts long text at whole characters", async () => {
    const engine = fakeEngine();
    show(engine);
    await screen.findByText(/무엇을 도와드릴까요/);
    fireEvent.input(screen.getByRole("textbox", { name: "메시지" }), { target: { value: `${"가".repeat(999)}😀😀` } });
    fireEvent.submit(screen.getByRole("button", { name: "보내기" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(engine.send).toHaveBeenCalledWith(expect.any(String), `${"가".repeat(999)}😀`, undefined));
  });
});
