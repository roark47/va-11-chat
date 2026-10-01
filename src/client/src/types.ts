import type { PatronFaceId } from "../../avatars";

export type ChannelSummary = {
  id: string;
  name: string;
  notice?: string;
  maxSeats?: number;
  onlineCount?: number;
};

export type AdminUser = {
  id: string;
  nickname: string;
  avatar?: PatronFaceId;
  online?: boolean;
};

export type AdminChannel = ChannelSummary & {
  maxSeats: number;
  onlineCount: number;
  users: AdminUser[];
};

export type ChatSession = {
  channel: ChannelSummary;
  user: AdminUser;
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
