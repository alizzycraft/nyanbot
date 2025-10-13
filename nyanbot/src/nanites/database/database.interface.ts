export interface DatabaseSetCommandPayload<T> {
  key: string;
  value: T;
}

export interface DatabaseGetCommandPayload {
  key: string;
}

export function isDatabaseSetCommand(
  command: any,
): command is { payload: DatabaseSetCommandPayload<any> } {
  return command?.type === 'database:set';
}

export function isDatabaseGetCommand(
  command: any,
): command is { payload: DatabaseGetCommandPayload } {
  return command?.type === 'database:get';
}