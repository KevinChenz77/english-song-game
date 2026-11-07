import { playTabs } from './play';

describe('playTabs', () => {
  const modes = (lang?: string) => playTabs({ lang }).map((t) => t[0]);

  it('英文、日文有唱唱看；韓文（還沒有語音辨識）沒有', () => {
    expect(modes()).toEqual(['listen', 'quiz', 'sing']);
    expect(modes('ja')).toEqual(['listen', 'quiz', 'sing']);
    expect(modes('ko')).toEqual(['listen', 'quiz']);
  });
});
