-- ===========================================
-- SYNC LOG TABLE CREATION
-- ===========================================
-- This table tracks sync operations and timestamps
-- for the new Sync Service with time-based pagination

-- Drop table if exists (for recreation)
DROP TABLE IF EXISTS "SyncLog" CASCADE;

-- Create SyncLog table
CREATE TABLE "SyncLog" (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Individual endpoint sync timestamps
    idx_property_timestamp TIMESTAMPTZ,
    vow_property_timestamp TIMESTAMPTZ,
    media_timestamp TIMESTAMPTZ,
    rooms_timestamp TIMESTAMPTZ,
    openhouse_timestamp TIMESTAMPTZ,
    
    -- Sync statistics
    total_processed INTEGER DEFAULT 0,
    total_successful INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    
    -- Additional metadata
    sync_duration_minutes DECIMAL(10,2),
    error_count INTEGER DEFAULT 0,
    last_error_message TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_synclog_timestamp ON "SyncLog" (timestamp DESC);
CREATE INDEX idx_synclog_idx_property ON "SyncLog" (idx_property_timestamp DESC);
CREATE INDEX idx_synclog_vow_property ON "SyncLog" (vow_property_timestamp DESC);
CREATE INDEX idx_synclog_media ON "SyncLog" (media_timestamp DESC);
CREATE INDEX idx_synclog_rooms ON "SyncLog" (rooms_timestamp DESC);
CREATE INDEX idx_synclog_openhouse ON "SyncLog" (openhouse_timestamp DESC);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_synclog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_synclog_updated_at
    BEFORE UPDATE ON "SyncLog"
    FOR EACH ROW
    EXECUTE FUNCTION update_synclog_updated_at();

-- Insert initial sync log entry
INSERT INTO "SyncLog" (
    timestamp,
    idx_property_timestamp,
    vow_property_timestamp,
    media_timestamp,
    rooms_timestamp,
    openhouse_timestamp,
    total_processed,
    total_successful,
    total_failed,
    sync_duration_minutes,
    error_count,
    last_error_message
) VALUES (
    NOW(),
    NULL, -- No previous syncs
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    0,
    0,
    0.0,
    0,
    NULL
);

-- Create a view for easy access to latest sync status
CREATE OR REPLACE VIEW latest_sync_status AS
SELECT 
    id,
    timestamp,
    idx_property_timestamp,
    vow_property_timestamp,
    media_timestamp,
    rooms_timestamp,
    openhouse_timestamp,
    total_processed,
    total_successful,
    total_failed,
    sync_duration_minutes,
    error_count,
    last_error_message,
    created_at,
    updated_at,
    -- Calculate success rate
    CASE 
        WHEN total_processed > 0 
        THEN ROUND((total_successful::DECIMAL / total_processed::DECIMAL) * 100, 2)
        ELSE 0 
    END as success_rate_percent,
    -- Calculate time since last sync
    EXTRACT(EPOCH FROM (NOW() - timestamp)) / 60 as minutes_since_last_sync
FROM "SyncLog"
ORDER BY timestamp DESC
LIMIT 1;

-- Create a function to get sync status for a specific endpoint
CREATE OR REPLACE FUNCTION get_endpoint_sync_status(endpoint_name TEXT)
RETURNS TABLE (
    endpoint TEXT,
    last_sync TIMESTAMPTZ,
    minutes_ago DECIMAL,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        endpoint_name as endpoint,
        CASE 
            WHEN endpoint_name = 'idx_property' THEN s.idx_property_timestamp
            WHEN endpoint_name = 'vow_property' THEN s.vow_property_timestamp
            WHEN endpoint_name = 'media' THEN s.media_timestamp
            WHEN endpoint_name = 'rooms' THEN s.rooms_timestamp
            WHEN endpoint_name = 'openhouse' THEN s.openhouse_timestamp
            ELSE NULL
        END as last_sync,
        CASE 
            WHEN endpoint_name = 'idx_property' AND s.idx_property_timestamp IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (NOW() - s.idx_property_timestamp)) / 60
            WHEN endpoint_name = 'vow_property' AND s.vow_property_timestamp IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (NOW() - s.vow_property_timestamp)) / 60
            WHEN endpoint_name = 'media' AND s.media_timestamp IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (NOW() - s.media_timestamp)) / 60
            WHEN endpoint_name = 'rooms' AND s.rooms_timestamp IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (NOW() - s.rooms_timestamp)) / 60
            WHEN endpoint_name = 'openhouse' AND s.openhouse_timestamp IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (NOW() - s.openhouse_timestamp)) / 60
            ELSE NULL
        END as minutes_ago,
        CASE 
            WHEN endpoint_name = 'idx_property' AND s.idx_property_timestamp IS NOT NULL THEN 'synced'
            WHEN endpoint_name = 'vow_property' AND s.vow_property_timestamp IS NOT NULL THEN 'synced'
            WHEN endpoint_name = 'media' AND s.media_timestamp IS NOT NULL THEN 'synced'
            WHEN endpoint_name = 'rooms' AND s.rooms_timestamp IS NOT NULL THEN 'synced'
            WHEN endpoint_name = 'openhouse' AND s.openhouse_timestamp IS NOT NULL THEN 'synced'
            ELSE 'never_synced'
        END as status
    FROM "SyncLog" s
    ORDER BY s.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON "SyncLog" TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE "SyncLog_id_seq" TO your_app_user;

-- Add comments for documentation
COMMENT ON TABLE "SyncLog" IS 'Tracks sync operations and timestamps for the new Sync Service';
COMMENT ON COLUMN "SyncLog".timestamp IS 'When the sync operation was performed';
COMMENT ON COLUMN "SyncLog".idx_property_timestamp IS 'Last successful IDX property sync timestamp';
COMMENT ON COLUMN "SyncLog".vow_property_timestamp IS 'Last successful VOW property sync timestamp';
COMMENT ON COLUMN "SyncLog".media_timestamp IS 'Last successful media sync timestamp';
COMMENT ON COLUMN "SyncLog".rooms_timestamp IS 'Last successful property rooms sync timestamp';
COMMENT ON COLUMN "SyncLog".openhouse_timestamp IS 'Last successful open house sync timestamp';
COMMENT ON COLUMN "SyncLog".total_processed IS 'Total number of records processed in this sync';
COMMENT ON COLUMN "SyncLog".total_successful IS 'Number of successfully processed records';
COMMENT ON COLUMN "SyncLog".total_failed IS 'Number of failed records';
COMMENT ON COLUMN "SyncLog".sync_duration_minutes IS 'Duration of the sync operation in minutes';
COMMENT ON COLUMN "SyncLog".error_count IS 'Number of errors encountered during sync';
COMMENT ON COLUMN "SyncLog".last_error_message IS 'Last error message encountered';

-- Display success message
DO $$
BEGIN
    RAISE NOTICE 'SyncLog table created successfully!';
    RAISE NOTICE 'You can now use the new Sync Service with time-based pagination.';
    RAISE NOTICE 'Run: SELECT * FROM latest_sync_status; to see current sync status.';
END $$;
