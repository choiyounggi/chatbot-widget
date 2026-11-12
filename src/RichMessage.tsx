import type { JSX } from "preact";
import type { BotMessage, CardButton, QuickReply } from "./types";

type Card = NonNullable<BotMessage["basic_card"]>;
type ListCard = NonNullable<BotMessage["list_card"]>;

/** Say something (a quick reply or a button was pressed), optionally starting a block directly. */
export type Say = (text: string, blockId?: string) => void;
/** A link was pressed: true when the app around the widget opens it (the browser should not). */
export type OnLink = (url: string) => boolean;

export const isHttpUrl = (url: string | null | undefined): url is string => !!url && /^https?:\/\/\S+$/i.test(url);

export function quickReplies(message: BotMessage): QuickReply[] {
  if (message.quick_reply_items && message.quick_reply_items.length > 0) return message.quick_reply_items;
  return message.quick_replies.map((label) => ({ label, action: "message" as const, message_text: label, block_id: null }));
}

function Link({ url, className, onLink, children }: { url: string; className: string; onLink: OnLink; children: JSX.Element | string }) {
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer"
       onClick={(e) => { if (onLink(url)) e.preventDefault(); }}>
      {children}
    </a>
  );
}

function ButtonView({ button, disabled, say, onLink }: { button: CardButton; disabled: boolean; say: Say; onLink: OnLink }) {
  if (button.action === "web_link") {
    return isHttpUrl(button.web_link_url)
      ? <Link className="cb-chip" url={button.web_link_url} onLink={onLink}>{button.label}</Link>
      : null;
  }
  if (button.action === "phone") {
    return button.phone_number ? <a className="cb-chip" href={`tel:${button.phone_number.replace(/[^+0-9]/g, "")}`}>{button.label}</a> : null;
  }
  const blockId = button.action === "block" ? (button.block_id ?? undefined) : undefined;
  return (
    <button type="button" className="cb-chip" disabled={disabled} onClick={() => say(button.message_text ?? button.label, blockId)}>
      {button.label}
    </button>
  );
}

function Buttons({ buttons, disabled, say, onLink }: { buttons?: CardButton[]; disabled: boolean; say: Say; onLink: OnLink }) {
  if (!buttons || buttons.length === 0) return null;
  return <div className="cb-buttons">{buttons.map((b, i) => <ButtonView key={i} button={b} disabled={disabled} say={say} onLink={onLink} />)}</div>;
}

function CardView({ card, disabled, say, onLink }: { card: Card; disabled: boolean; say: Say; onLink: OnLink }) {
  return (
    <div className="cb-card">
      {card.thumbnail && isHttpUrl(card.thumbnail.image_url) && (
        <img className="cb-card__image" src={card.thumbnail.image_url} alt={card.thumbnail.alt_text ?? ""} loading="lazy" />
      )}
      <div className="cb-card__body">
        {card.title && <p className="cb-card__title">{card.title}</p>}
        {card.description && <p className="cb-card__desc">{card.description}</p>}
      </div>
      <Buttons buttons={card.buttons} disabled={disabled} say={say} onLink={onLink} />
    </div>
  );
}

function ListView({ card, disabled, say, onLink }: { card: ListCard; disabled: boolean; say: Say; onLink: OnLink }) {
  return (
    <div className="cb-card">
      <p className="cb-list__header">{card.header.title}</p>
      <ul className="cb-list">
        {card.items.map((item, i) => (
          <li key={i} className="cb-list__item">
            <div className="cb-list__text">
              {isHttpUrl(item.link?.web)
                ? <Link className="cb-list__title" url={item.link.web} onLink={onLink}>{item.title}</Link>
                : <span className="cb-list__title">{item.title}</span>}
              {item.description && <span className="cb-list__desc">{item.description}</span>}
            </div>
            {isHttpUrl(item.image_url) && <img className="cb-list__image" src={item.image_url} alt="" loading="lazy" />}
          </li>
        ))}
      </ul>
      <Buttons buttons={card.buttons} disabled={disabled} say={say} onLink={onLink} />
    </div>
  );
}

/** One bot message: a text bubble, or its rich body (image, card, list, carousel). */
export function RichMessage({ message, disabled, say, onLink }: { message: BotMessage; disabled: boolean; say: Say; onLink: OnLink }) {
  const type = message.type ?? "text";
  if (type === "simple_image" && message.simple_image) {
    return isHttpUrl(message.simple_image.image_url)
      ? <img className="cb-image" src={message.simple_image.image_url} alt={message.simple_image.alt_text} loading="lazy" />
      : <p className="cb-bubble">{message.simple_image.alt_text}</p>;
  }
  if (type === "basic_card" && message.basic_card) return <CardView card={message.basic_card} disabled={disabled} say={say} onLink={onLink} />;
  if (type === "list_card" && message.list_card) return <ListView card={message.list_card} disabled={disabled} say={say} onLink={onLink} />;
  if (type === "carousel" && message.carousel) {
    return (
      <div className="cb-carousel" role="group" aria-label={`카드 ${message.carousel.items.length}장`}>
        {message.carousel.items.map((card, i) => <CardView key={i} card={card} disabled={disabled} say={say} onLink={onLink} />)}
      </div>
    );
  }
  return <p className="cb-bubble">{message.text}</p>;
}
