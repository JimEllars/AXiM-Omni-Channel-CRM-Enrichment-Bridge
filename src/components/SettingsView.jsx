import React from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiUser, FiKey, FiBell, FiZap, FiCheckCircle } from 'react-icons/fi';

export default function SettingsView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-6 flex items-center gap-2">
            <SafeIcon icon={FiUser} className="text-blue-400" />
            Identity & Access (IAM)
          </h4>
          <div className="space-y-4">
            {[
              { user: 'Admin Operator', role: 'Superuser', status: 'MFA Active' },
              { user: 'Pipeline Bot', role: 'API Access', status: 'Token Rotated' },
              { user: 'Compliance Officer', role: 'Read-Only', status: 'Active' },
            ].map(u => (
              <div key={u.user} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <SafeIcon icon={FiUser} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{u.user}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">{u.role}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded font-bold uppercase">
                  {u.status}
                </span>
              </div>
            ))}
            <button className="w-full py-3 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-xs font-bold hover:border-blue-500 hover:text-blue-400 transition-all">
              + INVITE TEAM MEMBER
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2">
            <SafeIcon icon={FiBell} className="text-amber-400" />
            Alerting Triggers
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Critical Failures (Slack)</span>
              <div className="w-8 h-4 bg-blue-600 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Monthly Usage Report</span>
              <div className="w-8 h-4 bg-slate-800 rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-600 rounded-full"></div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">KV Memory High Load</span>
              <div className="w-8 h-4 bg-blue-600 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div></div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-blue-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4 text-blue-400">
            <SafeIcon icon={FiZap} />
            <span className="font-black text-xs uppercase">Compute Plan</span>
          </div>
          <h5 className="text-lg font-bold text-white">Enterprise Tier</h5>
          <p className="text-xs text-slate-400 mt-1 mb-4">Unlimited Edge Workers & KV Invocations</p>
          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold">
            <SafeIcon icon={FiCheckCircle} />
            SLA: 99.99% GUARANTEED
          </div>
        </div>
      </div>
    </div>
  );
}