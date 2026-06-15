export type ChannelSummary = {
  id: string;
  name: string;
  notice?: string;
};

export type AdminUser = {
  id: string;
  nickname: string;
  password?: string | null;
};

export type AdminChannel = ChannelSummary & {
  users: AdminUser[];
};

export type ChatSession = {
  channel: ChannelSummary;
  user: AdminUser;
};

export type ChatMessage = {
  type: "message";
  userId: string;
  nickname: string;
  text: string;
  time: string;
};
