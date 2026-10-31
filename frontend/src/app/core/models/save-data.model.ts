import { Kid } from './kid.model';

/** 雲端存檔格式（跟後端約定）。 */
export type SavedPlayer = Omit<Kid, 'id'>;

export interface SaveData {
  version: 1;
  savedAt: string;
  players: SavedPlayer[];
}
