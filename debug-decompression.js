/**
 * Debug script to trace motif decompression
 */

const fs = require('fs');
const MotifCompressor = require('./MotifCompressor');

// Read the motif-compressed JSON
const compressedData = JSON.parse(fs.readFileSync('bwv785-motif-compressed.json', 'utf8'));

console.log('=== MOTIF DECOMPRESSION DEBUG ===');
console.log(`Original voices: ${compressedData.voices.length}`);

// Check voice 2 (index 1) specifically since that's where the problem is
const voice2 = compressedData.voices[1];
console.log(`\nVoice 2 items: ${voice2.length}`);

// Count different types
let regularNotes = 0;
let motifReferences = 0;
let motifOriginals = 0;

voice2.forEach((item, index) => {
    if (item.type === 'regular_note' || !item.type) {
        regularNotes++;
    } else if (item.type === 'motif_reference') {
        motifReferences++;
        console.log(`\nMotif reference at index ${index}:`);
        console.log(`  Motif ID: ${item.motifId}`);
        console.log(`  Delta: ${item.delta}`);
        console.log(`  Transformation: ${item.transformation}`);
        console.log(`  Confidence: ${item.confidence}`);
    } else if (item.type === 'motif_original') {
        motifOriginals++;
        console.log(`\nMotif original at index ${index}: ${item.notes.length} notes`);
    }
});

console.log(`\nVoice 2 summary:`);
console.log(`  Regular notes: ${regularNotes}`);
console.log(`  Motif references: ${motifReferences}`);
console.log(`  Motif originals: ${motifOriginals}`);

// Check motif library
if (compressedData.motifCompression && compressedData.motifCompression.motifLibrary) {
    console.log(`\nMotif library: ${compressedData.motifCompression.motifLibrary.length} motifs`);
    compressedData.motifCompression.motifLibrary.forEach(motif => {
        console.log(`  ${motif.id}: ${motif.length} notes (voice ${motif.originalVoice})`);
    });
}

// Now decompress and see what happens
console.log(`\n=== DECOMPRESSION PROCESS ===`);
const compressor = new MotifCompressor();
const decompressed = compressor.decompress(compressedData);

console.log(`\nAfter decompression:`);
console.log(`Voices: ${decompressed.voices.length}`);
decompressed.voices.forEach((voice, index) => {
    console.log(`  Voice ${index + 1}: ${voice.length} notes`);
});

// Save detailed analysis
const analysis = {
    originalCompressed: {
        voice1Length: compressedData.voices[0].length,
        voice2Length: compressedData.voices[1].length,
        voice2Types: voice2.map(item => item.type || 'regular_note')
    },
    afterDecompression: {
        voice1Length: decompressed.voices[0].length,
        voice2Length: decompressed.voices[1].length
    }
};

fs.writeFileSync('decompression-debug.json', JSON.stringify(analysis, null, 2));
console.log('\nDetailed analysis saved to decompression-debug.json');