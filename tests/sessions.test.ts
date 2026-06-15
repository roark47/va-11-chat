import assert from "node:assert/strict";
import { test } from "vitest";
import {
  clearSessionCookie,
  getSessionFromCookie,
  isAdmin,
  setSessionCookie,
} from "../src/sessions.js";
import { sessionCookieName } from "../src/config.js";

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

test("setSessionCookie writes a signed http-only session that can be read back", () => {
  let setCookie = "";
  const res = {
    setHeader(name: string, value: string) {
      assert.equal(name, "Set-Cookie");
      setCookie = value;
    },
  };

  setSessionCookie(res as never, {
    role: "user",
    channelId: "room",
    userId: "user_1",
    nickname: "Dana",
  });

  assert.match(setCookie, new RegExp(`^${sessionCookieName}=`));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.deepEqual(getSessionFromCookie(cookieValue(setCookie)), {
    role: "user",
    channelId: "room",
    userId: "user_1",
    nickname: "Dana",
  });
});

test("getSessionFromCookie rejects tampered signatures", () => {
  let setCookie = "";
  setSessionCookie(
    {
      setHeader(_name: string, value: string) {
        setCookie = value;
      },
    } as never,
    { role: "admin" },
  );

  const [name, encoded] = cookieValue(setCookie).split("=");
  const tampered = `${name}=${encoded!.replace(/\.[^.]+$/, ".bad-signature")}`;
  assert.equal(getSessionFromCookie(tampered), null);
});

test("clearSessionCookie expires the session and isAdmin checks the signed role", () => {
  let setCookie = "";
  clearSessionCookie({
    setHeader(_name: string, value: string) {
      setCookie = value;
    },
  } as never);

  assert.match(setCookie, new RegExp(`^${sessionCookieName}=`));
  assert.match(setCookie, /Max-Age=0/);

  let adminCookie = "";
  setSessionCookie(
    {
      setHeader(_name: string, value: string) {
        adminCookie = value;
      },
    } as never,
    { role: "admin" },
  );

  assert.equal(isAdmin({ headers: { cookie: cookieValue(adminCookie) } } as never), true);
  assert.equal(isAdmin({ headers: { cookie: "" } } as never), false);
});
