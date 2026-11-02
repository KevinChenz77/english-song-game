import { TestBed } from '@angular/core/testing';
import { Pronunciation } from './pronunciation';

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
