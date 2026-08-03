with open("src/utils/enrichmentLogic.js", "r") as f:
    content = f.read()

content = content.replace("                ai_provider: 'fallback_proxy',\\n          provider: 'cloudflare_workers_ai',\\n          ai_provider: 'llama-3.1-8b',", "          provider: 'cloudflare_workers_ai',")
content = content.replace("                ai_provider: 'fallback_proxy',\n          provider: 'cloudflare_workers_ai',\n          ai_provider: 'llama-3.1-8b',", "          provider: 'cloudflare_workers_ai',")

with open("src/utils/enrichmentLogic.js", "w") as f:
    f.write(content)
