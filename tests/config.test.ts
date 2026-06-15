import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test, vi } from "vitest";

async function importConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, undefined);
    else vi.stubEnv(key, value);
  }
  return import("../src/config.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("config derives data paths and numeric limits from the environment", async () => {
  const config = await importConfig({
    DATA_DIR: "tmp/chat-data",
    INITIAL_CHANNELS_PATH: "fixtures/channels.json",
    PORT: "4321",
    NODE_ENV: "development",
  });

  assert.equal(config.port, 4321);
  assert.equal(config.dataDir, path.resolve("tmp/chat-data"));
  assert.equal(config.messagesDir, path.join(path.resolve("tmp/chat-data"), "messages"));
  assert.equal(config.channelsPath, path.join(path.resolve("tmp/chat-data"), "channels.json"));
  assert.equal(config.initialChannelsPath, path.resolve("fixtures/channels.json"));
  assert.equal(config.maxMessageLength, 1000);
  assert.equal(config.maxHistoryMessages, 100);
});

test("requireProductionSecrets reports missing production secrets", async () => {
  const config = await importConfig({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "",
    COOKIE_SECRET: undefined,
    MESSAGE_SECRET: undefined,
  });

  assert.throws(
    () => config.requireProductionSecrets(),
    /Missing required production environment variables: ADMIN_PASSWORD, COOKIE_SECRET, MESSAGE_SECRET/,
  );
});

test("requireProductionSecrets rejects reused cookie and message secrets in production", async () => {
  const config = await importConfig({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "admin",
    COOKIE_SECRET: "same-secret",
    MESSAGE_SECRET: "same-secret",
  });

  assert.throws(
    () => config.requireProductionSecrets(),
    /COOKIE_SECRET and MESSAGE_SECRET must be different/,
  );
});

test("requireProductionSecrets allows separate production secrets", async () => {
  const config = await importConfig({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "admin",
    COOKIE_SECRET: "cookie-secret",
    MESSAGE_SECRET: "message-secret",
  });

  assert.doesNotThrow(() => config.requireProductionSecrets());
});
