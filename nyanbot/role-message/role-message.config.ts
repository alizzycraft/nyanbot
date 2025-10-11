import { RoleMessageConfig } from './interfaces/role-message.interface';

export const roleMessageConfigs: RoleMessageConfig[] = [
  {
    id: 'pronoun-roles',
    channel: 'roles',
    content:
      'React to have your pronouns added to your nickname. You can pick multiple!\n\n' +
      '💙 - He/Him\n' +
      '💖 - She/Her\n' +
      '💚 - They/Them\n' +
      '💜 - Any/All',
    action: {
      type: 'UPDATE_NICKNAME',
    },
    reactions: [
      { emoji: '💙', value: 'He/Him' },
      { emoji: '💖', value: 'She/Her' },
      { emoji: '💚', value: 'They/Them' },
      { emoji: '💜', value: 'Any/All' },
    ],
  },
  {
    id: 'political-leaning-roles',
    channel: 'roles',
    content:
      'Choose a role to identify your general political alignment.\n\n' +
      '🟥 - L\n' +
      '🟧 - CL\n' +
      '🟨 - C\n' +
      '🟩 - CR\n' +
      '🟦 - R',
    action: {
      type: 'UPDATE_NICKNAME',
    },
    reactions: [
      { emoji: '🟥', value: 'L' },
      { emoji: '🟧', value: 'CL' },
      { emoji: '🟨', value: 'C' },
      { emoji: '🟩', value: 'CR' },
      { emoji: '🟦', value: 'R' },
    ],
  },
];