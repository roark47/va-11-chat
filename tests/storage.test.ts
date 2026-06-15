import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, onTestFinished, test, vi } from "vitest";
import type { ChatMessage, ChannelsFile } from "../src/types.js";

async function tempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "va-11-storage-"));
  onTestFinished(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function importStorage(dataDir: string, extraEnv: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("MESSAGE_SECRET", extraEnv.MESSAGE_SECRET ?? "storage-message-secret");
  vi.stubEnv("NODE_ENV", extraEnv.NODE_ENV ?? "test");
  if (extraEnv.INITIAL_CHANNELS_PATH) {
    vi.stubEnv("INITIAL_CHANNELS_PATH", extraEnv.INITIAL_CHANNELS_PATH);
  }
  return import("../src/storage.js");
}

function message(index: number): ChatMessage {
  return {
    type: "message",
    userId: `user_${index}`,
    nickname: `Guest ${index}`,
    text: `message ${index}`,
    time: `2026-06-15T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("ensureDataFiles initializes channels from INITIAL_CHANNELS_PATH", async () => {
  const dataDir = await tempDir();
  const initialPath = path.join(dataDir, "initial.json");
  const initialChannels: ChannelsFile = {
    channels: [{ id: "room", name: "Room", users: [] }],
  };
  await fs.writeFile(initialPath, JSON.stringify(initialChannels));

  const storage = await importStorage(dataDir, { INITIAL_CHANNELS_PATH: initialPath });
  await storage.ensureDataFiles();

  assert.deepEqual(await storage.readChannels(), initialChannels);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, "channels.json"), "utf8")), {
    channels: [{ id: "room", name: "Room", users: [] }],
  });
});

test("writeChannels persists channel data after creating missing files", async () => {
  const dataDir = await tempDir();
  const storage = await importStorage(dataDir);
  const channels: ChannelsFile = {
    channels: [{ id: "late-shift", name: "Late Shift", notice: "Open", users: [] }],
  };

  await storage.writeChannels(channels);

  assert.deepEqual(await storage.readChannels(), channels);
});

test("admin password copies are encrypted and only decrypt with the message secret", async () => {
  const dataDir = await tempDir();
  const storage = await importStorage(dataDir, { MESSAGE_SECRET: "first-secret" });

  const encrypted = storage.encryptPasswordForAdminCopy("seat-password");

  assert.doesNotMatch(encrypted, /seat-password/);
  assert.equal(storage.decryptPasswordForAdminCopy(encrypted), "seat-password");
  assert.equal(storage.decryptPasswordForAdminCopy(undefined), null);

  const otherSecretStorage = await importStorage(dataDir, { MESSAGE_SECRET: "second-secret" });
  assert.equal(otherSecretStorage.decryptPasswordForAdminCopy(encrypted), null);
});

test("saveMessage stores encrypted history, trims old messages, and sanitizes channel filenames", async () => {
  const dataDir = await tempDir();
  const storage = await importStorage(dataDir);

  for (let index = 0; index < 105; index += 1) {
    await storage.saveMessage("../room?!", message(index));
  }

  const history = await storage.readHistory("../room?!");
  assert.equal(history.length, 100);
  assert.equal(history[0]!.text, "message 5");
  assert.equal(history.at(-1)!.text, "message 104");

  const raw = await fs.readFile(path.join(dataDir, "messages", "room.jsonl"), "utf8");
  assert.doesNotMatch(raw, /message 104/);
  assert.match(raw, /"alg":"aes-256-gcm"/);
});

test("migratePlaintextMessages encrypts valid legacy lines and leaves invalid lines unreadable", async () => {
  const dataDir = await tempDir();
  const storage = await importStorage(dataDir);
  const messagesDir = path.join(dataDir, "messages");
  await fs.mkdir(messagesDir, { recursive: true });
  await fs.writeFile(
    path.join(messagesDir, "room.jsonl"),
    `${JSON.stringify(message(1))}\n{"type":"event","text":"not a chat message"}\n`,
  );

  await storage.migratePlaintextMessages();

  const raw = await fs.readFile(path.join(messagesDir, "room.jsonl"), "utf8");
  assert.doesNotMatch(raw.split("\n")[0]!, /message 1/);
  assert.match(raw.split("\n")[0]!, /"alg":"aes-256-gcm"/);
  assert.match(raw, /"type":"event"/);
  assert.deepEqual(await storage.readHistory("room"), [message(1)]);
});

test("deleteHistory removes the channel history file", async () => {
  const dataDir = await tempDir();
  const storage = await importStorage(dataDir);

  await storage.saveMessage("room", message(1));
  await storage.deleteHistory("room");

  assert.deepEqual(await storage.readHistory("room"), []);
});
