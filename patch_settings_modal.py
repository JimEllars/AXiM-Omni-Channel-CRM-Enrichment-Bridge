import re

with open('src/components/SettingsView.jsx', 'r') as f:
    content = f.read()

# Add missing modal buttons code properly
content = content.replace(
"""                   <button onClick={() => setShowRestoreModal(false)} className="px-4 py-2 text-slate-300 hover:text-white text-sm font-bold transition-colors">Cancel</button>
                   <button onClick={handleRestore} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-red-500/20">Yes, Restore Now</button>""",
"""                   <button onClick={() => setShowRestoreModal(false)} className="px-4 py-2 text-slate-300 hover:text-white text-sm font-bold transition-colors">Cancel</button>
                   <button onClick={handleRestore} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-red-500/20">Yes, Restore Now</button>"""
)

with open('src/components/SettingsView.jsx', 'w') as f:
    f.write(content)
