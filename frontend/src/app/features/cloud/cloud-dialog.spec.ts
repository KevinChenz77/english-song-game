import { TestBed } from '@angular/core/testing';
import { KidsStore } from '../../core/kids-store';
import { mergeImport } from './cloud-dialog';

describe('mergeImport', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('rewardsV2', 'true');
  });

  it('新增不同名、同名依 ask 決定、名字太長略過', async () => {
    const store = TestBed.inject(KidsStore);
    const ming = store.add('小明', '🐱', { songs: { a: { listen: true } }, stickers: ['🎤'] })!;
    const hua = store.add('小華', '🐶')!;
    const asked: string[] = [];
    const r = await mergeImport(
      store,
      [
        { name: '小明', avatar: '🦊', songs: { b: { singAll: true } }, stickers: ['👑'] },
        { name: '小華', avatar: '🐼', songs: {}, stickers: ['⛄'] },
        { name: '小美', avatar: '🐰', songs: {}, stickers: [] },
        { name: '一二三四五六七八九十一', avatar: '🐰', songs: {}, stickers: [] },
      ],
      async (mine) => (asked.push(mine.name), mine.id === ming.id),
    );
    expect(r).toEqual({ added: 1, updated: 1, skipped: 1 });
    expect(asked).toEqual(['小明', '小華']);
    expect(store.byId(ming.id)).toEqual({ ...ming, avatar: '🦊', songs: { b: { singAll: true } }, stickers: ['👑'] });
    expect(store.byId(hua.id)).toEqual(hua);
    expect(store.kids().map((k) => k.name)).toEqual(['小明', '小華', '小美']);
  });
});
