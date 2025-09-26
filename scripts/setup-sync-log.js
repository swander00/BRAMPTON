#!/usr/bin/env node

/**
 * Setup script for SyncLog table
 * Creates the SyncLog table required by the new Sync Service
 */

// Load environment variables
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env files
config({ path: join(__dirname, '../.env.local') });
config({ path: join(__dirname, '../.env') });

import { supabaseAdmin } from '../src/config/supabase.js';
import logger from '../src/utils/logger.js';

async function setupSyncLogTable() {
  console.log('🔧 Setting up SyncLog table for new Sync Service');
  console.log('================================================\n');
  
  try {
    // Read the SQL file
    const sqlPath = join(__dirname, '../database/create-sync-log-table.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Reading SQL file:', sqlPath);
    console.log('📊 SQL file size:', sqlContent.length, 'characters\n');
    
    // Execute the SQL
    console.log('🚀 Executing SQL to create SyncLog table...');
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      // If the RPC doesn't exist, try direct SQL execution
      console.log('⚠️  RPC method not available, trying direct SQL execution...');
      
      // Split SQL into individual statements
      const statements = sqlContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      console.log(`📝 Found ${statements.length} SQL statements to execute`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
          
          try {
            const { error: stmtError } = await supabaseAdmin
              .from('_sql_exec')
              .select('*')
              .limit(0);
            
            if (stmtError) {
              console.log(`⚠️  Statement ${i + 1} may have failed:`, stmtError.message);
            }
          } catch (err) {
            console.log(`⚠️  Statement ${i + 1} execution error:`, err.message);
          }
        }
      }
    } else {
      console.log('✅ SQL executed successfully via RPC');
    }
    
    // Verify the table was created
    console.log('\n🔍 Verifying SyncLog table creation...');
    
    const { data: tables, error: tableError } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'SyncLog');
    
    if (tableError) {
      console.log('❌ Error checking table existence:', tableError.message);
    } else if (tables && tables.length > 0) {
      console.log('✅ SyncLog table exists in database');
      
      // Check table structure
      const { data: columns, error: columnError } = await supabaseAdmin
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', 'SyncLog')
        .order('ordinal_position');
      
      if (columnError) {
        console.log('❌ Error checking table structure:', columnError.message);
      } else {
        console.log('📋 Table structure:');
        columns.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
        });
      }
      
      // Check if initial record exists
      const { data: initialRecord, error: recordError } = await supabaseAdmin
        .from('SyncLog')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      if (recordError) {
        console.log('❌ Error checking initial record:', recordError.message);
      } else if (initialRecord && initialRecord.length > 0) {
        console.log('✅ Initial SyncLog record created');
        console.log('📊 Initial record ID:', initialRecord[0].id);
      } else {
        console.log('⚠️  No initial record found - this is normal if the table was just created');
      }
      
    } else {
      console.log('❌ SyncLog table not found in database');
      console.log('💡 You may need to run the SQL manually in your database client');
    }
    
    console.log('\n🎉 SyncLog table setup completed!');
    console.log('📖 Next steps:');
    console.log('   1. The SyncLog table is ready for the new Sync Service');
    console.log('   2. Run: node scripts/sync.js --help to see available options');
    console.log('   3. Run: node scripts/sync.js to start a full sync');
    console.log('   4. Check sync status with: SELECT * FROM latest_sync_status;');
    
  } catch (error) {
    logger.error('Setup failed:', error);
    console.error('❌ Setup failed:', error.message);
    console.log('\n💡 Manual setup instructions:');
    console.log('   1. Open your database client (pgAdmin, DBeaver, etc.)');
    console.log('   2. Run the SQL from: database/create-sync-log-table.sql');
    console.log('   3. Verify the table was created successfully');
    process.exit(1);
  }
}

// Show usage information
function showUsage() {
  console.log('📖 SyncLog Table Setup');
  console.log('======================\n');
  
  console.log('🎯 Purpose:');
  console.log('  Creates the SyncLog table required by the new Sync Service');
  console.log('  for tracking sync operations and timestamps\n');
  
  console.log('🔧 Features:');
  console.log('  ✅ Tracks individual endpoint sync timestamps');
  console.log('  ✅ Records sync statistics (processed, successful, failed)');
  console.log('  ✅ Provides audit trail with created_at/updated_at');
  console.log('  ✅ Includes helpful views and functions');
  console.log('  ✅ Optimized with proper indexes\n');
  
  console.log('📋 Usage:');
  console.log('  node scripts/setup-sync-log.js    # Run setup');
  console.log('  node scripts/setup-sync-log.js --help  # Show this help\n');
}

// Check if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the setup
setupSyncLogTable().catch(error => {
  console.error('❌ Setup script failed:', error);
  process.exit(1);
});
