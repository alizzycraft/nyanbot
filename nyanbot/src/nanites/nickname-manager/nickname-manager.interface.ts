export interface NicknameParts {
  pronoun?: string;
  politics?: string;
}

export interface UpdateNicknamePayload {
  userId: string;
  guildId: string;
  pronoun?: string;
  politics?: string;
}

export interface GetNicknamePartsPayload {
  userId: string;
}