import { useEffect, useState } from "react";
import { resolvePatronFaceId } from "../../../../avatars";
import { deleteResource, getJson, postForm } from "../../api";
import type { AdminChannel } from "../../types";
import { randomAvailableDrinkName } from "../../shared/drinks";
import { PatronPortrait } from "../../shared/patron-portrait";
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

type FreshKey = {
  id: string;
  name: string;
};

function roomLink(channelId: string): string {
  return `${window.location.origin}/chat/${encodeURIComponent(channelId)}`;
}

function AdminPage({ channels, refresh }: AdminPageProps) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [channelName, setChannelName] = useState("");
  const [freshKey, setFreshKey] = useState<FreshKey | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
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
      const created = await postForm<AdminChannel>("/api/admin/channels", {
        name: String(form.get("name") ?? ""),
        notice: String(form.get("notice") ?? ""),
        maxSeats: String(form.get("maxSeats") ?? "8"),
      });
      setChannelName("");
      formElement.reset();
      setFreshKey({ id: created.id, name: created.name });
      setExpandedRoomId(null);
      setNotice(`Hand them the key for ${created.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The menu board would not take it");
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

  async function updateMaxSeats(event: React.FormEvent<HTMLFormElement>, channelId: string) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const form = new FormData(event.currentTarget);
      await postForm(`/api/admin/channels/${encodeURIComponent(channelId)}/max-seats`, {
        maxSeats: String(form.get("maxSeats") ?? ""),
      });
      setNotice("Seat limit updated");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The seat limit would not stick");
    }
  }

  async function copyLink(channelId: string, channelName: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(roomLink(channelId));
      setNotice(`${channelName}'s room key is on the clipboard`);
    } catch {
      setError("The clipboard would not take the room link");
    }
  }

  async function removeChannel(channelId: string) {
    setError("");
    setNotice("");

    try {
      await deleteResource(`/api/admin/channels/${encodeURIComponent(channelId)}`);
      if (freshKey?.id === channelId) setFreshKey(null);
      if (expandedRoomId === channelId) setExpandedRoomId(null);
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
        ? `Clear ${pendingConfirmation.nickname}'s saved seat?`
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

        {freshKey && (
          <section className="admin-page__key-panel" aria-labelledby="fresh-key-title">
            <h2 className="admin-page__key-title" id="fresh-key-title">
              Tonight&apos;s key
            </h2>
            <p className="admin-page__key-copy">
              <strong>{freshKey.name}</strong> is open. Hand this link to anyone you want at the
              counter — the link is the only key.
            </p>
            <code className="admin-page__key-link">{roomLink(freshKey.id)}</code>
            <div className="admin-page__key-actions">
              <button
                className="form-page__button button--primary"
                type="button"
                onClick={() => copyLink(freshKey.id, freshKey.name)}
              >
                Copy the key
              </button>
              <button
                className="form-page__button button--secondary"
                type="button"
                onClick={() => setFreshKey(null)}
              >
                Got it
              </button>
            </div>
          </section>
        )}

        <section className="admin-page__section">
          <h2>Open a room</h2>
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
                Max seats (online)
                <br />
                <input
                  className="form-page__control"
                  name="maxSeats"
                  type="number"
                  min={2}
                  max={50}
                  defaultValue={8}
                  required
                />
              </label>
            </p>
            <p className="form-page__field">
              <label className="form-page__label">
                Board note <span className="form-page__meta">(optional)</span>
                <br />
                <textarea
                  className="form-page__control admin-page__notice-control"
                  name="notice"
                  rows={2}
                />
              </label>
            </p>
            <button className="form-page__button button--primary" type="submit">
              Open the room
            </button>
          </form>
        </section>

        <section className="admin-page__section">
          <h2>Tonight&apos;s board</h2>
          {channels.length === 0 ? (
            <p className="admin-page__empty">
              No rooms yet. Open one above, then share tonight&apos;s key with your guests.
            </p>
          ) : (
            <ul className="admin-page__channel-list">
              {channels.map((channel) => {
                const isExpanded = expandedRoomId === channel.id;
                return (
                  <li
                    className={`admin-page__channel-item${
                      freshKey?.id === channel.id ? " admin-page__channel-item--fresh" : ""
                    }`}
                    key={channel.id}
                  >
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
                        Delete room
                      </button>
                    </div>
                    <p className="admin-page__meta">
                      {channel.onlineCount}/{channel.maxSeats} online
                    </p>
                    <div className="admin-page__link-row">
                      <code className="admin-page__link">{roomLink(channel.id)}</code>
                      <button
                        className="admin-page__compact-button button--primary"
                        type="button"
                        onClick={() => copyLink(channel.id, channel.name)}
                      >
                        Copy key
                      </button>
                    </div>
                    <button
                      className="admin-page__compact-button button--secondary admin-page__more-toggle"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedRoomId(isExpanded ? null : channel.id)}
                    >
                      {isExpanded ? "Hide details" : "Seats, note & guests"}
                    </button>
                    {isExpanded && (
                      <div className="admin-page__details">
                        <form
                          className="admin-page__notice-form"
                          onSubmit={(event) => updateMaxSeats(event, channel.id)}
                        >
                          <p className="form-page__field admin-page__create-field">
                            <label className="form-page__label">
                              Max seats
                              <br />
                              <input
                                className="form-page__control admin-page__user-control"
                                name="maxSeats"
                                type="number"
                                min={2}
                                max={50}
                                defaultValue={channel.maxSeats}
                                key={`${channel.id}-${channel.maxSeats}`}
                                required
                              />
                            </label>
                            <button
                              className="admin-page__compact-button button--secondary"
                              type="submit"
                            >
                              Save seats
                            </button>
                          </p>
                        </form>
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
                          <button
                            className="admin-page__compact-button button--secondary"
                            type="submit"
                          >
                            Save note
                          </button>
                        </form>
                        {channel.users.length > 0 ? (
                          <ul className="admin-page__user-list">
                            {channel.users.map((user) => (
                              <li className="admin-page__user-item" key={user.id}>
                                <span className="admin-page__user-name">
                                  <span className="patron-frame patron-frame--seat">
                                    <PatronPortrait face={resolvePatronFaceId(user.avatar)} />
                                  </span>
                                  {user.nickname}
                                  {user.online ? " · online" : ""}
                                </span>
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
                                  Clear seat
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="admin-page__meta">No guests have sat down yet.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
