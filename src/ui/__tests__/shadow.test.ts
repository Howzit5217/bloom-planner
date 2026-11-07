import { androidShadow } from '../shadow';

describe('shadows on Android', () => {
  it('turns soft outer shadows into one elevation, in their colour at full strength', () => {
    const s = androidShadow('0px 6px 24px 0px rgba(120,100,70,0.12), 0px 1px 3px 0px rgba(120,100,70,0.12)');
    expect(s.kept).toEqual([]);
    expect(s.elevation).toBe(6);
    expect(s.color).toBe('rgb(120, 100, 70)');
    expect(androidShadow('0px 4px 14px 0px #00000059').color).toBe('#000000');
  });

  it('keeps the sharp ones (a highlight line, a ring) and leaves out soft inner ones', () => {
    const card = androidShadow('0px 4px 14px 0px rgba(0,0,0,0.35), inset 0px 1px 0px 0px rgba(255,255,255,0.95)');
    expect(card.kept).toEqual(['inset 0px 1px 0px 0px rgba(255,255,255,0.95)']);
    expect(card.elevation).toBe(4);
    const field = androidShadow('inset 0px 2px 5px 0px rgba(0,0,0,0.35)');
    expect(field).toEqual({ kept: [], elevation: 0, color: null });
    expect(androidShadow('0px 2px 8px 0px rgba(0,0,0,0.2), 0px 0px 0px 3px #4CAF50').kept).toEqual(['0px 0px 0px 3px #4CAF50']);
  });
});
