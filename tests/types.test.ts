import { expectTypeOf, test } from "vitest";
import type {
  AuthedSocket,
  ChannelsFile,
  ChatMessage,
  RateLimitBucket,
  Session,
  StoredChannel,
  StoredUser,
} from "../src/types.js";

test("chat domain types require the fields used by storage and sessions", () => {
  expectTypeOf<StoredUser>().toMatchTypeOf<{
    id: string;
    nickname: string;
    passwordHash: string;
    encryptedPassword?: string;
  }>();
  expectTypeOf<StoredChannel>().toMatchTypeOf<{
    id: string;
    name: string;
    notice?: string;
    users: StoredUser[];
  }>();
  expectTypeOf<ChannelsFile>().toMatchTypeOf<{ channels: StoredChannel[] }>();
  expectTypeOf<ChatMessage>().toMatchTypeOf<{
    type: "message";
    userId: string;
    nickname: string;
    text: string;
    time: string;
  }>();
});

test("connection helper types model signed sessions and rate buckets", () => {
  expectTypeOf<Session>().toEqualTypeOf<
    | { role: "admin"; channelId?: string; userId?: string; nickname?: string }
    | { role: "user"; channelId?: string; userId?: string; nickname?: string }
  >();
  expectTypeOf<RateLimitBucket>().toMatchTypeOf<{ count: number; resetAt: number }>();
  expectTypeOf<AuthedSocket>().toHaveProperty("channelId").toEqualTypeOf<string | undefined>();
  expectTypeOf<AuthedSocket>().toHaveProperty("rateLimitKey").toEqualTypeOf<string | undefined>();
});
