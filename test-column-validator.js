#!/usr/bin/env node

/**
 * Test script for column validator fix
 * This script tests the column validator to ensure it handles the Property table correctly
 */

import columnValidator from './src/utils/columnValidator.js';
import logger from './src/utils/logger.js';

async function testColumnValidator() {
  console.log('🧪 Testing Column Validator Fix...\n');
  
  try {
    // Test Property table column detection
    console.log('1. Testing Property table column detection...');
    const propertyColumns = await columnValidator.getTableColumns('Property');
    console.log(`   Found ${propertyColumns.size} columns for Property table`);
    
    if (propertyColumns.size > 0) {
      console.log('   ✅ Property table columns detected successfully');
      console.log('   Sample columns:', Array.from(propertyColumns).slice(0, 5));
    } else {
      console.log('   ⚠️  No columns found for Property table');
    }
    
    // Test filtering data for Property table
    console.log('\n2. Testing data filtering for Property table...');
    const testData = {
      ListingKey: 'TEST123',
      PropertyType: 'Residential',
      ContractStatus: 'Available',
      NonExistentColumn: 'This should be filtered out'
    };
    
    const filteredData = await columnValidator.filterDataForTable(testData, 'Property');
    console.log(`   Original data keys: ${Object.keys(testData).length}`);
    console.log(`   Filtered data keys: ${Object.keys(filteredData).length}`);
    console.log('   Filtered data:', filteredData);
    
    // Test cache statistics
    console.log('\n3. Testing cache statistics...');
    const stats = columnValidator.getCacheStats();
    console.log('   Cache stats:', stats);
    
    console.log('\n✅ Column validator test completed successfully!');
    
  } catch (error) {
    console.error('❌ Column validator test failed:', error.message);
    logger.error('Column validator test failed:', error);
  }
}

// Run the test
testColumnValidator().catch(console.error);
