# KV / Sheets Configuration Sync Strategy

## Overview
The Cloudflare Worker executes with minimal latency using `env` variables and KV storage. However, our configuration and recovery interfaces reside in Google Sheets and our React UI. To achieve synchronization, a mechanism to pull from Google Sheets and update Cloudflare KV is required.

## Strategy: Edge-Pull via Cloudflare Worker

### Concept
Rather than using a local Node.js script, we can leverage the Cloudflare Worker itself. Since the worker is already bound to KV (`LEAD_KV`) and can authenticate incoming webhook calls using `AXIM_INTERNAL_KEY`, we can introduce a new management endpoint (e.g., `/v1/management/sync`).

### Implementation Steps
1. **Management Endpoint**: Update `src/index.js` to catch `/v1/management/sync`.
2. **Fetch Config**: The worker calls the Google Sheets API (via our `workerSheets.js` utility) to read the `Config` tab.
3. **Update KV**: The worker iterates over the configuration rows and sets the corresponding keys in `env.LEAD_KV` (e.g., prefixing them like `config:egress_url`).
4. **Trigger Mechanism**:
   - A human administrator can invoke the sync via a button in the UI (`ConfigView.jsx`) that sends an authenticated POST request to `/v1/management/sync`.
   - Optionally, Cloudflare Cron Triggers can invoke the endpoint on a schedule.

### Worker Access
At runtime, instead of relying exclusively on static environment variables, the worker first checks the KV cache for the `config:egress_url` when processing payloads. If found, it dispatches to the updated URL; if missing, it falls back to the static environment variable `env.ALBATO_WEBHOOK_URL`.
