import { apiFetch } from "../utils/api";
import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiUser, FiBell, FiZap, FiCheckCircle, FiShield, FiTrash2, FiPlus, FiSave, FiKey, FiClock, FiActivity } from 'react-icons/fi';

export default function SettingsView() {
  const [ips, setIps] = useState([]);
  const [alertWebhook, setAlertWebhook] = useState('');
  const [webhookSyncStatus, setWebhookSyncStatus] = useState('');
  const [newIp, setNewIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [ecosystemTtl, setEcosystemTtl] = useState(7);
  const [ttlSyncStatus, setTtlSyncStatus] = useState('');

  const [scraperKeys, setScraperKeys] = useState([]);
  const [newScraperKey, setNewScraperKey] = useState('');
  const [scraperKeysStatus, setScraperKeysStatus] = useState('');

  const [subscribers, setSubscribers] = useState([]);
  const [newSubscriber, setNewSubscriber] = useState('');
  const [subscribersStatus, setSubscribersStatus] = useState('');

  const [newAgentKey, setNewAgentKey] = useState('');
  const [keyStatus, setKeyStatus] = useState('');

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);



  const fetchAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const response = await apiFetch('/v1/management/logs?limit=10', { method: 'GET' });
      if (response && response.ok) {
         const data = await response.json();
         setAuditLogs(data);
      } else if (response && Array.isArray(response)) {
         setAuditLogs(response);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

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

  const generateScraperKey = () => {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const key = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setNewScraperKey(key);
  };

  const addScraperKey = () => {
    if (newScraperKey && !scraperKeys.includes(newScraperKey)) {
        setScraperKeys([...scraperKeys, newScraperKey]);
        setNewScraperKey('');
    }
  };

  const removeScraperKey = (keyToRemove) => {
    setScraperKeys(scraperKeys.filter(k => k !== keyToRemove));
  };

  const handleSyncScraperKeys = async () => {
    setScraperKeysStatus('Saving...');
    try {
      const response = await apiFetch('/v1/management/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ scraper_api_keys: scraperKeys })
      });
      if (response.ok) {
        setScraperKeysStatus('Keys saved successfully.');
        setTimeout(() => setScraperKeysStatus(''), 3000);
      } else {
        setScraperKeysStatus('Failed to save keys.');
      }
    } catch (e) {
      setScraperKeysStatus('Save error.');
    }
  };

  const addSubscriber = () => {
    if (newSubscriber && !subscribers.includes(newSubscriber)) {
        setSubscribers([...subscribers, newSubscriber]);
        setNewSubscriber('');
    }
  };

  const removeSubscriber = (urlToRemove) => {
    setSubscribers(subscribers.filter(url => url !== urlToRemove));
  };

  const handleSyncSubscribers = async () => {
    setSubscribersStatus('Saving...');
    try {
      const response = await apiFetch('/v1/management/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ ecosystem_subscribers: subscribers })
      });
      if (response.ok) {
        setSubscribersStatus('Subscribers saved successfully.');
        setTimeout(() => setSubscribersStatus(''), 3000);
      } else {
        setSubscribersStatus('Failed to save subscribers.');
      }
    } catch (e) {
      setSubscribersStatus('Save error.');
    }
  };

  const handleSyncTtl = async () => {
    setTtlSyncStatus('Syncing...');
    try {
      const ttlSeconds = ecosystemTtl * 86400;
      const response = await apiFetch('/v1/management/config/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        },
        body: JSON.stringify({ ecosystem_ttl: ttlSeconds })
      });

      if (response.ok) {
        setTtlSyncStatus('TTL saved and synced.');
        setTimeout(() => setTtlSyncStatus(''), 3000);
      } else {
        setTtlSyncStatus('Failed to save TTL.');
      }
    } catch (e) {
      setTtlSyncStatus('Save error.');
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
            <SafeIcon icon={FiKey} className="text-green-400" />
            Scraper API Keys
          </h4>
          <div className="mb-6">
            <label className="text-xs dark:text-gray-400 text-gray-600 block mb-2 font-bold">Manage API keys for B2B/B2C scraper apps</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="flex-1 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-green-500 text-xs font-mono"
                placeholder="Generate or enter key..."
                value={newScraperKey}
                onChange={(e) => setNewScraperKey(e.target.value)}
              />
              <button onClick={generateScraperKey} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all">Generate</button>
              <button onClick={addScraperKey} className="bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 py-2 rounded-lg text-xs font-bold transition-all"><SafeIcon icon={FiPlus} /></button>
            </div>

            {scraperKeys.length > 0 && (
              <div className="dark:bg-gray-900/50 rounded-lg p-2 mb-2">
                {scraperKeys.map((key, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1 border-b dark:border-gray-700/50 last:border-0">
                    <span className="text-white text-xs font-mono">{key}</span>
                    <button onClick={() => removeScraperKey(key)} className="text-red-400 hover:text-red-300 p-1"><SafeIcon icon={FiTrash2} size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 items-center mt-2">
                <span className="text-xs text-gray-400">{scraperKeysStatus}</span>
                <button onClick={handleSyncScraperKeys} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-lg shadow-green-500/20">
                    <SafeIcon icon={FiSave} /> Save Keys
                </button>
            </div>
          </div>

          <h4 className="text-white font-bold mb-4 flex items-center gap-2 border-t dark:border-gray-700 pt-4">
            <SafeIcon icon={FiZap} className="text-blue-400" />
            Ecosystem Subscribers (Pub/Sub)
          </h4>
          <div className="mb-6">
            <label className="text-xs dark:text-gray-400 text-gray-600 block mb-2 font-bold">Downstream Webhook URLs</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="flex-1 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 text-xs"
                placeholder="https://app.example.com/webhook"
                value={newSubscriber}
                onChange={(e) => setNewSubscriber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubscriber()}
              />
              <button onClick={addSubscriber} className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-2 rounded-lg text-xs font-bold transition-all"><SafeIcon icon={FiPlus} /></button>
            </div>

            {subscribers.length > 0 && (
              <div className="dark:bg-gray-900/50 rounded-lg p-2 mb-2">
                {subscribers.map((url, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1 border-b dark:border-gray-700/50 last:border-0">
                    <span className="text-white text-xs">{url}</span>
                    <button onClick={() => removeSubscriber(url)} className="text-red-400 hover:text-red-300 p-1"><SafeIcon icon={FiTrash2} size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 items-center mt-2">
                <span className="text-xs text-gray-400">{subscribersStatus}</span>
                <button onClick={handleSyncSubscribers} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-lg shadow-blue-500/20">
                    <SafeIcon icon={FiSave} /> Save Subscribers
                </button>
            </div>
          </div>

          <h4 className="text-white font-bold mb-4 flex items-center gap-2 border-t dark:border-gray-700 border-gray-200/50 pt-4">
            <SafeIcon icon={FiZap} className="text-blue-400" />
            Scraper Data Retention (TTL)
          </h4>
          <div className="mb-6">
            <label className="text-xs dark:text-gray-400 text-gray-600 block mb-2 font-bold">Ecosystem Data Lifespan</label>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 dark:bg-gray-900 bg-gray-50/50 border dark:border-gray-700 border-gray-200 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 text-xs"
                value={ecosystemTtl}
                onChange={(e) => setEcosystemTtl(parseInt(e.target.value, 10))}
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
              </select>
              <button
                onClick={handleSyncTtl}
                className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-2 rounded-lg hover:bg-blue-500/20 transition-all text-xs font-bold whitespace-nowrap"
              >
                Save TTL
              </button>
            </div>
            {ttlSyncStatus && <p className="text-[10px] text-blue-400 mt-1">{ttlSyncStatus}</p>}
          </div>

          <h4 className="text-white font-bold mb-4 flex items-center gap-2 border-t dark:border-gray-700 border-gray-200/50 pt-4">
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

        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden shadow-2xl mt-8">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20">
            <h3 className="text-white font-medium flex items-center gap-2">
              <SafeIcon icon={FiActivity} className="text-blue-400" />
              System Audit Logs
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Recent anomaly logs and telemetry warnings.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 text-xs">
                <tr>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Event Type</th>
                  <th className="px-6 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {auditLogsLoading ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-4 text-center text-slate-500 text-xs italic">Loading logs...</td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-4 text-center text-slate-500 text-xs italic">No recent logs found.</td>
                  </tr>
                ) : (
                  auditLogs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                        <div className="flex items-center gap-1"><SafeIcon icon={FiClock} className="text-slate-600" /> {new Date(log.timestamp || log.time || log.created_at).toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        <span className="px-2 py-0.5 rounded font-bold border text-orange-500 bg-orange-500/10 border-orange-500/20">{log.event_type || log.type || 'UNKNOWN'}</span>
                      </td>
                      <td className="px-6 py-4 text-xs">{log.message || log.msg || log.error_message || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
