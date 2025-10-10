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
