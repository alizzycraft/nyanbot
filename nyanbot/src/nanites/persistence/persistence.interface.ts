import { Command } from '../../swarm/interfaces/command.interface';

export const PERSISTENCE_SAVE_STATE_COMMAND = 'persistence:saveState';
export const PERSISTENCE_LOAD_STATE_COMMAND = 'persistence:loadState';

// --- Save State Command ---
export interface PersistenceSaveStateCommandPayload<T> {
  key: string;
  data: T;
  onSave?: () => void;
}
export type PersistenceSaveStateCommand<T> = Command<
  PersistenceSaveStateCommandPayload<T>
>;
export const isPersistenceSaveStateCommand = (
  command: Command,
): command is PersistenceSaveStateCommand<any> =>
  command.type === PERSISTENCE_SAVE_STATE_COMMAND;

// --- Load State Command ---
export interface PersistenceLoadStateCommandPayload {
  key: string;
}
export type PersistenceLoadStateCommand =
  Command<PersistenceLoadStateCommandPayload>;
export const isPersistenceLoadStateCommand = (
  command: Command,
): command is PersistenceLoadStateCommand =>
  command.type === PERSISTENCE_LOAD_STATE_COMMAND;
