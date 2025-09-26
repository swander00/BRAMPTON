#!/usr/bin/env node

/**
 * Verify Media Sync Results
 * Checks the current state of media records and provides detailed analysis
 */

import { createClient } from '@supabase/supabase-js';
import { setProcessEnv } from '../src/config/credentials.js';

// Set up environment variables from credentials config
setProcessEnv();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyMediaSync() {
  console.log('🔍 Verifying Media Sync Results');
  console.log('==============================\n');

  try {
    // Get total counts
    console.log('📊 Getting total counts...');
    
    const { count: mediaCount, error: mediaError } = await supabase
      .from('Media')
      .select('*', { count: 'exact', head: true });

    const { count: propertyCount, error: propertyError } = await supabase
      .from('Property')
      .select('*', { count: 'exact', head: true });

    if (mediaError) {
      console.error('❌ Error getting media count:', mediaError.message);
    } else {
      console.log(`📸 Total Media Records: ${mediaCount}`);
    }

    if (propertyError) {
      console.error('❌ Error getting property count:', propertyError.message);
    } else {
      console.log(`🏠 Total Properties: ${propertyCount}`);
    }

    // Get recent media records
    console.log('\n📊 Getting recent media records...');
    const { data: recentMedia, error: recentError } = await supabase
      .from('Media')
      .select('MediaKey, ResourceRecordKey, MediaModificationTimestamp')
      .order('MediaModificationTimestamp', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error getting recent media:', recentError.message);
    } else if (recentMedia && recentMedia.length > 0) {
      console.log(`📸 Recent Media Records: ${recentMedia.length}`);
      recentMedia.forEach((media, index) => {
        console.log(`   ${index + 1}. ${media.MediaKey} | ${media.ResourceRecordKey} | ${media.MediaModificationTimestamp}`);
      });
    } else {
      console.log('📸 No recent media records found');
    }

    // Get media count by property
    console.log('\n📊 Getting media count by property...');
    const { data: mediaByProperty, error: mediaByPropertyError } = await supabase
      .from('Media')
      .select('ResourceRecordKey')
      .limit(1000);

    if (mediaByPropertyError) {
      console.error('❌ Error getting media by property:', mediaByPropertyError.message);
    } else if (mediaByProperty && mediaByProperty.length > 0) {
      // Count media per property
      const propertyCounts = {};
      mediaByProperty.forEach(media => {
        const key = media.ResourceRecordKey;
        propertyCounts[key] = (propertyCounts[key] || 0) + 1;
      });

      const uniqueProperties = Object.keys(propertyCounts).length;
      const totalMedia = mediaByProperty.length;
      const avgMediaPerProperty = Math.round(totalMedia / uniqueProperties);

      console.log(`📸 Sample Analysis (first 1000 records):`);
      console.log(`   Unique Properties: ${uniqueProperties}`);
      console.log(`   Total Media: ${totalMedia}`);
      console.log(`   Average Media per Property: ${avgMediaPerProperty}`);

      // Show top properties by media count
      const sortedProperties = Object.entries(propertyCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);

      console.log(`   Top Properties by Media Count:`);
      sortedProperties.forEach(([propertyKey, count], index) => {
        console.log(`     ${index + 1}. ${propertyKey}: ${count} media records`);
      });
    }

    // Check for any properties without media
    console.log('\n📊 Checking for properties without media...');
    const { data: propertiesWithoutMedia, error: noMediaError } = await supabase
      .from('Property')
      .select('ListingKey')
      .not('ListingKey', 'in', `(${mediaByProperty?.map(m => `'${m.ResourceRecordKey}'`).join(',') || ''})`)
      .limit(10);

    if (noMediaError) {
      console.log(`⚠️  Could not check for properties without media: ${noMediaError.message}`);
    } else if (propertiesWithoutMedia && propertiesWithoutMedia.length > 0) {
      console.log(`⚠️  Found ${propertiesWithoutMedia.length} properties without media (showing first 10):`);
      propertiesWithoutMedia.forEach((property, index) => {
        console.log(`   ${index + 1}. ${property.ListingKey}`);
      });
    } else {
      console.log('✅ All properties appear to have media records');
    }

    // Performance check
    console.log('\n📊 Performance Check...');
    const startTime = Date.now();
    const { data: performanceTest, error: perfError } = await supabase
      .from('Media')
      .select('MediaKey')
      .eq('ResourceRecordKey', 'C10243611')
      .limit(10);
    const queryTime = Date.now() - startTime;

    if (perfError) {
      console.log(`❌ Performance test failed: ${perfError.message}`);
    } else {
      console.log(`📊 Media query performance: ${queryTime}ms for 10 records`);
      if (queryTime > 100) {
        console.log('⚠️  Query is slow - indexes may be needed');
      } else {
        console.log('✅ Query performance is good');
      }
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

// Run the verification
verifyMediaSync().catch(console.error);
