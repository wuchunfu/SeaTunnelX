'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useTheme} from 'next-themes';
import {useLocale} from '@/lib/i18n';
import {Button} from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {ExternalLink, Loader2, RefreshCw} from 'lucide-react';

type TimeRange = 'now-1h' | 'now-6h' | 'now-24h' | 'now-7d';
type RefreshInterval = 'off' | '15s' | '30s' | '1m';
type GrafanaTheme = 'light' | 'dark';
const DEFAULT_LOAD_TIMEOUT_MS = 60000;

function resolveDashboardUID(locale: string): string {
  return locale === 'zh' ? 'seatunnel-overview-zh' : 'seatunnel-overview-en';
}

function resolveDashboardSlug(locale: string): string {
  return locale === 'zh'
    ? 'seatunnelx-shen-du-jian-kong'
    : 'seatunnelx-deep-monitoring';
}

function buildGrafanaProxyDashboardURL(
  locale: string,
  timeFrom: TimeRange,
  refresh: RefreshInterval,
  grafanaTheme: GrafanaTheme,
): string {
  const uid = resolveDashboardUID(locale);
  const slug = resolveDashboardSlug(locale);
  const path = `/api/v1/monitoring/proxy/grafana/d/${uid}/${slug}`;

  const search = new URLSearchParams({
    orgId: '1',
    from: timeFrom,
    to: 'now',
  });
  if (refresh !== 'off') {
    search.set('refresh', refresh);
  }
  search.set('theme', grafanaTheme);

  // Use full kiosk mode to hide Grafana side/top navigation as much as possible.
  // 使用完整 kiosk 模式，尽量隐藏 Grafana 左侧/顶部导航。
  return `${path}?${search.toString()}&kiosk`;
}

