import type { BotMessage, Look, Turn } from "./types";

export const BOT_ID = /^[a-z][a-z0-9_]{0,63}$/;
export const MAX_TEXT = 1000; // the engine answers longer input with an "input too long" message
export const TIMEOUT_MS = 15_000;

/** Why a call failed, in the words the widget shows. */
export type Failure = "forbidden" | "not_found" | "unavailable" | "invalid" | "network" | "timeout";

export const FAILURE_TEXT: Record<Failure, string> = {
  forbidden: "이 사이트에서는 쓸 수 없는 챗봇이에요.",
  not_found: "챗봇을 찾을 수 없어요.",
  unavailable: "챗봇이 잠시 답할 수 없어요. 조금 뒤에 다시 보내 주세요.",
  invalid: "보낼 수 없는 메시지예요.",
  network: "인터넷 연결을 확인해 주세요.",
  timeout: "답이 늦어지고 있어요. 다시 보내 주세요.",
};

export class EngineError extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(FAILURE_TEXT[failure]);
    this.failure = failure;
  }
}

export interface Engine {
  look(): Promise<Look>;
  open(session: string): Promise<BotMessage[]>;
  send(session: string, text: string, blockId?: string): Promise<BotMessage[]>;
}

/** The engine's base URL without a trailing slash; Error unless http(s). */
export function engineBase(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`engine must be an http(s) URL, got ${JSON.stringify(url)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`engine must be an http(s) URL, got ${JSON.stringify(url)}`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function failureOf(status: number): Failure {
  if (status === 403) return "forbidden";
  if (status === 404 || status === 409) return "not_found"; // 409: the bot is waiting to be deleted
  if (status === 422 || status === 413) return "invalid";
  return "unavailable";
}

/** The chat endpoints of one bot (docs/widget-plan.md §2). Every call ends within `timeoutMs`. */
export function engineClient(engine: string, bot: string, fetchImpl: typeof fetch = fetch,
                             timeoutMs = TIMEOUT_MS): Engine {
  if (!BOT_ID.test(bot)) throw new Error(`bot must be a bot ID like "sample", got ${JSON.stringify(bot)}`);
  const base = `${engineBase(engine)}/v1/bots/${bot}`;

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, { ...init, signal: abort.signal, credentials: "omit" });
      } catch {
        throw new EngineError(abort.signal.aborted ? "timeout" : "network");
      }
      if (!response.ok) throw new EngineError(failureOf(response.status));
      try {
        return (await response.json()) as T; // the timeout covers a body that stalls, too
      } catch {
        throw new EngineError(abort.signal.aborted ? "timeout" : "unavailable");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const session = (id: string) => `/sessions/${encodeURIComponent(id)}`;
  return {
    look: () => call<Look>("/web", { method: "GET" }),
    open: async (id) => (await call<Turn>(`${session(id)}/open`, { method: "POST" })).messages,
    send: async (id, text, blockId) => {
      const body = JSON.stringify(blockId ? { text, block_id: blockId } : { text });
      const turn = await call<Turn>(`${session(id)}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      return turn.messages;
    },
  };
}
