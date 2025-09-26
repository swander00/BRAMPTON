# Sync Service - Complete Rewrite

## Overview

The Sync Service has been completely rewritten to handle extensive backfill operations with time-based pagination, parent-child data integrity, and efficient CLI-based selective syncing.

## Key Features

### ✅ Time-Based Pagination
- **IDX/VOW Properties**: Uses `ModificationTimestamp`
- **Media**: Uses `MediaModificationTimestamp` 
- **PropertyRooms**: Uses `ModificationTimestamp`
- **OpenHouse**: Uses `ModificationTimestamp`
- **Benefit**: Prevents hitting the 100K API record limit

### ✅ Parent-Child Data Integrity
- **Property** is treated as the parent table
- **Media**: Only processes records where `ResourceRecordKey` matches existing `ListingKey`
- **PropertyRooms**: Only processes records where `ListingKey` exists in Property
- **OpenHouse**: Only processes records where `ListingKey` exists in Property
- **Implementation**: Preloads property keys into memory for efficient filtering

### ✅ Skip Existing Records
- Uses `SyncLog` table to track last successful sync timestamps
- Implements `ON CONFLICT` to avoid overwriting unchanged rows
- Only fetches records modified since last sync

### ✅ Sequential Parent-Child Execution
- **Step 1**: Sync Properties (IDX + VOW)
- **Step 2**: Load Property Keys for integrity
- **Step 3**: Sync Children (Media, PropertyRooms, OpenHouses)
- **Guarantee**: Never processes children for missing parent records

### ✅ Readable Console Output
- Clear phase indicators (📊 IDX, 🖼️ Media, 🏠 Rooms, 🏡 OpenHouses)
- Progress tracking with percentages
- Batch-level statistics
- Final summary with success rates

### ✅ CLI Switches for Selective Syncing
```bash
# Full sync (default)
node scripts/sync.js

# Selective sync
node scripts/sync.js --idx              # IDX Properties only
node scripts/sync.js --vow              # VOW Properties only  
node scripts/sync.js --media            # Media only
node scripts/sync.js --rooms            # PropertyRooms only
node scripts/sync.js --openhouse        # OpenHouses only

# Combined switches
node scripts/sync.js --idx --vow        # Both property feeds
node scripts/sync.js --media --rooms    # Media + Rooms
node scripts/sync.js --force            # Force sync (ignore timestamps)
```

## Configuration

### Batch Sizes
```javascript
property: {
  batchSize: 5000,        // API fetch batch size
  dbBatchSize: 100,       // Database upsert batch size
  throttleDelay: 500      // Delay between batches (ms)
},
media: {
  batchSize: 2000,        // API fetch batch size
  dbBatchSize: 100,       // Database upsert batch size
  throttleDelay: 750      // Delay between batches (ms)
},
rooms: {
  batchSize: 5000,        // API fetch batch size
  dbBatchSize: 100,       // Database upsert batch size
  throttleDelay: 500      // Delay between batches (ms)
},
openHouse: {
  batchSize: 5000,        // API fetch batch size
  dbBatchSize: 100,       // Database upsert batch size
  throttleDelay: 500      // Delay between batches (ms)
}
```

### Timestamp Fields
- **Properties**: `ModificationTimestamp`
- **Media**: `MediaModificationTimestamp` (different field!)
- **PropertyRooms**: `ModificationTimestamp`
- **OpenHouse**: `ModificationTimestamp`

## Database Schema Requirements

### SyncLog Table
```sql
CREATE TABLE SyncLog (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  idx_property_timestamp TIMESTAMPTZ,
  vow_property_timestamp TIMESTAMPTZ,
  media_timestamp TIMESTAMPTZ,
  rooms_timestamp TIMESTAMPTZ,
  openhouse_timestamp TIMESTAMPTZ,
  total_processed INTEGER,
  total_successful INTEGER,
  total_failed INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Usage Examples

### 1. Full Backfill
```bash
# Run complete backfill with all endpoints
node scripts/test-enhanced-sync.js
```

### 2. Incremental Sync
```bash
# Run incremental sync (only new/updated records)
node scripts/test-enhanced-sync.js
```

### 3. Selective Property Sync
```bash
# Sync only IDX properties
node scripts/test-enhanced-sync.js --idx

# Sync only VOW properties  
node scripts/test-enhanced-sync.js --vow

# Sync both property feeds
node scripts/test-enhanced-sync.js --idx --vow
```

### 4. Selective Child Sync
```bash
# Sync only media (requires properties to exist)
node scripts/test-enhanced-sync.js --media

