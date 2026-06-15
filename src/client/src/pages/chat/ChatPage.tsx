import { useEffect, useMemo, useRef, useState } from "react";
import { getJson } from "../../api";
import type { ChatMessage, ChatSession } from "../../types";
import {
  initialNotificationsEnabled,
  notifyIncomingMessage,
  requestNotificationPermission,
  saveNotificationPreference,
} from "../../shared/notifications";
import { LoginPage } from "../login/LoginPage";
import "./chat-page.css";

type ChatPageProps = {
  channelId: string;
};

export function ChatPage({ channelId }: ChatPageProps) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = socket;

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "history") setMessages(payload.messages);
      if (payload.type === "message") {
        setMessages((current) => [...current, payload]);
        notifyIncomingMessage(payload, session.user.id, notificationsEnabledRef.current);
      }
      if (payload.type === "error") setError(payload.message);
    });

    return () => socket.close();
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

    socketRef.current?.send(JSON.stringify({ type: "message", text }));
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
