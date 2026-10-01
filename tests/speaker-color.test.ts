import assert from "node:assert/strict";
import { test } from "vitest";
import { hashSpeakerKey, speakerToneFor } from "../src/client/src/shared/speaker-color.ts";

test("speakerToneFor is stable for the same userId", () => {
  const first = speakerToneFor("user_abc");
  const second = speakerToneFor("user_abc");
  assert.deepEqual(first, second);
});

test("different userIds usually land on different tones", () => {
  const a = speakerToneFor("user_alice");
  const b = speakerToneFor("user_bob");
  const c = speakerToneFor("user_cara");
  const distinct = new Set([a.ink, b.ink, c.ink]);
  assert.ok(distinct.size >= 2);
});

test("hashSpeakerKey is deterministic", () => {
  assert.equal(hashSpeakerKey("seat"), hashSpeakerKey("seat"));
});
