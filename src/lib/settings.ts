import { DEFAULT_RULES, type Rules } from "./alerts";
import { object } from "./api";
export const STORAGE_KEY = "squeek-alert-lab:settings:v1";
export interface Settings {
  token: string;
  chatId: string;
  rules: Rules;
}
export const initialSettings = (): Settings => ({
  token: "",
  chatId: "",
  rules: { ...DEFAULT_RULES },
});
export function readSettings(): { settings: Settings; error: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { settings: initialSettings(), error: "" };
    const value = object(JSON.parse(stored)),
      rules = object(value.rules);
    return {
      settings: {
        token: typeof value.token === "string" ? value.token : "",
        chatId: typeof value.chatId === "string" ? value.chatId : "",
        rules: {
          wake: typeof rules.wake === "boolean" ? rules.wake : true,
          sleep: typeof rules.sleep === "boolean" ? rules.sleep : true,
          round: typeof rules.round === "boolean" ? rules.round : true,
          threshold:
            typeof rules.threshold === "boolean" ? rules.threshold : true,
          rpmTarget:
            typeof rules.rpmTarget === "number" &&
            Number.isFinite(rules.rpmTarget) &&
            rules.rpmTarget > 0
              ? rules.rpmTarget
              : 500,
        },
      },
      error: "",
    };
  } catch {
    return {
      settings: initialSettings(),
      error:
        "Browser storage is unavailable or unreadable. Settings will stay in memory for this visit.",
    };
  }
}
export const validToken = (value: string) =>
  /^\d+:[A-Za-z0-9_-]{20,}$/.test(value.trim());
export function credentialsError(
  settings: Settings,
): { field: "token" | "chatId"; message: string } | null {
  if (!validToken(settings.token))
    return {
      field: "token",
      message: "Paste the full bot token from @BotFather, including the colon.",
    };
  if (
    !/^-?[1-9]\d*$/.test(settings.chatId.trim()) &&
    !/^@[A-Za-z][A-Za-z0-9_]{4,}$/.test(settings.chatId.trim())
  )
    return {
      field: "chatId",
      message:
        "Enter your numeric chat ID (including − for groups) or a public @channel name.",
    };
  return null;
}
export const validTarget = (value: string) =>
  value.trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0 &&
  Number(value) <= 1_000_000;
