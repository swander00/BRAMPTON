#!/usr/bin/env node

/**
 * Check Property Validation Issue
 * Investigates why media sync shows success but doesn't increase count
 */

import { setProcessEnv } from '../src/config/credentials.js';
import DatabaseService from '../src/services/databaseService.js';

// Set up environment variables
setProcessEnv();

async function checkPropertyValidation() {
  console.log('🔍 Property Validation Check');
  console.log('============================\n');

  const dbService = new DatabaseService();

  try {
    // Get initial counts
    console.log('📊 Getting initial counts...');
    const { count: initialMediaCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    const { count: initialPropertyCount } = await dbService.client
      .from('Property')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📸 Initial Media Count: ${initialMediaCount || 0}`);
    console.log(`🏠 Initial Property Count: ${initialPropertyCount || 0}`);

    // Test with a real property that exists
    console.log('\n🧪 Testing with real property...');
    
    // Get a sample property
    const { data: sampleProperty, error: propertyError } = await dbService.client
      .from('Property')
      .select('ListingKey')
      .limit(1)
      .single();

    if (propertyError || !sampleProperty) {
      console.error('❌ Could not get sample property:', propertyError?.message);
      return;
    }

    console.log(`📝 Using real property: ${sampleProperty.ListingKey}`);

    // Test media upsert with real property
    const testMedia = {
      ResourceRecordKey: sampleProperty.ListingKey, // Use real property
      MediaKey: 'TEST-REAL-PROPERTY-' + Date.now(),
      MediaObjectID: 'test-real-property',
      MediaURL: 'https://example.com/test-real-property.jpg',
      MediaCategory: 'Photo',
      MediaType: 'Image',
      MediaStatus: 'Active',
      ImageOf: 'Property',
      ClassName: 'Residential',
      ImageSizeDescription: 'Large',
      Order: 1,
      PreferredPhotoYN: false,
      ShortDescription: 'Test with real property',
      ResourceName: 'Test Resource',
      OriginatingSystemID: 'TEST-SYSTEM',
      MediaModificationTimestamp: new Date().toISOString(),
      ModificationTimestamp: new Date().toISOString(),
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    console.log('🧪 Testing media upsert with real property...');
    const upsertResult = await dbService.upsertMedia(testMedia);
    console.log('✅ Upsert result:', upsertResult);

    // Check count after upsert
    const { count: afterUpsertCount } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📸 Media Count After Real Property Test: ${afterUpsertCount || 0}`);
    console.log(`📊 Difference: ${(afterUpsertCount || 0) - (initialMediaCount || 0)}`);

    // Check if the test record exists
    const { data: testRecord, error: testError } = await dbService.client
      .from('Media')
      .select('MediaKey, ResourceRecordKey, CreatedAt')
      .eq('MediaKey', testMedia.MediaKey)
      .single();

    if (testError) {
      console.error('❌ Test record not found:', testError.message);
    } else {
      console.log('✅ Test record found:', testRecord);
    }

    // Now test the property validation function directly
    console.log('\n🧪 Testing property validation...');
    
    // Test with existing property
    const existingValidation = await dbService.validatePropertyExists(sampleProperty.ListingKey);
    console.log(`✅ Existing property validation: ${existingValidation}`);

    // Test with non-existing property
    const nonExistingValidation = await dbService.validatePropertyExists('NON-EXISTING-PROPERTY');
    console.log(`❌ Non-existing property validation: ${nonExistingValidation}`);

    // Check what properties the sync is trying to process
    console.log('\n🔍 Checking sync property processing...');
    
    // Get properties that the sync would process (first 10)
    const { data: syncProperties, error: syncError } = await dbService.client
      .from('Property')
      .select('ListingKey')
      .limit(10);

    if (syncError) {
      console.error('❌ Error getting sync properties:', syncError.message);
    } else {
      console.log(`📝 Sample properties for sync: ${syncProperties?.length || 0}`);
      if (syncProperties && syncProperties.length > 0) {
        syncProperties.forEach((prop, index) => {
          console.log(`   ${index + 1}. ${prop.ListingKey}`);
        });
      }
    }

    // Check if there are any media records for these properties
    if (syncProperties && syncProperties.length > 0) {
      const firstProperty = syncProperties[0];
      console.log(`\n🔍 Checking media for property: ${firstProperty.ListingKey}`);
      
      const { data: existingMedia, error: mediaError } = await dbService.client
        .from('Media')
        .select('MediaKey, ResourceRecordKey')
        .eq('ResourceRecordKey', firstProperty.ListingKey)
        .limit(5);

      if (mediaError) {
        console.error('❌ Error checking existing media:', mediaError.message);
      } else {
        console.log(`📸 Existing media for ${firstProperty.ListingKey}: ${existingMedia?.length || 0}`);
        if (existingMedia && existingMedia.length > 0) {
          existingMedia.forEach((media, index) => {
            console.log(`   ${index + 1}. ${media.MediaKey}`);
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Error during check:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

checkPropertyValidation().catch(console.error);
