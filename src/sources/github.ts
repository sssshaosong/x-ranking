import { fetchText, parseCount } from '../config';
import type { RawItem, SourceResult } from '../types';

/**
 * GitHub 没有 trending 接口，解析页面。
 * 注意：这里取的是「今日新增 star」，该值每天归零重置，
 * 因此 detect 里对数值回退做了保护，避免重置瞬间误报负增长。
 */
export async function fetchGitHub(): Promise<SourceResult> {
  const html = await fetchText('https://github.com/trending?since=daily');
  const chunks = html.split('<article class="Box-row').slice(1);

  const items: RawItem[] = [];
  for (const chunk of chunks) {
    const repo = chunk.match(/<h2[^>]*class="h3[^"]*"[\s\S]*?href="\/([^"]+)"/);
    const stars = chunk.match(/([\d,]+)\s*stars today/);
    if (!repo || !stars) continue;

    const lang = chunk.match(/<span itemprop="programmingLanguage">([^<]+)</);
    items.push({
      id: repo[1],
      title: repo[1],
      url: `https://github.com/${repo[1]}`,
      score: parseCount(stars[1]),
      rank: items.length + 1,
      extra: { starsToday: parseCount(stars[1]), lang: lang ? lang[1] : '—' },
    });
    if (items.length >= 25) break;
  }

  return { source: 'github', items };
}