# Sync only rooms (requires properties to exist)
node scripts/test-enhanced-sync.js --rooms

# Sync only open houses (requires properties to exist)
node scripts/test-enhanced-sync.js --openhouse
```

### 5. Force Sync
```bash
# Force sync all endpoints regardless of timestamps
node scripts/test-enhanced-sync.js --force
```

## Console Output Example

```
🚀 Starting Enhanced Sync - 2024-01-15T10:30:00.000Z
📋 Sync Options: { idx: true, vow: true, media: true, rooms: true, openhouse: true }

📅 Loaded last sync timestamps: {
  idx_property: "2024-01-14T15:45:00.000Z",
  vow_property: "2024-01-14T15:45:00.000Z",
  media: "2024-01-14T15:45:00.000Z",
  rooms: "2024-01-14T15:45:00.000Z",
  openhouse: "2024-01-14T15:45:00.000Z"
}

🔄 Executing Full Sync with Parent-Child Integrity

📊 === PROPERTY SYNC (PARENT) ===
⏰ Starting IDX Property sync
📅 Last sync: 2024-01-14T15:45:00.000Z
📊 Total records to process: 15,432
🔄 Batch 1: Fetching idx Property from 2024-01-14T15:45:00.000Z
📥 Batch 1: Fetched 5,000 records
✅ Batch 1: Processed 5,000, Success: 4,987, Failed: 13
📈 Progress: 32.4% (5,000/15,432)
...

✅ IDX Property sync completed
📊 Final stats: 15,420 successful, 12 failed, 3 batches

⏰ Starting VOW Property sync
📅 Last sync: 2024-01-14T15:45:00.000Z
📊 Total records to process: 8,234
...

🏠 Loading property keys for parent-child integrity...
✅ Loaded 23,654 property keys

🖼️  === MEDIA SYNC (CHILD) ===
⏰ Starting Media sync with parent integrity
📅 Last sync: 2024-01-14T15:45:00.000Z
📊 Total media records: 45,678
🏠 Property keys loaded: 23,654
🔄 Batch 1: Fetching Media from 2024-01-14T15:45:00.000Z
📥 Batch 1: Fetched 2,000 media records
🔍 Batch 1: 1,847 valid records (153 skipped)
✅ Batch 1: Processed 1,847, Success: 1,845, Failed: 2, Skipped: 153
📈 Progress: 4.0% (2,000/45,678) - Skipped: 153
...

✅ Media sync completed
📊 Final stats: 42,156 successful, 89 failed, 1,234 skipped

🎉 === SYNC COMPLETED ===
⏱️  Duration: 45 minutes
📊 Total Processed: 89,234
✅ Successful: 88,945
❌ Failed: 289
📈 Success Rate: 99.7%
```

## Error Handling

- **API Errors**: Logged and tracked in batch statistics
- **Database Errors**: Logged with chunk-level details
- **Validation Errors**: Tracked per record with specific error messages
- **Parent-Child Integrity**: Automatically skips orphaned records
- **Rate Limiting**: Built-in throttling with configurable delays

## Performance Optimizations

1. **Time-Based Pagination**: Avoids 100K API limit
2. **Memory Caching**: Property keys loaded once for child integrity
3. **Batch Processing**: Configurable batch sizes for API and database
4. **Throttling**: Adaptive delays to prevent rate limiting
5. **ON CONFLICT**: Efficient upserts without unnecessary overwrites
6. **Selective Fetching**: Only fetch records modified since last sync

## Migration from Old Service

The new service is a complete rewrite with a different API:

### Old Service
```javascript
const syncService = new EnhancedSyncService();
await syncService.executeFullSync();
await syncService.syncPropertiesInBatches();
await syncService.syncMediaInBatches();
```

### New Service
```javascript
const syncService = new SyncService();
await syncService.executeSync(); // Handles CLI parsing automatically
```

## Testing

Run the test script to see CLI functionality:

```bash
# Show usage information
node scripts/sync.js --help

# Test full sync
node scripts/sync.js

# Test selective sync
node scripts/sync.js --idx --media
```

## Troubleshooting

### Common Issues

1. **"No property keys loaded"**: Run property sync first
2. **"100K API limit hit"**: Service now uses time-based pagination automatically
3. **"High skip rates"**: Normal for child endpoints - indicates good parent-child integrity
4. **"Slow performance"**: Adjust batch sizes and throttle delays in config

### Monitoring

- Check `SyncLog` table for sync history
- Monitor console output for progress and errors
- Review logs for detailed error information
- Use CLI switches to isolate problematic endpoints
