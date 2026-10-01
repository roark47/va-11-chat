import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import {
  adminPassword,
  defaultMaxSeats,
  isProduction,
  maxMaxSeats,
  maxMessageLength,
  maxNicknameLength,
  messageRateLimitMax,
  messageRateLimitWindowMs,
  minMaxSeats,
  port,
  projectRoot,
  requireProductionSecrets,
} from "./config.js";
import { isPatronFaceId, resolvePatronFaceId, type PatronFaceId } from "./avatars.js";
import { randomId } from "./passwords.js";
import { clientIp, isRateLimited, rateLimitLogin } from "./rate-limit.js";
import { clearSessionCookie, getSessionFromCookie, isAdmin, setSessionCookie } from "./sessions.js";
import {
  deleteHistory,
  ensureDataFiles,
  migratePlaintextMessages,
  readChannels,
  readHistory,
  saveMessage,
  writeChannels,
} from "./storage.js";
import type {
  AuthedSocket,
  ChatMessage,
  RateLimitBucket,
  StoredChannel,
  StoredUser,
} from "./types.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const channelSockets = new Map<string, Set<AuthedSocket>>();
const messageRateLimits = new Map<string, RateLimitBucket>();
const channelJoinLocks = new Map<string, Promise<unknown>>();

app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

type ActionResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

function normalizeNickname(value: string): string {
  return value.trim().toLowerCase();
}

function parseMaxSeats(raw: unknown, fallback = defaultMaxSeats): ActionResult<number> {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: fallback };
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return {
      ok: false,
      status: 400,
      message: `Seat limit must be a whole number between ${minMaxSeats} and ${maxMaxSeats}`,
    };
  }

  if (value < minMaxSeats || value > maxMaxSeats) {
    return {
      ok: false,
      status: 400,
      message: `Seat limit must be between ${minMaxSeats} and ${maxMaxSeats}`,
    };
  }

  return { ok: true, value };
}

function validateNickname(nicknameInput: string): ActionResult<string> {
  const nickname = nicknameInput.trim();
  if (!nickname) {
    return { ok: false, status: 400, message: "Pick a nickname before taking a seat" };
  }

  if (nickname.length > maxNicknameLength) {
    return {
      ok: false,
      status: 400,
      message: `Keep the nickname to ${maxNicknameLength} characters or fewer`,
    };
  }

  if (
    Array.from(nickname).some((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    return {
      ok: false,
      status: 400,
      message: "That nickname has characters the bar will not pour",
    };
  }

  return { ok: true, value: nickname };
}

function countOnline(channelId: string, exceptUserId?: string): number {
  const ids = new Set<string>();
  for (const client of channelSockets.get(channelId) ?? []) {
    if (client.userId && client.userId !== exceptUserId) {
      ids.add(client.userId);
    }
  }
  return ids.size;
}

function isUserOnline(channelId: string, userId: string): boolean {
  for (const client of channelSockets.get(channelId) ?? []) {
    if (client.userId === userId) return true;
  }
  return false;
}

async function withChannelLock<T>(channelId: string, fn: () => Promise<T>): Promise<T> {
  const previous = channelJoinLocks.get(channelId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.catch(() => undefined).then(() => gate);
  channelJoinLocks.set(channelId, current);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (channelJoinLocks.get(channelId) === current) {
      channelJoinLocks.delete(channelId);
    }
  }
}

async function createChannel(
  nameInput: string,
  noticeInput = "",
  maxSeatsInput: unknown = defaultMaxSeats,
): Promise<ActionResult<StoredChannel>> {
  const name = nameInput.trim();
  if (!name) {
    return { ok: false, status: 400, message: "The board needs a drink name" };
  }

  const seats = parseMaxSeats(maxSeatsInput, defaultMaxSeats);
  if (!seats.ok) return seats;

  const data = await readChannels();
  if (data.channels.some((channel) => channel.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, status: 400, message: "That drink is already on tonight's board" };
  }

  const channel: StoredChannel = {
    id: randomId("room"),
    name,
    maxSeats: seats.value,
    ...(noticeInput.trim() ? { notice: noticeInput.trim() } : {}),
    users: [],
  };
  data.channels.push(channel);
  await writeChannels(data);
  return { ok: true, value: channel };
}

async function updateChannelNotice(
  channelId: string,
  noticeInput: string,
): Promise<ActionResult<StoredChannel>> {
  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 404, message: "That drink is not on tonight's board" };
  }

  const notice = noticeInput.trim();
  if (notice) {
    channel.notice = notice;
  } else {
    delete channel.notice;
  }

  await writeChannels(data);
  return { ok: true, value: channel };
}

