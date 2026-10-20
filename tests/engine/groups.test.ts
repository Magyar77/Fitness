import { describe, expect, it } from 'vitest';
import { bodyPartsOf, searchLibrary, typeOf } from '../../src/engine/library/groups';
import { EXERCISES, EXERCISES_BY_ID } from '../../src/engine/library/exercises';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;

describe('library groups and search', () => {
  it('groups exercises by body part', () => {
    expect(bodyPartsOf(ex('barbell-bench-press'))).toContain('chest');
    expect(bodyPartsOf(ex('lat-pulldown'))).toContain('back');
    expect(bodyPartsOf(ex('barbell-back-squat'))).toContain('legs');
    expect(bodyPartsOf(ex('sw-l-sit'))).toContain('core');
  });

  it('labels street workout separately from gym strength', () => {
    expect(typeOf(ex('sw-front-lever'))).toBe('calisthenics');
    expect(typeOf(ex('barbell-bench-press'))).toBe('strength');
    expect(typeOf(ex('push-up'))).toBe('calisthenics');
  });

  it('searches forgivingly and ranks name matches first', () => {
    const r = searchLibrary(EXERCISES, { query: 'pullup' });
    expect(r.slice(0, 5).every((e) => e.name.toLowerCase().replace(/[^a-z]/g, '').includes('pullup'))).toBe(true);
    expect(r[0]!.id.startsWith('fx-')).toBe(false); // app and street exercises before the catalog
    expect(searchLibrary(EXERCISES, { query: 'squat' })[0]!.name.toLowerCase()).toMatch(/^squat/);
    expect(searchLibrary(EXERCISES, { query: 'db bench' }).map((e) => e.id)).toContain('db-bench-press');
  });

  it('combines body part, equipment and type filters', () => {
    const r = searchLibrary(EXERCISES, { part: 'chest', equipment: 'bodyweight' });
    expect(r.length).toBeGreaterThan(5);
    expect(r.every((e) => e.equipmentKind === 'bodyweight' && bodyPartsOf(e).includes('chest'))).toBe(true);
    const street = searchLibrary(EXERCISES, { type: 'calisthenics' });
    expect(street.every((e) => e.category === 'calisthenics' || e.equipmentKind === 'bodyweight')).toBe(true);
    expect(street.map((e) => e.id)).toEqual(expect.arrayContaining(['sw-front-lever', 'push-up', 'pull-up']));
    expect(street.length).toBeGreaterThanOrEqual(60);
  });
});
