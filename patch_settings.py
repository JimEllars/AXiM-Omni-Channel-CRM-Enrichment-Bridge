import re

with open('src/components/SettingsView.jsx', 'r') as f:
    content = f.read()

# Add restore state and function
restore_logic = """
  const [restoreStatus, setRestoreStatus] = useState('');
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [lastBackupTimestamp, setLastBackupTimestamp] = useState('');

  const fetchLastBackupTimestamp = async () => {
    try {
      const response = await apiFetch('/v1/management/config/backup-timestamp', { method: 'GET' });
      if (response && response.ok) {
        const data = await response.json();
        if (data.timestamp) {
           setLastBackupTimestamp(new Date(data.timestamp).toLocaleString());
        }
      }
    } catch(err) {
      console.error("Failed to fetch backup timestamp");
    }
  };

  useEffect(() => {
    fetchLastBackupTimestamp();
  }, []);

  const handleRestore = async () => {
    setRestoreStatus('Restoring...');
    setShowRestoreModal(false);
    try {
      const res = await apiFetch('/v1/management/restore', { method: 'POST' });
      if (res && res.ok) {
         const data = await res.json();
         setRestoreStatus(`Restore successful! Snapshot: ${new Date(data.timestamp).toLocaleString()}`);
         setTimeout(() => setRestoreStatus(''), 5000);
      } else {
         setRestoreStatus('Restore failed.');
         setTimeout(() => setRestoreStatus(''), 3000);
      }
    } catch(err) {
      setRestoreStatus('Error during restore.');
      setTimeout(() => setRestoreStatus(''), 3000);
    }
  };
"""

content = content.replace(
"""  const [backupStatus, setBackupStatus] = useState('');""",
"""  const [backupStatus, setBackupStatus] = useState('');""" + restore_logic
)

ui_patch = """
          </h4>
          <div className="mb-6 flex flex-col items-start gap-2">
             <div className="flex gap-4">
                 <button onClick={handleForceBackup} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-500/20">
                     <SafeIcon icon={FiDatabase} /> Force Backup to Supabase
                 </button>
                 <button onClick={() => setShowRestoreModal(true)} className="bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                     <SafeIcon icon={FiActivity} /> Restore from Latest Backup
                 </button>
             </div>
             {backupStatus && <span className="text-xs text-purple-400">{backupStatus}</span>}
             {restoreStatus && <span className="text-xs text-emerald-400">{restoreStatus}</span>}
             {lastBackupTimestamp && <span className="text-[10px] text-gray-500">Last Backup: {lastBackupTimestamp}</span>}
          </div>

          {showRestoreModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-red-500/30 rounded-xl p-6 max-w-md w-full">
                <h3 className="text-white text-lg font-bold mb-2 flex items-center gap-2">
                   <SafeIcon icon={FiActivity} className="text-red-500" />
                   Confirm System Restore
                </h3>
                <p className="text-slate-300 text-sm mb-6">
                  Are you sure you want to pull the latest configuration backup from Supabase and overwrite the current active KV state? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                   <button onClick={() => setShowRestoreModal(false)} className="px-4 py-2 text-slate-300 hover:text-white text-sm font-bold transition-colors">Cancel</button>
                   <button onClick={handleRestore} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-red-500/20">Yes, Restore Now</button>
                </div>
              </div>
            </div>
          )}
"""

content = content.replace(
"""          </h4>
          <div className="mb-6 flex flex-col items-start">
             <button onClick={handleForceBackup} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-500/20 mb-2">
                 <SafeIcon icon={FiDatabase} /> Force Backup to Supabase
             </button>
             {backupStatus && <span className="text-xs text-purple-400">{backupStatus}</span>}
          </div>""",
ui_patch
)

with open('src/components/SettingsView.jsx', 'w') as f:
    f.write(content)

print("Done")
