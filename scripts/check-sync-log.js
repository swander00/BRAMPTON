#!/usr/bin/env node

/**
 * Check SyncLog table status
 * Verifies the SyncLog table exists and shows current sync status
 */

// Load environment variables
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env files
config({ path: join(__dirname, '../.env.local') });
config({ path: join(__dirname, '../.env') });

import { supabaseAdmin } from '../src/config/supabase.js';
import logger from '../src/utils/logger.js';

async function checkSyncLogTable() {
  console.log('🔍 Checking SyncLog table status');
  console.log('================================\n');
  
  try {
    // Check if table exists
    console.log('📋 Checking if SyncLog table exists...');
    
    const { data: tables, error: tableError } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'SyncLog');
    
    if (tableError) {
      console.log('❌ Error checking table existence:', tableError.message);
      return;
    }
    
    if (!tables || tables.length === 0) {
      console.log('❌ SyncLog table does not exist');
      console.log('💡 Run: node scripts/setup-sync-log.js to create it');
      return;
    }
    
    console.log('✅ SyncLog table exists');
    
    // Check table structure
    console.log('\n📊 Table structure:');
    const { data: columns, error: columnError } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', 'SyncLog')
      .order('ordinal_position');
    
    if (columnError) {
      console.log('❌ Error checking table structure:', columnError.message);
    } else {
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(not null)';
        const defaultVal = col.column_default ? ` default: ${col.column_default}` : '';
        console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });
    }
    
    // Check indexes
    console.log('\n🔍 Checking indexes...');
    const { data: indexes, error: indexError } = await supabaseAdmin
      .from('pg_indexes')
      .select('indexname, indexdef')
      .eq('tablename', 'SyncLog')
      .eq('schemaname', 'public');
    
    if (indexError) {
      console.log('⚠️  Could not check indexes:', indexError.message);
    } else if (indexes && indexes.length > 0) {
      console.log(`✅ Found ${indexes.length} indexes:`);
      indexes.forEach(idx => {
        console.log(`   - ${idx.indexname}`);
      });
    } else {
      console.log('⚠️  No indexes found');
    }
    
    // Check current sync status
    console.log('\n📈 Current sync status:');
    const { data: syncRecords, error: syncError } = await supabaseAdmin
      .from('SyncLog')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(5);
    
    if (syncError) {
      console.log('❌ Error fetching sync records:', syncError.message);
    } else if (syncRecords && syncRecords.length > 0) {
      console.log(`📊 Found ${syncRecords.length} sync record(s):`);
      
      syncRecords.forEach((record, index) => {
        console.log(`\n   Record ${index + 1} (ID: ${record.id}):`);
        console.log(`   📅 Timestamp: ${record.timestamp}`);
        console.log(`   📊 Processed: ${record.total_processed || 0}, Success: ${record.total_successful || 0}, Failed: ${record.total_failed || 0}`);
        
        if (record.idx_property_timestamp) {
          console.log(`   🏠 IDX Property: ${record.idx_property_timestamp}`);
        }
        if (record.vow_property_timestamp) {
          console.log(`   🏠 VOW Property: ${record.vow_property_timestamp}`);
        }
        if (record.media_timestamp) {
          console.log(`   🖼️  Media: ${record.media_timestamp}`);
        }
        if (record.rooms_timestamp) {
          console.log(`   🏠 Rooms: ${record.rooms_timestamp}`);
        }
        if (record.openhouse_timestamp) {
          console.log(`   🏡 OpenHouse: ${record.openhouse_timestamp}`);
        }
        
        if (record.sync_duration_minutes) {
          console.log(`   ⏱️  Duration: ${record.sync_duration_minutes} minutes`);
        }
        if (record.error_count > 0) {
          console.log(`   ❌ Errors: ${record.error_count}`);
        }
      });
      
      // Calculate success rate for the latest record
      const latest = syncRecords[0];
      if (latest.total_processed > 0) {
        const successRate = ((latest.total_successful / latest.total_processed) * 100).toFixed(1);
        console.log(`\n📈 Latest sync success rate: ${successRate}%`);
      }
      
    } else {
      console.log('📭 No sync records found');
      console.log('💡 Run a sync to create the first record: node scripts/sync.js');
    }
    
    // Check if views exist
    console.log('\n🔍 Checking views...');
    const { data: views, error: viewError } = await supabaseAdmin
      .from('information_schema.views')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'latest_sync_status');
    
    if (viewError) {
      console.log('⚠️  Could not check views:', viewError.message);
    } else if (views && views.length > 0) {
      console.log('✅ latest_sync_status view exists');
    } else {
      console.log('⚠️  latest_sync_status view not found');
    }
    
    console.log('\n🎉 SyncLog table check completed!');
    console.log('📖 Next steps:');
    console.log('   - Run: node scripts/sync.js --help to see sync options');
    console.log('   - Run: node scripts/sync.js to start a full sync');
    console.log('   - Check status anytime with: node scripts/check-sync-log.js');
    
  } catch (error) {
    logger.error('Check failed:', error);
    console.error('❌ Check failed:', error.message);
    process.exit(1);
  }
}

// Show usage information
function showUsage() {
  console.log('📖 SyncLog Table Check');
  console.log('======================\n');
  
  console.log('🎯 Purpose:');
  console.log('  Checks the status of the SyncLog table and shows current sync information\n');
  
  console.log('📋 What it checks:');
  console.log('  ✅ Table existence and structure');
  console.log('  ✅ Indexes and performance optimization');
  console.log('  ✅ Current sync records and statistics');
  console.log('  ✅ Views and helper functions');
  console.log('  ✅ Success rates and error counts\n');
  
  console.log('📋 Usage:');
  console.log('  node scripts/check-sync-log.js    # Check status');
  console.log('  node scripts/check-sync-log.js --help  # Show this help\n');
}

// Check if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the check
checkSyncLogTable().catch(error => {
  console.error('❌ Check script failed:', error);
  process.exit(1);
});
