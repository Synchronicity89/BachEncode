// test-motif-detector.js - Test the motif detection system
const MotifDetector = require('./MotifDetector');
const fs = require('fs');

// Load the test data
const testData = JSON.parse(fs.readFileSync('test-validation.json', 'utf8'));

console.log('Testing Motif Detector on validation data...');
console.log('Piece info:', {
    ppq: testData.ppq,
    tempo: testData.tempo,
    voices: testData.voices.length,
    totalNotes: testData.voices.reduce((sum, v) => sum + v.length, 0)
});

const detector = new MotifDetector();

// Test with different options
const analysisOptions = {
    keyOptions: {
        windowSize: 6,
        minConfidence: 0.5
    },
    motifOptions: {
        minLength: 3,
        maxLength: 8
    },
    matchOptions: {
        transformations: ['exact', 'retrograde', 'inversion', 'retrograde-inversion'],
        allowTimeDilation: true
    }
};

console.log('\n=== RUNNING MOTIF ANALYSIS ===');
const results = detector.analyzeMotifs(testData.voices, analysisOptions);

console.log('\n=== ANALYSIS RESULTS ===');
console.log('Global key:', results.keyAnalysis.globalKey);

console.log('\nMotifs per voice:');
results.voiceMotifs.forEach(voice => {
    console.log(`Voice ${voice.voiceIndex}: ${voice.count} motifs found`);
});

console.log('\nStatistics:');
console.log(`Total motifs: ${results.statistics.totalMotifs}`);
console.log(`Total matches: ${results.statistics.totalMatches}`);
console.log('Transformation types found:', results.statistics.transformationCounts);

if (results.motifMatches.length > 0) {
    console.log('\n=== TOP MOTIF MATCHES ===');
    // Sort by confidence and show top matches
    const topMatches = results.motifMatches
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
    
    topMatches.forEach((match, index) => {
        console.log(`\nMatch ${index + 1}:`);
        console.log(`  Transformation: ${match.transformation}`);
        console.log(`  Confidence: ${(match.confidence * 100).toFixed(1)}%`);
        console.log(`  Pitch similarity: ${(match.pitchSimilarity * 100).toFixed(1)}%`);
        console.log(`  Rhythm similarity: ${(match.rhythmSimilarity * 100).toFixed(1)}%`);
        console.log(`  Time dilation: ${match.timeDilation}x`);
        console.log(`  Voice: ${match.voiceIndex}`);
        console.log(`  Motif 1: notes ${match.motif1.startIndex}-${match.motif1.startIndex + match.motif1.length - 1}`);
        console.log(`  Motif 2: notes ${match.motif2.startIndex}-${match.motif2.startIndex + match.motif2.length - 1}`);
        console.log(`  Interval pattern 1: [${match.motif1.intervalPattern.map(i => i.toFixed(1)).join(', ')}]`);
        console.log(`  Interval pattern 2: [${match.motif2.intervalPattern.map(i => i.toFixed(1)).join(', ')}]`);
    });
}

// Test individual voice analysis
console.log('\n=== DETAILED VOICE ANALYSIS ===');
if (results.voiceMotifs.length > 0 && results.voiceMotifs[0].motifs.length > 0) {
    const firstVoice = results.voiceMotifs[0];
    console.log(`\nFirst few motifs from Voice 0:`);
    
    firstVoice.motifs.slice(0, 3).forEach((motif, index) => {
        console.log(`  Motif ${index + 1}:`);
        console.log(`    Position: notes ${motif.startIndex}-${motif.startIndex + motif.length - 1}`);
        console.log(`    Scale degrees: [${motif.pitchPattern.map(p => p?.toFixed(1) || 'X').join(', ')}]`);
        console.log(`    Intervals: [${motif.intervalPattern.map(i => i.toFixed(1)).join(', ')}]`);
        console.log(`    Key context: ${motif.keyContext.key} ${motif.keyContext.mode}`);
        console.log(`    Original pitches: [${motif.originalNotes.map(n => n.originalPitch).join(', ')}]`);
    });
}