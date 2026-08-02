import re

with open("src/components/DataTester.jsx", "r") as f:
    content = f.read()

# Add Lineage Viewer to the output section
# In the outputResult.map function
target = """                    <pre className="font-mono text-[11px] dark:bg-gray-800 bg-white/30 p-4 rounded-xl border dark:border-gray-700 border-gray-200/50 overflow-x-auto whitespace-pre-wrap">
                      <code dangerouslySetInnerHTML={{ __html: JSON.stringify(record, null, 2).replace(/("(.*?)":)/g, '<span class="text-blue-300">$1</span>').replace(/: "(.*?)"/g, ': <span class="text-emerald-400">"$1"</span>').replace(/: (true|false)/g, ': <span class="text-purple-400">$1</span>') }} />
                    </pre>
                  </motion.div>"""

new_rendering = """                    <pre className="font-mono text-[11px] dark:bg-gray-800 bg-white/30 p-4 rounded-xl border dark:border-gray-700 border-gray-200/50 overflow-x-auto whitespace-pre-wrap">
                      <code dangerouslySetInnerHTML={{ __html: JSON.stringify(record, null, 2).replace(/("(.*?)":)/g, '<span class="text-blue-300">$1</span>').replace(/: "(.*?)"/g, ': <span class="text-emerald-400">"$1"</span>').replace(/: (true|false)/g, ': <span class="text-purple-400">$1</span>') }} />
                    </pre>

                    {record._lineage && (
                      <div className="mt-4 p-4 dark:bg-gray-900 bg-gray-100 rounded-xl border dark:border-gray-700 border-gray-300">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 border-b dark:border-gray-700 border-gray-300 pb-2">Data Lineage Trace</h4>

                        <div className="flex flex-wrap gap-4 mb-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] uppercase font-bold text-slate-400">Processing Time</span>
                              <span className="text-[11px] font-mono text-emerald-400">{record._lineage.processing_time_ms} ms</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] uppercase font-bold text-slate-400">AI Provider</span>
                              <span className="text-[11px] font-mono text-blue-400">{record._lineage.ai_provider}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                           <span className="text-[9px] uppercase font-bold text-slate-400">Transformations Applied</span>
                           {record._lineage.rules_applied && record._lineage.rules_applied.length > 0 ? (
                              <div className="flex flex-col gap-2 relative pl-2 border-l-2 dark:border-gray-700 border-gray-300 ml-2">
                                {record._lineage.rules_applied.map((rule, idx) => (
                                  <div key={idx} className="flex items-center gap-2 relative">
                                     <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full dark:bg-gray-600 bg-gray-400"></div>
                                     <span className="text-[10px] font-mono dark:text-gray-300 text-gray-700 bg-black/5 dark:bg-black/20 px-2 py-1 rounded">{rule}</span>
                                  </div>
                                ))}
                              </div>
                           ) : (
                              <span className="text-[10px] italic text-slate-500">No transformations recorded.</span>
                           )}
                        </div>
                      </div>
                    )}
                  </motion.div>"""

content = content.replace(target, new_rendering)

with open("src/components/DataTester.jsx", "w") as f:
    f.write(content)
