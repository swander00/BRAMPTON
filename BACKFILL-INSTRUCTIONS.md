# AMPRE Backfill Sync Instructions

## Overview
The backfill sync will perform a complete initial data load from the AMPRE API to your Supabase database. This includes all available properties and their associated media.

## Prerequisites

### 1. Environment Setup
First, create a `.env` file in the project root with your configuration:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AMPRE API Configuration  
AMPRE_BASE_URL=https://query.ampre.ca
ACCESS_TOKEN=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2ZW5kb3JcL3RycmViXC83IiwiYXVkIjoiQW1wVXNlcnNVYXQiLCJyb2xlcyI6WyJBbXBWZW5kb3IiXSwiaXNzIjoiYW1wcmUudXMiLCJleHAiOjE3MDIxNjgyNjQsImlhdCI6MTY4NjYxMjY2OSwic3ViamVjdFR5cGUiOiJ2ZW5kb3IiLCJzdWJqZWN0S2V5IjoiNyIsImp0aSI6IjA3NDBlMzUzOTU4N2JmNGMiLCJjdXN0b21lck5hbWUiOiJ0cnJlYiJ9.At5kSygoqjUh4fhXgzpAtkIVMNANNzA0zFMMfknKsCE

# Optional Configuration
BATCH_SIZE_PROPERTY=1000
BATCH_SIZE_MEDIA=500  
LOG_LEVEL=info
TZ=America/Toronto
```

### 2. Database Setup
Ensure your Supabase database tables are created by running the SQL in `database/create-tables.sql` in your Supabase SQL editor.

### 3. Install Dependencies
```bash
npm install
```

## Running the Backfill

### Option 1: Quick Runner (Recommended)
```bash
npm run backfill
```

This will:
- Check your environment configuration
- Verify API and database connectivity
- Run the complete backfill process
- Show progress and final summary

### Option 2: Direct Script Execution
```bash
npm run backfill-direct
```

### Option 3: Manual Node Execution
```bash
node run-backfill.js
```

## Command Line Options

You can customize the backfill behavior with these flags:

```bash
# Save raw JSON files locally (for backup/debugging)
npm run backfill -- --save-files

# Reset database tables before sync (USE WITH CAUTION)
npm run backfill -- --reset-db

# Sync only properties (no media)
npm run backfill -- --no-media

# Sync only media (no properties)
npm run backfill -- --no-properties
```

## What to Expect

### Initial Setup
- Environment validation
- API connectivity test
- Database health check

### Property Sync
- Fetches all available properties (ContractStatus = 'Available')
- Processes in batches of 1000 (configurable)
- Maps RESO fields to your database schema
- Shows progress every 100 records

### Media Sync  
- Fetches all media records
- Links media to properties via ResourceRecordKey
- Processes in batches of 500 (configurable)
- Handles photos, virtual tours, etc.

### Progress Monitoring
The script will show:
- Batch progress (X/Y batches completed)
- Record counts (processed/total)
- Success/failure rates
- Estimated time remaining

### Output
- Real-time progress logs
- Final summary report
- Detailed report saved to `logs/backfill-report-{timestamp}.json`
- Error details for any failed records

## Expected Runtime
- **Small dataset (< 1k properties)**: 2-5 minutes
- **Medium dataset (1k-10k properties)**: 10-30 minutes  
- **Large dataset (10k+ properties)**: 30+ minutes

Runtime depends on:
- Number of properties and media
- Network speed
- Database performance
- AMPRE API response times

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   ```
   Error: Missing required environment variables: SUPABASE_URL
   ```
   Solution: Check your `.env` file has all required variables

2. **Database Connection Failed**
   ```
   Error: Database health check failed
   ```
   Solution: Verify Supabase credentials and database is accessible

3. **API Authentication Failed**
   ```
   Error: HTTP 401: Unauthorized
   ```
   Solution: Check your AMPRE ACCESS_TOKEN is valid and not expired

4. **Database Table Missing**
   ```
   Error: relation "Property" does not exist
   ```
   Solution: Run the SQL from `database/create-tables.sql` in Supabase

5. **Network Timeouts**
   ```
   Error: fetch failed
   ```
   Solution: Check internet connection, try again later

### Monitoring Progress

Check these files during/after execution:
- `logs/combined.log` - Detailed execution logs
- `logs/error.log` - Error-specific logs  
- `logs/backfill-report-*.json` - Final summary report

## Data Validation

After completion, verify your data:

```sql
-- Check property counts
SELECT COUNT(*) as total_properties FROM "Property";

-- Check media counts  
SELECT COUNT(*) as total_media FROM "Media";

-- Check property-media relationships
SELECT 
  p."ListingKey",
  COUNT(m."MediaKey") as media_count
FROM "Property" p
LEFT JOIN "Media" m ON p."ListingKey" = m."ResourceRecordKey"
GROUP BY p."ListingKey"
ORDER BY media_count DESC
LIMIT 10;

-- Check recent modifications
SELECT 
  "ListingKey",
  "ModificationTimestamp",
  "MlsStatus"
FROM "Property" 
ORDER BY "ModificationTimestamp" DESC 
LIMIT 10;
```

## Next Steps

After successful backfill:

1. **Set up incremental sync** for ongoing updates:
   ```bash
   npm run sync
   ```

2. **Start the API server** to access your data:
   ```bash
   npm run dev
   ```

3. **Monitor sync status** via API:
   ```bash
   curl http://localhost:3000/api/sync/status
   ```

## Support

If you encounter issues:
1. Check the logs in the `logs/` directory
2. Verify your environment configuration
3. Test API connectivity manually with the Postman collection
4. Check Supabase dashboard for database errors
