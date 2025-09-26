# SyncLog Table Setup Guide

## Overview

The new Sync Service requires a `SyncLog` table to track sync operations and timestamps. This guide provides multiple ways to create this table.

## 🎯 What is SyncLog?

The `SyncLog` table tracks:
- **Individual endpoint sync timestamps** (IDX, VOW, Media, Rooms, OpenHouse)
- **Sync statistics** (processed, successful, failed records)
- **Performance metrics** (duration, error counts)
- **Audit trail** (created_at, updated_at timestamps)

## 📋 Setup Options

### Option 1: Automatic Setup (Recommended)

```bash
# Try the automatic setup script
node scripts/setup-sync-log.js

# If that fails, try the manual approach
node scripts/create-sync-log-manual.js

# Verify the table was created
node scripts/check-sync-log.js
```

### Option 2: Manual Database Setup

If the automatic scripts don't work, you can create the table manually:

1. **Open your database client** (pgAdmin, DBeaver, Supabase Dashboard, etc.)
2. **Connect to your Supabase database**
3. **Run the SQL from the file**: `database/create-sync-log-table.sql`

### Option 3: Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `database/create-sync-log-table.sql`
4. Click **Run** to execute the SQL

## 📊 Table Structure

```sql
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
```

## 🔍 Verification

After creating the table, verify it works:

```bash
# Check table status
node scripts/check-sync-log.js

# Test the sync service
node scripts/sync.js --help
```

## 📈 Usage Examples

### Check Sync Status
```sql
-- View latest sync status
SELECT * FROM latest_sync_status;

-- Check specific endpoint status
SELECT * FROM get_endpoint_sync_status('idx_property');
```

### Manual Sync Log Entry
```sql
-- Insert a manual sync log entry
INSERT INTO "SyncLog" (
    timestamp,
    idx_property_timestamp,
    total_processed,
    total_successful,
    total_failed
) VALUES (
    NOW(),
    NOW(),
    1000,
    950,
    50
);
```

## 🚀 Next Steps

Once the SyncLog table is created:

1. **Test the sync service**: `node scripts/sync.js --help`
2. **Run a full sync**: `node scripts/sync.js`
3. **Run selective sync**: `node scripts/sync.js --idx --media`
4. **Monitor sync status**: `node scripts/check-sync-log.js`

## 🔧 Troubleshooting

### Common Issues

1. **"Table doesn't exist" error**
   - Run the setup scripts or create the table manually
   - Check database permissions

2. **"Permission denied" error**
   - Ensure your database user has CREATE TABLE permissions
   - Check Supabase RLS policies

3. **"Connection failed" error**
   - Verify your `.env` files have correct Supabase credentials
   - Check network connectivity

### Manual Verification

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'SyncLog';

-- Check table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'SyncLog'
ORDER BY ordinal_position;

-- Check for records
SELECT COUNT(*) FROM "SyncLog";
```

## 📚 Related Files

- `database/create-sync-log-table.sql` - Complete SQL for table creation
- `scripts/setup-sync-log.js` - Automatic setup script
- `scripts/check-sync-log.js` - Verification script
- `src/services/syncService.js` - The sync service that uses this table

## 🎉 Success!

Once the SyncLog table is created and verified, you can use the new Sync Service with:

- ✅ Time-based pagination (avoids 100K API limit)
- ✅ Parent-child data integrity
- ✅ Selective syncing via CLI switches
- ✅ Progress tracking and statistics
- ✅ Automatic timestamp management