export function MonitoringOverview() {
  const t = useTranslations('monitoringCenter');
  const {locale} = useLocale();
  const {resolvedTheme} = useTheme();

  const [timeRange, setTimeRange] = useState<TimeRange>('now-6h');
  const [refreshInterval, setRefreshInterval] =
    useState<RefreshInterval>('15s');
  const [iframeKey, setIframeKey] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTimeoutMs, setLoadTimeoutMs] = useState(DEFAULT_LOAD_TIMEOUT_MS);
  const [iframeHeight, setIframeHeight] = useState(900);
  const frameContainerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grafanaTheme: GrafanaTheme =
    resolvedTheme === 'light' ? 'light' : 'dark';

  const clearLoadTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const dashboardURL = useMemo(
    () =>
      buildGrafanaProxyDashboardURL(
        locale,
        timeRange,
        refreshInterval,
        grafanaTheme,
      ),
    [locale, timeRange, refreshInterval, grafanaTheme],
  );
  const embedURL = useMemo(
    () =>
      buildGrafanaProxyDashboardURL(
        locale,
        timeRange,
        refreshInterval,
        grafanaTheme,
      ),
    [locale, timeRange, refreshInterval, grafanaTheme],
  );

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      setLoadTimeoutMs(DEFAULT_LOAD_TIMEOUT_MS);
      return;
    }

    const connection = (
      navigator as Navigator & {
        connection?: {effectiveType?: string; saveData?: boolean};
      }
    ).connection;
    const effectiveType = connection?.effectiveType || '';
    const saveData = connection?.saveData === true;
    const slowNetwork =
      saveData || effectiveType.includes('2g') || effectiveType.includes('3g');
    setLoadTimeoutMs(slowNetwork ? 90000 : DEFAULT_LOAD_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    setLoaded(false);
    setLoadFailed(false);
    clearLoadTimeout();
    timeoutRef.current = setTimeout(() => {
      setLoadFailed(true);
    }, loadTimeoutMs);
    return () => clearLoadTimeout();
  }, [embedURL, iframeKey, loadTimeoutMs]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let rafId = 0;
    const recalcHeight = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        const el = frameContainerRef.current;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();
        if (!Number.isFinite(rect.top) || rect.top <= 0) {
          return;
        }

        // Keep one smooth scroll context by making iframe fill the remaining viewport.
        // 让 iframe 填充剩余视口高度，避免外层与内层双重滚动错位。
        const next = Math.max(720, Math.floor(window.innerHeight - rect.top - 12));
        setIframeHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
      });
    };

    recalcHeight();
    window.addEventListener('resize', recalcHeight);
    window.addEventListener('scroll', recalcHeight, {passive: true});

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(recalcHeight);
      if (frameContainerRef.current) {
        observer.observe(frameContainerRef.current);
      }
    }

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', recalcHeight);
      window.removeEventListener('scroll', recalcHeight);
      observer?.disconnect();
    };
  }, [locale]);

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='space-y-3'>
          <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3'>
            <CardTitle>{t('grafana.title')}</CardTitle>
            <div className='flex items-center gap-2 flex-wrap'>
              <Button
                variant='outline'
                onClick={() => setIframeKey((v) => v + 1)}
                className='shrink-0'
              >
                <RefreshCw className='h-4 w-4 mr-2' />
                {t('grafana.reload')}
              </Button>
              <Button asChild variant='outline' className='shrink-0'>
                <a href={dashboardURL} target='_blank' rel='noreferrer'>
                  <ExternalLink className='h-4 w-4 mr-2' />
                  {t('grafana.open')}
                </a>
              </Button>
            </div>
          </div>

          <div className='flex flex-col md:flex-row gap-2 md:items-center'>
            <div className='w-full md:w-56'>
              <Select
                value={timeRange}
                onValueChange={(value) => setTimeRange(value as TimeRange)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('grafana.timeRange.label')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='now-1h'>
                    {t('grafana.timeRange.last1h')}
                  </SelectItem>
                  <SelectItem value='now-6h'>
                    {t('grafana.timeRange.last6h')}
                  </SelectItem>
                  <SelectItem value='now-24h'>
                    {t('grafana.timeRange.last24h')}
                  </SelectItem>
                  <SelectItem value='now-7d'>
                    {t('grafana.timeRange.last7d')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='w-full md:w-56'>
              <Select
                value={refreshInterval}
                onValueChange={(value) =>
                  setRefreshInterval(value as RefreshInterval)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('grafana.refreshInterval.label')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='off'>
                    {t('grafana.refreshInterval.off')}
                  </SelectItem>
                  <SelectItem value='15s'>15s</SelectItem>
                  <SelectItem value='30s'>30s</SelectItem>
                  <SelectItem value='1m'>1m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className='p-0'>
          <div
            ref={frameContainerRef}
            className='relative border-t bg-muted/20 overflow-hidden'
            style={{height: `${iframeHeight}px`}}
          >
            {!loaded && !loadFailed ? (
              <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm'>
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  {t('grafana.loading')}
                </div>
              </div>
            ) : null}

            {loadFailed ? (
              <div className='absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm px-6 text-center'>
                <div className='text-sm text-muted-foreground'>
                  {t('grafana.loadFailed')}
                </div>
                <Button
                  variant='outline'
                  onClick={() => setIframeKey((v) => v + 1)}
                >
                  {t('grafana.retry')}
                </Button>
              </div>
            ) : null}

            <iframe
              key={iframeKey}
              title='Seatunnel Grafana Dashboard'
              src={embedURL}
              className='w-full h-full border-0 rounded-b-xl'
              sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-downloads'
              referrerPolicy='strict-origin-when-cross-origin'
              loading='eager'
              onLoad={() => {
                clearLoadTimeout();
                setLoaded(true);
                setLoadFailed(false);
              }}
              onError={() => {
                clearLoadTimeout();
                setLoadFailed(true);
              }}
            />

            <div className='pointer-events-none absolute top-0 left-0 right-0 h-12 bg-background/95' />
            <div className='pointer-events-none absolute bottom-0 left-0 right-0 h-2 bg-background/95' />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
