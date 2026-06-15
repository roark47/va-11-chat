import { useEffect, useState } from "react";
import { getJson, postForm } from "../../api";
import type { ChannelSummary } from "../../types";
import type { RedirectResponse } from "../../shared/types";
import "./login-page.css";

type LoginPageProps = {
  fixedChannelId?: string;
};

export function LoginPage({ fixedChannelId = "" }: LoginPageProps) {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getJson<ChannelSummary[]>("/api/channels")
      .then(setChannels)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "The door light stayed red"),
      );
  }, []);

  const fixedChannel = channels.find((channel) => channel.id === fixedChannelId);
  const fixedChannelLabel = fixedChannel?.name ?? fixedChannelId;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      const result = await postForm<RedirectResponse>("/api/login", {
        channelId: String(form.get("channelId") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      window.location.href = result.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The door light stayed red");
    }
  }

  return (
    <main className="form-page login-page">
      <div className="form-page__content">
        <h1 className="form-page__title">Good evening, stranger</h1>
        <p className="form-page__status form-page__status--error" aria-live="polite">
          {error}
        </p>
        <form className="form-page__form" onSubmit={submit}>
          {fixedChannelId ? (
            <p className="form-page__field">
              Tonight&apos;s order: <strong>{fixedChannelLabel}</strong>
              <input name="channelId" type="hidden" value={fixedChannelId} />
            </p>
          ) : (
            <p className="form-page__field">
              <label className="form-page__label">
                Pick tonight&apos;s order
                <br />
                <select className="form-page__control" name="channelId" required>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>
          )}
          <p className="form-page__field">
            <label className="form-page__label">
              Whisper the house password
              <br />
              <input className="form-page__control" name="password" type="password" required />
            </label>
          </p>
          <button className="form-page__button button--primary" type="submit">
            Take a seat
          </button>
          <p className="form-page__link-row">
            <a href="/admin">Staff door</a>
          </p>
        </form>
      </div>
    </main>
  );
}
