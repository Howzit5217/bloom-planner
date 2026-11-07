// What's new in a release, from its notes on GitHub: the "- " lines, each a change. A change reads
// "**Title:** what it does" (or plain "Title: what it does"); older notes are plain sentences, some
// with a stray second dash ("- - ...").

export interface NewsItem {
  /** A few words naming the change, or null for a plain sentence. */
  title: string | null;
  text: string;
}

/** The changes in release notes, at most `most` of them. */
export function releaseNews(notes: string, most = 4): NewsItem[] {
  return notes
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]\s+)+/, '').trim())
    .filter(Boolean)
    .slice(0, most)
    .map((line) => {
      const bold = /^\*\*(.+?):?\*\*:?\s*(.*)$/.exec(line);
      if (bold) return { title: bold[1].trim(), text: bold[2].trim() };
      // A short name before a colon is a title; a long run before one is just a sentence.
      const plain = /^([^:]{2,32}):\s+(.+)$/.exec(line);
      if (plain && plain[1].split(' ').length <= 5) return { title: plain[1].trim(), text: plain[2].trim() };
      return { title: null, text: line };
    });
}

/** One line for a banner: the changes' titles in a row, or the first change as it's written. */
export function newsLine(notes: string): string | null {
  const news = releaseNews(notes, 3);
  if (!news.length) return null;
  if (news.every((n) => n.title)) return news.map((n) => n.title).join(' · ');
  return news[0].title ? `${news[0].title}: ${news[0].text}` : news[0].text;
}
