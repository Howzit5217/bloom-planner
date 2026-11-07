import { newsLine, releaseNews } from '../releaseNotes';

const FOOTER = '\nUnofficial fan-made planner, not affiliated with Scopely or Nintendo.\n\n<sub>SHA-256 of the APK</sub>';

describe('release notes', () => {
  it('reads each change as a bold title and what it does', () => {
    const notes = `- **A Truer Sky:** colors that follow the sun's real height\n- **Smoother Catch-Up:** the sky speeds up and slows down${FOOTER}`;
    expect(releaseNews(notes)).toEqual([
      { title: 'A Truer Sky', text: "colors that follow the sun's real height" },
      { title: 'Smoother Catch-Up', text: 'the sky speeds up and slows down' },
    ]);
    expect(newsLine(notes)).toBe('A Truer Sky · Smoother Catch-Up');
  });

  it('drops the stray second dash older notes have, and keeps long sentences whole', () => {
    const notes = `- - Rulers follow your finger on every drag, and a goal's difficulty no longer changes: it stays\n- - Weather alerts: a morning forecast${FOOTER}`;
    expect(releaseNews(notes)).toEqual([
      { title: null, text: "Rulers follow your finger on every drag, and a goal's difficulty no longer changes: it stays" },
      { title: 'Weather alerts', text: 'a morning forecast' },
    ]);
    expect(newsLine(notes)).toBe("Rulers follow your finger on every drag, and a goal's difficulty no longer changes: it stays");
  });

  it('shows at most four changes, and nothing without any', () => {
    expect(releaseNews('- a\n- b\n- c\n- d\n- e')).toHaveLength(4);
    expect(releaseNews(FOOTER)).toEqual([]);
    expect(newsLine(FOOTER)).toBeNull();
  });
});
