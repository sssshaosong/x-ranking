import { fetchText } from '../config';
import type { RawItem, SourceResult } from '../types';

/** 百度热搜没有开放接口，页面里内嵌了 word / hotScore 字段对。 */
export async function fetchBaidu(): Promise<SourceResult> {
  const html = await fetchText('https://top.baidu.com/board?tab=realtime');
  const re = /"word":"([^"]*)"[\s\S]{0,600}?"hotScore":"?(\d+)"?/g;

  const items: RawItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null && items.length < 30) {
    const word = m[1].trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    items.push({
      id: word,
      title: word,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(word)}`,
      score: Number(m[2]),
      rank: items.length + 1,
      extra: { hotScore: Number(m[2]) },
    });
  }

  return { source: 'baidu', items };
}
