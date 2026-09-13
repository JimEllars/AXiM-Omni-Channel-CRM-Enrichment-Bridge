const fs = require('fs');
const file = 'src/components/Header.jsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  `        <div className="flex space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <div className={\`w-2 h-2 rounded-full \${isError ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}\`}></div>
            <SafeIcon icon={FiShield} className={isError ? 'text-yellow-400' : 'text-green-400'} />
            <span>{isError ? 'Syncing/Updating' : \`Edge Active: [\${healthStatus.region}]\`}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <SafeIcon icon={FiDatabase} className="text-blue-400" />
            <span>KV Store Operational</span>
          </div>
        </div>`,
  `        <div className="flex space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-400 min-w-[200px]">
            <div className={\`w-2 h-2 rounded-full transition-colors duration-300 \${isError ? 'bg-amber-400' : 'bg-green-400 animate-pulse'}\`}></div>
            <SafeIcon icon={FiShield} className={\`transition-colors duration-300 \${isError ? 'text-amber-400' : 'text-green-400'}\`} />
            <span className="transition-all duration-300">{isError ? 'Degraded/Retrying' : \`Edge Active: [\${healthStatus.region}]\`}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-400 min-w-[150px]">
            <SafeIcon icon={FiDatabase} className="text-blue-400" />
            <span>KV Store Syncing</span>
          </div>
        </div>`
);
fs.writeFileSync(file, content);
