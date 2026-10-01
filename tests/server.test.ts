import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { onTestFinished, test } from "vitest";
import { WebSocket } from "ws";

async function freePort() {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  assert.equal(typeof address, "object");
  return address.port;
}

async function tempDataDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "minimal-ws-chat-"));
}

async function waitForServer(child: ReturnType<typeof spawn>, port: number) {
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      await response.text();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("server did not start in time");
}

async function startServer(extraEnv: Record<string, string> = {}) {
  const port = await freePort();
  const dataDir = await tempDataDir();
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_PASSWORD: "test-admin",
      COOKIE_SECRET: "test-cookie-secret",
      MESSAGE_SECRET: "test-message-secret",
      DATA_DIR: dataDir,
      NODE_ENV: "test",
      PORT: String(port),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  onTestFinished(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  await waitForServer(child, port);
  return { child, port, dataDir, baseUrl: `http://127.0.0.1:${port}` };
}

async function spawnExpectFailure(env: Record<string, string>) {
  const port = await freePort();
  const dataDir = await tempDataDir();
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ...env,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const code = await new Promise((resolve) => child.once("exit", resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
  return { code, stderr };
}

function setCookieHeader(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function postForm(
  baseUrl: string,
  pathname: string,
  body: Record<string, string>,
  cookie = "",
) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(body),
  });
}

function waitForWebSocketMessage(
  ws: WebSocket,
  predicate?: (message: Record<string, unknown>) => boolean,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for websocket message"));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onMessage(raw: WebSocket.RawData) {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (!predicate || predicate(message)) {
        cleanup();
        resolve(message);
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

test("production refuses to start without MESSAGE_SECRET", async () => {
  const result = await spawnExpectFailure({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "admin",
    COOKIE_SECRET: "cookie-secret",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Missing required production environment variables: MESSAGE_SECRET/);
});

test("production refuses to start when cookie and message secrets are equal", async () => {
  const result = await spawnExpectFailure({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "admin",
    COOKIE_SECRET: "same-secret",
    MESSAGE_SECRET: "same-secret",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /COOKIE_SECRET and MESSAGE_SECRET must be different/);
});

test("adds security headers and rate-limits repeated login failures", async () => {
  const { baseUrl } = await startServer();

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("referrer-policy"), "no-referrer");
  assert.equal(home.headers.get("x-frame-options"), "DENY");

  const statuses = [];
  for (let index = 0; index < 11; index += 1) {
    const response = await postForm(baseUrl, "/admin/login", { password: "wrong" });
    statuses.push(response.status);
    await response.text();
  }

  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
});

test("json api supports browser click actions", async () => {
  const { baseUrl, dataDir } = await startServer();

  const anonymousSession = await fetch(`${baseUrl}/api/session`);
  assert.equal(anonymousSession.status, 401);

  const blockedCreate = await postForm(baseUrl, "/api/admin/channels", { name: "No Key" });
  assert.equal(blockedCreate.status, 403);

  const adminLogin = await postForm(baseUrl, "/api/admin/login", { password: "test-admin" });
  assert.equal(adminLogin.status, 200);
  assert.deepEqual(await adminLogin.json(), { redirectTo: "/admin" });
  const adminCookie = setCookieHeader(adminLogin);
  assert.ok(adminCookie);

  const createChannel = await postForm(
    baseUrl,
    "/api/admin/channels",
    { name: "API Room", notice: "Mind the midnight tab.", maxSeats: "4" },
    adminCookie,
  );
  assert.equal(createChannel.status, 201);
  const created = (await createChannel.json()) as {
    id: string;
    name: string;
    notice: string;
    maxSeats: number;
  };
  assert.equal(created.name, "API Room");
  assert.equal(created.notice, "Mind the midnight tab.");
  assert.equal(created.maxSeats, 4);
  assert.match(created.id, /^room_/);

  const adminState = await fetch(`${baseUrl}/api/admin`, { headers: { cookie: adminCookie } });
  assert.equal(adminState.status, 200);
  assert.equal(adminState.headers.get("cache-control"), "no-store");
  const adminStateJson = (await adminState.json()) as Array<{
    id: string;
    name: string;
    notice: string;
    maxSeats: number;
    users: Array<{ nickname: string }>;
  }>;
  assert.equal(adminStateJson[0]?.name, "API Room");
  assert.equal(adminStateJson[0]?.notice, "Mind the midnight tab.");
  assert.equal(adminStateJson[0]?.maxSeats, 4);
  assert.deepEqual(adminStateJson[0]?.users, []);

  const storedChannels = await fs.readFile(path.join(dataDir, "channels.json"), "utf8");
  assert.doesNotMatch(storedChannels, /passwordHash/);

  const roomLookup = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(created.id)}`);
  assert.equal(roomLookup.status, 200);
  assert.deepEqual(await roomLookup.json(), {
    id: created.id,
    name: "API Room",
    notice: "Mind the midnight tab.",
    maxSeats: 4,
    onlineCount: 0,
  });

  const userJoin = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Dana",
    remember: "1",
  });
  assert.equal(userJoin.status, 200);
  assert.deepEqual(await userJoin.json(), { redirectTo: `/chat/${created.id}` });
  assert.match(userJoin.headers.get("set-cookie") ?? "", /Max-Age=2592000/);
  const userCookie = setCookieHeader(userJoin);
  assert.ok(userCookie);

  const resumedSession = await fetch(`${baseUrl}/api/session`, {
    headers: { cookie: userCookie },
  });
  assert.equal(resumedSession.status, 200);
  assert.deepEqual(await resumedSession.json(), { redirectTo: `/chat/${created.id}` });

  const chatSession = await fetch(`${baseUrl}/api/chat/${encodeURIComponent(created.id)}`, {
    headers: { cookie: userCookie },
  });
  assert.equal(chatSession.status, 200);
  const chatSessionJson = (await chatSession.json()) as {
    channel: { name: string; notice: string; maxSeats: number };
    user: { nickname: string };
  };
  assert.equal(chatSessionJson.channel.name, "API Room");
  assert.equal(chatSessionJson.channel.notice, "Mind the midnight tab.");
  assert.equal(chatSessionJson.channel.maxSeats, 4);
  assert.equal(chatSessionJson.user.nickname, "Dana");

  const reseat = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Dana",
    avatar: "waves",
  });
  assert.equal(reseat.status, 200);
  const reseated = await fetch(`${baseUrl}/api/chat/${encodeURIComponent(created.id)}`, {
    headers: { cookie: userCookie },
  });
  const reseatedJson = (await reseated.json()) as { user: { avatar?: string } };
  assert.equal(reseatedJson.user.avatar, "waves");

  const badFace = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Quinn",
    avatar: "jill",
  });
  assert.equal(badFace.status, 400);
  assert.match(await badFace.text(), /faces at the counter/);

  const updateNotice = await postForm(
    baseUrl,
    `/api/admin/channels/${encodeURIComponent(created.id)}/notice`,
    { notice: "" },
    adminCookie,
  );
  assert.equal(updateNotice.status, 204);

  const updatedAdminState = await fetch(`${baseUrl}/api/admin`, {
    headers: { cookie: adminCookie },
  });
  const updatedAdminStateJson = (await updatedAdminState.json()) as Array<{ notice: string }>;
  assert.equal(updatedAdminStateJson[0]?.notice, "");
});

test("admin api deletes seats and channels; join enforces seat limits", async () => {
  const { baseUrl } = await startServer();

  const adminLogin = await postForm(baseUrl, "/api/admin/login", { password: "test-admin" });
  const adminCookie = setCookieHeader(adminLogin);
  assert.ok(adminCookie);

  const createChannel = await postForm(
    baseUrl,
    "/api/admin/channels",
    { name: "Delete Room", maxSeats: "2" },
    adminCookie,
  );
  assert.equal(createChannel.status, 201);
  const created = (await createChannel.json()) as { id: string; maxSeats: number };
  assert.equal(created.maxSeats, 2);

  const firstJoin = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Morgan",
  });
  assert.equal(firstJoin.status, 200);
  const firstCookie = setCookieHeader(firstJoin);

  const firstSocket = new WebSocket(`ws://127.0.0.1:${new URL(baseUrl).port}/ws`, {
    headers: { cookie: firstCookie },
  });
  onTestFinished(() => firstSocket.close());
  await waitForWebSocketMessage(firstSocket, (message) => message.type === "history");

  const secondJoin = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Riley",
  });
  assert.equal(secondJoin.status, 200);
  const secondCookie = setCookieHeader(secondJoin);
  const secondSocket = new WebSocket(`ws://127.0.0.1:${new URL(baseUrl).port}/ws`, {
    headers: { cookie: secondCookie },
  });
  onTestFinished(() => secondSocket.close());
  await waitForWebSocketMessage(secondSocket, (message) => message.type === "history");

  const fullJoin = await postForm(baseUrl, "/api/join", {
    channelId: created.id,
    nickname: "Casey",
  });
  assert.equal(fullJoin.status, 403);
  assert.match(await fullJoin.text(), /full \(2\/2\)/);

  const adminState = await fetch(`${baseUrl}/api/admin`, { headers: { cookie: adminCookie } });
  const adminStateJson = (await adminState.json()) as Array<{
    id: string;
    users: Array<{ id: string; nickname: string }>;
  }>;
  const user = adminStateJson[0]?.users.find((item) => item.nickname === "Morgan");
  assert.ok(user);

  const deleteUser = await fetch(
    `${baseUrl}/api/admin/channels/${encodeURIComponent(created.id)}/users/${encodeURIComponent(user?.id ?? "")}`,
    {
      method: "DELETE",
      headers: { cookie: adminCookie },
    },
  );
  assert.equal(deleteUser.status, 204);

  const deleteChannel = await fetch(
    `${baseUrl}/api/admin/channels/${encodeURIComponent(created.id)}`,
    {
      method: "DELETE",
      headers: { cookie: adminCookie },
    },
  );
  assert.equal(deleteChannel.status, 204);

  const missingRoom = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(created.id)}`);
  assert.equal(missingRoom.status, 404);
});

test("seeds channels from INITIAL_CHANNELS_PATH when runtime channels file is missing", async () => {
  const fixtureDir = await tempDataDir();
  onTestFinished(() => fs.rm(fixtureDir, { recursive: true, force: true }));

  const initialChannelsPath = path.join(fixtureDir, "initial-channels.json");
  await fs.writeFile(
    initialChannelsPath,
    JSON.stringify({
      channels: [
        {
          id: "seeded-room",
          name: "Seeded Room",
          users: [],
        },
      ],
    }),
  );

  const { baseUrl, dataDir } = await startServer({
    INITIAL_CHANNELS_PATH: initialChannelsPath,
  });

  const room = await fetch(`${baseUrl}/api/rooms/seeded-room`);
  assert.equal(room.status, 200);
  assert.deepEqual(await room.json(), {
    id: "seeded-room",
    name: "Seeded Room",
    notice: "",
    maxSeats: 8,
    onlineCount: 0,
  });

  const runtimeChannels = JSON.parse(
    await fs.readFile(path.join(dataDir, "channels.json"), "utf8"),
  ) as {
    channels: Array<{ id: string; maxSeats: number }>;
  };
  assert.equal(runtimeChannels.channels[0]?.id, "seeded-room");
  assert.equal(runtimeChannels.channels[0]?.maxSeats, 8);
});

test("stores chat messages encrypted and reads them back through websocket history", async () => {
  const { baseUrl, dataDir, port } = await startServer();

  const adminLogin = await postForm(baseUrl, "/admin/login", { password: "test-admin" });
  assert.equal(adminLogin.status, 302);
  const adminCookie = setCookieHeader(adminLogin);
  assert.ok(adminCookie);

  const createChannel = await postForm(
    baseUrl,
    "/api/admin/channels",
    { name: "Secret Room" },
    adminCookie,
  );
  assert.equal(createChannel.status, 201);
  const created = (await createChannel.json()) as { id: string };

  const userJoin = await postForm(baseUrl, "/join", {
    channelId: created.id,
    nickname: "Alice",
    avatar: "hoop",
  });
  assert.equal(userJoin.status, 302);
  const userCookie = setCookieHeader(userJoin);
  assert.ok(userCookie);

  const chatPage = await fetch(`${baseUrl}/chat/${encodeURIComponent(created.id)}`, {
    headers: { cookie: userCookie },
  });
  const chatHtml = await chatPage.text();
  assert.equal(chatPage.status, 200);
  assert.match(chatHtml, /<div id="root"><\/div>/);

  const chatSession = await fetch(`${baseUrl}/api/chat/${encodeURIComponent(created.id)}`, {
    headers: { cookie: userCookie },
  });
  assert.equal(chatSession.status, 200);
  const chatSessionJson = (await chatSession.json()) as {
    channel: { name: string };
    user: { nickname: string };
  };
  assert.equal(chatSessionJson.channel.name, "Secret Room");
  assert.equal(chatSessionJson.user.nickname, "Alice");

  const firstSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie: userCookie },
  });
  onTestFinished(() => firstSocket.close());

  const history = await waitForWebSocketMessage(
    firstSocket,
    (message) => message.type === "history",
  );
  assert.deepEqual(history.messages, []);

  const plaintext = "PRIVATE_PLAINTEXT_SHOULD_NOT_APPEAR";
  firstSocket.send(JSON.stringify({ type: "message", text: plaintext }));

  const broadcast = await waitForWebSocketMessage(
    firstSocket,
    (message) => message.type === "message" && message.text === plaintext,
  );
  assert.equal(broadcast.nickname, "Alice");
  assert.equal(broadcast.avatar, "hoop");
  assert.match(String(broadcast.id), /^message_/);
  assert.equal(typeof broadcast.userId, "string");
  firstSocket.close();

  const messageFile = path.join(dataDir, "messages", `${created.id}.jsonl`);
  const encryptedFile = await fs.readFile(messageFile, "utf8");
  assert.doesNotMatch(encryptedFile, new RegExp(plaintext));
  assert.match(encryptedFile, /"alg":"aes-256-gcm"/);

  const secondSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie: userCookie },
  });
  onTestFinished(() => secondSocket.close());

  const restoredHistory = await waitForWebSocketMessage(
    secondSocket,
    (message) => message.type === "history",
  );
  const restoredMessages = restoredHistory.messages as Array<{
    nickname: string;
    avatar: string;
    userId: string;
    text: string;
  }>;
  assert.equal(restoredMessages.length, 1);
  assert.equal(restoredMessages[0]?.nickname, "Alice");
  assert.equal(restoredMessages[0]?.avatar, "hoop");
  assert.equal(restoredMessages[0]?.userId, broadcast.userId);
  assert.equal(restoredMessages[0]?.text, plaintext);
});

test("serves installable PWA metadata and service worker", async () => {
  const { baseUrl } = await startServer();

  const manifest = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  const manifestJson = (await manifest.json()) as {
    start_url: string;
    display: string;
    icons: Array<{ sizes: string }>;
  };
  assert.equal(manifestJson.start_url, "/?source=pwa");
  assert.equal(manifestJson.display, "standalone");
  assert.deepEqual(
    manifestJson.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );

  const worker = await fetch(`${baseUrl}/service-worker.js`);
  assert.equal(worker.status, 200);
  assert.match(await worker.text(), /notificationclick/);
});

test("rate-limits websocket messages", async () => {
  const { baseUrl, port } = await startServer();

  const adminLogin = await postForm(baseUrl, "/admin/login", { password: "test-admin" });
  const adminCookie = setCookieHeader(adminLogin);
  const createChannel = await postForm(
    baseUrl,
    "/api/admin/channels",
    { name: "Rate Room" },
    adminCookie,
  );
  assert.equal(createChannel.status, 201);
  const created = (await createChannel.json()) as { id: string };

  const userJoin = await postForm(baseUrl, "/join", {
    channelId: created.id,
    nickname: "Bob",
  });
  const userCookie = setCookieHeader(userJoin);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie: userCookie },
  });
  onTestFinished(() => socket.close());

  await waitForWebSocketMessage(socket, (message) => message.type === "history");

  for (let index = 0; index < 9; index += 1) {
    socket.send(JSON.stringify({ type: "message", text: `message ${index}` }));
  }

  const rateLimitError = await waitForWebSocketMessage(
    socket,
    (message) =>
      message.type === "error" && String(message.message).includes("shaker is still moving"),
  );
  assert.equal(rateLimitError.message, "Slow down; the shaker is still moving");
});
