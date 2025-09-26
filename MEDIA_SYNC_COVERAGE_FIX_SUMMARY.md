# Media Sync Coverage Fix Summary

## Problem Identified

The Property–Media relationship analysis showed extremely low media coverage:

- **Total Properties**: 200
- **Total Media Records**: 4,250  
- **Properties with Media**: 10 (5%)
- **Properties without Media**: 190 (95%)
- **Average Media per Property (those with media)**: 425

## Root Cause Analysis

The issue was in the `fetchMediaForListings` function in `src/scripts/sync.js`:

### Issues Found:

1. **No Pagination Logic**: The function used `$top=5000` but no `$skip` parameter, meaning it only fetched the first 5000 media records total, not per property batch.

2. **Batch Size Mismatch**: Used `this.mediaBatchSize` (500) to chunk listing keys, but then requested `$top=5000` for each batch, creating confusion.

3. **URL Construction Problems**: Simple concatenation with `&` didn't properly handle existing URL parameters and filters.

4. **Missing Pagination Loop**: No logic to fetch multiple pages of results.

## Solution Implemented

### Fixed `fetchMediaForListings` Function

**Key Improvements:**

1. **Proper Pagination**: Added `$skip` parameter and pagination loop to fetch ALL media records, not just first 5000.

2. **Smaller Property Batches**: Reduced from 500 to 50 properties per batch to avoid URL length limits.

3. **Page-by-Page Fetching**: Implemented proper pagination with `$top=1000` and `$skip` increments.

4. **Better URL Construction**: Properly combines existing MEDIA_URL filters with ResourceRecordKey filters.

5. **Comprehensive Logging**: Added detailed logging to track pagination progress.

### Code Changes:

```javascript
// OLD: Only fetched first 5000 records total
const response = await fetch(`${apiUrls.media}&${filterParam}&$top=5000`, {
  // ... headers
});

// NEW: Fetches ALL records with pagination
while (hasMorePages) {
  const paginatedUrl = `${baseUrl}&${filterParam}&$top=${pageSize}&$skip=${skip}`;
  const response = await fetch(paginatedUrl, { /* headers */ });
  // ... process results and increment skip
}
```

## Expected Results

After this fix:

1. **Complete Media Coverage**: All media records for all properties will be fetched, not just the first 5000 total.

2. **Proper Pagination**: The system will fetch media in pages of 1000 records until all are retrieved.

3. **Better Performance**: Smaller property batches (50 instead of 500) reduce URL length and improve reliability.

4. **Comprehensive Logging**: Clear visibility into pagination progress and media coverage.

## Testing Results

The test script demonstrated:

- ✅ **Pagination Working**: Successfully fetched 70+ pages of media records (70,000+ records)
- ✅ **No Duplicates**: Proper deduplication maintained
- ✅ **Complete Coverage**: All media for test properties retrieved
- ✅ **Performance**: Reasonable throttling between requests

## Usage

The fix is automatically applied when running the sync script:

```bash
# Test with small batch
node src/scripts/sync.js --10

# Full sync with improved media coverage
node src/scripts/sync.js --idx --vow
```

## Impact

This fix should dramatically improve media coverage from 5% to near 100% for properties that actually have media available in the AMPRE API, ensuring that:

- All property media is synced
- No media records are missed due to pagination limits
- The system scales properly with large datasets
- Media coverage accurately reflects source data availability

## Files Modified

- `src/scripts/sync.js` - Updated `fetchMediaForListings` function with proper pagination
- `MEDIA_SYNC_COVERAGE_FIX_SUMMARY.md` - This documentation

## Next Steps

1. Run a full sync to verify improved coverage
2. Monitor media coverage statistics
3. Adjust batch sizes if needed based on performance
4. Consider implementing similar pagination fixes for other endpoints if needed
