const fs = require('fs');
const MotifCompressor = require('./MotifCompressor');

// Load the compressed data
const compressed = JSON.parse(fs.readFileSync('bwv785-fixed-motif-compressed.json'));

console.log('=== DECOMPRESSION DEBUG ===');
console.log('Original compressed data:');
console.log(`Voice 1: ${compressed.voices[0].length} items`);
console.log(`Voice 2: ${compressed.voices[1].length} items`);

// Count voice 2 item types
const voice2Types = {};
compressed.voices[1].forEach((item, index) => {
    const type = item.type || 'unknown';
    voice2Types[type] = (voice2Types[type] || 0) + 1;
    if (type === 'motif_original' || type === 'motif_reference') {
        console.log(`${type} at index ${index}:`, item.motifId || 'motif_0');
    }
});

console.log('\nVoice 2 item types:', voice2Types);

// Check motif library
console.log('\nMotif library:');
compressed.motifCompression.motifLibrary.forEach(motif => {
    console.log(`${motif.id}: ${motif.originalNotes.length} original notes`);
});

// Now decompress
const motifCompressor = new MotifCompressor();
const decompressed = motifCompressor.decompress(compressed);

console.log('\nAfter decompression:');
console.log(`Voice 1: ${decompressed.voices[0].length} notes`);
console.log(`Voice 2: ${decompressed.voices[1].length} notes`);

// Count expected notes
let expectedVoice2Notes = 0;
compressed.voices[1].forEach(item => {
    if (item.type === 'regular_note') {
        expectedVoice2Notes += 1;
    } else if (item.type === 'motif_original') {
        // Should expand to original notes length
        expectedVoice2Notes += compressed.motifCompression.motifLibrary[0].originalNotes.length;
    } else if (item.type === 'motif_reference') {
        // Should expand to motif length
        expectedVoice2Notes += compressed.motifCompression.motifLibrary[0].originalNotes.length;
    }
});

console.log(`Expected Voice 2 notes: ${expectedVoice2Notes}`);
console.log(`Actual Voice 2 notes: ${decompressed.voices[1].length}`);
console.log(`Difference: ${expectedVoice2Notes - decompressed.voices[1].length}`);

if (expectedVoice2Notes !== decompressed.voices[1].length) {
    console.log('\n⚠️ NOTE COUNT MISMATCH DETECTED!');
}