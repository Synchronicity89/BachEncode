const fs = require('fs');
const path = require('path');
const { compressMidiToJson, decompressJsonToMidi } = require('./EncodeDecode.js');

/**
 * Test to verify motif compression/decompression maintains musical integrity
 * This test should FAIL until we fix the decompression quality issues
 */
async function testMotifRoundtripIntegrity() {
    console.log('=== MOTIF ROUNDTRIP INTEGRITY TEST ===');
    console.log('This test verifies that motif compression preserves musical content');
    console.log();
    
    const testDir = './temp_test';
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Test with a simple, known MIDI file
    const inputFile = 'test_input/BWV772.MID';
    const compressedFile = path.join(testDir, 'test_roundtrip.json');
    const decompressedFile = path.join(testDir, 'test_roundtrip_decompressed.mid');
    
    console.log(`Testing with: ${inputFile}`);
    
    // Get original file stats
    const originalStats = fs.statSync(inputFile);
    console.log(`Original MIDI size: ${originalStats.size} bytes`);
    
    try {
        // Step 1: Compress with motifs
        console.log('\n1. Compressing with motif compression...');
        const compressionResult = await compressMidiToJson(inputFile, compressedFile, { useMotifs: true });
        
        if (compressionResult && compressionResult.motifCount) {
            console.log(`   Motifs compressed: ${compressionResult.motifCount}`);
            console.log(`   Compression ratio: ${compressionResult.compressionRatio}x`);
        }
        
        const compressedStats = fs.statSync(compressedFile);
        console.log(`   Compressed JSON size: ${compressedStats.size} bytes`);
        
        // Step 2: Decompress back to MIDI
        console.log('\n2. Decompressing back to MIDI...');
        await decompressJsonToMidi(compressedFile, decompressedFile);
        
        const decompressedStats = fs.statSync(decompressedFile);
        console.log(`   Decompressed MIDI size: ${decompressedStats.size} bytes`);
        
        // Step 3: Analyze the results for quality issues
        console.log('\n3. Analyzing roundtrip quality...');
        
        const sizeRatio = decompressedStats.size / originalStats.size;
        console.log(`   Size ratio (decompressed/original): ${sizeRatio.toFixed(3)}`);
        
        // Test criteria for musical integrity
        const tests = {
            'Size preservation': {
                pass: sizeRatio > 0.8, // Decompressed should be at least 80% of original size
                actual: sizeRatio,
                expected: '> 0.8',
                critical: true
            },
            'Not too small': {
                pass: decompressedStats.size > 1000, // Should be more than 1KB for a real piece
                actual: `${decompressedStats.size} bytes`,
                expected: '> 1000 bytes',
                critical: true
            },
            'Reasonable compression': {
                pass: compressionResult && compressionResult.compressionRatio < 1000, // Shouldn't be suspiciously high
                actual: compressionResult ? `${compressionResult.compressionRatio}x` : 'N/A',
                expected: '< 1000x',
                critical: false
            }
        };
        
        console.log('\n4. Test Results:');
        let allPassed = true;
        let criticalFailed = false;
        
        for (const [testName, test] of Object.entries(tests)) {
            const status = test.pass ? '✓ PASS' : '✗ FAIL';
            const critical = test.critical ? ' (CRITICAL)' : '';
            console.log(`   ${status} ${testName}: ${test.actual} (expected ${test.expected})${critical}`);
            
            if (!test.pass) {
                allPassed = false;
                if (test.critical) {
                    criticalFailed = true;
                }
            }
        }
        
        console.log('\n=== SUMMARY ===');
        if (allPassed) {
            console.log('✓ ALL TESTS PASSED: Motif roundtrip maintains musical integrity');
            return true;
        } else {
            console.log('✗ TESTS FAILED: Motif roundtrip has quality issues');
            if (criticalFailed) {
                console.log('⚠ CRITICAL ISSUES DETECTED:');
                console.log('  - Decompressed file is much smaller than original');
                console.log('  - This suggests significant data loss during compression/decompression');
                console.log('  - The resulting music likely sounds incomplete or incorrect');
            }
            return false;
        }
        
    } catch (error) {
        console.error('❌ TEST ERROR:', error.message);
        return false;
    }
}

// Helper function to extract note count from debug output (if available)
function extractNoteCount(debugFile) {
    try {
        if (fs.existsSync(debugFile)) {
            const debugContent = fs.readFileSync(debugFile, 'utf8');
            const match = debugContent.match(/Extraction complete: (\d+) notes found/);
            return match ? parseInt(match[1]) : null;
        }
    } catch (error) {
        // Ignore errors
    }
    return null;
}

// Run the test
if (require.main === module) {
    testMotifRoundtripIntegrity().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}

module.exports = { testMotifRoundtripIntegrity };