import React from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiActivity, FiShield, FiDatabase } from 'react-icons/fi';

export default function Header() {
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
            <SafeIcon icon={FiShield} className="text-green-400" />
            <span>Worker Edge Active</span>
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