-- Database tables for incremental sync state management
-- Run this script to create the necessary tables for sync state and checkpoint tracking

-- Table to store overall sync state for each sync type
CREATE TABLE IF NOT EXISTS "sync_state" (
    id SERIAL PRIMARY KEY,
    last_media_sync_timestamp TIMESTAMPTZ,
    last_property_sync_timestamp TIMESTAMPTZ,
    last_rooms_sync_timestamp TIMESTAMPTZ,
    last_openhouse_sync_timestamp TIMESTAMPTZ,
    state_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to store checkpoints for resumable sync operations
CREATE TABLE IF NOT EXISTS "sync_checkpoints" (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL UNIQUE,
    checkpoint_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to store processed media keys for deduplication
CREATE TABLE IF NOT EXISTS "processed_media_keys" (
    id SERIAL PRIMARY KEY,
    media_key VARCHAR(255) NOT NULL UNIQUE,
    resource_record_key VARCHAR(255),
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    sync_batch_id VARCHAR(100),
    INDEX idx_media_key (media_key),
    INDEX idx_resource_record_key (resource_record_key),
    INDEX idx_processed_at (processed_at)
);

-- Indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_state_updated_at ON "sync_state" ("updated_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_checkpoints_sync_type ON "sync_checkpoints" ("sync_type");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_checkpoints_created_at ON "sync_checkpoints" ("created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_media_keys_media_key ON "processed_media_keys" ("media_key");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_media_keys_resource_record_key ON "processed_media_keys" ("resource_record_key");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_media_keys_processed_at ON "processed_media_keys" ("processed_at");

-- Insert initial sync state record
INSERT INTO "sync_state" (last_media_sync_timestamp, last_property_sync_timestamp, last_rooms_sync_timestamp, last_openhouse_sync_timestamp, state_data)
VALUES (NULL, NULL, NULL, NULL, '{}')
ON CONFLICT (id) DO NOTHING;

-- Function to clean up old checkpoints (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_checkpoints()
RETURNS void AS $$
BEGIN
    DELETE FROM "sync_checkpoints" 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    -- Clean up old processed media keys (older than 30 days)
    DELETE FROM "processed_media_keys" 
    WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Function to get sync status
CREATE OR REPLACE FUNCTION get_sync_status()
RETURNS TABLE (
    sync_type TEXT,
    last_sync_timestamp TIMESTAMPTZ,
    has_checkpoint BOOLEAN,
    checkpoint_age INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'media'::TEXT as sync_type,
        ss.last_media_sync_timestamp,
        (sc.sync_type IS NOT NULL) as has_checkpoint,
        (NOW() - sc.created_at) as checkpoint_age
    FROM "sync_state" ss
    LEFT JOIN "sync_checkpoints" sc ON sc.sync_type = 'media'
    
    UNION ALL
    
    SELECT 
        'property'::TEXT as sync_type,
        ss.last_property_sync_timestamp,
        (sc.sync_type IS NOT NULL) as has_checkpoint,
        (NOW() - sc.created_at) as checkpoint_age
    FROM "sync_state" ss
    LEFT JOIN "sync_checkpoints" sc ON sc.sync_type = 'property'
    
    UNION ALL
    
    SELECT 
        'rooms'::TEXT as sync_type,
        ss.last_rooms_sync_timestamp,
        (sc.sync_type IS NOT NULL) as has_checkpoint,
        (NOW() - sc.created_at) as checkpoint_age
    FROM "sync_state" ss
    LEFT JOIN "sync_checkpoints" sc ON sc.sync_type = 'rooms'
    
    UNION ALL
    
    SELECT 
        'openhouse'::TEXT as sync_type,
        ss.last_openhouse_sync_timestamp,
        (sc.sync_type IS NOT NULL) as has_checkpoint,
        (NOW() - sc.created_at) as checkpoint_age
    FROM "sync_state" ss
    LEFT JOIN "sync_checkpoints" sc ON sc.sync_type = 'openhouse';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON "sync_state" TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON "sync_checkpoints" TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON "processed_media_keys" TO your_app_user;
-- GRANT USAGE ON SEQUENCE sync_state_id_seq TO your_app_user;
-- GRANT USAGE ON SEQUENCE sync_checkpoints_id_seq TO your_app_user;
-- GRANT USAGE ON SEQUENCE processed_media_keys_id_seq TO your_app_user;

COMMENT ON TABLE "sync_state" IS 'Stores the last sync timestamp for each sync type and additional state data';
COMMENT ON TABLE "sync_checkpoints" IS 'Stores checkpoints for resumable sync operations';
COMMENT ON TABLE "processed_media_keys" IS 'Tracks processed media keys to avoid reprocessing duplicates';
COMMENT ON FUNCTION cleanup_old_checkpoints() IS 'Cleans up old checkpoints and processed media keys';
COMMENT ON FUNCTION get_sync_status() IS 'Returns current sync status for all sync types';
