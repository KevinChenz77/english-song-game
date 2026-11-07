import { TestBed } from '@angular/core/testing';
import { Pronunciation } from './pronunciation';
import { LANGS } from './lang';

const aud = () => JSON.parse(localStorage.getItem('aud2') ?? '{}');

describe('Pronunciation.url', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('404：記成 ""（查過沒有），下次不再查', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 404, ok: false });
    vi.stubGlobal('fetch', fetch);
    const p = TestBed.inject(Pronunciation);
    expect(await p.url('zork')).toBe('');
    expect(aud()).toEqual({ zork: '' });
    expect(await p.url('zork')).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('429：不記錄，下次再查', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 429, ok: false });
    vi.stubGlobal('fetch', fetch);
    const p = TestBed.inject(Pronunciation);
    expect(await p.url('zork')).toBeNull();
    expect(aud()).toEqual({});
    await p.url('zork');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('網路錯誤：不記錄', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const p = TestBed.inject(Pronunciation);
    expect(await p.url('zorks')).toBeNull(); // zorks、zork 兩個形式都試過
    expect(aud()).toEqual({});
  });
});

describe('Pronunciation.say 依語言', () => {
  const voices = [
    { name: 'Albert', lang: 'en-US' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Hattori', lang: 'ja-JP' }, // ja 的好聽名單裡
    { name: 'Some ja', lang: 'ja-JP' },
  ];
  let spoken: { text: string; lang: string; voice?: { name: string } }[];

  beforeEach(() => {
    localStorage.clear();
    spoken = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 1;
        voice?: { name: string };
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => voices,
      cancel: () => {},
      speak: (u: (typeof spoken)[number]) => spoken.push(u),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ja：不查字典，同步用 ja-JP 好聽的聲音唸讀音（不是漢字）', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const p = TestBed.inject(Pronunciation);
    p.say({ s: '猫', r: 'ねこ' }, LANGS['ja']);
    expect(fetch).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1); // 同步，iOS 點擊當下才唸得出來
    expect(spoken[0].text).toBe('ねこ');
    expect(spoken[0].lang).toBe('ja-JP');
    expect(spoken[0].voice?.name).toBe('Hattori');
    p.say({ s: 'いぬ' }, LANGS['ja']); // 沒有讀音＝唸原文
    expect(spoken[1].text).toBe('いぬ');
  });

  it('TTS：utterance 結束才 resolve', async () => {
    const p = TestBed.inject(Pronunciation);
    let done = false;
    void p.say({ s: 'いぬ' }, LANGS['ja']).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    (spoken[0] as unknown as { onend: () => void }).onend();
    await vi.waitFor(() => expect(done).toBe(true));
  });

  it('TTS：utterance 出錯也 resolve', async () => {
    const said = TestBed.inject(Pronunciation).say({ s: 'いぬ' }, LANGS['ja']);
    (spoken[0] as unknown as { onerror: () => void }).onerror();
    await said;
  });

  it('錄音 play() 被拒：改用 TTS，唸完才 resolve', async () => {
    localStorage.setItem('aud2', JSON.stringify({ fox: 'https://example.test/fox.mp3' }));
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('blocked'));
    const said = TestBed.inject(Pronunciation).say({ s: 'fox' }, LANGS['en']);
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].text).toBe('fox');
    (spoken[0] as unknown as { onend: () => void }).onend();
    await said;
    play.mockRestore();
  });

  it('字典查詢丟錯：改用 TTS，唸完才 resolve', async () => {
    const json = () => Promise.reject(new SyntaxError('bad json'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json }));
    const said = TestBed.inject(Pronunciation).say({ s: 'fox' }, LANGS['en']);
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    (spoken[0] as unknown as { onend: () => void }).onend();
    await said;
  });

  it('錄音：播到 ended 才 resolve', async () => {
    localStorage.setItem('aud2', JSON.stringify({ fox: 'https://example.test/fox.mp3' }));
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const p = TestBed.inject(Pronunciation);
    let done = false;
    void p.say({ s: 'fox' }, LANGS['en']).then(() => (done = true));
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    (p as unknown as { audio: HTMLAudioElement }).audio.dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(done).toBe(true));
    play.mockRestore();
  });

  it('沒有 speechSynthesis：直接 resolve', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    await TestBed.inject(Pronunciation).say({ s: 'いぬ' }, LANGS['ja']);
  });

  it('英文 token（日文歌裡 l: en）：走英文字典，查不到用 en-US 的自然聲音', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 404, ok: false });
    vi.stubGlobal('fetch', fetch);
    const p = TestBed.inject(Pronunciation);
    p.say({ s: 'happy', l: 'en' }, LANGS['en']);
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(fetch.mock.calls[0][0]).toContain('/entries/en/happy');
    expect(spoken[0].lang).toBe('en-US');
    expect(spoken[0].voice?.name).toBe('Samantha');
  });
});
