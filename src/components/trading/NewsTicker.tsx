import { useState, useEffect, useRef } from 'react';

interface NewsItem {
  title: string;
  link: string;
  source: string;
}

// Cache in localStorage to reduce API calls
const CACHE_KEY = 'clawtrader_news_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

const getCachedNews = (): { news: NewsItem[]; timestamp: number } | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore cache errors
  }
  return null;
};

const setCachedNews = (news: NewsItem[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ news, timestamp: Date.now() }));
  } catch {
    // Ignore cache errors
  }
};

const FALLBACK_NEWS: NewsItem[] = [
  { title: 'Bitcoin continues to show strength above key support levels', link: '#', source: 'market' },
  { title: 'Ethereum staking yields remain attractive for long-term holders', link: '#', source: 'ethereum' },
  { title: 'Institutional adoption of digital assets accelerates globally', link: '#', source: 'crypto' },
  { title: 'DeFi protocols report steady growth in total value locked', link: '#', source: 'defi' },
  { title: 'Layer 2 solutions see increased transaction volumes', link: '#', source: 'technology' },
];

const NewsItemLink = ({ item }: { item: NewsItem }) => (
  <a
    href={item.link}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center shrink-0 mx-8 text-xs hover:text-primary transition-colors"
  >
    <span className="text-primary mr-2 font-bold">•</span>
    <span className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
      {item.title}
    </span>
    <span className="text-muted-foreground/50 ml-2 text-[10px] uppercase whitespace-nowrap">
      {item.source}
    </span>
  </a>
);

export function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>(FALLBACK_NEWS);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchNews = async () => {
      // Check local cache first
      const cached = getCachedNews();
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setNews(cached.news);
        return;
      }

      try {
        // Fetch crypto news from CryptoCompare public API (no key needed)
        const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=20');
        if (!res.ok) throw new Error('API error');
        const json = await res.json();
        if (json?.Data?.length > 0) {
          const items: NewsItem[] = json.Data.slice(0, 20).map((n: any) => ({
            title: n.title,
            link: n.url,
            source: n.source_info?.name ?? n.source ?? 'crypto',
          }));
          setNews(items);
          setCachedNews(items);
        }
      } catch (err) {
        console.error('News fetch exception:', err);
        // Fallback already set as default
      }
    };

    fetchNews();

    // Auto-refresh every 30 minutes
    const interval = setInterval(fetchNews, CACHE_DURATION);
    return () => clearInterval(interval);
  }, []);

  if (news.length === 0) {
    return null;
  }

  // Single-track infinite scroll: duplicate content so when first set scrolls out,
  // second set seamlessly fills in. Using one single div with CSS animation.
  return (
    <div className="w-full overflow-hidden bg-muted/20 border-y border-border/50 py-2">
      <div className="news-ticker-track flex">
        {/* First copy */}
        {news.map((item, i) => (
          <NewsItemLink key={`a-${i}`} item={item} />
        ))}
        {/* Second copy for seamless loop */}
        {news.map((item, i) => (
          <NewsItemLink key={`b-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
