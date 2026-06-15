import { useEffect, useState } from "react";
import { deleteResource, getJson, postForm } from "../../api";
import type { AdminChannel } from "../../types";
import { randomAvailableDrinkName } from "../../shared/drinks";
import { AdminLoginPage } from "../admin-login/AdminLoginPage";
import "../login/login-page.css";
import "./admin-page.css";

export function AdminRoute() {
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);

  async function refresh() {
    setChannels(await getJson<AdminChannel[]>("/api/admin"));
  }

  useEffect(() => {
    refresh().catch(() => setChannels(null));
  }, []);

  if (channels === null) return <AdminLoginPage />;
  return <AdminPage channels={channels} refresh={refresh} />;
}

type AdminPageProps = {
  channels: AdminChannel[];
  refresh: () => Promise<void>;
};

type PendingConfirmation =
  | { type: "channel"; channelId: string; channelName: string }
  | { type: "user"; channelId: string; userId: string; nickname: string };

function AdminPage({ channels, refresh }: AdminPageProps) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [channelName, setChannelName] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    setChannelName((current) => {
      const usedNames = new Set(channels.map((channel) => channel.name.trim().toLowerCase()));
      if (current && !usedNames.has(current.trim().toLowerCase())) return current;
      return randomAvailableDrinkName(channels);
    });
  }, [channels]);

  async function createChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      await postForm("/api/admin/channels", {
        name: String(form.get("name") ?? ""),
        notice: String(form.get("notice") ?? ""),
      });
      setChannelName("");
      formElement.reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The menu board would not take it");
    }
  }

  async function addUser(event: React.FormEvent<HTMLFormElement>, channelId: string) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      await postForm(`/api/admin/channels/${encodeURIComponent(channelId)}/users`, {
        nickname: String(form.get("nickname") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      formElement.reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The guest list rejected the name");
    }
  }

  async function updateNotice(event: React.FormEvent<HTMLFormElement>, channelId: string) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const form = new FormData(event.currentTarget);
      await postForm(`/api/admin/channels/${encodeURIComponent(channelId)}/notice`, {
        notice: String(form.get("notice") ?? ""),
      });
      setNotice("The board note is fresh");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The board note would not stick");
    }
  }

  async function copyPassword(password: string | null | undefined, nickname: string) {
    if (!password) return;
    setError("");

    try {
      await navigator.clipboard.writeText(password);
      setNotice(`${nickname}'s house password is on the clipboard`);
    } catch {
      setError("The clipboard would not take the house password");
    }
  }

  async function removeChannel(channelId: string) {
    setError("");
    setNotice("");

    try {
      await deleteResource(`/api/admin/channels/${encodeURIComponent(channelId)}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The board refused to lose that drink");
    }
  }

  async function removeUser(channelId: string, userId: string) {
    setError("");
    setNotice("");

    try {
      await deleteResource(
        `/api/admin/channels/${encodeURIComponent(channelId)}/users/${encodeURIComponent(userId)}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The guest list would not let go");
    }
  }

  async function confirmPendingAction() {
    const action = pendingConfirmation;
    if (!action) return;
    setPendingConfirmation(null);

    if (action.type === "channel") {
      await removeChannel(action.channelId);
      return;
    }

    await removeUser(action.channelId, action.userId);
  }

  const statusMessage = error || notice || "";
  const confirmationText =
    pendingConfirmation?.type === "channel"
      ? `Strike ${pendingConfirmation.channelName} from tonight's board?`
      : pendingConfirmation
        ? `Close ${pendingConfirmation.nickname}'s seat?`
        : "";

  return (
    <main className="form-page admin-page">
      <div className="form-page__content admin-page__content">
        <h1 className="form-page__title">Back Bar Ledger</h1>
        <p
          className={`form-page__status ${
            error ? "form-page__status--error" : "form-page__status--notice"
          }`}
          aria-live="polite"
        >
          {statusMessage}
        </p>
        <form className="admin-page__logout" method="post" action="/logout">
          <button className="form-page__button button--secondary" type="submit">
            End shift
          </button>
        </form>

        <section className="admin-page__section">
          <h2>Write a new order</h2>
          <form className="form-page__form admin-page__create-form" onSubmit={createChannel}>
            <p className="form-page__field admin-page__create-field">
              <label className="form-page__label">
                Drink on the board
                <br />
                <input
                  className="form-page__control"
                  name="name"
                  required
                  value={channelName}
                  autoComplete="off"
                  onChange={(event) => setChannelName(event.currentTarget.value)}
                />
              </label>
              <button
                className="form-page__button button--secondary"
                type="button"
                onClick={() => setChannelName(randomAvailableDrinkName(channels, channelName))}
              >
                Reroll the bottle
              </button>
            </p>
            <p className="form-page__field">
              <label className="form-page__label">
                Board note
                <br />
                <textarea
                  className="form-page__control admin-page__notice-control"
                  name="notice"
                  rows={3}
                />
              </label>
            </p>
            <button className="form-page__button button--primary" type="submit">
              Put it on the menu
            </button>
          </form>
        </section>

        <section className="admin-page__section">
          <h2>Tonight&apos;s board</h2>
          <ul className="admin-page__channel-list">
            {channels.map((channel) => (
              <li className="admin-page__channel-item" key={channel.id}>
                <div className="admin-page__channel-header">
                  <strong>{channel.name}</strong>
                  <button
                    className="admin-page__compact-button button--danger"
                    type="button"
                    onClick={() =>
                      setPendingConfirmation({
                        type: "channel",
                        channelId: channel.id,
                        channelName: channel.name,
                      })
                    }
                  >
                    Delete channel
                  </button>
                </div>
                <form
                  className="admin-page__notice-form"
                  onSubmit={(event) => updateNotice(event, channel.id)}
                >
                  <p className="form-page__field">
                    <label className="form-page__label">
                      Board note
                      <br />
                      <textarea
                        className="form-page__control admin-page__notice-control"
                        name="notice"
                        rows={3}
                        defaultValue={channel.notice ?? ""}
                      />
                    </label>
                  </p>
                  <button className="admin-page__compact-button button--secondary" type="submit">
                    Save note
                  </button>
                </form>
                <ul className="admin-page__user-list">
                  {channel.users.map((user) => (
                    <li className="admin-page__user-item" key={user.id}>
                      <span className="admin-page__user-name">{user.nickname}</span>
                      <button
                        className="admin-page__compact-button button--secondary"
                        type="button"
                        disabled={!user.password}
                        title={
                          user.password
                            ? `Copy ${user.nickname}'s password`
                            : "No saved password for this older guest"
                        }
                        onClick={() => copyPassword(user.password, user.nickname)}
                      >
                        Copy password
                      </button>
                      <button
                        className="admin-page__compact-button button--danger"
                        type="button"
                        onClick={() =>
                          setPendingConfirmation({
                            type: "user",
                            channelId: channel.id,
                            userId: user.id,
                            nickname: user.nickname,
                          })
                        }
                      >
                        Delete member
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="admin-page__user-form"
                  onSubmit={(event) => addUser(event, channel.id)}
                >
                  <p className="form-page__field">
                    <label className="form-page__label">
                      Guest handle
                      <br />
                      <input
                        className="form-page__control admin-page__user-control"
                        name="nickname"
                        required
                      />
                    </label>
                  </p>
                  <p className="form-page__field">
                    <label className="form-page__label">
                      House password
                      <br />
                      <input
                        className="form-page__control admin-page__user-control"
                        name="password"
                        type="password"
                        required
                      />
                    </label>
                  </p>
                  <button className="form-page__button button--primary" type="submit">
                    Seat this guest
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <p className="form-page__link-row">
          <a href="/">Back to the front door</a>
        </p>
      </div>
      {pendingConfirmation && (
        <div className="admin-page__modal-backdrop" role="presentation">
          <section
            className="admin-page__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
          >
            <h2 className="admin-page__modal-title" id="admin-confirm-title">
              Last call
            </h2>
            <p className="admin-page__modal-copy">{confirmationText}</p>
            <div className="admin-page__modal-actions">
              <button
                className="form-page__button button--secondary"
                type="button"
                onClick={() => setPendingConfirmation(null)}
              >
                Keep it
              </button>
              <button
                className="form-page__button button--danger"
                type="button"
                onClick={confirmPendingAction}
              >
                Confirm
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
