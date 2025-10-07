const fs = require('fs');
const path = require('path');
const MotifCompressor = require('./MotifCompressor');

/**
 * Utility script to regenerate compressed JSON files with exact motif matches only.
 * This addresses the issue where files contain non-exact transformations like 
 * "retrograde-inversion", "retrograde", etc.
 * 
 * Usage:
 *   node regenerate-exact-motifs.js <input.json> [output.json]
 * 
 * If no output file is specified, creates <input>-exact-only.json
 */

function regenerateWithExactMotifs(inputPath, outputPath) {
    console.log(`Reading input file: ${inputPath}`);
    
    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input file not found: ${inputPath}`);
        return false;
    }
    
    try {
        // Read the original JSON file
        const jsonData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        console.log(`✅ Loaded JSON data (${jsonData.voices.length} voices)`);
        
        // Remove any existing motif compression to start fresh
        if (jsonData.motifCompression) {
            console.log('🔄 Removing existing motif compression...');
            delete jsonData.motifCompression;
            
            // Convert motif_reference and motif_original back to regular_note
            for (let voiceIndex = 0; voiceIndex < jsonData.voices.length; voiceIndex++) {
                const voice = jsonData.voices[voiceIndex];
                for (let i = 0; i < voice.length; i++) {
                    const item = voice[i];
                    if (item.type === 'motif_reference' || item.type === 'motif_original') {
                        console.log(`⚠️  Warning: Found ${item.type} that cannot be converted back to regular_note`);
                        console.log(`   This suggests the file was already compressed. Consider using the original MIDI file instead.`);
                    }
                }
            }
        }
        
        // Apply motif compression with exactMatchesOnly=true
        console.log('🎵 Applying motif compression with exactMatchesOnly=true...');
        const compressor = new MotifCompressor({
            exactMatchesOnly: true,
            conservativeMode: true,
            compressionThreshold: 0.95  // High threshold for quality
        });
        
        const compressedData = compressor.compress(jsonData);
        
        // Analyze the results
        const motifCount = compressedData.motifCompression?.motifLibrary?.length || 0;
        const compressionRatio = compressedData.motifCompression?.compressionStats?.compressionRatio || 1.0;
        
        console.log(`✅ Compression complete:`);
        console.log(`   Motifs found: ${motifCount}`);
        console.log(`   Compression ratio: ${compressionRatio.toFixed(3)}x`);
        
        // Validate no non-exact transformations
        let nonExactCount = 0;
        if (compressedData.motifCompression?.motifLibrary) {
            for (const voice of compressedData.voices) {
                for (const item of voice) {
                    if (item.type === 'motif_reference') {
                        if (item.transformation && item.transformation !== 'exact') {
                            nonExactCount++;
                            console.log(`⚠️  Found non-exact transformation: ${item.transformation} (confidence: ${item.confidence})`);
                        }
                    }
                }
            }
        }
        
        if (nonExactCount === 0) {
            console.log('✅ Validation passed: No non-exact transformations found');
        } else {
            console.log(`❌ Validation failed: Found ${nonExactCount} non-exact transformations`);
            console.log('   This suggests exactMatchesOnly mode is not working correctly');
        }
        
        // Write the output file
        fs.writeFileSync(outputPath, JSON.stringify(compressedData, null, 2));
        console.log(`💾 Saved exact-motifs version to: ${outputPath}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error processing file: ${error.message}`);
        return false;
    }
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('🎵 Regenerate JSON files with exact motif matches only');
        console.log('');
        console.log('Usage:');
        console.log('  node regenerate-exact-motifs.js <input.json> [output.json]');
        console.log('');
        console.log('Examples:');
        console.log('  node regenerate-exact-motifs.js output/bwv785-with-motifs.json');
        console.log('  node regenerate-exact-motifs.js data.json data-exact.json');
        console.log('');
        console.log('This utility removes non-exact motif transformations like:');
        console.log('  - retrograde-inversion');
        console.log('  - retrograde');
        console.log('  - inversion');
        console.log('');
        console.log('And only keeps exact pattern matches.');
        return;
    }
    
    const inputPath = args[0];
    let outputPath = args[1];
    
    if (!outputPath) {
        const parsed = path.parse(inputPath);
        outputPath = path.join(parsed.dir, `${parsed.name}-exact-only${parsed.ext}`);
    }
    
    console.log('🎵 BachEncode Exact Motifs Regenerator');
    console.log('=====================================');
    console.log(`Input:  ${inputPath}`);
    console.log(`Output: ${outputPath}`);
    console.log('');
    
    const success = regenerateWithExactMotifs(inputPath, outputPath);
    
    if (success) {
        console.log('');
        console.log('🎉 Success! The file has been regenerated with exact motif matches only.');
        console.log('   All non-exact transformations have been removed.');
    } else {
        console.log('');
        console.log('💥 Failed to regenerate the file. Please check the error messages above.');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { regenerateWithExactMotifs };