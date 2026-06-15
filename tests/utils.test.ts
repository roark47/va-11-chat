import assert from "node:assert/strict";
import { test } from "vitest";
import { escapeHtml, slugify } from "../src/utils.js";

test("escapeHtml escapes characters that can break out of markup", () => {
  assert.equal(
    escapeHtml(`Tom & "Jill" <script>'x'</script>`),
    "Tom &amp; &quot;Jill&quot; &lt;script&gt;&#39;x&#39;&lt;/script&gt;",
  );
});

test("slugify normalizes labels into bounded URL-safe ids", () => {
  assert.equal(slugify("  Fancy Room! 11 / Night_shift  "), "fancy-room-11-night_shift");
  assert.equal(slugify("x".repeat(80)), "x".repeat(48));
});
