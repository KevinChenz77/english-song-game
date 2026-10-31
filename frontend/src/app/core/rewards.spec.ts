import { TestBed } from '@angular/core/testing';
import { KidsStore } from './kids-store';
import { Rewards } from './rewards';
import { Song } from './models/song.model';

const letitgo = { id: 'letitgo', sticker: '❄️' } as Song;
const snowman = { id: 'snowman', sticker: '⛄' } as Song;

describe('KidsStore + Rewards', () => {
  beforeEach(() => localStorage.clear());

  it('rewardsV2：舊進度只歸零一次，名字頭像保留', () => {
    localStorage.setItem('kids', JSON.stringify([{ id: 1, name: '小明', avatar: '🐶', songs: { x: { listen: true } }, stickers: ['🎤'] }]));
    const store = TestBed.inject(KidsStore);
    expect(store.kids()).toEqual([{ id: 1, name: '小明', avatar: '🐶', songs: {}, stickers: [] }]);
    expect(JSON.parse(localStorage.getItem('rewardsV2')!)).toBe(true);
    TestBed.resetTestingModule();
    localStorage.setItem('kids', JSON.stringify([{ id: 1, name: '小明', avatar: '🐶', songs: { x: { listen: true } }, stickers: [] }]));
    expect(TestBed.inject(KidsStore).kids()[0].songs).toEqual({ x: { listen: true } });
  });

  it('add：名字 1～10 字，id 不重複', () => {
    const store = TestBed.inject(KidsStore);
    expect(store.add('一二三四五六七八九十一', '🐱')).toBeNull();
    const a = store.add(' 小明 ', '🐱')!;
    const b = store.add('小華', '🐶')!;
    expect(a.name).toBe('小明');
    expect(a.id).not.toBe(b.id);
    expect(JSON.parse(localStorage.getItem('kids')!)).toHaveLength(2);
  });

  it('earn：每首歌每項只拿一次；貼紙每首歌各拿一份；慶祝文字疊加', () => {
    const store = TestBed.inject(KidsStore);
    const rewards = TestBed.inject(Rewards);
    const id = store.add('小明', '🐱')!.id;
    rewards.earn(id, letitgo, 'singAll');
    rewards.earn(id, letitgo, 'singAll');
    rewards.earn(id, letitgo, 'quizHard');
    rewards.earn(id, snowman, 'singAll');
    rewards.earn(id, snowman, 'quizHard');
    const kid = store.byId(id)!;
    expect(kid.songs).toEqual({ letitgo: { singAll: true, quizHard: true }, snowman: { singAll: true, quizHard: true } });
    expect(kid.stickers).toEqual(['👑', '❄️', '👑', '⛄']);
    expect(rewards.celebration()!.emoji).toBe('⛄');
    expect(rewards.celebration()!.text.split('🏆').length - 1).toBe(2);
    rewards.dismiss();
    expect(rewards.celebration()).toBeNull();
  });
});
