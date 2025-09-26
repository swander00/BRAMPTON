#!/usr/bin/env node

/**
 * Create Essential Database Indexes for Media Sync
 * Creates only the most critical indexes for performance
 */

import { createClient } from '@supabase/supabase-js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createEssentialIndexes() {
  console.log('🔧 Creating Essential Database Indexes');
  console.log('=====================================\n');

  const indexes = [
    {
      name: 'Property ListingKey Index',
      sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listing_key ON "Property" ("ListingKey");',
      description: 'Critical for property validation lookups'
    },
    {
      name: 'Media ResourceRecordKey Index',
      sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_resource_key ON "Media" ("ResourceRecordKey");',
      description: 'Critical for media filtering by property'
    },
    {
      name: 'Media Timestamp Index',
      sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_modification_timestamp ON "Media" ("MediaModificationTimestamp");',
      description: 'Critical for timestamp-based pagination'
    },
    {
      name: 'Property Timestamp Index',
      sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_modification_timestamp ON "Property" ("ModificationTimestamp");',
      description: 'Critical for property timestamp queries'
    }
  ];

  for (const index of indexes) {
    try {
      console.log(`📊 Creating ${index.name}...`);
      console.log(`   ${index.description}`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql: index.sql
      });

      if (error) {
        console.log(`   ⚠️  ${error.message}`);
        // Try without CONCURRENTLY if it fails
        const simpleSql = index.sql.replace('CONCURRENTLY ', '');
        console.log(`   🔄 Retrying without CONCURRENTLY...`);
        
        const { error: retryError } = await supabase.rpc('exec_sql', {
          sql: simpleSql
        });

        if (retryError) {
          console.log(`   ❌ Failed: ${retryError.message}`);
        } else {
          console.log(`   ✅ Created successfully`);
        }
      } else {
        console.log(`   ✅ Created successfully`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');
  }

  // Update table statistics
  console.log('📊 Updating table statistics...');
  const tables = ['Property', 'Media'];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql: `ANALYZE "${table}";`
      });

      if (error) {
        console.log(`   ⚠️  Could not analyze ${table}: ${error.message}`);
      } else {
        console.log(`   ✅ Analyzed ${table}`);
      }
    } catch (error) {
      console.log(`   ❌ Error analyzing ${table}: ${error.message}`);
    }
  }

  console.log('\n🎉 Index creation completed!');
  console.log('💡 Run the performance test to verify improvements.');
}

// Run the index creation
createEssentialIndexes().catch(console.error);
