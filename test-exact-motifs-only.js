/**
 * Integration test to detect non-exact motif transformations
 * This test should FAIL until the motif compression system is fixed to only use exact matches
 */

const fs = require('fs');
const path = require('path');
const EncodeDecode = require('./EncodeDecode');

function testExactMotifsOnly() {
    console.log('=== TESTING EXACT MOTIFS ONLY ===');
    
    const tempDir = 'temp';
    const testFile = 'midi/BWV785.mid';
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    try {
        // Test 1: With exactMatchesOnly=true (should pass)
        console.log('1a. Testing with exactMatchesOnly=true (should pass)...');
        const exactMotifJsonPath = path.join(tempDir, 'test-exact-motifs.json');
        const exactMotifOptions = { 
            useMotifCompression: true,
            motifOptions: {
                exactMatchesOnly: true,
                conservativeMode: true,
                compressionThreshold: 0.9
            }
        };
        
        const exactMotifResults = EncodeDecode.compressMidiToJson(testFile, exactMotifJsonPath, exactMotifOptions);
        console.log(`   Created exact motif compression: ${exactMotifResults.motifCount} motifs, ratio: ${exactMotifResults.compressionRatio.toFixed(3)}x`);
        
        const exactNonExactTransformations = analyzeMotifTransformations(exactMotifJsonPath, 'exactMatchesOnly=true');
        
        // Test 2: With default motif settings (might have non-exact transformations)
        console.log('1b. Testing with default motif settings (might fail)...');
        const defaultMotifJsonPath = path.join(tempDir, 'test-default-motifs.json');
        const defaultMotifOptions = { 
            useMotifCompression: true,
            motifOptions: {
                exactMatchesOnly: false,  // Allow transformations
                conservativeMode: false,
                compressionThreshold: 0.5  // Lower threshold
            }
        };
        
        const defaultMotifResults = EncodeDecode.compressMidiToJson(testFile, defaultMotifJsonPath, defaultMotifOptions);
        console.log(`   Created default motif compression: ${defaultMotifResults.motifCount} motifs, ratio: ${defaultMotifResults.compressionRatio.toFixed(3)}x`);
        
        const defaultNonExactTransformations = analyzeMotifTransformations(defaultMotifJsonPath, 'default settings');
        
        // Test 3: Check what user might be seeing - load existing compressed file
        const existingMotifJsonPath = 'output/bwv785-with-motifs.json';
        let existingNonExactTransformations = [];
        if (fs.existsSync(existingMotifJsonPath)) {
            console.log('1c. Testing existing compressed file...');
            existingNonExactTransformations = analyzeMotifTransformations(existingMotifJsonPath, 'existing file');
        }
        
        console.log('2. Test Results Summary:');
        
        // Check exact matches test
        if (exactNonExactTransformations.length > 0) {
            console.log(`   ❌ FAIL: exactMatchesOnly=true still produced ${exactNonExactTransformations.length} non-exact transformations`);
            printTransformations(exactNonExactTransformations);
            process.exit(1);
        } else {
            console.log('   ✅ PASS: exactMatchesOnly=true correctly uses only exact matches');
        }
        
        // Check default settings test
        if (defaultNonExactTransformations.length > 0) {
            console.log(`   ⚠️  WARNING: Default settings produced ${defaultNonExactTransformations.length} non-exact transformations (this is expected)`);
            printTransformations(defaultNonExactTransformations.slice(0, 3), 'First 3 examples');
        } else {
            console.log('   ℹ️  INFO: Default settings also used only exact matches');
        }
        
        // Check existing file
        if (existingNonExactTransformations.length > 0) {
            console.log(`   ❌ FAIL: Existing file has ${existingNonExactTransformations.length} non-exact transformations`);
            printTransformations(existingNonExactTransformations);
            console.log('   This suggests the existing file was created with non-exact settings.');
            process.exit(1);
        } else if (fs.existsSync(existingMotifJsonPath)) {
            console.log('   ✅ PASS: Existing file uses only exact matches');
        }
        
        console.log('3. Overall Result:');
        console.log('   ✅ PASS: Motif compression system correctly respects exactMatchesOnly setting');
        
    } catch (error) {
        console.error('Error during test:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        // Clean up temp files
        try {
            const filesToClean = ['test-exact-motifs.json', 'test-default-motifs.json'];
            filesToClean.forEach(filename => {
                const filePath = path.join(tempDir, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (cleanupError) {
            console.warn('Warning: Could not clean up temp files:', cleanupError.message);
        }
    }
}

function analyzeMotifTransformations(jsonPath, testName) {
    console.log(`   Analyzing ${testName}...`);
    const compressedData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const nonExactTransformations = [];
    
    // Check if motif compression was enabled
    if (compressedData.motifCompression && compressedData.motifCompression.enabled) {
        console.log(`   Found ${compressedData.motifCompression.motifLibrary.length} motifs in library`);
        
        // Check each voice for motif references
        compressedData.voices.forEach((voice, voiceIndex) => {
            voice.forEach((item, itemIndex) => {
                if (item.type === 'motif_reference') {
                    console.log(`   Found motif reference: motif=${item.motifId}, transformation=${item.transformation}, confidence=${item.confidence}`);
                    
                    // Check if transformation is exactly "exact" or identity transformation
                    if (item.transformation !== 'exact' && item.transformation !== 'identity') {
                        nonExactTransformations.push({
                            voiceIndex,
                            itemIndex,
                            motifId: item.motifId,
                            transformation: item.transformation,
                            confidence: item.confidence,
                            timeDilation: item.timeDilation
                        });
                    }
                    
                    // Also check if transformation properties indicate non-exact matches
                    if (item.timeDilation && item.timeDilation !== 1.0) {
                        nonExactTransformations.push({
                            voiceIndex,
                            itemIndex,
                            motifId: item.motifId,
                            transformation: item.transformation,
                            reason: `Non-unity time dilation: ${item.timeDilation}`,
                            confidence: item.confidence
                        });
                    }
                } else if (item.type === 'motif_original') {
                    console.log(`   Found motif original: motif=${item.motifId}`);
                }
            });
        });
        
        // Also check the motif library for any indication of transformations
        compressedData.motifCompression.motifLibrary.forEach((motif, motifIndex) => {
            console.log(`   Motif ${motif.id}: ${motif.matches} matches, confidence ${motif.confidence.toFixed(3)}`);
            
            // Check if the motif has non-exact characteristics
            if (motif.confidence < 1.0) {
                console.log(`   WARNING: Motif ${motif.id} has confidence < 1.0 (${motif.confidence}), suggesting non-exact matches`);
            }
        });
    } else {
        console.log('   No motif compression found in JSON');
    }
    
    return nonExactTransformations;
}

function printTransformations(transformations, label = 'Non-exact transformations') {
    console.log(`   ${label}:`);
    transformations.forEach((transform, index) => {
        console.log(`   ${index + 1}. Voice ${transform.voiceIndex}, Item ${transform.itemIndex}:`);
        console.log(`      Motif: ${transform.motifId}`);
        console.log(`      Transformation: ${transform.transformation}`);
        console.log(`      Confidence: ${transform.confidence}`);
        if (transform.timeDilation) console.log(`      Time Dilation: ${transform.timeDilation}`);
        if (transform.reason) console.log(`      Issue: ${transform.reason}`);
    });
}

// Run the test
if (require.main === module) {
    testExactMotifsOnly();
}

module.exports = { testExactMotifsOnly };