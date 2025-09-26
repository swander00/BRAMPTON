#!/usr/bin/env node

/**
 * Simple Property-Media Relationship Check
 * Quick analysis of property-media relationships
 */

import { supabaseAdmin } from '../src/config/supabase.js';

async function quickCheck() {
    try {
        console.log('🔍 Starting quick property-media analysis...\n');

        // 1. Count total properties
        console.log('📊 Counting total properties...');
        const { count: totalProperties, error: propError } = await supabaseAdmin
            .from('Property')
            .select('*', { count: 'exact', head: true });

        if (propError) {
            console.error('❌ Error counting properties:', propError.message);
            return;
        }

        console.log(`✅ Total properties: ${totalProperties}`);

        // 2. Count total media
        console.log('📸 Counting total media records...');
        const { count: totalMedia, error: mediaError } = await supabaseAdmin
            .from('Media')
            .select('*', { count: 'exact', head: true });

        if (mediaError) {
            console.error('❌ Error counting media:', mediaError.message);
            return;
        }

        console.log(`✅ Total media records: ${totalMedia}`);

        // 3. Count unique properties that have media
        console.log('🔗 Counting properties with media...');
        const { data: mediaData, error: mediaDataError } = await supabaseAdmin
            .from('Media')
            .select('ResourceRecordKey')
            .not('ResourceRecordKey', 'is', null);

        if (mediaDataError) {
            console.error('❌ Error fetching media data:', mediaDataError.message);
            return;
        }

        // Get unique property keys that have media
        const uniquePropertyKeys = new Set(mediaData.map(m => m.ResourceRecordKey));
        const propertiesWithMedia = uniquePropertyKeys.size;

        console.log(`✅ Properties with media: ${propertiesWithMedia}`);

        // 4. Calculate percentages
        const propertiesWithoutMedia = totalProperties - propertiesWithMedia;
        const withMediaPercentage = ((propertiesWithMedia / totalProperties) * 100).toFixed(2);
        const withoutMediaPercentage = ((propertiesWithoutMedia / totalProperties) * 100).toFixed(2);

        // 5. Calculate average media per property
        const avgMediaPerProperty = (totalMedia / propertiesWithMedia).toFixed(2);

        // 6. Display results
        console.log('\n' + '='.repeat(60));
        console.log('📋 PROPERTY-MEDIA RELATIONSHIP SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Properties: ${totalProperties.toLocaleString()}`);
        console.log(`Total Media Records: ${totalMedia.toLocaleString()}`);
        console.log(`Properties with Media: ${propertiesWithMedia.toLocaleString()} (${withMediaPercentage}%)`);
        console.log(`Properties without Media: ${propertiesWithoutMedia.toLocaleString()} (${withoutMediaPercentage}%)`);
        console.log(`Average Media per Property: ${avgMediaPerProperty}`);
        console.log('='.repeat(60));

        // 7. Check for orphaned media
        console.log('\n🔍 Checking for orphaned media...');
        const sampleMediaKeys = mediaData.slice(0, 10).map(m => m.ResourceRecordKey);
        let orphanedCount = 0;

        for (const key of sampleMediaKeys) {
            const { data: propertyExists } = await supabaseAdmin
                .from('Property')
                .select('ListingKey')
                .eq('ListingKey', key)
                .single();
            
            if (!propertyExists) {
                orphanedCount++;
            }
        }

        if (orphanedCount > 0) {
            console.log(`⚠️  Found ${orphanedCount} potentially orphaned media records in sample`);
        } else {
            console.log('✅ No orphaned media found in sample');
        }

        console.log('\n✅ Analysis complete!');

    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the analysis
quickCheck()
    .then(() => {
        console.log('\n🎉 Quick check completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Quick check failed:', error.message);
        process.exit(1);
    });
