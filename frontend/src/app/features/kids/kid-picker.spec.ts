import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { KidPicker } from './kid-picker';

describe('KidPicker 管理模式', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('rewardsV2', 'true');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('平常沒有刪除鍵；✏️ 管理才出現，確認文字有名字；完成後又藏起來', async () => {
    const store = TestBed.inject(KidsStore);
    store.add('小明', '🐱');
    const f = TestBed.createComponent(KidPicker);
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent!.includes(t))!;
    expect(el.querySelector('.del')).toBeNull();

    btn('管理').click();
    await f.whenStable();
    const del = el.querySelector<HTMLButtonElement>('.del')!;
    expect(del.getAttribute('aria-label')).toBe('刪除 小明');

    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    del.click();
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('小明'));
    expect(store.kids().length).toBe(1);

    btn('完成').click();
    await f.whenStable();
    expect(el.querySelector('.del')).toBeNull();
  });
});
