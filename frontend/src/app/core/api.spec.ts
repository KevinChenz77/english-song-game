import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api, LYRICS_ERR, LYRICS_MISSING, NET_ERR, cloudMessage } from './api';
import { APP_CONFIG, checkConfig } from './app-config';
import { saveTranslation } from './translations';

const BASE = 'http://api.test';

describe('Api', () => {
  let api: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('save 200 → created', async () => {
    const p = api.save('小明', '1234', { version: 1, savedAt: 'x', players: [] });
    const req = http.expectOne(`${BASE}/api/save`);
    expect(req.request.body.name).toBe('小明');
    req.flush({ ok: true, created: true });
    expect(await p).toEqual({ ok: true, created: true });
  });

  it.each([
    ['save', 401, '這個名字已經有人用了，或密碼不對'],
    ['save', 413, '存檔太大了，請聯絡家長或管理者'],
    ['load', 401, '密碼不對喔'],
    ['load', 404, '找不到這個名字的存檔'],
    ['load', 429, '錯太多次了，請 10 分鐘後再試'],
    ['load', 500, '存檔伺服器出了點問題，請稍後再試'],
  ] as const)('%s %i → 中文訊息', async (kind, st, msg) => {
    const p = kind === 'save' ? api.save('a', '1234', { version: 1, savedAt: 'x', players: [] }) : api.load('a', '1234');
    http.expectOne(`${BASE}/api/${kind}`).flush({ ok: false }, { status: st, statusText: 'x' });
    await expect(p).rejects.toThrow(msg);
  });

  it('網路錯誤 → 連不到', async () => {
    const p = api.load('a', '1234');
    http.expectOne(`${BASE}/api/load`).error(new ProgressEvent('error'));
    await expect(p).rejects.toThrow(NET_ERR);
    expect(cloudMessage('save', 400)).toBe('名字要 1～10 個字、密碼至少 4 個字');
  });

  it('load 回傳 data', async () => {
    const p = api.load('a', '1234');
    http.expectOne(`${BASE}/api/load`).flush({ ok: true, data: { players: [] } });
    expect(await p).toEqual({ players: [] });
  });

  it('content：解析 LRC，本機家長修改覆蓋伺服器翻譯', async () => {
    saveTranslation('letitgo', 'b', ' 家長改的 ');
    const p = api.content('letitgo');
    http.expectOne(`${BASE}/api/songs/letitgo/content`).flush({
      ok: true,
      songId: 'letitgo',
      lrc: '[00:01.00] a\n[00:02.00] b',
      translations: { a: '甲', b: '乙' },
    });
    const c = await p;
    expect(c.lines.map((l) => l.text)).toEqual(['a', 'b']);
    expect(c.translations).toEqual({ a: '甲', b: '家長改的' });
  });

  it('content：後端 tokens 陣列 → Token（null 省略、不認得的語言丟 l）；一個 token 壞掉／接不回原句／太長 → 整句不放；沒有 tokens 欄位 → undefined', async () => {
    // 自編的字（不是歌詞）
    const long = 'あ'.repeat(65);
    const p = api.content('j');
    http.expectOne(`${BASE}/api/songs/j/content`).flush({
      ok: true,
      lrc: '[00:01.00] 山へhappy go',
      translations: {},
      tokens: {
        '山へhappy go': [
          ['山', 'やま', 'yama'],
          ['へ', null, 'e'],
          ['happy', null, null, 'en'],
          ['go', null, null, 'zz'],
        ],
        山へ: [['山', 'やま'], [null]], // 有一個壞的
        川へ: [['川', 'かわ'], 'x'],
        海へ: [['海', 7]], // 讀音不是字串
        空へ: [['空']], // 接不回原句
        [long]: [[long]], // 太長
        toString: [['toString']],
        bad: 'x',
        empty: [],
      },
    });
    const t = (await p).tokens!;
    expect({ ...t }).toEqual({
      '山へhappy go': [
        { s: '山', r: 'やま', ro: 'yama' },
        { s: 'へ', ro: 'e' },
        { s: 'happy', l: 'en' },
        { s: 'go' },
      ],
      toString: [{ s: 'toString' }],
    });
    expect(Object.getPrototypeOf(t)).toBeNull();
    const p2 = api.content('e');
    http.expectOne(`${BASE}/api/songs/e/content`).flush({ ok: true, lrc: '[00:01.00] a', translations: {} });
    expect((await p2).tokens).toBeUndefined();
  });

  it('content 404 → 還沒準備好；其他錯誤 → 抓不到', async () => {
    const p1 = api.content('x');
    http.expectOne(`${BASE}/api/songs/x/content`).flush({ ok: false }, { status: 404, statusText: 'x' });
    await expect(p1).rejects.toThrow(LYRICS_MISSING);
    const p2 = api.content('x');
    http.expectOne(`${BASE}/api/songs/x/content`).flush({ ok: false }, { status: 500, statusText: 'x' });
    await expect(p2).rejects.toThrow(LYRICS_ERR);
  });
});

describe('checkConfig', () => {
  it('缺 apiBaseUrl 丟錯；去掉結尾斜線', () => {
    expect(() => checkConfig({})).toThrow();
    expect(() => checkConfig(null)).toThrow();
    expect(() => checkConfig({ apiBaseUrl: '' })).toThrow();
    expect(checkConfig({ apiBaseUrl: 'http://x/' })).toEqual({ apiBaseUrl: 'http://x' });
  });
});
