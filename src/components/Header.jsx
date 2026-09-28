import { apiFetch } from "../utils/api";
import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiActivity, FiShield, FiDatabase } from 'react-icons/fi';
import { configService } from '../services/configService';

export default function Header() {
  const [healthStatus, setHealthStatus] = useState({ active: true, region: 'checking...' });
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const edgeUrl = 'https://api.axim.us.com'; // Assuming configService or similar provides this, but we'll use a local fallback if we can't find it.
        // The worker is likely deployed at an endpoint we need to hit, let's use the current window location or a generic one? Wait, the prompt says hit `/v1/health`. If it's a relative path on the same domain or maybe we can just hit `/v1/health`.

        // Let's use `/v1/health` as a relative path if they are on the same domain, or from config. We will just fetch `/v1/health`.
        const res = await apiFetch('/v1/health');
        if (!res.ok) throw new Error('Not OK');
        const data = await res.json();

        if (mounted) {
          setHealthStatus({ active: true, region: data.region || 'unknown' });
          setIsError(false);
        }
      } catch (err) {
        if (mounted) {
          setIsError(true);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 text-white p-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600/20 border border-blue-500/30 text-blue-400 p-2 rounded-lg">
            <SafeIcon icon={FiActivity} className="text-xl" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide">AXiM Core Pipeline</h1>
            <p className="text-xs text-slate-400">Omni-Channel CRM Enrichment Bridge</p>
          </div>
        </div>
        <div className="flex space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-400 min-w-[200px]">
            <div className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isError ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isError ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </div>
            <SafeIcon icon={FiShield} className={`transition-colors duration-300 ${isError ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span className="transition-all duration-300 font-medium">{isError ? 'Degraded/Retrying' : `Edge Active: [${healthStatus.region}]`}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-400 min-w-[150px] bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
            <SafeIcon icon={FiDatabase} className="text-blue-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider">KV Syncing</span>
          </div>
        </div>
      </div>
    </header>
  );
}
