import { resource } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SongCatalog } from '../../core/song-catalog';
import { STAR_KEYS } from '../../core/game/reward-rules';
import { Help } from './help';

describe('Help', () => {
  it('小朋友版三張卡在上、家長區預設收起；範例小卡用清單第一首、含金卡', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SongCatalog,
          useFactory: () => ({
            songs: resource({ loader: async () => [{ emoji: '🎵', title: 'Test Song', from: 'Nowhere', sticker: '🧪' }] }),
          }),
        },
      ],
    });
    const f = TestBed.createComponent(Help);
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelectorAll('.modes li').length).toBe(3);
    const parent = el.querySelector('details.parent') as HTMLDetailsElement;
    expect(parent.open).toBe(false);
    expect(parent.textContent).toContain('🧪');
    expect(el.querySelector('.big-line')!.textContent).toContain(`${STAR_KEYS.length} 顆星星`);
    expect(el.querySelectorAll('app-song-card').length).toBe(5);
    expect(el.querySelectorAll('app-song-card.gold').length).toBe(1);
  });
});
