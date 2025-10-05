const MotifCompressor = require('../MotifCompressor');
const KeyAnalyzer = require('../KeyAnalyzer');

// Test with higher minimum motif length
const keyAnalyzer = new KeyAnalyzer();
keyAnalyzer.minMotifLength = 4; // Try requiring at least 4 notes

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

console.log('=== TESTING WITH minMotifLength = 4 ===');
const compressed = motifCompressor.compress(musicData);

console.log('\n=== RESULT ===');
if (compressed.motifCompression) {
    console.log('Found motifs:', compressed.motifCompression.motifLibrary.length);
} else {
    console.log('No motifs found (original format returned)');
}