import assert from "node:assert/strict";
import { test } from "vitest";
import { hashPassword, randomId, verifyPassword } from "../src/passwords.js";

test("hashPassword creates salted scrypt hashes that verify the original password only", async () => {
  const first = await hashPassword("house-secret");
  const second = await hashPassword("house-secret");

  assert.match(first, /^scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("house-secret", first), true);
  assert.equal(await verifyPassword("wrong-secret", first), false);
});

test("verifyPassword rejects malformed hashes instead of throwing", async () => {
  assert.equal(await verifyPassword("house-secret", "plain-text"), false);
  assert.equal(await verifyPassword("house-secret", "scrypt::missing"), false);
});

test("randomId prefixes high-entropy hexadecimal ids", () => {
  assert.match(randomId("user"), /^user_[a-f0-9]{16}$/);
});
