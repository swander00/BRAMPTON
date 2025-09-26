#!/usr/bin/env node

/**
 * Property-Media Relationship Analysis Script
 * 
 * This script analyzes the relationship between Property and Media tables:
 * - Total properties in Property table
 * - Total media records in Media table
 * - Properties with media (count and percentage)
 * - Properties without media (count and percentage)
 * - Media records per property (statistics)
 * - Orphaned media records (if any)
 */

import { supabaseAdmin } from '../src/config/supabase.js';
import logger from '../src/utils/logger.js';

async function analyzePropertyMediaRelationships() {
    try {
        logger.info('Starting Property-Media relationship analysis...');

        // 1. Get total count of properties
        logger.info('Fetching total property count...');
        const { count: totalProperties, error: propertyCountError } = await supabaseAdmin
            .from('Property')
            .select('*', { count: 'exact', head: true });

        if (propertyCountError) {
            throw new Error(`Error counting properties: ${propertyCountError.message}`);
        }

        // 2. Get total count of media records
        logger.info('Fetching total media count...');
        const { count: totalMedia, error: mediaCountError } = await supabaseAdmin
            .from('Media')
            .select('*', { count: 'exact', head: true });

        if (mediaCountError) {
            throw new Error(`Error counting media: ${mediaCountError.message}`);
        }

        // 3. Get properties with media (using JOIN)
        logger.info('Analyzing properties with media...');
        const { data: propertiesWithMedia, error: propertiesWithMediaError } = await supabaseAdmin
            .from('Property')
            .select(`
                ListingKey,
                Media!inner(MediaKey)
            `);

        if (propertiesWithMediaError) {
            throw new Error(`Error fetching properties with media: ${propertiesWithMediaError.message}`);
        }

        // 4. Get media count per property
        logger.info('Calculating media count per property...');
        const { data: mediaPerProperty, error: mediaPerPropertyError } = await supabaseAdmin
            .from('Media')
            .select('ResourceRecordKey')
            .not('ResourceRecordKey', 'is', null);

        if (mediaPerPropertyError) {
            throw new Error(`Error fetching media per property: ${mediaPerPropertyError.message}`);
        }

        // 5. Check for orphaned media (media without corresponding properties)
        logger.info('Checking for orphaned media...');
        const { data: orphanedMedia, error: orphanedMediaError } = await supabaseAdmin
            .from('Media')
            .select('MediaKey, ResourceRecordKey')
            .not('ResourceRecordKey', 'is', null);

        if (orphanedMediaError) {
            throw new Error(`Error checking orphaned media: ${orphanedMediaError.message}`);
        }

        // Check which media records don't have corresponding properties
        const orphanedMediaKeys = [];
        for (const media of orphanedMedia) {
            const { data: propertyExists } = await supabaseAdmin
                .from('Property')
                .select('ListingKey')
                .eq('ListingKey', media.ResourceRecordKey)
                .single();
            
            if (!propertyExists) {
                orphanedMediaKeys.push(media.MediaKey);
            }
        }

        // Calculate statistics
        const propertiesWithMediaCount = propertiesWithMedia.length;
        const propertiesWithoutMediaCount = totalProperties - propertiesWithMediaCount;
        const propertiesWithMediaPercentage = ((propertiesWithMediaCount / totalProperties) * 100).toFixed(2);
        const propertiesWithoutMediaPercentage = ((propertiesWithoutMediaCount / totalProperties) * 100).toFixed(2);

        // Calculate media distribution
        const mediaCountMap = {};
        mediaPerProperty.forEach(media => {
            const listingKey = media.ResourceRecordKey;
            mediaCountMap[listingKey] = (mediaCountMap[listingKey] || 0) + 1;
        });

        const mediaCounts = Object.values(mediaCountMap);
        const avgMediaPerProperty = mediaCounts.length > 0 ? (mediaCounts.reduce((a, b) => a + b, 0) / mediaCounts.length).toFixed(2) : 0;
        const maxMediaPerProperty = Math.max(...mediaCounts, 0);
        const minMediaPerProperty = Math.min(...mediaCounts, 0);

        // Generate report
        console.log('\n' + '='.repeat(80));
        console.log('PROPERTY-MEDIA RELATIONSHIP ANALYSIS REPORT');
        console.log('='.repeat(80));
        
        console.log('\n📊 OVERVIEW:');
        console.log(`Total Properties: ${totalProperties.toLocaleString()}`);
        console.log(`Total Media Records: ${totalMedia.toLocaleString()}`);
        
        console.log('\n🏠 PROPERTIES WITH MEDIA:');
        console.log(`Properties with media: ${propertiesWithMediaCount.toLocaleString()} (${propertiesWithMediaPercentage}%)`);
        console.log(`Properties without media: ${propertiesWithoutMediaCount.toLocaleString()} (${propertiesWithoutMediaPercentage}%)`);
        
        console.log('\n📸 MEDIA DISTRIBUTION:');
        console.log(`Average media per property: ${avgMediaPerProperty}`);
        console.log(`Maximum media per property: ${maxMediaPerProperty}`);
        console.log(`Minimum media per property: ${minMediaPerProperty}`);
        
        if (orphanedMediaKeys.length > 0) {
            console.log(`\n⚠️  ORPHANED MEDIA: ${orphanedMediaKeys.length} media records without corresponding properties`);
            console.log('Orphaned media keys (first 10):', orphanedMediaKeys.slice(0, 10));
        } else {
            console.log('\n✅ NO ORPHANED MEDIA: All media records have corresponding properties');
        }

        // Media count distribution
        const mediaCountDistribution = {};
        mediaCounts.forEach(count => {
            mediaCountDistribution[count] = (mediaCountDistribution[count] || 0) + 1;
        });

        console.log('\n📈 MEDIA COUNT DISTRIBUTION:');
        const sortedDistribution = Object.entries(mediaCountDistribution)
            .sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        sortedDistribution.forEach(([count, properties]) => {
            const percentage = ((properties / propertiesWithMediaCount) * 100).toFixed(1);
            console.log(`${count} media: ${properties.toLocaleString()} properties (${percentage}%)`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('ANALYSIS COMPLETE');
        console.log('='.repeat(80));

        // Log summary to file
        logger.info('Property-Media Analysis Complete', {
            totalProperties,
            totalMedia,
            propertiesWithMedia: propertiesWithMediaCount,
            propertiesWithoutMedia: propertiesWithoutMediaCount,
            avgMediaPerProperty,
            maxMediaPerProperty,
            minMediaPerProperty,
            orphanedMediaCount: orphanedMediaKeys.length
        });

        return {
            totalProperties,
            totalMedia,
            propertiesWithMedia: propertiesWithMediaCount,
            propertiesWithoutMedia: propertiesWithoutMediaCount,
            avgMediaPerProperty,
            maxMediaPerProperty,
            minMediaPerProperty,
            orphanedMediaCount: orphanedMediaKeys.length
        };

    } catch (error) {
        logger.error('Error in property-media analysis:', error);
        console.error('❌ Analysis failed:', error.message);
        throw error;
    }
}

// Run the analysis if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzePropertyMediaRelationships()
        .then(() => {
            console.log('\n✅ Analysis completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Analysis failed:', error.message);
            process.exit(1);
        });
}

export default analyzePropertyMediaRelationships;
