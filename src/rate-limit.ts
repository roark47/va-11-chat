import type http from "node:http";
import type express from "express";
import { loginRateLimitMax, loginRateLimitWindowMs } from "./config.js";
import type { RateLimitBucket } from "./types.js";

const loginRateLimits = new Map<string, RateLimitBucket>();

export function clientIp(req: express.Request | http.IncomingMessage): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function isRateLimited(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  current.count += 1;
  return current.count > max;
}

export function rateLimitLogin(req: express.Request, res: express.Response): boolean {
  const key = `login:${clientIp(req)}`;
  if (!isRateLimited(loginRateLimits, key, loginRateLimitMax, loginRateLimitWindowMs)) {
    return false;
  }

  res.status(429).send("The door needs a minute. Try again later.");
  return true;
}
