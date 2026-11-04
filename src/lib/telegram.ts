import { object } from "./api";
export class DeliveryError extends Error {
  constructor(
    message: string,
    public retryAt = 0,
  ) {
    super(message);
  }
}
export async function sendTelegram(
  token: string,
  chatId: string,
  message: string,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${token.trim()}/sendMessage`,
      {
        method: "POST",
        body: new URLSearchParams({
          chat_id: chatId.trim(),
          text: message,
          disable_web_page_preview: "true",
        }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
          : AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new DeliveryError(
      "Delivery unconfirmed. Check your connection. Retrying may send a duplicate.",
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = object(await response.json());
  } catch {
    throw new DeliveryError(
      "Telegram returned an unreadable response. Delivery is unconfirmed; retry may duplicate it.",
    );
  }
  if (response.ok && payload.ok === true) return;
  const code =
    typeof payload.error_code === "number"
      ? payload.error_code
      : response.status;
  if (code === 401 || code === 404)
    throw new DeliveryError(
      "Telegram rejected this token. Stop watching and copy a fresh token from @BotFather.",
    );
  if (code === 400)
    throw new DeliveryError(
      "Telegram could not find this chat. Check the chat ID and send /start to your bot first.",
    );
  if (code === 403)
    throw new DeliveryError(
      "The bot cannot message this chat. Unblock it or give it permission to post.",
    );
  if (code === 429) {
    const seconds = Number(object(payload.parameters).retry_after);
    const delay =
      Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) : 30;
    throw new DeliveryError(
      `Telegram is rate limiting messages. Retry after ${delay} seconds.`,
      Date.now() + delay * 1000,
    );
  }
  throw new DeliveryError(
    "Telegram could not confirm delivery. Check your connection and try again; a duplicate is possible.",
  );
}
export interface TelegramChat {
  id: string;
  label: string;
}
export async function findTelegramChats(
  token: string,
): Promise<TelegramChat[]> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${token.trim()}/getUpdates`,
      {
        method: "POST",
        body: new URLSearchParams({ timeout: "0", limit: "100" }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new Error(
      "Could not reach Telegram. Check your connection and try again, or enter the chat ID manually.",
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = object(await response.json());
  } catch {
    throw new Error(
      "Could not read Telegram’s response. Enter the chat ID manually.",
    );
  }
  if (!response.ok || payload.ok !== true) {
    if (response.status === 409 || payload.error_code === 409)
      throw new Error(
        "This bot uses a webhook or another updates reader. Enter the chat ID manually.",
      );
    throw new Error(
      "Could not read chats. Check the bot token, or enter the chat ID manually.",
    );
  }
  const chats = new Map<string, TelegramChat>();
  for (const raw of Array.isArray(payload.result) ? payload.result : []) {
    const update = object(raw);
    const entry = object(
      update.message ?? update.channel_post ?? update.my_chat_member,
    );
    const chat = object(entry.chat);
    if (
      typeof chat.id !== "number" ||
      !Number.isSafeInteger(chat.id) ||
      chat.id === 0
    )
      continue;
    const id = String(chat.id);
    const name =
      typeof chat.title === "string"
        ? chat.title
        : typeof chat.first_name === "string"
          ? chat.first_name
          : "Telegram chat";
    chats.set(id, { id, label: name });
  }
  return [...chats.values()];
}
