import { describe, expect, it, vi } from "vitest";
import { EngineError, engineBase, engineClient, FAILURE_TEXT } from "./api";

function reply(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

describe("engineBase", () => {
  it("keeps origin and path without a trailing slash", () => {
    expect(engineBase("https://api.example.com/")).toBe("https://api.example.com");
    expect(engineBase("http://127.0.0.1:8765/chat//")).toBe("http://127.0.0.1:8765/chat");
  });
  it.each(["ftp://x", "not a url", "", "javascript:alert(1)"])("refuses %j", (url) => {
    expect(() => engineBase(url)).toThrow(/http\(s\)/);
  });
});

describe("engineClient", () => {
  it("refuses a bot ID the engine would refuse", () => {
    expect(() => engineClient("https://e.example", "Bad-Bot")).toThrow(/bot ID/);
  });

  it("calls the three chat endpoints of the bot without cookies", async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/web") ? { bot: "sample", title: "샘플", color: "#2563EB", placeholder: "입력" }
        : { bot: "sample", session: "s", messages: [{ response: "r", text: "안녕", quick_replies: [] }] })));
    const engine = engineClient("https://e.example/", "sample", fetchImpl as unknown as typeof fetch);
    expect((await engine.look()).title).toBe("샘플");
    expect(await engine.open("s 1")).toHaveLength(1);
    await engine.send("s1", "날씨", "weather");
    await engine.send("s1", "안녕");
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([u, i]) => [u, i.method])).toEqual([
      ["https://e.example/v1/bots/sample/web", "GET"],
      ["https://e.example/v1/bots/sample/sessions/s%201/open", "POST"],
      ["https://e.example/v1/bots/sample/sessions/s1/messages", "POST"],
      ["https://e.example/v1/bots/sample/sessions/s1/messages", "POST"],
    ]);
    expect(calls[2]?.[1].body).toBe(JSON.stringify({ text: "날씨", block_id: "weather" }));
    expect(calls[3]?.[1].body).toBe(JSON.stringify({ text: "안녕" }));
    expect(calls.every(([, i]) => i.credentials === "omit")).toBe(true);
  });

  it.each([
    [403, "forbidden"], [404, "not_found"], [409, "not_found"], [422, "invalid"], [413, "invalid"],
    [500, "unavailable"], [503, "unavailable"], [429, "unavailable"],
  ])("maps HTTP %i to %s", async (status, failure) => {
    const engine = engineClient("https://e.example", "sample", reply(status) as unknown as typeof fetch);
    await expect(engine.look()).rejects.toMatchObject({ failure });
  });

  it("maps a network error, a timeout and a body that is not JSON", async () => {
    const down = engineClient("https://e.example", "sample", vi.fn(async () => { throw new TypeError("failed"); }) as unknown as typeof fetch);
    await expect(down.open("s")).rejects.toMatchObject({ failure: "network", message: FAILURE_TEXT.network });
    const slow = engineClient("https://e.example", "sample", ((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch, 20);
    await expect(slow.send("s", "안녕")).rejects.toMatchObject({ failure: "timeout" });
    const garbled = engineClient("https://e.example", "sample", reply(200, "<html>") as unknown as typeof fetch);
    await expect(garbled.look()).rejects.toBeInstanceOf(EngineError);
  });
});
