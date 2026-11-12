import { fireEvent, render, screen, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { isHttpUrl, quickReplies, RichMessage } from "./RichMessage";
import type { BotMessage } from "./types";

const base: BotMessage = { response: "r", type: "text", text: "요약", quick_replies: [] };

function show(message: BotMessage, onLink = vi.fn(() => false)) {
  const say = vi.fn();
  render(<RichMessage message={message} disabled={false} say={say} onLink={onLink} />);
  return { say, onLink };
}

describe("RichMessage", () => {
  it("a text keeps its line breaks", () => {
    show({ ...base, text: "첫 줄\n둘째 줄" });
    expect(screen.getByText("첫 줄\n둘째 줄", { normalizer: (s) => s })).toHaveClass("cb-bubble");
  });

  it("an image shows only an http(s) picture, else its alt text", () => {
    show({ ...base, type: "simple_image", simple_image: { image_url: "https://img.example/a.png", alt_text: "지도" } });
    expect(screen.getByRole("img", { name: "지도" })).toHaveAttribute("src", "https://img.example/a.png");
    show({ ...base, type: "simple_image", simple_image: { image_url: "javascript:alert(1)", alt_text: "막힌 그림" } });
    expect(screen.getByText("막힌 그림")).toBeInTheDocument();
  });

  it("a card has its picture, title, text and every kind of button", async () => {
    const { say, onLink } = show({
      ...base, type: "basic_card", basic_card: {
        title: "오늘 날씨", description: "맑음", thumbnail: { image_url: "https://img.example/sun.png", alt_text: "해", fixed_ratio: false },
        buttons: [
          { label: "자세히", action: "web_link", web_link_url: "https://weather.example/today" },
          { label: "전화", action: "phone", phone_number: "+82 2-123-4567" },
          { label: "내일은?", action: "message", message_text: "내일 날씨" },
          { label: "처음으로", action: "block", block_id: "welcome" },
          { label: "나쁜 링크", action: "web_link", web_link_url: "javascript:alert(1)" },
        ],
      },
    });
    expect(screen.getByRole("img", { name: "해" })).toBeInTheDocument();
    expect(screen.getByText("오늘 날씨")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "자세히" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "전화" })).toHaveAttribute("href", "tel:+8221234567");
    expect(screen.queryByText("나쁜 링크")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "해" })).toHaveAttribute("referrerpolicy", "no-referrer");
    await userEvent.click(screen.getByRole("button", { name: "내일은?" }));
    expect(say).toHaveBeenLastCalledWith("내일 날씨", undefined);
    await userEvent.click(screen.getByRole("button", { name: "처음으로" }));
    expect(say).toHaveBeenLastCalledWith("처음으로", "welcome");
    fireEvent.click(screen.getByRole("link", { name: "자세히" }));
    expect(onLink).toHaveBeenCalledWith("https://weather.example/today");
  });

  it("a phone button without digits and a message button with an empty text", async () => {
    const { say } = show({ ...base, type: "basic_card", basic_card: { title: "t", buttons: [
      { label: "전화 없음", action: "phone", phone_number: "--" },
      { label: "문의", action: "message", message_text: "" },
    ] } });
    expect(screen.queryByText("전화 없음")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "문의" }));
    expect(say).toHaveBeenCalledWith("문의", undefined);
  });

  it("a link an app opens does not also open in the browser", () => {
    show({ ...base, type: "basic_card", basic_card: { title: "t", buttons: [{ label: "열기", action: "web_link", web_link_url: "https://a.example" }] } },
         vi.fn(() => true));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link", { name: "열기" }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("a list card has its header, linked and plain items, and buttons", () => {
    show({
      ...base, type: "list_card", list_card: {
        header: { title: "공지" },
        items: [
          { title: "점검 안내", description: "새벽 2시", image_url: "https://img.example/i.png", link: { web: "https://n.example/1" } },
          { title: "링크 없는 항목" },
        ],
        buttons: [{ label: "더 보기", action: "message" }],
      },
    });
    expect(screen.getByText("공지")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "점검 안내" })).toHaveAttribute("href", "https://n.example/1");
    expect(screen.getByText("링크 없는 항목").tagName).toBe("SPAN");
    expect(screen.getByRole("button", { name: "더 보기" })).toBeInTheDocument();
  });

  it("a carousel is a group of cards", () => {
    show({ ...base, type: "carousel", carousel: { type: "basic_card", items: [{ title: "하나" }, { title: "둘" }] } });
    const group = screen.getByRole("group", { name: "카드 2장" });
    expect(within(group).getByText("하나")).toBeInTheDocument();
    expect(within(group).getByText("둘")).toBeInTheDocument();
  });

  it("a rich type without its body falls back to the text", () => {
    show({ ...base, type: "basic_card", text: "카드 요약" });
    expect(screen.getByText("카드 요약")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("quick replies come from quick_reply_items, else from plain labels", () => {
    expect(quickReplies({ ...base, quick_replies: ["예"] })).toEqual([{ label: "예", action: "message", message_text: "예", block_id: null }]);
    const items = [{ label: "처음", action: "block" as const, message_text: null, block_id: "welcome" }];
    expect(quickReplies({ ...base, quick_replies: ["처음"], quick_reply_items: items })).toEqual(items);
    expect(quickReplies(base)).toEqual([]);
  });
  it.each([["https://a.example", true], ["http://a.example/x", true], ["javascript:x", false], ["//a.example", false],
           ["https://a b", false], [null, false], ["", false]])("%j is an http(s) URL: %s", (url, ok) => {
    expect(isHttpUrl(url)).toBe(ok);
  });
});
