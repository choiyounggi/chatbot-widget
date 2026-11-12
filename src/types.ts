import type { components } from "./schema";

export type BotMessage = components["schemas"]["MessageOut"];
export type Look = components["schemas"]["WebPublicOut"];
export type Turn = components["schemas"]["TurnOut"];
export type CardButton = NonNullable<components["schemas"]["BasicCard"]["buttons"]>[number];
export type QuickReply = components["schemas"]["QuickReplyOut"];
