#!/usr/bin/env node

/**
 * Clear Tables and Test Media Coverage
 * Clears tables, fetches 50 properties, and reports media coverage
 */

import DatabaseService from './src/services/databaseService.js';
import SyncService from './src/services/syncService.js';
import './src/config/config.js'; // Load environment variables

async function clearAndTest() {
  console.log('🧹 Clear Tables and Test Media Coverage');
  console.log('=====================================\n');

  const dbService = new DatabaseService();
  const syncService = new SyncService();

  try {
    // Step 1: Clear all tables
    console.log('🧹 Step 1: Clearing all tables...');
    await clearAllTables(dbService);
    
    // Step 2: Fetch 50 properties
    console.log('\n📥 Step 2: Fetching 50 properties...');
    const propertyStats = await fetchLimitedProperties(syncService, 50);
    
    // Step 3: Fetch media for those properties
    console.log('\n🖼️  Step 3: Fetching media for properties...');
    const mediaStats = await syncService.syncMediaWithParentIntegrity();
    
    // Step 4: Analyze media coverage
    console.log('\n📊 Step 4: Analyzing media coverage...');
    const coverageReport = await analyzeMediaCoverage(dbService);
    
    // Final report
    console.log('\n🎉 === FINAL REPORT ===');
    console.log(`📊 Properties fetched: ${propertyStats.successful}`);
    console.log(`🖼️  Media records fetched: ${mediaStats.successful}`);
    console.log(`📈 Media coverage: ${coverageReport.coveragePercentage}%`);
    console.log(`🏠 Properties with media: ${coverageReport.propertiesWithMedia}`);
    console.log(`📭 Properties without media: ${coverageReport.propertiesWithoutMedia}`);
    console.log(`📊 Average media per property: ${coverageReport.averageMediaPerProperty}`);
    
    if (coverageReport.topMediaProperties.length > 0) {
      console.log('\n🏆 Top 5 properties by media count:');
      coverageReport.topMediaProperties.forEach((prop, index) => {
        console.log(`   ${index + 1}. ${prop.ListingKey}: ${prop.mediaCount} media files`);
      });
    }

  } catch (error) {
    console.error('❌ Error during clear and test:', error.message);
    throw error;
  }
}

/**
 * Clear all main tables
 */
async function clearAllTables(dbService) {
  const tables = ['Media', 'PropertyRooms', 'OpenHouse', 'Property', 'SyncLog'];
  
  console.log(`🗑️  Clearing ${tables.length} tables...`);
  
  for (const table of tables) {
    try {
      console.log(`   Clearing ${table}...`);
      const { error } = await dbService.client
        .from(table)
        .delete()
        .neq('ListingKey', 'never_matches'); // This deletes all records
      
      if (error) {
        console.log(`   ⚠️  Warning clearing ${table}: ${error.message}`);
      } else {
        console.log(`   ✅ ${table} cleared successfully`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error clearing ${table}: ${error.message}`);
    }
  }
}

/**
 * Fetch limited number of properties
 */
async function fetchLimitedProperties(syncService, maxProperties) {
  console.log(`🔄 Fetching up to ${maxProperties} properties...`);
  
  // Temporarily override batch size for limited fetch
  const originalBatchSize = syncService.config.property.batchSize;
  syncService.config.property.batchSize = maxProperties;
  
  try {
    // Fetch IDX properties only (most common)
    const stats = await syncService.syncWithTimePagination('idx', 'Property');
    
    console.log(`✅ Property fetch completed:`);
    console.log(`   📥 Fetched: ${stats.totalFetched}`);
    console.log(`   ✅ Successful: ${stats.successful}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    
    return stats;
  } finally {
    // Restore original batch size
    syncService.config.property.batchSize = originalBatchSize;
  }
}

/**
 * Analyze media coverage for properties
 */
async function analyzeMediaCoverage(dbService) {
  console.log('📊 Analyzing media coverage...');
  
  try {
    // Get total property count
    const { count: totalProperties, error: propError } = await dbService.client
      .from('Property')
      .select('*', { count: 'exact', head: true });
    
    if (propError) {
      throw new Error(`Failed to count properties: ${propError.message}`);
    }
    
    // Get total media count
    const { count: totalMedia, error: mediaError } = await dbService.client
      .from('Media')
      .select('*', { count: 'exact', head: true });
    
    if (mediaError) {
      throw new Error(`Failed to count media: ${mediaError.message}`);
    }
    
    // Get properties with media count
    const { data: propertiesWithMedia, error: withMediaError } = await dbService.client
      .from('Property')
      .select(`
        ListingKey,
        UnparsedAddress,
        ListPrice,
        Media(MediaKey)
      `);
    
    if (withMediaError) {
      throw new Error(`Failed to get properties with media: ${withMediaError.message}`);
    }
    
    // Calculate coverage statistics
    const propertiesWithMediaCount = propertiesWithMedia.filter(p => p.Media && p.Media.length > 0).length;
    const propertiesWithoutMediaCount = totalProperties - propertiesWithMediaCount;
    const coveragePercentage = totalProperties > 0 ? ((propertiesWithMediaCount / totalProperties) * 100).toFixed(1) : 0;
    const averageMediaPerProperty = totalProperties > 0 ? (totalMedia / totalProperties).toFixed(1) : 0;
    
    // Get top properties by media count
    const propertiesWithMediaCounts = propertiesWithMedia.map(p => ({
      ListingKey: p.ListingKey,
      address: p.UnparsedAddress,
      price: p.ListPrice,
      mediaCount: p.Media ? p.Media.length : 0
    }));
    
    const topMediaProperties = propertiesWithMediaCounts
      .filter(p => p.mediaCount > 0)
      .sort((a, b) => b.mediaCount - a.mediaCount)
      .slice(0, 5);
    
    // Media type breakdown
    const { data: mediaByType, error: typeError } = await dbService.client
      .from('Media')
      .select('MediaType')
      .not('MediaType', 'is', null);
    
    const mediaTypeBreakdown = {};
    if (!typeError && mediaByType) {
      mediaByType.forEach(media => {
        const type = media.MediaType || 'Unknown';
        mediaTypeBreakdown[type] = (mediaTypeBreakdown[type] || 0) + 1;
      });
    }
    
    return {
      totalProperties: totalProperties || 0,
      totalMedia: totalMedia || 0,
      propertiesWithMedia: propertiesWithMediaCount,
      propertiesWithoutMedia: propertiesWithoutMediaCount,
      coveragePercentage: parseFloat(coveragePercentage),
      averageMediaPerProperty: parseFloat(averageMediaPerProperty),
      topMediaProperties,
      mediaTypeBreakdown
    };
    
  } catch (error) {
    console.error('❌ Error analyzing media coverage:', error.message);
    throw error;
  }
}

// Run the script
clearAndTest().catch(console.error);
