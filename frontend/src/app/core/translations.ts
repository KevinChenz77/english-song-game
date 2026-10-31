import { load, save } from './storage';

// 家長在本機修改的整句中文（localStorage 'tr_<songId>'），覆蓋伺服器的翻譯。

export const localTranslations = (songId: string) => load<Record<string, string>>(`tr_${songId}`, {});

export function saveTranslation(songId: string, line: string, zh: string) {
  save(`tr_${songId}`, { ...localTranslations(songId), [line]: zh.trim() });
}
