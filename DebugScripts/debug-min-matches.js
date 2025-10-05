const MotifCompressor = require('../MotifCompressor');
const KeyAnalyzer = require('../KeyAnalyzer');

// Test with minMotifMatches = 2
const keyAnalyzer = new KeyAnalyzer();
const motifCompressor = new MotifCompressor({
    keyAnalyzer,
    minConfidence: 0.3,
    maxCompressionRatio: 0.7,
    minMotifMatches: 2  // Set to 2 to require original + 2 matches = 3 total instances
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

console.log('=== TESTING WITH minMotifMatches = 2 ===');
const compressed = motifCompressor.compress(musicData);

console.log('\n=== RESULT ===');
if (compressed.motifCompression) {
    console.log('Found motifs:', compressed.motifCompression.motifLibrary.length);
} else {
    console.log('No motifs found (original format returned)');
}