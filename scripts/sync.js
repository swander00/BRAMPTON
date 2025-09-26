#!/usr/bin/env node

/**
 * Sync script for the new Sync Service
 * Demonstrates CLI functionality and selective syncing
 */

// Load environment variables
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env files (try .env.local first, then .env)
config({ path: join(__dirname, '../.env.local') });
config({ path: join(__dirname, '../.env') });

import SyncService from '../src/services/syncService.js';
import logger from '../src/utils/logger.js';

async function testSync() {
  console.log('🧪 Testing Sync Service');
  console.log('=====================================\n');
  
  const syncService = new SyncService();
  
  try {
    // Test 1: Full sync (default behavior)
    console.log('📋 Test 1: Full Sync (Default)');
    console.log('Command: node scripts/sync.js');
    console.log('Expected: Sync all endpoints in sequence (Properties → Media → Rooms → OpenHouses)\n');
    
    // Test 2: Selective sync examples
    console.log('📋 Test 2: Selective Sync Examples');
    console.log('Command: node scripts/sync.js --idx');
    console.log('Expected: Sync only IDX Properties\n');
    
    console.log('Command: node scripts/sync.js --vow');
    console.log('Expected: Sync only VOW Properties\n');
    
    console.log('Command: node scripts/sync.js --media');
    console.log('Expected: Sync only Media (requires Properties to be synced first)\n');
    
    console.log('Command: node scripts/sync.js --rooms');
    console.log('Expected: Sync only PropertyRooms (requires Properties to be synced first)\n');
    
    console.log('Command: node scripts/sync.js --openhouse');
    console.log('Expected: Sync only OpenHouses (requires Properties to be synced first)\n');
    
    console.log('Command: node scripts/sync.js --idx --vow');
    console.log('Expected: Sync both IDX and VOW Properties\n');
    
    console.log('Command: node scripts/sync.js --media --rooms --openhouse');
    console.log('Expected: Sync all child endpoints (Media, Rooms, OpenHouses)\n');
    
    // Test 3: Force sync
    console.log('📋 Test 3: Force Sync');
    console.log('Command: node scripts/sync.js --force');
    console.log('Expected: Force sync all endpoints regardless of last sync timestamps\n');
    
    // Parse current CLI arguments
    const args = process.argv.slice(2);
    const syncOptions = syncService.parseCliArgs(args);
    
    console.log('🎯 Current CLI Arguments:', args);
    console.log('📋 Parsed Sync Options:', syncOptions);
    console.log('\n');
    
    // Execute sync based on current arguments
    if (args.length === 0) {
      console.log('ℹ️  No CLI arguments provided. Running full sync demonstration...');
      console.log('💡 To test selective sync, add CLI switches like --idx, --media, etc.\n');
      
      // For demonstration, we'll just show what would happen without actually running
      console.log('🚀 Would execute: Full sync with parent-child integrity');
      console.log('   1. Sync IDX Properties');
      console.log('   2. Sync VOW Properties');
      console.log('   3. Load Property Keys for integrity');
      console.log('   4. Sync Media (filtered by existing properties)');
      console.log('   5. Sync PropertyRooms (filtered by existing properties)');
      console.log('   6. Sync OpenHouses (filtered by existing properties)');
    } else {
      console.log('🚀 Executing sync with provided arguments...');
      await syncService.executeSync(syncOptions);
    }
    
  } catch (error) {
    logger.error('Test failed:', error);
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Show usage information
function showUsage() {
  console.log('📖 Sync Service - Usage Guide');
  console.log('=====================================\n');
  
  console.log('🎯 CLI Switches:');
  console.log('  --idx        Sync IDX Properties only');
  console.log('  --vow        Sync VOW Properties only');
  console.log('  --media      Sync Media only (requires Properties)');
  console.log('  --rooms      Sync PropertyRooms only (requires Properties)');
  console.log('  --openhouse  Sync OpenHouses only (requires Properties)');
  console.log('  --force      Force sync regardless of timestamps\n');
  
  console.log('📋 Examples:');
  console.log('  node scripts/sync.js                    # Full sync');
  console.log('  node scripts/sync.js --idx              # IDX only');
  console.log('  node scripts/sync.js --media --rooms    # Media + Rooms');
  console.log('  node scripts/sync.js --force            # Force full sync\n');
  
  console.log('🔧 Key Features:');
  console.log('  ✅ Time-based pagination (avoids 100K API limit)');
  console.log('  ✅ Parent-child data integrity');
  console.log('  ✅ Skip existing records using timestamps');
  console.log('  ✅ Sequential execution (Properties → Children)');
  console.log('  ✅ Readable console output with progress');
  console.log('  ✅ CLI switches for selective syncing\n');
}

// Check if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the test
testSync().catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
