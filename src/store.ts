import type { BotMessage } from "./types";

export const MAX_ENTRIES = 100;
const SESSION_ID = /^[A-Za-z0-9_-]{1,63}$/;

export type Entry =
  | { id: string; from: "user"; text: string; blockId?: string; failed?: boolean }
  | { id: string; from: "bot"; message: BotMessage };

export interface Saved {
  session: string;
  entries: Entry[];
}

/** 24 random bytes as base64url: 32 characters nobody can guess. */
export function newSessionId(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(24));
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function isSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** An entry written by this or another version, another tab or the page itself: kept only when it
 * can be shown. */
export function isEntry(value: unknown): value is Entry {
  if (!isObject(value) || typeof value.id !== "string") return false;
  if (value.from === "user") return typeof value.text === "string" && (value.blockId === undefined || typeof value.blockId === "string");
  if (value.from !== "bot" || !isObject(value.message)) return false;
  const m = value.message;
  return typeof m.text === "string" && Array.isArray(m.quick_replies) && m.quick_replies.every((q) => typeof q === "string")
    && (m.quick_reply_items === undefined || (Array.isArray(m.quick_reply_items) && m.quick_reply_items.every((q) => isObject(q) && typeof q.label === "string")));
}

/** One conversation per engine and bot on this device (localStorage), or in memory when the
 * browser refuses storage (private mode, blocked site data). Never throws. */
export class Memory {
  readonly key: string;
  private fallback: Saved | null = null;

  constructor(engine: string, bot: string, private readonly storage: () => Storage | null = () => window.localStorage) {
    this.key = `chatbot-widget:${engine}:${bot}`;
  }

  load(): Saved | null {
    try {
      const raw = this.storage()?.getItem(this.key);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if (typeof saved?.session === "string" && isSessionId(saved.session) && Array.isArray(saved.entries)) {
          return { session: saved.session, entries: saved.entries.filter(isEntry).slice(-MAX_ENTRIES) };
        }
      }
    } catch {
      // unreadable or blocked: fall through
    }
    return this.fallback;
  }

  save(saved: Saved): void {
    const kept = { session: saved.session, entries: saved.entries.slice(-MAX_ENTRIES) };
    this.fallback = kept;
    try {
      this.storage()?.setItem(this.key, JSON.stringify(kept));
    } catch {
      // full or blocked: the in-memory copy is enough for this page
    }
  }

  clear(): void {
    this.fallback = null;
    try {
      this.storage()?.removeItem(this.key);
    } catch {
      // blocked: nothing stored anyway
    }
  }
}
