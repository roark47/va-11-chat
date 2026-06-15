import type { WebSocket } from "ws";

export type StoredUser = {
  id: string;
  nickname: string;
  passwordHash: string;
  encryptedPassword?: string;
};

export type StoredChannel = {
  id: string;
  name: string;
  notice?: string;
  users: StoredUser[];
};

export type ChannelsFile = {
  channels: StoredChannel[];
};

export type Session = {
  role: "admin" | "user";
  channelId?: string;
  userId?: string;
  nickname?: string;
};

export type ChatMessage = {
  type: "message";
  userId: string;
  nickname: string;
  text: string;
  time: string;
};

export type AuthedSocket = WebSocket & {
  channelId?: string;
  userId?: string;
  nickname?: string;
  rateLimitKey?: string;
};

export type RateLimitBucket = {
  count: number;
  resetAt: number;
};
