import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { clientIp, isRateLimited, rateLimitLogin } from "../src/rate-limit.js";
import type { RateLimitBucket } from "../src/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("clientIp prefers the first forwarded address before socket fallback", () => {
  assert.equal(
    clientIp({
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.2" },
      socket: { remoteAddress: "127.0.0.1" },
    } as never),
    "203.0.113.8",
  );

  assert.equal(
    clientIp({ headers: {}, socket: { remoteAddress: "127.0.0.1" } } as never),
    "127.0.0.1",
  );
});

test("isRateLimited counts attempts inside a window and resets after expiry", () => {
  const buckets = new Map<string, RateLimitBucket>();
  vi.spyOn(Date, "now").mockReturnValue(1_000);

  assert.equal(isRateLimited(buckets, "login:1", 2, 500), false);
  assert.equal(isRateLimited(buckets, "login:1", 2, 500), false);
  assert.equal(isRateLimited(buckets, "login:1", 2, 500), true);

  vi.spyOn(Date, "now").mockReturnValue(1_501);
  assert.equal(isRateLimited(buckets, "login:1", 2, 500), false);
  assert.deepEqual(buckets.get("login:1"), { count: 1, resetAt: 2_001 });
});

test("rateLimitLogin sends a 429 response only after the login bucket is exhausted", () => {
  vi.spyOn(Date, "now").mockReturnValue(10_000);
  const req = {
    headers: { "x-forwarded-for": "198.51.100.25" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const sent: Array<{ status: number; body: string }> = [];
  const res = {
    status(code: number) {
      sent.push({ status: code, body: "" });
      return this;
    },
    send(body: string) {
      sent[sent.length - 1]!.body = body;
    },
  };

  for (let index = 0; index < 10; index += 1) {
    assert.equal(rateLimitLogin(req as never, res as never), false);
  }

  assert.equal(rateLimitLogin(req as never, res as never), true);
  assert.deepEqual(sent, [{ status: 429, body: "The door needs a minute. Try again later." }]);
});
