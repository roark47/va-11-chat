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
  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }

    if (Notification.permission !== "granted") return false;
    await registerNotificationWorker();
    return true;
  } catch {
    return false;
  }
}

async function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;

  try {
    return await navigator.serviceWorker.register("/service-worker.js");
  } catch {
    // Desktop browsers can still use the Notification constructor as a fallback.
    return null;
  }
}

export async function notifyIncomingMessage(
  message: ChatMessage,
  currentUserId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  if (!("Notification" in window)) return;
  if (message.userId === currentUserId) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: message.text,
    data: { url: window.location.href },
    icon: "/logo.png",
    tag: `chat-message-${message.userId}-${message.time}`,
  };

  const registration = await registerNotificationWorker();
  if (registration) {
    try {
      await registration.showNotification(message.nickname, options);
      return;
    } catch {
      // Fall through for browsers that expose service workers but reject notifications.
    }
  }

  try {
    const notification = new Notification(message.nickname, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Unsupported notification implementations should not interrupt incoming messages.
  }
}
