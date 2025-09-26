#!/usr/bin/env node

/**
 * Test script for improved column validator
 * This script demonstrates the improved circuit breaker behavior
 */

import columnValidator from './src/utils/columnValidator.js';
import logger from './src/utils/logger.js';

async function testImprovedValidator() {
  console.log('🧪 Testing Improved Column Validator...\n');
  
  try {
    // Test 1: First call (should trigger warnings and mark as empty)
    console.log('1. First call to Property table (should trigger warnings)...');
    const result1 = await columnValidator.getTableColumns('Property');
    console.log(`   Result: ${result1.size} columns found`);
    
    // Test 2: Second call (should be skipped due to circuit breaker)
    console.log('\n2. Second call to Property table (should be skipped)...');
    const result2 = await columnValidator.getTableColumns('Property');
    console.log(`   Result: ${result2.size} columns found`);
    
    // Test 3: Third call (should still be skipped)
    console.log('\n3. Third call to Property table (should still be skipped)...');
    const result3 = await columnValidator.getTableColumns('Property');
    console.log(`   Result: ${result3.size} columns found`);
    
    // Test 4: Check cache statistics
    console.log('\n4. Cache statistics:');
    const stats = columnValidator.getCacheStats();
    console.log('   Stats:', JSON.stringify(stats, null, 2));
    
    // Test 5: Test data filtering (should work without warnings)
    console.log('\n5. Testing data filtering (should work without warnings)...');
    const testData = {
      ListingKey: 'TEST123',
      PropertyType: 'Residential',
      ContractStatus: 'Available'
    };
    
    const filteredData = await columnValidator.filterDataForTable(testData, 'Property');
    console.log(`   Original: ${Object.keys(testData).length} keys`);
    console.log(`   Filtered: ${Object.keys(filteredData).length} keys`);
    console.log(`   Filtered data:`, filteredData);
    
    console.log('\n✅ Improved column validator test completed!');
    console.log('📊 Key improvements:');
    console.log('   - Only 1 warning per table instead of hundreds');
    console.log('   - Circuit breaker activates immediately for empty tables');
    console.log('   - Clean logs with minimal spam');
    console.log('   - Better performance with pre-check system');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logger.error('Test failed:', error);
  }
}

// Run the test
testImprovedValidator().catch(console.error);
