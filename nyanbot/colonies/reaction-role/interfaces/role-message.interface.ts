export interface RoleMessageConfig {
  id: string;
  channel: string;
  content: string;
  reactions: {
    emoji: string;
    value: string;
    action: {
      type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH';
    };
  }[];
}

export interface PostedRoleMessage {
  configId: string; // Which config generated this message
  guildId: string;
  channelId: string;
  messageId: string; // The ID of the message on Discord
  postedAt: Date;
}