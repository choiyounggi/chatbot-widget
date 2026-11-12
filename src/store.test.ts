import { describe, expect, it } from "vitest";
import { isSessionId, MAX_ENTRIES, Memory, newSessionId, type Entry } from "./store";

const bot = (n: number): Entry => ({ id: `b${n}`, from: "bot", message: { response: "r", type: "text", text: `${n}`, quick_replies: [] } });

describe("session IDs", () => {
  it("are 32 URL-safe characters from 24 random bytes", () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newSessionId()).not.toBe(id);
    expect(newSessionId((b) => b.fill(255))).toBe("_".repeat(32));
  });
  it.each([["abc", true], ["a".repeat(63), true], ["a".repeat(64), false], ["", false], ["a b", false], ["가", false]])(
    "%j is a session ID: %s", (value, ok) => expect(isSessionId(value)).toBe(ok));
});

describe("Memory", () => {
  it("keeps one conversation per engine and bot, at most MAX_ENTRIES", () => {
    const a = new Memory("https://e.example", "sample");
    const other = new Memory("https://e.example", "other");
    a.save({ session: "s1", entries: Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => bot(i)) });
    const loaded = a.load();
    expect(loaded?.session).toBe("s1");
    expect(loaded?.entries).toHaveLength(MAX_ENTRIES);
    expect(loaded?.entries[0]).toEqual(bot(5));
    expect(JSON.parse(localStorage.getItem(a.key) ?? "{}").entries).toHaveLength(MAX_ENTRIES); // what is written
    expect(other.load()).toBeNull();
    a.clear();
    expect(a.load()).toBeNull();
  });

  it("ignores a stored value it cannot use", () => {
    const m = new Memory("https://e.example", "sample");
    for (const raw of ["{", "null", JSON.stringify({ session: "bad id", entries: [] }), JSON.stringify({ session: "s", entries: {} })]) {
      localStorage.setItem(m.key, raw);
      expect(m.load()).toBeNull();
    }
  });

  it("drops stored entries this version cannot show, keeps the rest", () => {
    const m = new Memory("https://e.example", "sample");
    const good = [bot(1), { id: "u", from: "user", text: "질문", blockId: "weather" }];
    const bad = [{ from: "bot" }, { id: "b", from: "bot", message: { text: 3, quick_replies: [] } }, null, "x",
                 { id: "c", from: "bot", message: { text: "t", quick_replies: [1] } },
                 { id: "d", from: "bot", message: { text: "t", quick_replies: [], quick_reply_items: [{}] } },
                 { id: "e", from: "user", text: "t", blockId: 5 }, { id: "f", from: "system", text: "t" }];
    localStorage.setItem(m.key, JSON.stringify({ session: "abc", entries: [bad[0], good[0], ...bad.slice(1), good[1]] }));
    expect(m.load()).toEqual({ session: "abc", entries: good });
  });

  it("works in memory when the browser refuses storage", () => {
    const refusing = () => { throw new DOMException("denied", "SecurityError"); };
    const m = new Memory("https://e.example", "sample", refusing);
    expect(m.load()).toBeNull();
    m.save({ session: "s1", entries: [bot(1)] });
    expect(m.load()).toEqual({ session: "s1", entries: [bot(1)] });
    m.clear();
    expect(m.load()).toBeNull();
    const none = new Memory("https://e.example", "sample", () => null);
    none.save({ session: "s2", entries: [] });
    expect(none.load()?.session).toBe("s2");
  });
});
