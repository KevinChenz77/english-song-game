import { TestBed } from '@angular/core/testing';
import { SongCard } from './song-card';

describe('SongCard', () => {
  it('最難全對 → gold 金框；星星字串含 👑', async () => {
    const f = TestBed.createComponent(SongCard);
    f.componentRef.setInput('song', { emoji: '🎵', title: 'Test Song', from: 'Nowhere' });
    f.componentRef.setInput('progress', { listen: true });
    await f.whenStable();
    const host: HTMLElement = f.nativeElement;
    expect(host.classList).toContain('card');
    expect(host.classList).not.toContain('gold');

    f.componentRef.setInput('progress', { listen: true, singAll: true, expert: true });
    await f.whenStable();
    expect(host.classList).toContain('gold');
    expect(host.textContent).toContain('⭐⭐☆☆ 👑');
  });

  it('非英文歌才有語言小標籤', async () => {
    const f = TestBed.createComponent(SongCard);
    f.componentRef.setInput('song', { emoji: '🎵', title: 'T', from: 'F' });
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.lang')).toBeNull();
    f.componentRef.setInput('song', { emoji: '🎵', title: 'T', from: 'F', lang: 'ja' });
    await f.whenStable();
    expect(el.querySelector('.lang')?.textContent).toBe('日文');
  });
});
