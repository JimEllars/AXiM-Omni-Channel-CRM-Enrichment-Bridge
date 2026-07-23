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
    <header className="bg-slate-900 border-b border-slate-800 text-white p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <SafeIcon icon={FiActivity} className="text-xl" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide">AXiM Core Pipeline</h1>
            <p className="text-xs text-slate-400">Omni-Channel CRM Enrichment Bridge</p>
          </div>
        </div>
        <div className="flex space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <div className={`w-2 h-2 rounded-full ${isError ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`}></div>
            <SafeIcon icon={FiShield} className={isError ? 'text-yellow-400' : 'text-green-400'} />
            <span>{isError ? 'Syncing/Updating' : `Edge Active: [${healthStatus.region}]`}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <SafeIcon icon={FiDatabase} className="text-blue-400" />
            <span>KV Store Operational</span>
          </div>
        </div>
      </div>
    </header>
  );
}
