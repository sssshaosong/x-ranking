import { fetchText, parseCount } from '../config';
import type { RawItem, SourceResult } from '../types';

interface CoinItem {
  id?: string;
  name?: string;
  symbol?: string;
  data?: {
    price?: number | string;
    market_cap?: string;
    total_volume?: string;
    price_change_percentage_24h?: Record<string, number>;
  };
}

/** 趋势榜只有 15 个，用市值做速度判定——资金流入是最直接的关注度信号。 */
export async function fetchCoinGecko(): Promise<SourceResult> {
  const data = JSON.parse(
    await fetchText('https://api.coingecko.com/api/v3/search/trending')
  ) as { coins?: Array<{ item?: CoinItem }> };

  const items: RawItem[] = (data.coins ?? [])
    .map((c) => c.item)
    .filter((c): c is CoinItem => !!c && !!c.id)
    .map((c, i) => {
      const mcap = parseCount(c.data?.market_cap);
      const vol = parseCount(c.data?.total_volume);
      const change = c.data?.price_change_percentage_24h ?? {};
      return {
        id: String(c.id),
        title: `${c.name ?? c.id} (${(c.symbol ?? '').toUpperCase()})`,
        url: `https://www.coingecko.com/en/coins/${c.id}`,
        score: mcap || vol,
        rank: i + 1,
        extra: {
          mcap: mcap || '—',
          change24h: typeof change.usd === 'number' ? `${change.usd.toFixed(1)}%` : '—',
          price: c.data?.price ?? '—',
        },
      };
    });

  return { source: 'coingecko', items };
}
