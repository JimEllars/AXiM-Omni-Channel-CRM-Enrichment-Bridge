CREATE TABLE public.canonical_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('INDIVIDUAL', 'ORGANIZATION')),
    legal_name VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    primary_email VARCHAR(255),
    primary_phone VARCHAR(50),
    attributes JSONB,
    state_hash CHAR(64),
    last_enriched_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.external_identity_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id UUID REFERENCES public.canonical_entities(id),
    system_name VARCHAR(50) NOT NULL CHECK (system_name IN ('SUITEDASH', 'DESKERA', 'AXIM_INTERNAL')),
    external_id VARCHAR(255) NOT NULL,
    last_synced_hash CHAR(64),
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT external_identity_mappings_unique UNIQUE (system_name, external_id)
);

CREATE TABLE public.sync_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'NO_OP', 'DELETE')),
    source_system VARCHAR(50),
    target_system VARCHAR(50),
    status_code INT,
    execution_time_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.conflict_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_data JSONB,
    score NUMERIC(4,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_canonical_entities_primary_email ON public.canonical_entities(primary_email);
CREATE INDEX idx_canonical_entities_primary_phone ON public.canonical_entities(primary_phone);
CREATE INDEX idx_external_identity_mappings_sys_ext ON public.external_identity_mappings(system_name, external_id);
