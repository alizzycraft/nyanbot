export interface RoleMessageConfig {
  id: string;
  channel: string;
  content: string;
  action: {
    type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME';
  };
  reactions: {
    emoji: string;
    value: string;
  }[];
}

export interface PostedRoleMessage {
  configId: string; // Which config generated this message
  guildId: string;
  channelId: string;
  messageId: string; // The ID of the message on Discord
  postedAt: Date;
}
