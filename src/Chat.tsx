import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { EngineError, FAILURE_TEXT, MAX_TEXT, type Engine, type Failure } from "./api";
import type { WidgetEvent } from "./bridge";
import { quickReplies, RichMessage, type OnLink } from "./RichMessage";
import { newSessionId, type Entry, type Memory, type Saved } from "./store";
import type { BotMessage, Look } from "./types";

export const DEFAULT_COLOR = "#2563EB";

export interface ChatProps {
  engine: Engine;
  store: Memory;
  session?: string; // given by the app: used as is, and "새 대화" is not offered
  title?: string; // overrides the engine's
  color?: string;
  active: boolean; // shown: focus the input
  showClose: boolean;
  onClose?: () => void;
  onEvent: (event: WidgetEvent) => void;
  onLink: OnLink;
  onLook?: (look: { color: string; title: string }) => void;
}

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter += 1)}`;
const failureOf = (error: unknown): Failure => (error instanceof EngineError ? error.failure : "unavailable");

function start(store: Memory, session?: string): Saved {
  const saved = store.load();
  if (session) return saved?.session === session ? saved : { session, entries: [] };
  return saved ?? { session: newSessionId(), entries: [] };
}

/** The conversation: header, messages, quick replies and the input (docs/widget-plan.md §3). */
export function Chat(props: ChatProps) {
  const { engine, store, onEvent } = props;
  const [chat, setChat] = useState<Saved>(() => start(store, props.session));
  const [look, setLook] = useState<Look | null>(null);
  const [blocked, setBlocked] = useState<Failure | null>(null); // forbidden / not_found: nothing works
  const [busy, setBusy] = useState(false);
  const [openFailed, setOpenFailed] = useState<Failure | null>(null);
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const live = useRef(chat); // the latest conversation, for callbacks that outlive a render
  live.current = chat;
  const alive = useRef(true); // false after unmount: a late reply changes nothing
  const busyNow = useRef(false);
  busyNow.current = busy;

  const update = (change: (saved: Saved) => Saved) => {
    if (!alive.current) return;
    const next = change(live.current);
    live.current = next;
    store.save(next);
    setChat(next);
  };
  const fail = (failure: Failure) => {
    if (failure === "forbidden" || failure === "not_found") setBlocked(failure);
    return failure;
  };
  const received = (messages: BotMessage[]) => {
    if (messages.length === 0 || !alive.current) return;
    update((s) => ({ ...s, entries: [...s.entries, ...messages.map((m): Entry => ({ id: nextId(), from: "bot", message: m }))] }));
    onEvent({ type: "message", messages });
  };

  const open = async (session: string) => {
    setBusy(true);
    setOpenFailed(null);
    try {
      received(await engine.open(session));
    } catch (error) {
      setOpenFailed(fail(failureOf(error)));
    } finally {
      setBusy(false);
    }
  };

  // right after the first render, so an unmount that comes before the effects ran still counts
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!alive.current) return undefined; // removed before its effects ran
    let stopped = false;
    engine.look().then((l) => {
      if (stopped) return;
      setLook(l);
      props.onLook?.({ color: props.color ?? l.color, title: props.title ?? l.title });
    }).catch((error: unknown) => { if (!stopped) fail(failureOf(error)); });
    if (live.current.entries.length === 0) void open(live.current.session);
    onEvent({ type: "ready" });
    // another tab of this site changed the conversation (a message, 새 대화): show what it saved
    const onStorage = (e: StorageEvent) => {
      if (e.key !== store.key || busyNow.current) return;
      const saved = store.load();
      if (saved && (!props.session || saved.session === props.session)) {
        live.current = saved;
        setChat(saved);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      stopped = true;
      alive.current = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []); // once per mount

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.entries.length, busy, props.active]); // a hidden panel loses its scroll position

  useEffect(() => {
    if (props.active) input.current?.focus();
  }, [props.active]);

  const deliver = async (entry: Extract<Entry, { from: "user" }>) => {
    setBusy(true);
    try {
      const messages = await engine.send(live.current.session, entry.text, entry.blockId);
      received(messages);
    } catch (error) {
      fail(failureOf(error));
      update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entry.id ? { ...entry, failed: true } : e)) }));
    } finally {
      setBusy(false);
    }
  };

  /** False when nothing was sent (blank, busy, blocked): the input keeps what was typed. */
  const say = (text: string, blockId?: string): boolean => {
    const clean = Array.from(text.trim()).slice(0, MAX_TEXT).join(""); // whole characters, never half a pair
    if (!clean || busy || blocked) return false;
    const entry: Extract<Entry, { from: "user" }> = { id: nextId(), from: "user", text: clean, ...(blockId ? { blockId } : {}) };
    update((s) => ({ ...s, entries: [...s.entries, entry] }));
    void deliver(entry);
    return true;
  };

  const retry = (entry: Extract<Entry, { from: "user" }>) => {
    if (busy) return;
    const again = { id: entry.id, from: "user" as const, text: entry.text, ...(entry.blockId ? { blockId: entry.blockId } : {}) };
    update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entry.id ? again : e)) }));
    void deliver(again);
  };

  const newChat = () => {
    if (busy) return;
    store.clear();
    const fresh = { session: newSessionId(), entries: [] };
    update(() => fresh);
    input.current?.focus(); // the button is disabled while the new session opens
    void open(fresh.session);
  };

  const submit = () => {
    if (say(draft)) setDraft("");
  };

  const title = props.title ?? look?.title ?? "챗봇";
  const color = props.color ?? look?.color ?? DEFAULT_COLOR;
  const last = chat.entries.at(-1);
  const replies = last?.from === "bot" && !blocked ? quickReplies(last.message) : [];

  return (
    <section className="cb-chat" style={{ "--cb-accent": color }} aria-label={`${title} 대화`}>
      <header className="cb-header">
        <h2 className="cb-title">{title}</h2>
        {!props.session && !blocked && (
          <button type="button" className="cb-header__btn" onClick={newChat} disabled={busy}>새 대화</button>
        )}
        {props.showClose && (
          <button type="button" className="cb-header__btn cb-close" aria-label="닫기" onClick={props.onClose}>✕</button>
        )}
      </header>

      {blocked ? (
        <p className="cb-blocked" role="alert">{FAILURE_TEXT[blocked]}</p>
      ) : (
        <>
          <div className="cb-log" ref={log} role="log" aria-live="polite" aria-label="대화 내용">
            {chat.entries.length === 0 && !busy && !openFailed && <p className="cb-empty">무엇이든 물어보세요.</p>}
            {chat.entries.map((entry) => entry.from === "bot" ? (
              <div key={entry.id} className="cb-row cb-row--bot">
                <RichMessage message={entry.message} disabled={busy} say={say} onLink={props.onLink} />
              </div>
            ) : (
              <div key={entry.id} className="cb-row cb-row--user">
                <p className="cb-bubble cb-bubble--user">{entry.text}</p>
                {entry.failed && (
                  <p className="cb-failed">
                    보내지 못했어요.{" "}
                    <button type="button" className="cb-link" onClick={() => retry(entry)} disabled={busy}>다시 보내기</button>
                  </p>
                )}
              </div>
            ))}
            {busy && <div className="cb-row cb-row--bot"><span className="cb-typing" role="status"><span className="cb-sr">답을 쓰는 중</span><i /><i /><i /></span></div>}
          </div>
          {openFailed && !busy && (
            <p className="cb-failed cb-failed--open" role="alert">
              {FAILURE_TEXT[openFailed]}{" "}
              <button type="button" className="cb-link" onClick={() => void open(chat.session)}>다시 시도</button>
            </p>
          )}
          {replies.length > 0 && (
            <div className="cb-replies" role="group" aria-label="바로 답하기">
              {replies.map((q, i) => (
                <button key={i} type="button" className="cb-chip" disabled={busy}
                        onClick={() => say(q.message_text || q.label, q.action === "block" ? (q.block_id ?? undefined) : undefined)}>
                  {q.label}
                </button>
              ))}
            </div>
          )}
          <form className="cb-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <textarea ref={input} className="cb-input" rows={1} maxLength={MAX_TEXT} value={draft}
                      placeholder={look?.placeholder ?? "메시지를 입력하세요"} aria-label="메시지"
                      onInput={(e) => setDraft(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
                          e.preventDefault();
                          submit();
                        }
                      }} />
            <button type="submit" className="cb-send" disabled={busy || !draft.trim()} aria-label="보내기">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5l2.6 7.1L14 12l-8.4 1.4z" /></svg>
            </button>
          </form>
          {draft.length > MAX_TEXT - 100 && <p className="cb-count">{draft.length}/{MAX_TEXT}</p>}
        </>
      )}
    </section>
  );
}
