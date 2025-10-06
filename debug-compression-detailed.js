/**
 * Debug script to trace exactly what happens during motif compression
 */

const fs = require('fs');
const MotifCompressor = require('./MotifCompressor');

// Read the original motif-free JSON
const originalData = JSON.parse(fs.readFileSync('bwv785-original-motif-free.json', 'utf8'));

console.log('=== DETAILED COMPRESSION DEBUG ===');
console.log(`Original data:`);
console.log(`  Voice 1: ${originalData.voices[0].length} notes`);
console.log(`  Voice 2: ${originalData.voices[1].length} notes`);
console.log(`  Total: ${originalData.voices[0].length + originalData.voices[1].length} notes`);

// Create a compressor with debug logging
const compressor = new MotifCompressor({
    maxCompressionRatio: 1.0, // Remove the arbitrary limit
    minMotifMatches: 1, // Allow even single matches
    compressionThreshold: 0.3 // Lower threshold for more aggressive compression
});

// Monkey patch the replacement function to add logging
const originalReplace = compressor.replaceWithMotifReferences;
compressor.replaceWithMotifReferences = function(compressed, compressibleMotifs, motifAnalysis) {
    console.log('\n=== REPLACEMENT PHASE ===');
    console.log(`Compressible motifs: ${compressibleMotifs.length}`);
    
    compressibleMotifs.forEach((item, index) => {
        console.log(`\nMotif ${index}:`);
        console.log(`  Voice: ${item.motif.voiceIndex}`);
        console.log(`  Start: ${item.motif.startIndex}`);
        console.log(`  Length: ${item.motif.length}`);
        console.log(`  Matches: ${item.matches.length}`);
        
        item.matches.forEach((match, matchIndex) => {
            console.log(`    Match ${matchIndex}: voice ${match.voiceIndex}, start ${match.motifIndex2}, confidence ${match.confidence.toFixed(3)}`);
        });
    });
    
    // Count notes before replacement
    const notesBefore = compressed.voices.map(voice => voice.length);
    console.log(`\nNotes before replacement: [${notesBefore.join(', ')}] = ${notesBefore.reduce((a,b) => a+b, 0)} total`);
    
    // Call original function
    const result = originalReplace.call(this, compressed, compressibleMotifs, motifAnalysis);
    
    // Count notes after replacement
    const notesAfter = compressed.voices.map(voice => voice.length);
    console.log(`Notes after replacement: [${notesAfter.join(', ')}] = ${notesAfter.reduce((a,b) => a+b, 0)} total`);
    
    return result;
};

// Perform compression
console.log('\n=== STARTING COMPRESSION ===');
const compressed = compressor.compress(originalData);

console.log('\n=== FINAL RESULT ===');
console.log(`Compressed data:`);
console.log(`  Voice 1: ${compressed.voices[0].length} items`);
console.log(`  Voice 2: ${compressed.voices[1].length} items`);

// Analyze the compressed structure
compressed.voices.forEach((voice, voiceIndex) => {
    let regular = 0, originals = 0, references = 0;
    voice.forEach(item => {
        if (item.type === 'regular_note' || !item.type) regular++;
        else if (item.type === 'motif_original') originals++;
        else if (item.type === 'motif_reference') references++;
    });
    console.log(`  Voice ${voiceIndex + 1}: ${regular} regular, ${originals} originals, ${references} references`);
});

// Save debug info
fs.writeFileSync('compression-debug-detailed.json', JSON.stringify({
    original: originalData,
    compressed: compressed
}, null, 2));