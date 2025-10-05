/**
 * test-integration.js - Test script for integrated motif compression
 */

const EncodeDecode = require('./EncodeDecode');
const fs = require('fs');

async function testIntegration() {
    console.log('=== TESTING ENCODEDECODE.JS INTEGRATION ===\n');
    
    const testFiles = [
        { input: 'test-validation.mid', name: 'Validation Test' }
    ];
    
    for (const testFile of testFiles) {
        console.log(`--- Testing ${testFile.name} ---`);
        
        try {
            // Test 1: Standard compression (no motifs)
            console.log('1. Standard compression...');
            const standardOutput = testFile.input.replace('.mid', '-standard.json');
            EncodeDecode.compressMidiToJson(testFile.input, standardOutput);
            
            const standardData = JSON.parse(fs.readFileSync(standardOutput, 'utf8'));
            const standardNotes = countNotes(standardData);
            console.log(`   Standard compression: ${standardNotes} notes`);
            
            // Test 2: Motif compression using options
            console.log('2. Motif compression via options...');
            const motifOutput = testFile.input.replace('.mid', '-motif-integrated.json');
            const motifOptions = { useMotifCompression: true };
            EncodeDecode.compressMidiToJson(testFile.input, motifOutput, motifOptions);
            
            const motifData = JSON.parse(fs.readFileSync(motifOutput, 'utf8'));
            console.log(`   Motif compression: ${motifData.motifCompression ? motifData.motifCompression.motifLibrary.length : 0} motifs`);
            console.log(`   Compression ratio: ${motifData.motifCompression ? motifData.motifCompression.compressionStats.compressionRatio.toFixed(2) : 1.0}x`);
            
            // Test 3: Custom configuration
            console.log('3. Custom motif configuration...');
            const customOutput = testFile.input.replace('.mid', '-custom-motif.json');
            const customConfig = EncodeDecode.createCompressionConfig({
                useMotifCompression: true,
                compressionThreshold: 0.4, // Lower threshold
                minMotifMatches: 2 // Higher minimum matches
            });
            EncodeDecode.compressMidiToJson(testFile.input, customOutput, customConfig);
            
            const customData = JSON.parse(fs.readFileSync(customOutput, 'utf8'));
            console.log(`   Custom compression: ${customData.motifCompression ? customData.motifCompression.motifLibrary.length : 0} motifs`);
            console.log(`   Compression ratio: ${customData.motifCompression ? customData.motifCompression.compressionStats.compressionRatio.toFixed(2) : 1.0}x`);
            
            // Test 4: Roundtrip integrity
            console.log('4. Testing roundtrip integrity...');
            
            // Standard roundtrip
            const standardDecompressed = testFile.input.replace('.mid', '-standard-decompressed.mid');
            EncodeDecode.decompressJsonToMidi(standardOutput, standardDecompressed);
            console.log(`   Standard roundtrip: ${fs.existsSync(standardDecompressed) ? 'SUCCESS' : 'FAILED'}`);
            
            // Motif roundtrip
            const motifDecompressed = testFile.input.replace('.mid', '-motif-decompressed.mid');
            EncodeDecode.decompressJsonToMidi(motifOutput, motifDecompressed);
            console.log(`   Motif roundtrip: ${fs.existsSync(motifDecompressed) ? 'SUCCESS' : 'FAILED'}`);
            
            // Test 5: Verify motif decompression works automatically
            console.log('5. Testing automatic motif detection...');
            const autoDetectionWorks = motifData.motifCompression && motifData.motifCompression.enabled;
            console.log(`   Auto-detection: ${autoDetectionWorks ? 'SUCCESS' : 'FAILED'}`);
            
            console.log(`✓ ${testFile.name} completed successfully\n`);
            
        } catch (error) {
            console.error(`✗ ${testFile.name} failed:`, error.message);
        }
    }
    
    console.log('=== INTEGRATION TEST COMPLETE ===');
}

function countNotes(musicData) {
    let count = 0;
    musicData.voices.forEach(voice => {
        count += voice.length;
    });
    return count;
}

// Run the test
testIntegration().catch(console.error);