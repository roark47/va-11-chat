import { useEffect, useState } from "react";
import { defaultPatronFaceId, patronFaces, type PatronFaceId } from "../../../../avatars";
import { getJson, postForm } from "../../api";
import type { ChannelSummary } from "../../types";
import { PatronPortrait } from "../../shared/patron-portrait";
import type { RedirectResponse } from "../../shared/types";
import "./login-page.css";

type LoginPageProps = {
  fixedChannelId?: string;
};

export function LoginPage({ fixedChannelId = "" }: LoginPageProps) {
  const [room, setRoom] = useState<ChannelSummary | null>(null);
  const [error, setError] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(Boolean(fixedChannelId));
  const [avatar, setAvatar] = useState<PatronFaceId>(defaultPatronFaceId);

  useEffect(() => {
    if (!fixedChannelId) {
      setLoadingRoom(false);
      return;
    }

    setLoadingRoom(true);
    getJson<ChannelSummary>(`/api/rooms/${encodeURIComponent(fixedChannelId)}`)
      .then(setRoom)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "That room link stayed dark"),
      )
      .finally(() => setLoadingRoom(false));
  }, [fixedChannelId]);

  useEffect(() => {
    const surface = fixedChannelId ? (room ? "join" : "entry") : "lobby";
    document.body.dataset.surface = surface;
    return () => {
      delete document.body.dataset.surface;
    };
  }, [fixedChannelId, room]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      const result = await postForm<RedirectResponse>("/api/join", {
        channelId: String(form.get("channelId") ?? ""),
        nickname: String(form.get("nickname") ?? ""),
        avatar: String(form.get("avatar") ?? ""),
        remember: form.get("remember") === "on" ? "1" : "",
      });
      window.location.href = result.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The door light stayed red");
    }
  }

  if (!fixedChannelId) {
    return (
      <main className="form-page login-page login-page--lobby">
        <div className="form-page__content">
          <p className="login-page__sign">VA-11</p>
          <h1 className="form-page__title">The counter is open</h1>
          <p className="login-page__lede">
            A small late-night room. Talk across the counter, then leave — nothing here is meant to
            be an archive.
          </p>
          <p className="login-page__wait" role="status">
            Waiting on a room link from your host.
          </p>
          <p className="login-page__wait-sub">
            With the link, pick a nickname, a face, and take a seat.
          </p>
          <p className="form-page__link-row login-page__staff-link">
            <a href="/admin">Opening tonight? Staff hatch</a>
          </p>
        </div>
      </main>
    );
  }

  if (loadingRoom) {
    return (
      <main className="form-page login-page">
        <div className="form-page__content">
          <p className="form-page__status form-page__status--notice" role="status">
            Checking tonight&apos;s room...
          </p>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="form-page login-page">
        <div className="form-page__content">
          <h1 className="form-page__title">Room not found</h1>
          <p className="form-page__status form-page__status--error" aria-live="polite">
            {error || "That room link is not on tonight's board"}
          </p>
          <p className="form-page__link-row">
            <a href="/">Back to the front door</a>
          </p>
        </div>
      </main>
    );
  }

  const online = room.onlineCount ?? 0;
  const maxSeats = room.maxSeats ?? 0;
  const isFull = maxSeats > 0 && online >= maxSeats;
  const seatsLabel = maxSeats > 0 ? `${online}/${maxSeats} seats taken` : "";

  return (
    <main className="form-page login-page login-page--join">
      <div className="form-page__content">
        <p className="login-page__drink">{room.name}</p>
        <h1 className="form-page__title">Good evening, stranger</h1>
        <p className="login-page__trust">
          Anyone with this link can join. Talk stays in the room — recent chat lives on the server,
          not as a lasting archive of you.
        </p>
        {seatsLabel ? <p className="form-page__meta login-page__seats">{seatsLabel}</p> : null}
        <p className="form-page__status form-page__status--error" aria-live="polite">
          {error ||
            (isFull
              ? `The room is full (${online}/${maxSeats}). Try again when a stool frees up.`
              : "")}
        </p>
        <form className="form-page__form" onSubmit={submit}>
          <input name="channelId" type="hidden" value={room.id} />
          <p className="form-page__field">
            <label className="form-page__label">
              What should we call you
              <br />
              <input
                className="form-page__control"
                name="nickname"
                required
                maxLength={24}
                autoComplete="nickname"
                autoFocus
                disabled={isFull}
              />
            </label>
          </p>
          <fieldset className="login-page__faces" disabled={isFull}>
            <legend className="form-page__label">Pick a face for the counter</legend>
            <div className="login-page__face-grid">
              {patronFaces.map((face) => (
                <label
                  className={`login-page__face${avatar === face.id ? " login-page__face--selected" : ""}`}
                  key={face.id}
                >
                  <input
                    className="login-page__face-input"
                    type="radio"
                    name="avatar"
                    value={face.id}
                    checked={avatar === face.id}
                    onChange={() => setAvatar(face.id)}
                    required
                  />
                  <span className="patron-frame patron-frame--pick">
                    <PatronPortrait face={face.id} />
                  </span>
                  <span className="login-page__face-label">{face.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="form-page__field form-page__remember">
            <label className="form-page__label">
              <input name="remember" type="checkbox" /> Keep this seat on this device for 30 days
            </label>
            <span className="form-page__meta login-page__remember-hint">
              Optional. Remembers only this room seat in a cookie — not a lasting chat history.
            </span>
          </p>
          <button
            className="form-page__button button--primary login-page__seat-cta"
            type="submit"
            disabled={isFull}
          >
            Take a seat
          </button>
        </form>
      </div>
    </main>
  );
}
