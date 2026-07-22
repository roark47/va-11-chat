import { useEffect, useMemo, useRef, useState } from "react";
import { getJson } from "../../api";
import type { ChatMessage, ChatSession } from "../../types";
import {
  initialNotificationsEnabled,
  notifyIncomingMessage,
  requestNotificationPermission,
  saveNotificationPreference,
} from "../../shared/notifications";
import { InstallAppButton } from "../../shared/pwa";
import { LoginPage } from "../login/LoginPage";
import "./chat-page.css";

type ChatPageProps = {
  channelId: string;
};

type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

const reconnectDelays = [0, 1_000, 2_000, 5_000, 10_000, 30_000];

function messageKey(message: ChatMessage): string {
  return message.id ?? `${message.time}:${message.userId}:${message.text}`;
}

export function ChatPage({ channelId }: ChatPageProps) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    initialNotificationsEnabled(),
  );
  const socketRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const notificationsEnabledRef = useRef(notificationsEnabled);

  useEffect(() => {
    setNeedsLogin(false);
    setSession(null);
    setMessages([]);
    getJson<ChatSession>(`/api/chat/${encodeURIComponent(channelId)}`)
      .then(setSession)
      .catch(() => setNeedsLogin(true));
  }, [channelId]);

  useEffect(() => {
    if (!session) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let disposed = false;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let hiddenAt: number | null = null;

    function scheduleReconnect() {
      if (disposed) return;
      window.clearTimeout(reconnectTimer);

      if (!navigator.onLine) {
        setConnectionState("offline");
        return;
      }

      setConnectionState("reconnecting");
      const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)]!;
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function connect() {
      if (disposed || !navigator.onLine) {
        if (!navigator.onLine) setConnectionState("offline");
        return;
      }

      const current = socketRef.current;
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      setConnectionState(reconnectAttempt === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) return;
        reconnectAttempt = 0;
        setConnectionState("connected");
      });

      socket.addEventListener("message", (event) => {
        let payload: { type?: string; messages?: ChatMessage[] } & Partial<ChatMessage> & {
            message?: string;
          };
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          setError("The incoming message was unreadable");
          return;
        }

        if (payload.type === "history" && Array.isArray(payload.messages)) {
          setMessages(payload.messages);
        }
        if (
          payload.type === "message" &&
          typeof payload.userId === "string" &&
          typeof payload.nickname === "string" &&
          typeof payload.text === "string" &&
          typeof payload.time === "string"
        ) {
          const message = payload as ChatMessage;
          setMessages((currentMessages) =>
            currentMessages.some((item) => messageKey(item) === messageKey(message))
              ? currentMessages
              : [...currentMessages, message],
          );
          void notifyIncomingMessage(message, session.user.id, notificationsEnabledRef.current);
        }
        if (payload.type === "error" && typeof payload.message === "string") {
          setError(payload.message);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        scheduleReconnect();
      });

      socket.addEventListener("error", () => socket.close());
    }

    function recoverConnection() {
      if (disposed || document.visibilityState === "hidden" || !navigator.onLine) return;
      const current = socketRef.current;
      if (current) {
        socketRef.current = null;
        current.close(4000, "Refreshing connection");
      }
      reconnectAttempt = 0;
      connect();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (hiddenAt !== null && Date.now() - hiddenAt >= 3_000) recoverConnection();
      hiddenAt = null;
    }

    connect();
    window.addEventListener("online", recoverConnection);
    window.addEventListener("offline", scheduleReconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("online", recoverConnection);
      window.removeEventListener("offline", scheduleReconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const current = socketRef.current;
      socketRef.current = null;
      current?.close(1000, "Page closed");
    };
  }, [session]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }, [messages.length]);

  const title = session?.channel.name ?? "Pouring the order";
  const channelNotice = session?.channel.notice?.trim() ?? "";
  const patron = session?.user.nickname ?? "";
  const currentUserId = session?.user.id ?? "";
  const visibleMessages = useMemo(() => messages, [messages]);
  const connectionLabel = {
    connecting: "Connecting",
    connected: "Live",
    reconnecting: "Reconnecting",
    offline: "Offline",
  }[connectionState];

  if (needsLogin) {
    return <LoginPage fixedChannelId={channelId} />;
  }

  async function toggleNotifications(event: React.ChangeEvent<HTMLInputElement>) {
    const shouldEnable = event.currentTarget.checked;
    if (!shouldEnable) {
      setNotificationSwitch(false);
      return;
    }

    const allowed = await requestNotificationPermission();
    setNotificationSwitch(allowed);
    setError(
      allowed
        ? ""
        : "Browser notifications are blocked. Allow them in the site settings and try again.",
    );
  }

  function setNotificationSwitch(enabled: boolean) {
    notificationsEnabledRef.current = enabled;
    setNotificationsEnabled(enabled);
    saveNotificationPreference(enabled);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const text = inputRef.current?.value.trim() ?? "";
    if (!text) return;

    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError(
        "Connection interrupted. Your message is still here; try again when the line is live.",
      );
      return;
    }

    socketRef.current.send(JSON.stringify({ type: "message", text }));
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }

  return (
    <main className="chat-page">
      <h1 className="chat-page__title">{title}</h1>
      {channelNotice && <p className="chat-page__notice">{channelNotice}</p>}
      <div className="chat-page__toolbar">
        <span
          className={`chat-page__connection chat-page__connection--${connectionState}`}
          role="status"
          aria-live="polite"
        >
          {connectionLabel}
        </span>
        <InstallAppButton />
        <label className="chat-page__toolbar-item">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            disabled={!("Notification" in window) || Notification.permission === "denied"}
            onChange={toggleNotifications}
          />{" "}
          Wake the bell
        </label>
        {patron && <span className="chat-page__toolbar-item">Guest: {patron}</span>}
        <form className="chat-page__toolbar-item" method="post" action="/logout">
          <button className="button--secondary" type="submit">
            Leave the seat
          </button>
        </form>
      </div>
      {error && <p className="chat-page__error">{error}</p>}
      <hr />
      <div className="chat-page__messages" ref={messagesRef}>
        {visibleMessages.map((message) => (
          <article
            className={`chat-page__message ${
              message.userId === currentUserId
                ? "chat-page__message--own"
                : "chat-page__message--other"
            }`}
            key={`${message.time}-${message.userId}-${message.text}`}
          >
            <header className="chat-page__message-header">
              <time dateTime={message.time}>{new Date(message.time).toLocaleTimeString()}</time>
              <strong>{message.nickname}</strong>
            </header>
            <p className="chat-page__message-text">{message.text}</p>
          </article>
        ))}
      </div>
      <form className="chat-page__composer" onSubmit={submit}>
        <p className="chat-page__composer-row">
          <input
            className="chat-page__composer-input"
            ref={inputRef}
            name="text"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={1000}
            required
            placeholder="Say it across the counter..."
          />
        </p>
      </form>
    </main>
  );
}
