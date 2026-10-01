import type { WebSocket } from "ws";
import type { PatronFaceId } from "./avatars.js";

export type StoredUser = {
  id: string;
  nickname: string;
  avatar?: PatronFaceId;
};

export type StoredChannel = {
  id: string;
  name: string;
  notice?: string;
  maxSeats: number;
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
  id?: string;
  userId: string;
  nickname: string;
  avatar?: PatronFaceId;
  text: string;
  time: string;
};

export type AuthedSocket = WebSocket & {
  channelId?: string;
  userId?: string;
  nickname?: string;
  rateLimitKey?: string;
  isAlive?: boolean;
};

export type RateLimitBucket = {
  count: number;
  resetAt: number;
};
