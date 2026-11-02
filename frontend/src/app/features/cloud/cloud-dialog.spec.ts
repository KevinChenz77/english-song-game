import { TestBed } from '@angular/core/testing';
import { Api } from '../../core/api';
import { KidsStore } from '../../core/kids-store';
import { SongCatalog } from '../../core/song-catalog';
import { Cloud, CloudDialog, mergeImport } from './cloud-dialog';

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
      async (mine) => {
        asked.push(mine.name);
        return mine.id === ming.id;
      },
    );
    expect(r).toEqual({ added: 1, updated: 1, skipped: 1 });
    expect(asked).toEqual(['小明', '小華']);
    expect(store.byId(ming.id)).toEqual({ ...ming, avatar: '🦊', songs: { b: { singAll: true } }, stickers: ['👑'] });
    expect(store.byId(hua.id)).toEqual(hua);
    expect(store.kids().map((k) => k.name)).toEqual(['小明', '小華', '小美']);
  });
});

describe('CloudDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom 沒有 showModal／close
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('匯入格式壞掉 → 「存檔格式不對」，不動本機小朋友', async () => {
    const load = vi.fn(async () => ({ players: [{ name: 1 }] }));
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { load } },
        { provide: SongCatalog, useValue: { songs: { hasValue: () => false } } },
      ],
    });
    const f = TestBed.createComponent(CloudDialog);
    await f.whenStable();
    TestBed.inject(Cloud).open('load');
    await f.whenStable();

    const el: HTMLElement = f.nativeElement;
    const [name, pw] = Array.from(el.querySelectorAll('input'));
    name.value = 'family';
    name.dispatchEvent(new Event('input'));
    pw.value = 'abcd1234';
    pw.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('family', 'abcd1234'));
    await f.whenStable();

    expect(el.querySelector('.msg')!.textContent).toBe('存檔格式不對');
    expect(el.querySelector('.msg')!.classList).toContain('bad');
    expect(TestBed.inject(KidsStore).kids()).toEqual([]);
  });
});
