import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

interface ServerHealth {
    status: 'online' | 'offline' | 'checking';
    timestamp?: string;
    uptime?: number;
}

const TRADING_SERVER_URL = import.meta.env.VITE_TRADING_SERVER_URL || 'http://96.30.205.215:3001';

export function ServerStatus() {
    const [tradingStatus, setTradingStatus] = useState<ServerHealth>({ status: 'checking' });

    const checkHealth = async (): Promise<ServerHealth> => {
        const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
        const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const healthUrl = `${TRADING_SERVER_URL}/health`;

        try {
            let response;
            if (isVercel) {
                response = await fetch(`/api/health/trading`, { signal: AbortSignal.timeout(5000) });
            } else if (isHttpsPage && healthUrl.startsWith('http://')) {
                const { fetchWithProxy } = await import('@/lib/proxyFetch');
                response = await fetchWithProxy(healthUrl);
            } else {
                response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
            }

            if (response.ok) {
                try {
                    const data = await response.json();
                    return { status: 'online', timestamp: data.timestamp, uptime: data.uptime };
                } catch {
                    return { status: 'online' };
                }
            }
            return { status: 'offline' };
        } catch {
            return { status: 'offline' };
        }
    };

    useEffect(() => {
        checkHealth().then(setTradingStatus);
        const interval = setInterval(() => checkHealth().then(setTradingStatus), 30000);
        return () => clearInterval(interval);
    }, []);

    const formatUptime = (seconds?: number) => {
        if (!seconds) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return 'bg-green-500 animate-pulse';
            case 'checking': return 'bg-yellow-500 animate-pulse';
            default: return 'bg-red-500';
        }
    };

    const getStatusTextColor = (status: string) => {
        switch (status) {
            case 'online': return 'text-green-500';
            case 'checking': return 'text-yellow-500';
            default: return 'text-red-500';
        }
    };

    return (
        <div className="group relative">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/50 border border-border/50 hover:border-border transition-colors">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(tradingStatus.status)}`} />
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            </div>

            {/* Tooltip */}
            <div className="absolute right-0 top-full mt-2 w-48 p-3 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="text-xs space-y-1">
                    <div className="font-semibold text-foreground">Trading Server</div>
                    <div className="text-muted-foreground">
                        Status: <span className={getStatusTextColor(tradingStatus.status)}>
                            {tradingStatus.status}
                        </span>
                    </div>
                    {tradingStatus.uptime && (
                        <div className="text-muted-foreground">
                            Uptime: {formatUptime(tradingStatus.uptime)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
