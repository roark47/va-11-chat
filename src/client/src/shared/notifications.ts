import type { ChatMessage } from "../types";

const notificationPreferenceKey = "va11-chat-notifications-enabled";

export function initialNotificationsEnabled(): boolean {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  try {
    return window.localStorage.getItem(notificationPreferenceKey) === "1";
  } catch {
    return false;
  }
}

export function saveNotificationPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(notificationPreferenceKey, enabled ? "1" : "0");
  } catch {
    // Private browsing or storage restrictions should not break the switch.
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  return Notification.permission === "granted";
}

export function notifyIncomingMessage(
  message: ChatMessage,
  currentUserId: string,
  enabled: boolean,
): void {
  if (!enabled) return;
  if (!("Notification" in window)) return;
  if (message.userId === currentUserId) return;
  if (Notification.permission !== "granted") return;

  new Notification(message.nickname, {
    body: message.text,
    tag: "chat-message",
  });
}
