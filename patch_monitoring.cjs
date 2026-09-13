const fs = require('fs');
const file = 'src/components/Monitoring.jsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  `        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-900 z-10 shadow-sm">`,
  `        <div className="flex justify-between items-center px-6 py-2 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-500 uppercase font-black tracking-widest">
           <span>Live Network Stats</span>
           <span className="flex gap-4">
             <span className="text-emerald-400">Circuit: Closed</span>
             <span className="text-blue-400">Backoff: Active (Jitter)</span>
           </span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-900 z-10 shadow-sm">`
);
fs.writeFileSync(file, content);
