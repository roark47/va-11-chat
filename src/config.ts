import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(__dirname, "..");
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(projectRoot, "data");
export const messagesDir = path.join(dataDir, "messages");
export const channelsPath = path.join(dataDir, "channels.json");
export const initialChannelsPath = process.env.INITIAL_CHANNELS_PATH
  ? path.resolve(process.env.INITIAL_CHANNELS_PATH)
  : "";

export const port = Number(process.env.PORT ?? 3000);
export const isProduction = process.env.NODE_ENV === "production";
export const adminPassword = process.env.ADMIN_PASSWORD ?? "";
export const cookieSecret = process.env.COOKIE_SECRET ?? "development-secret-change-me";
export const messageSecret = process.env.MESSAGE_SECRET ?? (isProduction ? "" : cookieSecret);
export const sessionCookieName = "chat_session";

export const maxMessageLength = 1000;
export const maxHistoryMessages = 100;
export const loginRateLimitWindowMs = 10 * 60 * 1000;
export const loginRateLimitMax = 10;
export const messageRateLimitWindowMs = 10 * 1000;
export const messageRateLimitMax = 8;

export function requireProductionSecrets(): void {
  if (!isProduction) return;

  const missing = [];
  if (!adminPassword) missing.push("ADMIN_PASSWORD");
  if (!process.env.COOKIE_SECRET) missing.push("COOKIE_SECRET");
  if (!process.env.MESSAGE_SECRET) missing.push("MESSAGE_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (cookieSecret === messageSecret) {
    throw new Error("COOKIE_SECRET and MESSAGE_SECRET must be different in production.");
  }
}
