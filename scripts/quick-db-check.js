#!/usr/bin/env node

/**
 * Quick Database Check
 * Uses the same database service as the sync
 */

import { setProcessEnv } from '../src/config/credentials.js';
import DatabaseService from '../src/services/databaseService.js';

// Set up environment variables
setProcessEnv();

async function quickCheck() {
  console.log('🔍 Quick Database Check');
  console.log('======================\n');

  const dbService = new DatabaseService();

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    const isHealthy = await dbService.healthCheck();
    
    if (!isHealthy) {
      console.log('❌ Database connection failed');
      return;
    }
    
    console.log('✅ Database connection successful');

    // Check media count
    console.log('\n📊 Checking Media table...');
    
    // Try to get media count
    const { data: mediaData, error: mediaError, count: mediaCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });

    if (mediaError) {
      console.error('❌ Media table error:', mediaError.message);
      
      if (mediaError.message.includes('relation "Media" does not exist')) {
        console.log('❌ Media table does not exist!');
        console.log('💡 The sync is failing because the Media table is missing.');
        console.log('💡 You need to create the Media table first.');
        return;
      }
    } else {
      console.log(`✅ Media table exists`);
      console.log(`📸 Total Media Records: ${mediaCount || 0}`);
    }

    // Check property count
    console.log('\n📊 Checking Property table...');
    const { data: propertyData, error: propertyError, count: propertyCount } = await dbService.client
      .from('Property')
      .select('*', { count: 'exact', head: true });

    if (propertyError) {
      console.error('❌ Property table error:', propertyError.message);
    } else {
      console.log(`✅ Property table exists`);
      console.log(`🏠 Total Properties: ${propertyCount || 0}`);
    }

    // Check recent media if table exists
    if (!mediaError) {
      console.log('\n📊 Checking recent media records...');
      const { data: recentMedia, error: recentError } = await dbService.client
        .from('Media')
        .select('MediaKey, ResourceRecordKey, CreatedAt')
        .order('CreatedAt', { ascending: false })
        .limit(3);

      if (recentError) {
        console.error('❌ Error getting recent media:', recentError.message);
      } else {
        console.log(`📸 Recent Media Records: ${recentMedia?.length || 0}`);
        if (recentMedia && recentMedia.length > 0) {
          recentMedia.forEach((media, index) => {
            console.log(`   ${index + 1}. ${media.MediaKey} | ${media.ResourceRecordKey} | ${media.CreatedAt}`);
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Error during check:', error.message);
  }
}

quickCheck().catch(console.error);
