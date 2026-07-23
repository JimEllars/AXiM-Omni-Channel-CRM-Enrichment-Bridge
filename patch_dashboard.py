import re

with open('src/components/Dashboard.jsx', 'r') as f:
    content = f.read()

# Add states for edgeAiSuccess and edgeAiFallback
states_regex = r"const \[aiRescues, setAiRescues\] = useState\(null\);\n\s+const \[rateLimitDrops, setRateLimitDrops\] = useState\(null\);"
new_states = """const [aiRescues, setAiRescues] = useState(null);
  const [rateLimitDrops, setRateLimitDrops] = useState(null);
  const [edgeAiSuccess, setEdgeAiSuccess] = useState(0);
  const [edgeAiFallback, setEdgeAiFallback] = useState(0);"""

content = re.sub(states_regex, new_states, content)

# Update fetchAnalytics to extract and set the new states
fetch_regex = r"setAiRescues\(data\.cognitive_rescues\);\n\s+setRateLimitDrops\(data\.rate_limit_drops\);\n\s+setErrorMsg\(null\);"
new_fetch = """setAiRescues(data.cognitive_rescues);
          setRateLimitDrops(data.rate_limit_drops);
          setEdgeAiSuccess(data.edge_ai_success || 0);
          setEdgeAiFallback(data.edge_ai_fallback || 0);
          setErrorMsg(null);"""

content = re.sub(fetch_regex, new_fetch, content)

# Update the cards rendering
cards_regex = r"\{ title: 'Cognitive Rescues', value: loadingRescues \? '\.\.\.' : \(aiRescues \|\| 0\), icon: FiCpu, color: 'text-indigo-400', bg: 'bg-indigo-400/10', trend: '\+NEW' \},"
new_cards = """{
      title: 'Cognitive Rescues',
      value: loadingRescues ? '...' : (aiRescues || 0),
      icon: FiCpu,
      color: 'text-indigo-400',
      bg: 'bg-indigo-400/10',
      trend: '+NEW',
      split: {
        local: loadingRescues ? 0 : edgeAiSuccess,
        external: loadingRescues ? 0 : edgeAiFallback
      }
    },"""

content = re.sub(cards_regex, new_cards, content)


render_regex = r"(<h4 className=\"text-3xl font-black text-white italic tracking-tighter\">\{card\.value\.toLocaleString\(\)\}</h4>\n\s+</motion\.div>)"

def replacer_render(match):
    return """<h4 className="text-3xl font-black text-white italic tracking-tighter">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</h4>
            {card.split && (
              <div className="mt-2 flex gap-2 text-[9px] font-bold tracking-widest text-slate-400">
                <span className="bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">LOCAL: {card.split.local}</span>
                <span className="bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">EXT: {card.split.external}</span>
              </div>
            )}
          </motion.div>"""

content = re.sub(render_regex, replacer_render, content)

with open('src/components/Dashboard.jsx', 'w') as f:
    f.write(content)
