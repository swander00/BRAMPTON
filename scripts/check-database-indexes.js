#!/usr/bin/env node

/**
 * Database Index Check Script
 * Checks existing indexes and provides recommendations
 */

import { createClient } from '@supabase/supabase-js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDatabaseIndexes() {
  console.log('🔍 Checking Database Indexes and Performance');
  console.log('============================================\n');

  try {
    // Check existing indexes
    console.log('📊 Checking existing indexes...');
    const { data: indexes, error: indexError } = await supabase
      .from('pg_indexes')
      .select('schemaname, tablename, indexname, indexdef')
      .in('tablename', ['Property', 'Media', 'PropertyRooms', 'OpenHouse'])
      .like('indexname', 'idx_%')
      .order('tablename')
      .order('indexname');

    if (indexError) {
      console.log('⚠️  Could not query pg_indexes directly, trying alternative approach...');
      
      // Alternative: Check if we can query the tables directly
      const { data: mediaCount, error: mediaError } = await supabase
        .from('Media')
        .select('*', { count: 'exact', head: true });
      
      const { data: propertyCount, error: propertyError } = await supabase
        .from('Property')
        .select('*', { count: 'exact', head: true });

      console.log(`📸 Media records: ${mediaCount?.length || 'unknown'}`);
      console.log(`🏠 Property records: ${propertyCount?.length || 'unknown'}`);
      
      if (mediaError) console.log('❌ Media query error:', mediaError.message);
      if (propertyError) console.log('❌ Property query error:', propertyError.message);
    } else {
      console.log('✅ Found indexes:');
      if (indexes && indexes.length > 0) {
        indexes.forEach(idx => {
          console.log(`   ${idx.tablename}.${idx.indexname}`);
        });
      } else {
        console.log('   No custom indexes found');
      }
    }

    // Test query performance
    console.log('\n📊 Testing query performance...');
    
    // Test 1: Simple count query
    const start1 = Date.now();
    const { data: mediaData, error: mediaError } = await supabase
      .from('Media')
      .select('MediaKey', { count: 'exact', head: true });
    const time1 = Date.now() - start1;
    
    console.log(`   Media count query: ${time1}ms (${mediaData?.length || 'error'})`);
    if (mediaError) console.log(`   Error: ${mediaError.message}`);

    // Test 2: Property count query
    const start2 = Date.now();
    const { data: propertyData, error: propertyError } = await supabase
      .from('Property')
      .select('ListingKey', { count: 'exact', head: true });
    const time2 = Date.now() - start2;
    
    console.log(`   Property count query: ${time2}ms (${propertyData?.length || 'error'})`);
    if (propertyError) console.log(`   Error: ${propertyError.message}`);

    // Test 3: Media with ResourceRecordKey filter
    const start3 = Date.now();
    const { data: mediaFiltered, error: mediaFilterError } = await supabase
      .from('Media')
      .select('MediaKey')
      .eq('ResourceRecordKey', 'C10243611')
      .limit(10);
    const time3 = Date.now() - start3;
    
    console.log(`   Media filtered query: ${time3}ms (${mediaFiltered?.length || 0} results)`);
    if (mediaFilterError) console.log(`   Error: ${mediaFilterError.message}`);

    // Test 4: Property with ListingKey filter
    const start4 = Date.now();
    const { data: propertyFiltered, error: propertyFilterError } = await supabase
      .from('Property')
      .select('ListingKey')
      .eq('ListingKey', 'C10243611')
      .limit(1);
    const time4 = Date.now() - start4;
    
    console.log(`   Property filtered query: ${time4}ms (${propertyFiltered?.length || 0} results)`);
    if (propertyFilterError) console.log(`   Error: ${propertyFilterError.message}`);

    // Recommendations
    console.log('\n💡 Performance Analysis:');
    if (time3 > 100) {
      console.log('⚠️  Media filtered queries are slow - indexes needed');
    } else {
      console.log('✅ Media filtered queries are fast');
    }
    
    if (time4 > 50) {
      console.log('⚠️  Property filtered queries are slow - indexes needed');
    } else {
      console.log('✅ Property filtered queries are fast');
    }

    if (time1 > 500) {
      console.log('⚠️  Media count queries are very slow - table may need optimization');
    }

    if (time2 > 500) {
      console.log('⚠️  Property count queries are very slow - table may need optimization');
    }

  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  }
}

// Run the check
checkDatabaseIndexes().catch(console.error);
