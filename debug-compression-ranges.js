const fs = require('fs');
const MotifCompressor = require('./MotifCompressor');

// Load the original motif-free data
const original = JSON.parse(fs.readFileSync('bwv785-original-motif-free.json'));

console.log('=== COMPRESSION ANALYSIS ===');
console.log(`Original Voice 2: ${original.voices[1].length} notes`);

// Create a motif compressor and run compression with debug
const motifCompressor = new MotifCompressor();
const compressed = motifCompressor.compress(original);

console.log(`Compressed Voice 2: ${compressed.voices[1].length} items`);

// Check the matches that were selected for compression
if (compressed.motifCompression && compressed.motifCompression.motifLibrary.length > 0) {
    const motif = compressed.motifCompression.motifLibrary[0];
    console.log(`\nMotif details:`);
    console.log(`- Original voice: ${motif.originalVoice}`);
    console.log(`- Original position: ${motif.originalPosition}`);
    console.log(`- Length: ${motif.length}`);
    console.log(`- Matches: ${motif.matches}`);
    
    // Find all motif references and originals in compressed data
    let motifOriginals = 0;
    let motifReferences = 0;
    let regularNotes = 0;
    
    compressed.voices[1].forEach((item, index) => {
        if (item.type === 'motif_original') {
            motifOriginals++;
            console.log(`Motif original at index ${index} (was position ${motif.originalPosition})`);
        } else if (item.type === 'motif_reference') {
            motifReferences++;
            console.log(`Motif reference at index ${index}`);
        } else {
            regularNotes++;
        }
    });
    
    console.log(`\nCompression summary:`);
    console.log(`- Regular notes: ${regularNotes}`);
    console.log(`- Motif originals: ${motifOriginals}`);
    console.log(`- Motif references: ${motifReferences}`);
    console.log(`- Total items: ${regularNotes + motifOriginals + motifReferences}`);
    
    // Calculate expected final notes
    const expectedNotes = regularNotes + (motifOriginals + motifReferences) * motif.length;
    console.log(`- Expected final notes: ${expectedNotes}`);
    console.log(`- Original notes: ${original.voices[1].length}`);
    console.log(`- Notes lost: ${original.voices[1].length - expectedNotes}`);
    
    // The issue might be overlapping matches
    // Let's check if matches are overlapping
    console.log(`\nMatch analysis needed...`);
}