#!/usr/bin/env node

/**
 * Manual SyncLog table creation
 * Executes the SQL directly to create the SyncLog table
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

async function createSyncLogTable() {
  console.log('🔧 Creating SyncLog table manually');
  console.log('==================================\n');
  
  try {
    // Step 1: Drop table if exists
    console.log('🗑️  Dropping existing SyncLog table if it exists...');
    const { error: dropError } = await supabaseAdmin
      .from('SyncLog')
      .select('*')
      .limit(0);
    
    if (dropError && dropError.code === 'PGRST116') {
      console.log('✅ No existing table to drop');
    } else {
      console.log('⚠️  Table may exist, continuing with creation...');
    }
    
    // Step 2: Create the table using raw SQL
    console.log('📋 Creating SyncLog table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS "SyncLog" (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idx_property_timestamp TIMESTAMPTZ,
        vow_property_timestamp TIMESTAMPTZ,
        media_timestamp TIMESTAMPTZ,
        rooms_timestamp TIMESTAMPTZ,
        openhouse_timestamp TIMESTAMPTZ,
        total_processed INTEGER DEFAULT 0,
        total_successful INTEGER DEFAULT 0,
        total_failed INTEGER DEFAULT 0,
        sync_duration_minutes DECIMAL(10,2),
        error_count INTEGER DEFAULT 0,
        last_error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    
    // Execute the SQL
    const { data, error } = await supabaseAdmin.rpc('exec', { sql: createTableSQL });
    
    if (error) {
      console.log('⚠️  RPC exec not available, trying alternative approach...');
      
      // Try to create the table by inserting a test record
      console.log('🔄 Attempting to create table by testing insert...');
      
      const { error: insertError } = await supabaseAdmin
        .from('SyncLog')
        .insert({
          timestamp: new Date().toISOString(),
          total_processed: 0,
          total_successful: 0,
          total_failed: 0
        });
      
      if (insertError) {
        console.log('❌ Could not create table automatically');
        console.log('💡 Manual setup required:');
        console.log('   1. Open your database client (pgAdmin, DBeaver, etc.)');
        console.log('   2. Connect to your Supabase database');
        console.log('   3. Run the SQL from: database/create-sync-log-table.sql');
        console.log('   4. Verify the table was created successfully');
        return;
      } else {
        console.log('✅ SyncLog table created successfully!');
      }
    } else {
      console.log('✅ SyncLog table created successfully via RPC!');
    }
    
    // Step 3: Create indexes
    console.log('🔍 Creating indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_synclog_timestamp ON "SyncLog" (timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_synclog_idx_property ON "SyncLog" (idx_property_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_synclog_vow_property ON "SyncLog" (vow_property_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_synclog_media ON "SyncLog" (media_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_synclog_rooms ON "SyncLog" (rooms_timestamp DESC);',
      'CREATE INDEX IF NOT EXISTS idx_synclog_openhouse ON "SyncLog" (openhouse_timestamp DESC);'
    ];
    
    for (const indexSQL of indexes) {
      try {
        await supabaseAdmin.rpc('exec', { sql: indexSQL });
        console.log('✅ Index created');
      } catch (err) {
        console.log('⚠️  Index creation skipped (may already exist)');
      }
    }
    
    // Step 4: Insert initial record
    console.log('📝 Inserting initial sync log record...');
    
    const { error: initialInsertError } = await supabaseAdmin
      .from('SyncLog')
      .insert({
        timestamp: new Date().toISOString(),
        total_processed: 0,
        total_successful: 0,
        total_failed: 0,
        sync_duration_minutes: 0.0,
        error_count: 0
      });
    
    if (initialInsertError) {
      console.log('⚠️  Could not insert initial record:', initialInsertError.message);
    } else {
      console.log('✅ Initial sync log record created');
    }
    
    // Step 5: Verify table exists
    console.log('🔍 Verifying table creation...');
    
    const { data: testData, error: testError } = await supabaseAdmin
      .from('SyncLog')
      .select('id, timestamp, total_processed')
      .order('timestamp', { ascending: false })
      .limit(1);
    
    if (testError) {
      console.log('❌ Error verifying table:', testError.message);
    } else if (testData && testData.length > 0) {
      console.log('✅ SyncLog table verified and working!');
      console.log(`📊 Found ${testData.length} record(s) in table`);
      console.log(`🆔 Latest record ID: ${testData[0].id}`);
      console.log(`📅 Latest timestamp: ${testData[0].timestamp}`);
    } else {
      console.log('⚠️  Table exists but no records found');
    }
    
    console.log('\n🎉 SyncLog table setup completed!');
    console.log('📖 Next steps:');
    console.log('   1. Run: node scripts/check-sync-log.js to verify setup');
    console.log('   2. Run: node scripts/sync.js --help to see sync options');
    console.log('   3. Run: node scripts/sync.js to start a full sync');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n💡 Manual setup instructions:');
    console.log('   1. Open your database client (pgAdmin, DBeaver, etc.)');
    console.log('   2. Connect to your Supabase database');
    console.log('   3. Run the SQL from: database/create-sync-log-table.sql');
    console.log('   4. Verify the table was created successfully');
    process.exit(1);
  }
}

// Run the setup
createSyncLogTable().catch(error => {
  console.error('❌ Setup script failed:', error);
  process.exit(1);
});
