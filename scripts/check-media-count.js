#!/usr/bin/env node

/**
 * Check Media Count Script
 * Verifies actual media records in database
 */

import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/config/config.js';

// Create Supabase client
const supabaseClient = createClient(supabase.url, supabase.serviceRoleKey);

async function checkMediaCount() {
  console.log('🔍 Checking Media Database Count');
  console.log('================================\n');

  try {
    // Check total media count
    console.log('📊 Getting total media count...');
    const { data: mediaCount, error: mediaError } = await supabaseClient
      .from('Media')
      .select('*', { count: 'exact', head: true });

    if (mediaError) {
      console.error('❌ Error getting media count:', mediaError.message);
      return;
    }

    console.log(`📸 Total Media Records: ${mediaCount?.length || 0}`);

    // Check media count by property
    console.log('\n📊 Getting media count by property...');
    const { data: mediaByProperty, error: propertyError } = await supabaseClient
      .from('Media')
      .select('ResourceRecordKey')
      .limit(10);

    if (propertyError) {
      console.error('❌ Error getting media by property:', propertyError.message);
      return;
    }

    console.log(`📸 Sample Media Records: ${mediaByProperty?.length || 0}`);
    if (mediaByProperty && mediaByProperty.length > 0) {
      console.log('📋 Sample ResourceRecordKeys:');
      mediaByProperty.forEach((media, index) => {
        console.log(`   ${index + 1}. ${media.ResourceRecordKey}`);
      });
    }

    // Check recent media records
    console.log('\n📊 Getting recent media records...');
    const { data: recentMedia, error: recentError } = await supabaseClient
      .from('Media')
      .select('MediaKey, ResourceRecordKey, MediaURL, CreatedAt')
      .order('CreatedAt', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error('❌ Error getting recent media:', recentError.message);
      return;
    }

    console.log(`📸 Recent Media Records: ${recentMedia?.length || 0}`);
    if (recentMedia && recentMedia.length > 0) {
      console.log('📋 Recent Media:');
      recentMedia.forEach((media, index) => {
        console.log(`   ${index + 1}. ${media.MediaKey} | ${media.ResourceRecordKey} | ${media.CreatedAt}`);
      });
    }

    // Check if Media table exists and has data
    console.log('\n📊 Checking Media table structure...');
    const { data: tableInfo, error: tableError } = await supabaseClient
      .from('Media')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('❌ Media table error:', tableError.message);
      if (tableError.message.includes('relation "Media" does not exist')) {
        console.log('❌ Media table does not exist in database!');
        console.log('💡 You need to create the Media table first.');
        return;
      }
    } else {
      console.log('✅ Media table exists and is accessible');
    }

    // Check property count for comparison
    console.log('\n📊 Getting property count for comparison...');
    const { data: propertyCount, error: propError } = await supabaseClient
      .from('Property')
      .select('*', { count: 'exact', head: true });

    if (propError) {
      console.error('❌ Error getting property count:', propError.message);
    } else {
      console.log(`🏠 Total Properties: ${propertyCount?.length || 0}`);
    }

  } catch (error) {
    console.error('❌ Error checking media count:', error.message);
  }
}

// Run the check
checkMediaCount().catch(console.error);