async function updateChannelMaxSeats(
  channelId: string,
  maxSeatsInput: unknown,
): Promise<ActionResult<StoredChannel>> {
  const seats = parseMaxSeats(maxSeatsInput);
  if (!seats.ok) return seats;

  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 404, message: "That drink is not on tonight's board" };
  }

  channel.maxSeats = seats.value;
  await writeChannels(data);
  return { ok: true, value: channel };
}

function parseAvatar(input: unknown): ActionResult<PatronFaceId | undefined> {
  const value = String(input ?? "").trim();
  if (!value) return { ok: true, value: undefined };
  if (!isPatronFaceId(value)) {
    return { ok: false, status: 400, message: "Pick one of the faces at the counter" };
  }
  return { ok: true, value };
}

async function joinChannel(
  channelId: string,
  nicknameInput: string,
  avatarInput: unknown,
): Promise<ActionResult<{ channel: StoredChannel; user: StoredUser; online: number }>> {
  const nicknameResult = validateNickname(nicknameInput);
  if (!nicknameResult.ok) return nicknameResult;
  const avatarResult = parseAvatar(avatarInput);
  if (!avatarResult.ok) return avatarResult;

  return withChannelLock(channelId, async () => {
    const data = await readChannels();
    const channel = data.channels.find((item) => item.id === channelId);
    if (!channel) {
      return { ok: false, status: 404, message: "That room link is not on tonight's board" };
    }

    const nickname = nicknameResult.value;
    const avatar = avatarResult.value;
    const normalized = normalizeNickname(nickname);
    const existing = channel.users.find((user) => normalizeNickname(user.nickname) === normalized);

    if (existing && isUserOnline(channel.id, existing.id)) {
      return {
        ok: false,
        status: 400,
        message: "That nickname is already seated at this counter",
      };
    }

    const online = countOnline(channel.id, existing?.id);
    if (online >= channel.maxSeats) {
      return {
        ok: false,
        status: 403,
        message: `The room is full (${online}/${channel.maxSeats})`,
      };
    }

    let user = existing;
    let dirty = false;
    if (!user) {
      user = { id: randomId("user"), nickname, ...(avatar ? { avatar } : {}) };
      channel.users.push(user);
      dirty = true;
    } else {
      if (user.nickname !== nickname) {
        user.nickname = nickname;
        dirty = true;
      }
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        dirty = true;
      }
    }
    if (dirty) await writeChannels(data);

    return { ok: true, value: { channel, user, online } };
  });
}

async function deleteChannel(channelId: string): Promise<ActionResult<StoredChannel>> {
  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 404, message: "That drink is not on tonight's board" };
  }

  data.channels = data.channels.filter((item) => item.id !== channelId);
  await writeChannels(data);
  await deleteHistory(channelId);
  return { ok: true, value: channel };
}

async function deleteChannelUser(
  channelId: string,
  userId: string,
): Promise<ActionResult<StoredUser>> {
  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 404, message: "That drink is not on tonight's board" };
  }

  const user = channel.users.find((item) => item.id === userId);
  if (!user) {
    return { ok: false, status: 404, message: "That guest is not on the stool list" };
  }

  channel.users = channel.users.filter((item) => item.id !== userId);
  await writeChannels(data);
  return { ok: true, value: user };
}

function closeChannelSockets(channelId: string): void {
  for (const client of channelSockets.get(channelId) ?? []) {
    client.close(1000, "Channel closed");
  }
  channelSockets.delete(channelId);
}

function closeUserSockets(channelId: string, userId: string): void {
  const sockets = channelSockets.get(channelId);
  if (!sockets) return;

  for (const client of sockets) {
    if (client.userId === userId) {
      client.close(1000, "Seat closed");
      sockets.delete(client);
    }
  }

  if (sockets.size === 0) channelSockets.delete(channelId);
}

function roomSummary(channel: StoredChannel) {
  const online = countOnline(channel.id);
  return {
    id: channel.id,
    name: channel.name,
    notice: channel.notice ?? "",
    maxSeats: channel.maxSeats,
    onlineCount: online,
  };
}

