import { apiFetch } from "../utils/api";
import React, { useState } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiUser, FiBell, FiZap, FiCheckCircle, FiShield, FiTrash2, FiPlus, FiSave, FiKey } from 'react-icons/fi';

export default function SettingsView() {
  const [ips, setIps] = useState([]);
  const [alertWebhook, setAlertWebhook] = useState('');
  const [webhookSyncStatus, setWebhookSyncStatus] = useState('');
  const [newIp, setNewIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const [newAgentKey, setNewAgentKey] = useState('');
  const [keyStatus, setKeyStatus] = useState('');

  const generateAndProvisionKey = async () => {
    setKeyStatus('Generating...');
    try {
      // Generate a random 32-character hex key
      const array = new Uint8Array(16);
      window.crypto.getRandomValues(array);
      const key = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

      // Hash it on the frontend before sending (SHA-256)
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const response = await apiFetch('/v1/management/onyx-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ hashed_key: hashedKey })
      });

      if (response.ok) {
        setNewAgentKey(key);
        setKeyStatus('Key provisioned successfully! Copy it now, it will not be shown again.');
      } else {
        setKeyStatus('Failed to provision key.');
      }
    } catch (e) {
      console.error(e);
      setKeyStatus('Error provisioning key.');
    }
  };

  const validateIp = (ip) => {
    // Basic IPv4 and IPv6 validation regex
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  };

  const handleAddIp = () => {
    if (!newIp) return;
    if (validateIp(newIp)) {
      if (!ips.includes(newIp)) {
        setIps([...ips, newIp]);
      }
      setNewIp('');
      setIpError('');
    } else {
      setIpError('Invalid IPv4 or IPv6 format');
    }
  };

  const handleRemoveIp = (ipToRemove) => {
    setIps(ips.filter(ip => ip !== ipToRemove));
  };

  const handleSyncIps = async () => {
    setSyncStatus('Syncing...');
    try {
      // We assume there's a base URL or it's on the same origin. Since it's a UI, we'll hit the worker endpoint.
      // If we don't have the exact host, we'll try an absolute or relative path based on Vite setup.
      // Often VITE_API_URL or similar is used. We'll fallback to a generic fetch with the expected path.
      // Based on project architecture, it's a Cloudflare worker. The worker handles `/v1/management/sync`.

      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
      const response = await apiFetch(`/v1/management/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ ip_whitelist: ips })
      });

      if (response.ok) {
        setSyncStatus('Synced successfully!');
        setTimeout(() => setSyncStatus(''), 3000);
      } else {
        setSyncStatus('Sync failed.');
      }
    } catch (e) {
      console.error(e);
      setSyncStatus('Sync error.');
    }
  };

  const handleSyncWebhook = async () => {
    setWebhookSyncStatus('Saving...');
    try {
      const response = await apiFetch(`/v1/management/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ alert_webhook: alertWebhook })
      });

      if (response.ok) {
        setWebhookSyncStatus('Saved successfully!');
        setTimeout(() => setWebhookSyncStatus(''), 3000);
      } else {
        setWebhookSyncStatus('Save failed.');
      }
    } catch (e) {
      console.error(e);
      setWebhookSyncStatus('Save error.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="dark:bg-gray-800 bg-white/50 border dark:border-gray-700 border-gray-200 rounded-xl p-6">
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
              <div key={u.user} className="flex items-center justify-between p-4 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full dark:bg-gray-700 bg-gray-100 flex items-center justify-center dark:text-gray-400 text-gray-600">
                    <SafeIcon icon={FiUser} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{u.user}</p>
                    <p className="text-[10px] dark:text-gray-500 text-gray-500 uppercase tracking-widest">{u.role}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded font-bold uppercase">
                  {u.status}
                </span>
              </div>
            ))}
            <button className="w-full py-3 border-2 border-dashed dark:border-gray-700 border-gray-200 rounded-xl dark:text-gray-500 text-gray-500 text-xs font-bold hover:border-blue-500 hover:text-blue-400 transition-all">
              + INVITE TEAM MEMBER
            </button>
          </div>
        </div>

        {/* Onyx Agent Connections Section */}
        <div className="dark:bg-gray-800 bg-white/50 border dark:border-gray-700 border-gray-200 rounded-xl p-6">
          <h4 className="text-white font-bold mb-6 flex items-center gap-2">
            <SafeIcon icon={FiKey} className="text-purple-400" />
            Onyx Agent Connections
          </h4>
          <p className="dark:text-gray-400 text-gray-600 text-sm mb-4">
            Generate revocable API keys for Onyx Desktop Agents. These keys only grant access to the batch upload ingress route and cannot access management features.
          </p>
          <div className="flex flex-col gap-4">
            <button
              onClick={generateAndProvisionKey}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg shadow-purple-500/20"
            >
              <SafeIcon icon={FiPlus} /> Generate & Provision New Key
            </button>
            {keyStatus && <p className="text-sm dark:text-gray-300 text-gray-800 mt-2">{keyStatus}</p>}
            {newAgentKey && (
              <div className="dark:bg-gray-900 bg-gray-50/80 border border-purple-500/30 p-4 rounded-lg mt-2 relative">
                <p className="text-xs text-purple-400 font-bold mb-1 uppercase tracking-widest">Secret Agent Key (Show Once)</p>
                <code className="text-white text-lg font-mono break-all">{newAgentKey}</code>
              </div>
            )}
          </div>
        </div>

        {/* IP Management Section */}
        <div className="dark:bg-gray-800 bg-white/50 border dark:border-gray-700 border-gray-200 rounded-xl p-6">
          <h4 className="text-white font-bold mb-6 flex items-center gap-2">
            <SafeIcon icon={FiShield} className="text-emerald-400" />
            Allowed Ingress IPs
          </h4>

          <div className="flex items-center gap-4 mb-4">
            <input
              type="text"
              placeholder="Enter IPv4 or IPv6 address..."
              className="flex-1 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
            />
            <button
              onClick={handleAddIp}
              className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-500/20 transition-all text-sm font-bold"
            >
              <SafeIcon icon={FiPlus} /> Add IP
            </button>
          </div>
          {ipError && <p className="text-red-400 text-xs mb-4">{ipError}</p>}

          <div className="space-y-2 mb-6 max-h-48 overflow-y-auto pr-2">
            {ips.length === 0 ? (
              <p className="dark:text-gray-500 text-gray-500 text-sm italic">No IPs whitelisted. System will fail-open (all allowed).</p>
            ) : (
              ips.map(ip => (
                <div key={ip} className="flex items-center justify-between p-3 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 rounded-lg">
                  <span className="text-sm font-mono dark:text-gray-300 text-gray-800">{ip}</span>
                  <button
                    onClick={() => handleRemoveIp(ip)}
                    className="dark:text-gray-500 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <SafeIcon icon={FiTrash2} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t dark:border-gray-700 border-gray-200 pt-4">
            <span className="text-xs dark:text-gray-400 text-gray-600">{syncStatus}</span>
            <button
              onClick={handleSyncIps}
              className="bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-all text-sm font-bold shadow-lg shadow-blue-500/20"
            >
              <SafeIcon icon={FiSave} /> Save & Sync
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="dark:bg-gray-800 bg-white/50 border dark:border-gray-700 border-gray-200 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2">
            <SafeIcon icon={FiBell} className="text-amber-400" />
            Alerting Triggers
          </h4>

          <div className="mb-6">
            <label className="text-xs dark:text-gray-400 text-gray-600 block mb-2 font-bold">System Alerts Webhook (Slack/Discord)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="https://hooks.slack.com/services/..."
                className="flex-1 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500 text-xs"
                value={alertWebhook}
                onChange={(e) => setAlertWebhook(e.target.value)}
              />
              <button
                onClick={handleSyncWebhook}
                className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-2 rounded-lg hover:bg-amber-500/20 transition-all text-xs font-bold whitespace-nowrap"
              >
                Save URL
              </button>
            </div>
            {webhookSyncStatus && <p className="text-[10px] text-amber-400 mt-1">{webhookSyncStatus}</p>}
          </div>

          <div className="space-y-4 pt-4 border-t dark:border-gray-700 border-gray-200/50">
            <div className="flex items-center justify-between">
              <span className="text-xs dark:text-gray-400 text-gray-600">Critical Failures (Slack)</span>
              <div className="w-8 h-4 bg-blue-600 dark:bg-blue-600 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs dark:text-gray-400 text-gray-600">Monthly Usage Report</span>
              <div className="w-8 h-4 dark:bg-gray-700 bg-gray-100 rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-600 rounded-full"></div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs dark:text-gray-400 text-gray-600">KV Memory High Load</span>
              <div className="w-8 h-4 bg-blue-600 dark:bg-blue-600 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div></div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-blue-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4 text-blue-400">
            <SafeIcon icon={FiZap} />
            <span className="font-black text-xs uppercase">Compute Plan</span>
          </div>
          <h5 className="text-lg font-bold text-white">Enterprise Tier</h5>
          <p className="text-xs dark:text-gray-400 text-gray-600 mt-1 mb-4">Unlimited Edge Workers & KV Invocations</p>
          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold">
            <SafeIcon icon={FiCheckCircle} />
            SLA: 99.99% GUARANTEED
          </div>
        </div>
      </div>
    </div>
  );
}
