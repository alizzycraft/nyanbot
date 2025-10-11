export interface Command<T = any> {
  type: string;
  payload: T;
}