function setUserSession(
  res: express.Response,
  channel: StoredChannel,
  user: StoredUser,
  remember: boolean,
): void {
  setSessionCookie(
    res,
    {
      role: "user",
      channelId: channel.id,
      userId: user.id,
      nickname: user.nickname,
    },
    remember ? { maxAgeSeconds: 60 * 60 * 24 * 30 } : { maxAgeSeconds: undefined },
  );
}

app.get("/api/rooms/:channelId", async (req, res, next) => {
  try {
    const data = await readChannels();
    const channel = data.channels.find((item) => item.id === req.params.channelId);
    if (!channel) {
      res.status(404).send("That room link is not on tonight's board");
      return;
    }

    res.json(roomSummary(channel));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(401).send("The staff hatch needs a key");
      return;
    }

    const data = await readChannels();
    res.json(
      data.channels.map((channel) => ({
        ...roomSummary(channel),
        users: channel.users.map((user) => ({
          id: user.id,
          nickname: user.nickname,
          ...(user.avatar ? { avatar: user.avatar } : {}),
          online: isUserOnline(channel.id, user.id),
        })),
      })),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/:channelId", async (req, res, next) => {
  try {
    const session = getSessionFromCookie(req.headers.cookie);
    const data = await readChannels();
    const channel = data.channels.find((item) => item.id === req.params.channelId);
    const user = channel?.users.find((item) => item.id === session?.userId);

    if (
      !session ||
      session.role !== "user" ||
      session.channelId !== req.params.channelId ||
      !channel ||
      !user
    ) {
      res.status(401).send("The front door needs a seat check");
      return;
    }

    res.json({
      channel: roomSummary(channel),
      user: {
        id: user.id,
        nickname: user.nickname,
        ...(user.avatar ? { avatar: user.avatar } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    const session = getSessionFromCookie(req.headers.cookie);
    if (session?.role !== "user" || !session.channelId || !session.userId) {
      res.status(401).send("No active seat");
      return;
    }

    const data = await readChannels();
    const channel = data.channels.find((item) => item.id === session.channelId);
    const user = channel?.users.find((item) => item.id === session.userId);
    if (!channel || !user) {
      clearSessionCookie(res);
      res.status(401).send("That seat is no longer available");
      return;
    }

    res.json({ redirectTo: `/chat/${encodeURIComponent(channel.id)}` });
  } catch (error) {
    next(error);
  }
});

app.post("/api/join", async (req, res, next) => {
  try {
    if (rateLimitLogin(req, res)) return;

    const result = await joinChannel(
      String(req.body.channelId ?? ""),
      String(req.body.nickname ?? ""),
      req.body.avatar,
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    const { channel, user } = result.value;
    setUserSession(res, channel, user, String(req.body.remember ?? "") === "1");
    res.json({ redirectTo: `/chat/${encodeURIComponent(channel.id)}` });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (req, res) => {
  if (rateLimitLogin(req, res)) return;

  const password = String(req.body.password ?? "");
  if (!adminPassword) {
    res.status(500).send("ADMIN_PASSWORD is not configured");
    return;
  }

  if (password !== adminPassword) {
    res.status(401).send("The bartender key did not turn");
    return;
  }

  setSessionCookie(res, { role: "admin" });
  res.json({ redirectTo: "/admin" });
});

app.post("/api/admin/channels", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await createChannel(
      String(req.body.name ?? ""),
      String(req.body.notice ?? ""),
      req.body.maxSeats,
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.status(201).json(roomSummary(result.value));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/channels/:channelId/notice", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await updateChannelNotice(req.params.channelId, String(req.body.notice ?? ""));
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/channels/:channelId/max-seats", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await updateChannelMaxSeats(req.params.channelId, req.body.maxSeats);
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/channels/:channelId", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await deleteChannel(req.params.channelId);
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    closeChannelSockets(req.params.channelId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/channels/:channelId/users/:userId", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await deleteChannelUser(req.params.channelId, req.params.userId);
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    closeUserSockets(req.params.channelId, req.params.userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/join", async (req, res, next) => {
  try {
    if (rateLimitLogin(req, res)) return;

    const result = await joinChannel(
      String(req.body.channelId ?? ""),
      String(req.body.nickname ?? ""),
      req.body.avatar,
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    const { channel, user } = result.value;
    setUserSession(res, channel, user, String(req.body.remember ?? "") === "1");
    res.redirect(`/chat/${encodeURIComponent(channel.id)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/admin/login", async (req, res) => {
  if (rateLimitLogin(req, res)) return;

  const password = String(req.body.password ?? "");
  if (!adminPassword) {
    res.status(500).send("ADMIN_PASSWORD is not configured");
    return;
  }

  if (password !== adminPassword) {
    res.status(401).send("The bartender key did not turn");
    return;
  }

  setSessionCookie(res, { role: "admin" });
  res.redirect("/admin");
});

app.post("/admin/channels", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await createChannel(
      String(req.body.name ?? ""),
      String(req.body.notice ?? ""),
      req.body.maxSeats,
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.redirect("/admin");
  } catch (error) {
    next(error);
  }
});

app.post("/admin/channels/:channelId/notice", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await updateChannelNotice(req.params.channelId, String(req.body.notice ?? ""));
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.redirect("/admin");
  } catch (error) {
    next(error);
  }
});

app.post("/admin/channels/:channelId/max-seats", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await updateChannelMaxSeats(req.params.channelId, req.body.maxSeats);
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.redirect("/admin");
  } catch (error) {
    next(error);
  }
});

app.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect("/");
});

server.on("upgrade", async (req, socket, head) => {
  const session = getSessionFromCookie(req.headers.cookie);
  if (req.url !== "/ws" || session?.role !== "user" || !session.channelId || !session.userId) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === session.channelId);
  const user = channel?.users.find((item) => item.id === session.userId);
  if (!channel || !user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  if (countOnline(channel.id, user.id) >= channel.maxSeats) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const authed = ws as AuthedSocket;
    authed.channelId = channel.id;
    authed.userId = user.id;
    authed.nickname = user.nickname;
    authed.rateLimitKey = `message:${channel.id}:${user.id}:${clientIp(req)}`;
    wss.emit("connection", authed, req);
  });
});

wss.on("connection", async (ws: AuthedSocket) => {
  const channelId = ws.channelId;
  const userId = ws.userId;
  const nickname = ws.nickname;
  const rateLimitKey = ws.rateLimitKey;
  if (!channelId || !userId || !nickname || !rateLimitKey) {
    ws.close();
    return;
  }

  const sockets = channelSockets.get(channelId) ?? new Set<AuthedSocket>();
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  sockets.add(ws);
  channelSockets.set(channelId, sockets);

  ws.send(JSON.stringify({ type: "history", messages: await readHistory(channelId) }));

  ws.on("message", async (raw) => {
    if (
      isRateLimited(messageRateLimits, rateLimitKey, messageRateLimitMax, messageRateLimitWindowMs)
    ) {
      ws.send(JSON.stringify({ type: "error", message: "Slow down; the shaker is still moving" }));
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "That order slip is unreadable" }));
      return;
    }

    const text =
      typeof payload === "object" && payload !== null && "text" in payload
        ? String((payload as { text: unknown }).text).trim()
        : "";

    if (!text) {
      ws.send(JSON.stringify({ type: "error", message: "Say something before serving it" }));
      return;
    }

    if (text.length > maxMessageLength) {
      ws.send(JSON.stringify({ type: "error", message: "That order is too long for the counter" }));
      return;
    }

    const seated = (await readChannels()).channels
      .find((item) => item.id === channelId)
      ?.users.find((item) => item.id === userId);
    const message: ChatMessage = {
      type: "message",
      id: randomId("message"),
      userId,
      nickname,
      avatar: resolvePatronFaceId(seated?.avatar),
      text,
      time: new Date().toISOString(),
    };

    await saveMessage(channelId, message);
    for (const client of channelSockets.get(channelId) ?? []) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  });

  ws.on("close", () => {
    const current = channelSockets.get(channelId);
    current?.delete(ws);
    if (current?.size === 0) channelSockets.delete(channelId);
  });
});

const websocketHeartbeat = setInterval(() => {
  for (const client of wss.clients as Set<AuthedSocket>) {
    if (client.readyState !== client.OPEN) continue;

    if (client.isAlive === false) {
      client.terminate();
      continue;
    }

    client.isAlive = false;
    client.ping();
  }
}, 30_000);
websocketHeartbeat.unref();

async function configureFrontend(): Promise<void> {
  if (!isProduction && process.env.NODE_ENV !== "test") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return;
  }

  const clientDist = path.join(projectRoot, "dist", "client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

requireProductionSecrets();
await ensureDataFiles();
await migratePlaintextMessages();
await configureFrontend();

server.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
