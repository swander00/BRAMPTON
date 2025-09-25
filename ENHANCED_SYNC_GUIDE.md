# Enhanced Sync Guide

## Overview

The Enhanced Sync Service provides improved error handling, 5000-record batching, and clear console output for syncing real estate data from AMPRE API to Supabase.

## Key Improvements

### 🔧 Error Handling
- **Detailed HTTP Error Messages**: Now shows the actual error response body from the API instead of just "HTTP 400:"
- **Graceful Error Recovery**: Continues processing other batches even if one fails
- **Comprehensive Error Logging**: All errors are logged with context for debugging

### 📊 Batching (5000 Records)
- **API Fetching**: Fetches data in 5000-record batches for efficiency
- **Database Operations**: Processes database operations in smaller 100-record chunks for stability
- **Memory Efficient**: Processes and releases memory for each batch

### 🖥️ Console Output
- **Real-time Progress**: Shows progress with batch numbers, percentages, and timing
- **Clear Visual Feedback**: Uses emojis and formatting for easy reading
- **Performance Metrics**: Displays records/second processing speed
- **Comprehensive Summaries**: Final statistics for success rates and totals

## Usage

### Full Sync (Properties + Media)
```bash
node src/scripts/enhanced-sync.js
```

### Properties Only
```bash
node src/scripts/enhanced-sync.js --properties-only
```

### Media Only
```bash
node src/scripts/enhanced-sync.js --media-only
```

### Single Property Sync
```bash
node src/scripts/enhanced-sync.js --single X12172823
```

## Error Analysis

The HTTP 400 errors you were seeing are likely caused by:

1. **Token Expiration**: Your API tokens may have expired
2. **Invalid Filters**: OData filter syntax might be malformed
3. **Rate Limiting**: API might be rate limiting your requests
4. **Authentication Issues**: Wrong token for the requested feed type

### Check Your Tokens
Your tokens in `src/config/credentials.js`:
- **IDX Token**: Expires 2534023007 (Year 2050 - OK)
- **VOW Token**: Expires 2534023007 (Year 2050 - OK)

### Common 400 Error Solutions
1. **Check API Response**: Enhanced error handling now shows the actual error message
2. **Verify Filters**: Make sure OData filters are properly encoded
3. **Test Individual Endpoints**: Use the single property sync to test specific records
4. **Monitor Rate Limits**: The enhanced sync includes timing to help identify rate limiting

## Sample Console Output

```
🚀 Enhanced Sync Script Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 2025-01-24T19:51:13.000Z
🔧 Arguments: none
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏠 ===== ENHANCED PROPERTY SYNC STARTED =====
📊 Batch Size: 5,000 records
💾 Database Batch Size: 100 records
⏰ Started at: 2025-01-24T19:51:13.123Z

📈 Total properties available: 25,847
🔄 Will process in batches of 5,000

📦 ===== BATCH 1 =====
📥 Fetching records 0 - 4,999
✅ Fetched 5,000 properties
🔄 Processing 5,000 properties for batch 1...
✅ Mapped 4,987/5,000 properties successfully
💾 Upserting to database in batches of 100...
💾 Database upsert: 4,987/4,987 successful
⏱️  Batch 1 completed in 45s (111 records/sec)
📊 Batch Stats: 4,987/5,000 successful (99%)
🎯 Overall Progress: 5,000/25,847 (19%)
```

## Monitoring and Debugging

### Log Files
- Main application logs: `logs/app.log`
- Error details are logged with full context
- Batch processing stats included in logs

### Performance Monitoring
- **Records per second**: Shows processing speed
- **Success rates**: Percentage of successful records per batch
- **Memory usage**: Batching prevents memory overflow
- **Error patterns**: Grouped errors help identify systematic issues

### Troubleshooting Commands

Test API connectivity:
```bash
node src/scripts/enhanced-sync.js --single X12172823
```

Check specific error details in logs:
```bash
tail -f logs/app.log | grep ERROR
```

## Configuration

Edit `src/config/credentials.js` to:
- Update API tokens if expired
- Modify batch sizes if needed
- Change API endpoints

## Comparison with Original

| Feature | Original | Enhanced |
|---------|----------|----------|
| Batch Size | 1,000 | 5,000 |
| Error Details | "HTTP 400:" | Full error response |
| Console Output | Minimal | Rich with emojis & progress |
| Error Recovery | Stops on error | Continues processing |
| Performance Metrics | None | Records/sec, timing |
| Database Batching | 100 | Configurable (default 100) |
| Memory Management | Basic | Optimized batch processing |
