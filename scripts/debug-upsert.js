#!/usr/bin/env node

/**
 * Debug Upsert Script
 * Tests actual database upsert functionality
 */

import { setProcessEnv } from '../src/config/credentials.js';
import DatabaseService from '../src/services/databaseService.js';
import { mapMedia, validateMedia } from '../mappers/mapMedia.js';

// Set up environment variables
setProcessEnv();

async function debugUpsert() {
  console.log('🔍 Debug Upsert Test');
  console.log('===================\n');

  const dbService = new DatabaseService();

  try {
    // Get initial count
    console.log('📊 Getting initial media count...');
    const { count: initialCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📸 Initial Media Count: ${initialCount || 0}`);

    // Create a test media record
    const testMedia = {
      ResourceRecordKey: 'TEST-' + Date.now(),
      MediaKey: 'TEST-MEDIA-' + Date.now(),
      MediaObjectID: 'test-object-id',
      MediaURL: 'https://example.com/test-image.jpg',
      MediaCategory: 'Photo',
      MediaType: 'Image',
      MediaStatus: 'Active',
      ImageOf: 'Property',
      ClassName: 'Residential',
      ImageSizeDescription: 'Large',
      Order: 1,
      PreferredPhotoYN: false,
      ShortDescription: 'Test image for debugging',
      ResourceName: 'Test Resource',
      OriginatingSystemID: 'TEST-SYSTEM',
      MediaModificationTimestamp: new Date().toISOString(),
      ModificationTimestamp: new Date().toISOString(),
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    console.log('\n🧪 Testing single media upsert...');
    console.log(`📝 Test Media Key: ${testMedia.MediaKey}`);

    // Test single upsert
    const singleResult = await dbService.upsertMedia(testMedia);
    console.log('✅ Single upsert result:', singleResult);

    // Check count after single upsert
    const { count: afterSingleCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📸 Media Count After Single: ${afterSingleCount || 0}`);
    console.log(`📊 Difference: ${(afterSingleCount || 0) - (initialCount || 0)}`);

    // Test batch upsert
    console.log('\n🧪 Testing batch media upsert...');
    
    const testBatch = [
      {
        ResourceRecordKey: 'TEST-BATCH-' + Date.now(),
        MediaKey: 'TEST-BATCH-1-' + Date.now(),
        MediaObjectID: 'test-batch-1',
        MediaURL: 'https://example.com/test-batch-1.jpg',
        MediaCategory: 'Photo',
        MediaType: 'Image',
        MediaStatus: 'Active',
        ImageOf: 'Property',
        ClassName: 'Residential',
        ImageSizeDescription: 'Large',
        Order: 1,
        PreferredPhotoYN: false,
        ShortDescription: 'Test batch image 1',
        ResourceName: 'Test Resource',
        OriginatingSystemID: 'TEST-SYSTEM',
        MediaModificationTimestamp: new Date().toISOString(),
        ModificationTimestamp: new Date().toISOString(),
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      },
      {
        ResourceRecordKey: 'TEST-BATCH-' + Date.now(),
        MediaKey: 'TEST-BATCH-2-' + Date.now(),
        MediaObjectID: 'test-batch-2',
        MediaURL: 'https://example.com/test-batch-2.jpg',
        MediaCategory: 'Photo',
        MediaType: 'Image',
        MediaStatus: 'Active',
        ImageOf: 'Property',
        ClassName: 'Residential',
        ImageSizeDescription: 'Large',
        Order: 2,
        PreferredPhotoYN: false,
        ShortDescription: 'Test batch image 2',
        ResourceName: 'Test Resource',
        OriginatingSystemID: 'TEST-SYSTEM',
        MediaModificationTimestamp: new Date().toISOString(),
        ModificationTimestamp: new Date().toISOString(),
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      }
    ];

    const batchResult = await dbService.upsertMediaBatch(testBatch, 10);
    console.log('✅ Batch upsert result:', batchResult);

    // Check count after batch upsert
    const { count: afterBatchCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📸 Media Count After Batch: ${afterBatchCount || 0}`);
    console.log(`📊 Total Difference: ${(afterBatchCount || 0) - (initialCount || 0)}`);

    // Check if our test records actually exist
    console.log('\n🔍 Checking if test records exist...');
    
    const { data: testRecords, error: testError } = await dbService.client
      .from('Media')
      .select('MediaKey, ResourceRecordKey, CreatedAt')
      .like('MediaKey', 'TEST-%')
      .order('CreatedAt', { ascending: false });

    if (testError) {
      console.error('❌ Error checking test records:', testError.message);
    } else {
      console.log(`📸 Test Records Found: ${testRecords?.length || 0}`);
      if (testRecords && testRecords.length > 0) {
        testRecords.forEach((record, index) => {
          console.log(`   ${index + 1}. ${record.MediaKey} | ${record.CreatedAt}`);
        });
      }
    }

    // Test direct Supabase upsert
    console.log('\n🧪 Testing direct Supabase upsert...');
    
    const directTestMedia = {
      ResourceRecordKey: 'DIRECT-TEST-' + Date.now(),
      MediaKey: 'DIRECT-TEST-' + Date.now(),
      MediaObjectID: 'direct-test',
      MediaURL: 'https://example.com/direct-test.jpg',
      MediaCategory: 'Photo',
      MediaType: 'Image',
      MediaStatus: 'Active',
      ImageOf: 'Property',
      ClassName: 'Residential',
      MediaModificationTimestamp: new Date().toISOString(),
      ModificationTimestamp: new Date().toISOString(),
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    const { data: directResult, error: directError } = await dbService.client
      .from('Media')
      .upsert(directTestMedia, {
        onConflict: 'MediaKey',
        ignoreDuplicates: false
      })
      .select();

    if (directError) {
      console.error('❌ Direct upsert error:', directError.message);
    } else {
      console.log('✅ Direct upsert successful:', directResult);
    }

    // Final count check
    const { count: finalCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📸 Final Media Count: ${finalCount || 0}`);
    console.log(`📊 Total Records Added: ${(finalCount || 0) - (initialCount || 0)}`);

  } catch (error) {
    console.error('❌ Error during debug test:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugUpsert().catch(console.error);
