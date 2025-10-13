import { RoleMessageConfig } from './interfaces/role-message.interface';

export const roleMessageConfigs: RoleMessageConfig[] = [
  {
    id: 'pronoun-roles',
    channel: 'roles',
    selectionType: 'single', // Only one pronoun selection allowed
    content:
      'React to have your pronouns added to your nickname. You can only pick one!\n\n' +
      '💙 - He/Him\n' +
      '💖 - She/Her\n' +
      '💚 - They/Them\n' +
      '💜 - Any/All',
    reactions: [
      { emoji: '💙', value: 'He/Him', action: { type: 'UPDATE_NICKNAME' } },
      { emoji: '💖', value: 'She/Her', action: { type: 'UPDATE_NICKNAME' } },
      { emoji: '💚', value: 'They/Them', action: { type: 'UPDATE_NICKNAME' } },
      { emoji: '💜', value: 'Any/All', action: { type: 'UPDATE_NICKNAME' } },
    ],
  },
  {
    id: 'political-leaning-roles',
    channel: 'roles',
    selectionType: 'single', // Only one political alignment allowed
    content:
      'Choose a role to identify your general political alignment.\n\n' +
      '🟥 - Left\n' +
      '🟧 - Center-Left\n' +
      '🟨 - Center\n' +
      '🟩 - Center-Right\n' +
      '🟦 - Right',
    reactions: [
      { emoji: '🟥', value: 'L', action: { type: 'BOTH' } },
      { emoji: '🟧', value: 'CL', action: { type: 'BOTH' } },
      { emoji: '🟨', value: 'C', action: { type: 'BOTH' } },
      { emoji: '🟩', value: 'CR', action: { type: 'BOTH' } },
      { emoji: '🟦', value: 'R', action: { type: 'BOTH' } },
    ],
  },
];