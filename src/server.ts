import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import {
  adminPassword,
  isProduction,
  maxMessageLength,
  messageRateLimitMax,
  messageRateLimitWindowMs,
  port,
  projectRoot,
  requireProductionSecrets,
} from "./config.js";
import { randomId, hashPassword, verifyPassword } from "./passwords.js";
import { clientIp, isRateLimited, rateLimitLogin } from "./rate-limit.js";
import { clearSessionCookie, getSessionFromCookie, isAdmin, setSessionCookie } from "./sessions.js";
import {
  decryptPasswordForAdminCopy,
  deleteHistory,
  ensureDataFiles,
  encryptPasswordForAdminCopy,
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
import { slugify } from "./utils.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const channelSockets = new Map<string, Set<AuthedSocket>>();
const messageRateLimits = new Map<string, RateLimitBucket>();

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

async function authenticateChatUser(
  channelId: string,
  password: string,
): Promise<ActionResult<{ channel: StoredChannel; user: StoredUser }>> {
  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 401, message: "That drink is not on tonight's board" };
  }

  for (const user of channel.users) {
    if (await verifyPassword(password, user.passwordHash)) {
      return { ok: true, value: { channel, user } };
    }
  }

  return { ok: false, status: 401, message: "The house password did not open this seat" };
}

async function createChannel(
  nameInput: string,
  noticeInput = "",
): Promise<ActionResult<StoredChannel>> {
  const name = nameInput.trim();
  if (!name) {
    return { ok: false, status: 400, message: "The board needs a drink name" };
  }

  const data = await readChannels();
  const baseId = slugify(name) || randomId("channel");
  let id = baseId;
  let suffix = 2;
  while (data.channels.some((channel) => channel.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const notice = noticeInput.trim();
  const channel: StoredChannel = { id, name, ...(notice ? { notice } : {}), users: [] };
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

async function addChannelUser(
  channelId: string,
  nicknameInput: string,
  password: string,
): Promise<ActionResult<StoredUser>> {
  const nickname = nicknameInput.trim();
  if (!nickname || !password) {
    return { ok: false, status: 400, message: "Guest handle and house password are required" };
  }

  const data = await readChannels();
  const channel = data.channels.find((item) => item.id === channelId);
  if (!channel) {
    return { ok: false, status: 404, message: "That drink is not on tonight's board" };
  }

  const user = {
    id: randomId("user"),
    nickname,
    passwordHash: await hashPassword(password),
    encryptedPassword: encryptPasswordForAdminCopy(password),
  };
  channel.users.push(user);
  await writeChannels(data);
  return { ok: true, value: user };
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

app.get("/api/channels", async (_req, res, next) => {
  try {
    const data = await readChannels();
    res.json(data.channels.map((channel) => ({ id: channel.id, name: channel.name })));
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
        id: channel.id,
        name: channel.name,
        notice: channel.notice ?? "",
        users: channel.users.map((user) => ({
          id: user.id,
          nickname: user.nickname,
          password: decryptPasswordForAdminCopy(user.encryptedPassword),
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
      channel: { id: channel.id, name: channel.name, notice: channel.notice ?? "" },
      user: { id: user.id, nickname: user.nickname },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    if (rateLimitLogin(req, res)) return;

    const result = await authenticateChatUser(
      String(req.body.channelId ?? ""),
      String(req.body.password ?? ""),
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    const { channel, user } = result.value;
    setSessionCookie(res, {
      role: "user",
      channelId: channel.id,
      userId: user.id,
      nickname: user.nickname,
    });
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

    const result = await createChannel(String(req.body.name ?? ""), String(req.body.notice ?? ""));
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    res.status(204).end();
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

app.post("/api/admin/channels/:channelId/users", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await addChannelUser(
      req.params.channelId,
      String(req.body.nickname ?? ""),
      String(req.body.password ?? ""),
    );
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

app.post("/login", async (req, res, next) => {
  try {
    if (rateLimitLogin(req, res)) return;

    const result = await authenticateChatUser(
      String(req.body.channelId ?? ""),
      String(req.body.password ?? ""),
    );
    if (!result.ok) {
      res.status(result.status).send(result.message);
      return;
    }

    const { channel, user } = result.value;
    setSessionCookie(res, {
      role: "user",
      channelId: channel.id,
      userId: user.id,
      nickname: user.nickname,
    });
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

    const result = await createChannel(String(req.body.name ?? ""), String(req.body.notice ?? ""));
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

app.post("/admin/channels/:channelId/users", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).send("The staff hatch needs a key");
      return;
    }

    const result = await addChannelUser(
      req.params.channelId,
      String(req.body.nickname ?? ""),
      String(req.body.password ?? ""),
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

    const message: ChatMessage = {
      type: "message",
      userId,
      nickname,
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
