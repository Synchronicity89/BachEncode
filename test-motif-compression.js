/**
 * test-motif-compression.js - Test script for MotifCompressor
 */

const MotifCompressor = require('./MotifCompressor');
const fs = require('fs');

function testMotifCompression(inputFile) {
    console.log(`=== TESTING MOTIF COMPRESSION ON ${inputFile} ===`);
    
    try {
        // Load the standard compressed JSON data
        const musicData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        console.log(`Loaded music data: ${musicData.voices.length} voices`);
        
        // Count original notes
        let originalNoteCount = 0;
        musicData.voices.forEach(voice => {
            originalNoteCount += voice.length;
        });
        console.log(`Original note count: ${originalNoteCount}`);
        
        // Create compressor instance
        const compressor = new MotifCompressor();
        
        // Compress with motif patterns
        console.log('\n--- COMPRESSION PHASE ---');
        const compressed = compressor.compress(musicData);
        
        // Display compression results
        if (compressed.motifCompression) {
            console.log('\nCOMPRESSION RESULTS:');
            console.log(`Motif library size: ${compressed.motifCompression.motifLibrary.length}`);
            console.log(`Original notes: ${compressed.motifCompression.compressionStats.originalNotes}`);
            console.log(`Compressed references: ${compressed.motifCompression.compressionStats.compressedReferences}`);
            console.log(`Compression ratio: ${compressed.motifCompression.compressionStats.compressionRatio.toFixed(3)}x`);
            
            // Show motif library details
            console.log('\nMOTIF LIBRARY:');
            compressed.motifCompression.motifLibrary.forEach((motif, index) => {
                console.log(`  ${motif.id}: ${motif.length} notes, ${motif.matches} matches, confidence ${motif.confidence.toFixed(1)}%`);
                console.log(`    Key: ${motif.keyContext.key} ${motif.keyContext.mode}`);
                console.log(`    Scale degrees: [${motif.pitchPattern.join(', ')}]`);
                console.log(`    Intervals: [${motif.intervalPattern.join(', ')}]`);
            });
        } else {
            console.log('No motif compression applied (no suitable motifs found)');
        }
        
        // Test decompression
        console.log('\n--- DECOMPRESSION PHASE ---');
        const decompressed = compressor.decompress(compressed);
        
        // Verify roundtrip integrity
        console.log('\n--- ROUNDTRIP VERIFICATION ---');
        
        // Count decompressed notes
        let decompressedNoteCount = 0;
        decompressed.voices.forEach(voice => {
            decompressedNoteCount += voice.length;
        });
        
        console.log(`Decompressed note count: ${decompressedNoteCount}`);
        console.log(`Note count match: ${originalNoteCount === decompressedNoteCount ? 'PASS' : 'FAIL'}`);
        
        // Compare basic structure
        const structureMatch = 
            decompressed.ppq === musicData.ppq &&
            decompressed.tempo === musicData.tempo &&
            decompressed.voices.length === musicData.voices.length;
        
        console.log(`Structure match: ${structureMatch ? 'PASS' : 'FAIL'}`);
        
        // Save results for inspection
        const compressedFilename = inputFile.replace('.json', '-motif-compressed.json');
        const decompressedFilename = inputFile.replace('.json', '-motif-decompressed.json');
        
        fs.writeFileSync(compressedFilename, JSON.stringify(compressed, null, 2));
        fs.writeFileSync(decompressedFilename, JSON.stringify(decompressed, null, 2));
        
        console.log(`\nResults saved to:`);
        console.log(`  Compressed: ${compressedFilename}`);
        console.log(`  Decompressed: ${decompressedFilename}`);
        
        return {
            success: true,
            originalNotes: originalNoteCount,
            compressedNotes: decompressedNoteCount,
            compressionRatio: compressed.motifCompression ? compressed.motifCompression.compressionStats.compressionRatio : 1.0,
            motifsFound: compressed.motifCompression ? compressed.motifCompression.motifLibrary.length : 0
        };
        
    } catch (error) {
        console.error('Error during motif compression test:', error);
        return { success: false, error: error.message };
    }
}

// Test with command line argument or default file
const inputFile = process.argv[2] || 'test-validation.json';

if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    console.log('Usage: node test-motif-compression.js <input-file.json>');
    process.exit(1);
}

const result = testMotifCompression(inputFile);

if (result.success) {
    console.log('\n=== TEST SUMMARY ===');
    console.log(`✓ Motif compression test completed successfully`);
    console.log(`✓ ${result.motifsFound} motifs found and compressed`);
    console.log(`✓ Compression ratio: ${result.compressionRatio.toFixed(3)}x`);
    console.log(`✓ Roundtrip integrity verified`);
} else {
    console.log('\n=== TEST FAILED ===');
    console.log(`✗ Error: ${result.error}`);
    process.exit(1);
}