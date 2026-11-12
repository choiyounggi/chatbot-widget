import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { BOT_ID, engineBase, engineClient, type Engine } from "./api";
import { postToApp, type WidgetEvent } from "./bridge";
import { Chat, DEFAULT_COLOR } from "./Chat";
import { isSessionId, Memory } from "./store";
import css from "./styles.css?inline";

export interface MountOptions {
  engine: string; // the engine's URL, e.g. https://chat-api.example.com
  bot: string;
  mode?: "launcher" | "inline" | "page"; // default: launcher
  container?: HTMLElement; // inline and page: where to draw (default: a new element at the end of <body>)
  title?: string; // default: the bot's web settings
  color?: string; // #RRGGBB; default: the bot's web settings
  session?: string; // an app's own unguessable session key (default: a random one kept on this device)
  showClose?: boolean; // page: show a close button that sends "close" to the app
  open?: boolean; // launcher: start open
  onEvent?: (event: WidgetEvent) => void;
  fetch?: typeof fetch; // tests
  storage?: () => Storage | null; // tests
}

export interface WidgetHandle {
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
}

const COLOR = /^#[0-9A-Fa-f]{6}$/;

function check(options: MountOptions): void {
  engineBase(options.engine); // throws for a non-http(s) URL
  if (!BOT_ID.test(options.bot)) throw new Error(`bot must be a bot ID like "sample", got ${JSON.stringify(options.bot)}`);
  if (options.color !== undefined && !COLOR.test(options.color)) throw new Error(`color must be #RRGGBB, got ${JSON.stringify(options.color)}`);
  if (options.session !== undefined && !isSessionId(options.session)) {
    throw new Error("session must be 1-63 characters of A-Z a-z 0-9 _ -");
  }
}

interface Controls {
  set?: (open: boolean | ((o: boolean) => boolean)) => void;
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.3-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8Z" /></svg>;
}

function Launcher({ engine, store, options, controls, emit, onLink }: {
  engine: Engine; store: Memory; options: MountOptions; controls: Controls; emit: (e: WidgetEvent) => void; onLink: (url: string) => boolean;
}) {
  const [open, setOpen] = useState(options.open === true);
  const [opened, setOpened] = useState(options.open === true); // keep the conversation once it was shown
  const [look, setLook] = useState({ color: options.color ?? DEFAULT_COLOR, title: options.title ?? "챗봇" });
  controls.set = setOpen;

  useEffect(() => { if (open) setOpened(true); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {opened && (
        <div className="cb-panel" hidden={!open} style={{ "--cb-accent": look.color }}>
          <Chat engine={engine} store={store} session={options.session} title={options.title} color={options.color}
                active={open} showClose onClose={() => setOpen(false)} onEvent={emit} onLink={onLink} onLook={setLook} />
        </div>
      )}
      <button type="button" className="cb-launcher" style={{ "--cb-accent": look.color }} aria-expanded={open}
              aria-label={open ? `${look.title} 닫기` : `${look.title} 열기`} onClick={() => setOpen((o) => !o)}>
        {open ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" /></svg> : <ChatIcon />}
      </button>
    </>
  );
}

/** Draw the chat on this page (docs/widget-plan.md §1). Throws for bad options. */
export function mount(options: MountOptions): WidgetHandle {
  check(options);
  const mode = options.mode ?? "launcher";
  const engine = engineClient(options.engine, options.bot, options.fetch ?? ((input, init) => window.fetch(input, init)));
  const store = new Memory(engineBase(options.engine), options.bot, options.storage);

  const host = mode === "launcher" || !options.container ? document.createElement("div") : options.container;
  if (host !== options.container) document.body.appendChild(host);
  host.setAttribute("data-chatbot-widget", options.bot);
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  root.className = "cb-fill";
  const style = document.createElement("style");
  style.textContent = css;
  shadow.replaceChildren(style, root);

  const emit = (event: WidgetEvent) => {
    postToApp(event);
    try {
      options.onEvent?.(event);
    } catch (error) {
      console.error("chatbot-widget: onEvent threw", error);
    }
  };
  const onLink = (url: string) => {
    emit({ type: "link", url });
    return hasApp(); // inside an app the app decides how to open a link; on a site the browser opens it
  };
  const controls: Controls = {};

  if (mode === "launcher") {
    render(<Launcher engine={engine} store={store} options={options} controls={controls} emit={emit} onLink={onLink} />, root);
  } else {
    render(
      <Chat engine={engine} store={store} session={options.session} title={options.title} color={options.color} active
            showClose={mode === "page" && options.showClose === true} onClose={() => emit({ type: "close" })}
            onEvent={emit} onLink={onLink} />,
      root,
    );
  }

  let destroyed = false;
  return {
    open: () => controls.set?.(true),
    close: () => controls.set?.(false),
    toggle: () => controls.set?.((o) => !o),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      render(null, root);
      shadow.replaceChildren();
      if (host !== options.container) host.remove();
    },
  };
}

function hasApp(): boolean {
  const w = window as unknown as Record<string, unknown> & { webkit?: { messageHandlers?: { chatbot?: unknown } } };
  return Boolean(w.ReactNativeWebView || w.ChatbotAndroid || w.webkit?.messageHandlers?.chatbot);
}
