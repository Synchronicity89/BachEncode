const MotifCompressor = require('../MotifCompressor');
const KeyAnalyzer = require('../KeyAnalyzer');

// Test the failing case
const keyAnalyzer = new KeyAnalyzer();
const motifCompressor = new MotifCompressor({
    keyAnalyzer,
    minConfidence: 0.3,
    maxCompressionRatio: 0.7
});

const musicData = {
    voices: [
        [
            // Single instance of a pattern - should NOT be compressed
            { pitch: 'C4', dur: 480, start: 0 },
            { pitch: 'D4', dur: 480, start: 480 },
            { pitch: 'E4', dur: 480, start: 960 },
            // Different pattern
            { pitch: 'F4', dur: 480, start: 1440 },
            { pitch: 'G4', dur: 480, start: 1920 },
            { pitch: 'A4', dur: 480, start: 2400 }
        ]
    ]
};

console.log('=== DEBUGGING FAILING TEST CASE ===');
console.log('Input:', JSON.stringify(musicData, null, 2));

const compressed = motifCompressor.compress(musicData);

console.log('\n=== COMPRESSION RESULT ===');
if (compressed.motifCompression) {
    console.log('Found motifs:', compressed.motifCompression.motifLibrary.length);
    console.log('Motif details:', JSON.stringify(compressed.motifCompression.motifLibrary, null, 2));
} else {
    console.log('No compression applied');
}