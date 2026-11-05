import { clearOf, withAlpha } from '../color';

describe('fade colors', () => {
  it('make a color clear or partly clear, from hex or rgba', () => {
    expect(clearOf('#FFFDF8')).toBe('#FFFDF800');
    expect(clearOf('rgba(52,110,54,0.94)')).toBe('rgba(52,110,54,0)');
    expect(withAlpha('#FFFDF8', 0.5)).toBe('rgba(255,253,248,0.5)');
    expect(withAlpha('#FFFDF880', 1)).toBe('rgba(255,253,248,0.502)');
    expect(withAlpha('rgba(52,110,54,0.94)', 0.5)).toBe('rgba(52,110,54,0.47)');
    expect(withAlpha('transparent', 0.5)).toBe('transparent');
  });
});
