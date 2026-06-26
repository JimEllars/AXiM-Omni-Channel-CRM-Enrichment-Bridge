import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import SafeIcon from '../common/SafeIcon';
import { FiUploadCloud, FiFile, FiCheckCircle, FiPlay, FiSettings, FiTrash2, FiActivity } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

export default function DataImporter() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [status, setStatus] = useState('IDLE'); // IDLE, MAPPING, PROCESSING, DONE
  const [progress, setProgress] = useState(0);
  const [validationError, setValidationError] = useState(null);
  const fileInputRef = useRef(null);

  const aximSchema = [
    { key: 'email', label: 'Email Address (Required)' },
    { key: 'name', label: 'Full Name' },
    { key: 'company', label: 'Company Name' },
    { key: 'linkedin_url', label: 'LinkedIn URL' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'company_size', label: 'Company Size' }
  ];

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    processFile(droppedFile);
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    processFile(selectedFile);
  };

  const processFile = (file) => {
    if (!file) return;
    setFile(file);

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: header => header.trim(),
        complete: (results) => {
          const fields = results.meta.fields || [];
          const cleanedData = results.data.filter(row => Object.values(row).some(val => val !== null && val !== '' && typeof val === 'string' ? val.trim() !== '' : true));
          setHeaders(fields);
          setData(cleanedData);
          setStatus('MAPPING');

          // Auto-map where possible
          const initialMapping = {};
          aximSchema.forEach(schema => {
             const match = fields.find(f => f.toLowerCase().includes(schema.key.toLowerCase()));
             if (match) initialMapping[schema.key] = match;
          });
          setMapping(initialMapping);
        }
      });
    } else if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          const parsedData = Array.isArray(json) ? json : [json];
          const cleanedData = parsedData.filter(row => Object.keys(row).length > 0 && Object.values(row).some(v => v !== null && v !== ''));

          if (cleanedData.length > 0) {
            const trimmedData = cleanedData.map(row => {
              const newRow = {};
              for (const [key, value] of Object.entries(row)) {
                 newRow[key.trim()] = value;
              }
              return newRow;
            });
            const keys = Object.keys(trimmedData[0]);
            setHeaders(keys);
            setData(trimmedData);
            setStatus('MAPPING');
          }
        } catch (err) {
          console.error("JSON parse error:", err);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleMappingChange = (schemaKey, headerValue) => {
    setMapping(prev => ({ ...prev, [schemaKey]: headerValue }));
  };

  const handleProcess = async () => {
    // Validation step
    const emailKey = mapping['email'];
    if (emailKey) {
       let invalidCount = 0;
       const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
       for (const row of data) {
           const email = row[emailKey];
           if (!email || !emailRegex.test(String(email).trim())) {
               invalidCount++;
           }
       }
       if (data.length > 0 && (invalidCount / data.length) >= 0.5) {
           setValidationError(`Validation Error: ${(invalidCount / data.length * 100).toFixed(0)}% of rows have invalid or missing emails in the mapped column. Please fix your data or mapping.`);
           return;
       }
    }
    setValidationError(null);

    setStatus('PROCESSING');
    setProgress(0);

    // Transform data according to mapping
    const mappedData = data.map(row => {
      const newRow = {};
      Object.keys(mapping).forEach(schemaKey => {
        if (mapping[schemaKey]) {
          newRow[schemaKey] = row[mapping[schemaKey]];
        }
      });
      return newRow;
    });

    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(mappedData.length / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = mappedData.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

      try {
        await fetch('/v1/webhooks/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_AXIM_INTERNAL_KEY}`
          },
          body: JSON.stringify({ source: 'manual_import', records: batch })
        });
      } catch (err) {
        console.error("Batch error:", err);
      }

      setProgress(Math.round(((i + 1) / totalBatches) * 100));
    }

    setStatus('DONE');
  };

  const reset = () => {
    setFile(null);
    setData([]);
    setHeaders([]);
    setMapping({});
    setStatus('IDLE');
    setProgress(0);
    setValidationError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3 uppercase italic">
            <SafeIcon icon={FiUploadCloud} className="text-blue-400" />
            Universal Data Importer
          </h2>
          <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">Batch Ingest & Normalization</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {status === 'IDLE' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="border-2 border-dashed border-slate-700 bg-slate-900/50 rounded-3xl p-16 text-center hover:border-blue-500 hover:bg-slate-800/50 transition-all cursor-pointer group"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".csv,.json"
              onChange={handleFileSelect}
            />
            <div className="w-20 h-20 mx-auto bg-slate-800 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600/20 transition-all">
               <SafeIcon icon={FiUploadCloud} className="text-3xl text-slate-400 group-hover:text-blue-400 transition-colors" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Drag & Drop Files Here</h3>
            <p className="text-slate-500 text-sm mb-6">Supports .CSV and .JSON (Max 10MB)</p>
            <button className="px-6 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors">
              Browse Files
            </button>
          </motion.div>
        )}

        {status === 'MAPPING' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex justify-between items-center shadow-xl">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
                    <SafeIcon icon={FiFile} className="text-xl" />
                 </div>
                 <div>
                    <h3 className="text-white font-bold text-sm">{file?.name}</h3>
                    <p className="text-slate-500 text-xs">{data.length} records detected</p>
                 </div>
               </div>
               <button onClick={reset} className="text-slate-500 hover:text-white transition-colors p-2">
                 <SafeIcon icon={FiTrash2} />
               </button>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 shadow-xl">
               <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                 <SafeIcon icon={FiSettings} className="text-blue-400" />
                 Map Data Columns
               </h3>

               <div className="space-y-4 mb-8">
                 {aximSchema.map(schema => (
                   <div key={schema.key} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-950 rounded-xl border border-slate-800">
                     <div className="w-1/3">
                        <label className="text-xs font-bold text-slate-300">{schema.label}</label>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">{schema.key}</p>
                     </div>
                     <div className="w-full md:w-2/3">
                        <select
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-white focus:border-blue-500 outline-none transition-colors"
                          value={mapping[schema.key] || ''}
                          onChange={(e) => handleMappingChange(schema.key, e.target.value)}
                        >
                          <option value="">-- Ignore --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                     </div>
                   </div>
                 ))}
               </div>

               {validationError && (
                 <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-xl text-red-400 text-sm font-bold">
                    {validationError}
                 </div>
               )}
               <div className="flex justify-end">
                 <button
                   onClick={handleProcess}
                   disabled={!mapping['email']}
                   className={`px-8 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg ${mapping['email'] ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                 >
                   <SafeIcon icon={FiPlay} /> PROCESS & ENRICH BATCH
                 </button>
               </div>
            </div>
          </motion.div>
        )}

        {(status === 'PROCESSING' || status === 'DONE') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center shadow-xl">
             <div className="max-w-md mx-auto">
               <div className="w-24 h-24 mx-auto mb-8 relative">
                 {status === 'PROCESSING' ? (
                   <>
                     <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                     <div
                       className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"
                     ></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                       <SafeIcon icon={FiActivity} className="text-blue-400 text-2xl animate-pulse" />
                     </div>
                   </>
                 ) : (
                   <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 rounded-full">
                     <SafeIcon icon={FiCheckCircle} className="text-emerald-500 text-5xl" />
                   </div>
                 )}
               </div>

               <h3 className="text-2xl font-bold text-white mb-2">
                 {status === 'PROCESSING' ? 'Ingesting Batch Data...' : 'Import Complete!'}
               </h3>

               <p className="text-slate-400 text-sm mb-8">
                 {status === 'PROCESSING'
                   ? `Dispatching records to enrichment pipeline in chunks.`
                   : `${data.length} records have been successfully submitted to the pipeline.`}
               </p>

               <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-8">
                 <div
                   className="h-full bg-blue-500 transition-all duration-300"
                   style={{ width: `${progress}%` }}
                 ></div>
               </div>

               {status === 'DONE' && (
                 <button
                   onClick={reset}
                   className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
                 >
                   IMPORT ANOTHER FILE
                 </button>
               )}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
