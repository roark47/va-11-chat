import crypto from "node:crypto";
import cookie from "cookie";
import type express from "express";
import { cookieSecret, isProduction, sessionCookieName } from "./config.js";
import type { Session } from "./types.js";

function sign(value: string): string {
  return crypto.createHmac("sha256", cookieSecret).update(value).digest("base64url");
}

function encodeSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature || sign(body) !== signature) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
  } catch {
    return null;
  }
}

export function getSessionFromCookie(header: string | undefined): Session | null {
  const parsed = cookie.parse(header ?? "");
  return decodeSession(parsed[sessionCookieName]);
}

export function setSessionCookie(res: express.Response, session: Session): void {
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(sessionCookieName, encodeSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    }),
  );
}

export function clearSessionCookie(res: express.Response): void {
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(sessionCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 0,
    }),
  );
}

export function isAdmin(req: express.Request): boolean {
  return getSessionFromCookie(req.headers.cookie)?.role === "admin";
}
