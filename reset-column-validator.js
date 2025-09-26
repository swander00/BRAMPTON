#!/usr/bin/env node

/**
 * Reset script for column validator circuit breaker
 * This script resets the circuit breaker for the Property table
 */

import columnValidator from './src/utils/columnValidator.js';
import logger from './src/utils/logger.js';

async function resetColumnValidator() {
  console.log('🔄 Resetting Column Validator Circuit Breaker...\n');
  
  try {
    // Get current stats
    const statsBefore = columnValidator.getCacheStats();
    console.log('Before reset:', statsBefore);
    
    // Reset circuit breaker for Property table
    columnValidator.resetCircuitBreaker('Property');
    
    // Clear cache
    columnValidator.clearCache();
    
    // Get stats after reset
    const statsAfter = columnValidator.getCacheStats();
    console.log('After reset:', statsAfter);
    
    console.log('\n✅ Column validator circuit breaker reset successfully!');
    
  } catch (error) {
    console.error('❌ Failed to reset column validator:', error.message);
    logger.error('Failed to reset column validator:', error);
  }
}

// Run the reset
resetColumnValidator().catch(console.error);
