import { lookup, nameOk, norm, passwordOk } from './text';

const DICT = { snow: '雪', tears: '眼淚' };

describe('norm / lookup（legacy #test）', () => {
  it('norm 去標點、小寫、彎引號', () => {
    expect(norm('Go,')).toBe('go');
    expect(norm('Don’t')).toBe("don't");
    expect(norm("'cause")).toBe('cause');
  });

  it('lookup 複數退回原形', () => {
    expect(lookup('tears', DICT)).toBe('眼淚');
    expect(lookup('snows', DICT)).toBe(DICT.snow);
    expect(lookup('sky', DICT)).toBeNull();
  });
});

describe('nameOk（去空白後 1～10 字，emoji 算 1 字）', () => {
  it.each([
    ['小明', true],
    ['  小明  ', true],
    ['一二三四五六七八九十', true],
    ['一二三四五六七八九十一', false],
    ['🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱', true],
    ['🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱', false],
    ['', false],
    ['   ', false],
  ])('%j → %s', (s, ok) => expect(nameOk(s)).toBe(ok));
});

describe('passwordOk', () => {
  it('4～64 字、不 trim', () => {
    expect(passwordOk('abc')).toBe(false);
    expect(passwordOk('abcd')).toBe(true);
    expect(passwordOk('  a ')).toBe(true);
    expect(passwordOk('x'.repeat(65))).toBe(false);
  });
});
