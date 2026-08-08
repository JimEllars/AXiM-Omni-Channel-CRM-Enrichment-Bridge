CREATE TABLE IF NOT EXISTS public.bridge_config_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    backup_type TEXT DEFAULT 'full_kv_snapshot' NOT NULL,
    payload JSONB NOT NULL
);
ALTER TABLE public.bridge_config_backups ENABLE ROW LEVEL SECURITY;
