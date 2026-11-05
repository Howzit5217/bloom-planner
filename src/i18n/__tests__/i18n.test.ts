/// <reference types="node" />
import path from 'path';
import bundled from '../../data/bloom-levels.json';
import { DICTS, langFor, LANGS, pluralOne, setLang, t, tn } from '../core';
import { taskText } from '../level-text';
import { collectKeys, placeholders } from './keys';

const keys = collectKeys(path.join(__dirname, '..', '..'));

afterEach(() => setLang('en'));

describe('translations', () => {
  it('finds the app strings', () => {
    expect(keys.size).toBeGreaterThan(400);
    expect(keys.has('Time to get growing')).toBe(true);
    expect(keys.has('{n} days')).toBe(true);
  });

  it('has no narrator: nothing says I, me, my, we, us or let’s', () => {
    const narrator = /\b(I|I'll|I'm|I've|I'd|me|my|mine|myself|we|we'll|we're|us|our|ours|let's)\b/i;
    expect([...keys.keys()].filter((k) => narrator.test(k))).toEqual([]);
  });

  it('offers exactly the languages Pikmin Bloom does', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['en', 'es', 'fr', 'pt-BR', 'de', 'it', 'ja', 'ko', 'zh-Hant', 'zh-Hans']);
    expect(Object.keys(DICTS).sort()).toEqual(['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant']);
  });

  for (const [lang, dict] of Object.entries(DICTS)) {
    describe(lang, () => {
      it('has every string', () => {
        const missing = [...keys.keys()].filter((k) => !(k in dict));
        expect(missing).toEqual([]);
      });
      it('has no strings the app no longer uses', () => {
        expect(Object.keys(dict).filter((k) => !keys.has(k))).toEqual([]);
      });
      it('keeps every {placeholder}', () => {
        const wrong = Object.entries(dict).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join());
        expect(wrong).toEqual([]);
      });
      it('translates instead of copying English (beyond names and units)', () => {
        // The app's name, and German, which says "Level" just like the game does.
        const NAMES = ['Bloom Planner', ...(lang === 'de' ? ['Level {level}', 'Level {from} → {to}'] : [])];
        const same = Object.entries(dict).filter(([k, v]) => k === v && k.length > 12 && /[a-z]{4}/.test(k) && !NAMES.includes(k));
        expect(same).toEqual([]);
      });
    });
  }

  it('picks the language from the phone locale', () => {
    expect(langFor('pt-BR')).toBe('pt-BR');
    expect(langFor('pt-PT')).toBe('pt-BR');
    expect(langFor('zh-Hant-TW')).toBe('zh-Hant');
    expect(langFor('zh-HK')).toBe('zh-Hant');
    expect(langFor('zh-CN')).toBe('zh-Hans');
    expect(langFor('zh-Hans')).toBe('zh-Hans');
    expect(langFor('de-AT')).toBe('de');
    expect(langFor('ja_JP')).toBe('ja');
    expect(langFor('nl-NL')).toBe('en');
    expect(langFor(undefined)).toBe('en');
  });

  it('fills placeholders and plurals', () => {
    expect(t('Level {level}', { level: 12 })).toBe('Level 12');
    expect(tn(1, '{n} day', '{n} days')).toBe('1 day');
    expect(tn(3, '{n} day', '{n} days')).toBe('3 days');
    setLang('fr');
    expect(tn(0, '{n} day', '{n} days')).toBe('0 jour');
    expect(tn(2, '{n} day', '{n} days')).toBe('2 jours');
    setLang('ja');
    expect(tn(1, '{n} day', '{n} days')).toBe('1日');
    expect(pluralOne('ko', 1)).toBe(false);
  });

  it('translates every level task in the level file', () => {
    const tasks = [...new Set((bundled.levels as Array<{ task?: string }>).map((l) => l.task).filter((x): x is string => !!x))];
    for (const lang of Object.keys(DICTS)) {
      setLang(lang as never);
      // A task may read the same once translated ("Tutorial" in Spanish), so check it was looked up.
      const untouched = tasks.filter((task) => taskText(task) === task && !(task in DICTS[lang as keyof typeof DICTS]));
      expect({ lang, untouched }).toEqual({ lang, untouched: [] });
    }
  });
});
