import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  channelsPath,
  initialChannelsPath,
  maxHistoryMessages,
  messageSecret,
  messagesDir,
} from "./config.js";
import type { ChannelsFile, ChatMessage } from "./types.js";

export async function ensureDataFiles(): Promise<void> {
  await fs.mkdir(messagesDir, { recursive: true });
  try {
    await fs.access(channelsPath);
  } catch {
    if (initialChannelsPath) {
      const initialChannels = JSON.parse(
        await fs.readFile(initialChannelsPath, "utf8"),
      ) as ChannelsFile;
      await fs.writeFile(channelsPath, JSON.stringify(initialChannels, null, 2));
      return;
    }

    await fs.writeFile(channelsPath, JSON.stringify({ channels: [] }, null, 2));
  }
}

export async function readChannels(): Promise<ChannelsFile> {
  await ensureDataFiles();
  const raw = await fs.readFile(channelsPath, "utf8");
  return JSON.parse(raw) as ChannelsFile;
}

export async function writeChannels(data: ChannelsFile): Promise<void> {
  await ensureDataFiles();
  await fs.writeFile(channelsPath, JSON.stringify(data, null, 2));
}

function messageEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(messageSecret).digest();
}

function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", messageEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: ciphertext.toString("base64url"),
  });
}

function decryptJson<T>(line: string): T | null {
  try {
    const payload = JSON.parse(line) as {
      v?: number;
      alg?: string;
      iv?: string;
      tag?: string;
      data?: string;
    };
    if (
      payload.v !== 1 ||
      payload.alg !== "aes-256-gcm" ||
      !payload.iv ||
      !payload.tag ||
      !payload.data
    ) {
      return null;
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      messageEncryptionKey(),
      Buffer.from(payload.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

function encryptMessage(message: ChatMessage): string {
  return encryptJson(message);
}

export function encryptPasswordForAdminCopy(password: string): string {
  return encryptJson({ password });
}

export function decryptPasswordForAdminCopy(encryptedPassword: string | undefined): string | null {
  if (!encryptedPassword) return null;
  const payload = decryptJson<{ password?: unknown }>(encryptedPassword);
  return typeof payload?.password === "string" ? payload.password : null;
}

function isEncryptedMessageLine(line: string): boolean {
  try {
    const payload = JSON.parse(line) as { v?: number; alg?: string };
    return payload.v === 1 && payload.alg === "aes-256-gcm";
  } catch {
    return false;
  }
}

function parseLegacyPlaintextMessage(line: string): ChatMessage | null {
  try {
    const payload = JSON.parse(line) as Partial<ChatMessage>;
    if (
      payload.type === "message" &&
      typeof payload.userId === "string" &&
      typeof payload.nickname === "string" &&
      typeof payload.text === "string" &&
      typeof payload.time === "string"
    ) {
      return payload as ChatMessage;
    }
    return null;
  } catch {
    return null;
  }
}

function decryptMessage(line: string): ChatMessage | null {
  return decryptJson<ChatMessage>(line);
}

export async function migratePlaintextMessages(): Promise<void> {
  await fs.mkdir(messagesDir, { recursive: true });
  const entries = await fs.readdir(messagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

    const filePath = path.join(messagesDir, entry.name);
    const lines = (await fs.readFile(filePath, "utf8")).split("\n").filter(Boolean);
    let changed = false;
    const migratedLines = lines.map((line) => {
      if (isEncryptedMessageLine(line)) return line;

      const legacyMessage = parseLegacyPlaintextMessage(line);
      if (!legacyMessage) return line;

      changed = true;
      return encryptMessage(legacyMessage);
    });

    if (changed) {
      await fs.writeFile(filePath, `${migratedLines.join("\n")}\n`);
    }
  }
}

function safeMessageFile(channelId: string): string {
  return path.join(messagesDir, `${channelId.replace(/[^a-zA-Z0-9_-]/g, "")}.jsonl`);
}

export async function readHistory(channelId: string): Promise<ChatMessage[]> {
  try {
    const raw = await fs.readFile(safeMessageFile(channelId), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-maxHistoryMessages)
      .map(decryptMessage)
      .filter((message): message is ChatMessage => message !== null);
  } catch {
    return [];
  }
}

export async function saveMessage(channelId: string, message: ChatMessage): Promise<void> {
  await fs.mkdir(messagesDir, { recursive: true });
  const filePath = safeMessageFile(channelId);
  const current = await readHistory(channelId);
  current.push(message);
  const trimmed = current.slice(-maxHistoryMessages);
  await fs.writeFile(filePath, `${trimmed.map(encryptMessage).join("\n")}\n`);
}

export async function deleteHistory(channelId: string): Promise<void> {
  await fs.rm(safeMessageFile(channelId), { force: true });
}
