// test-key-analyzer.js - Test the key detection on our validation data
const KeyAnalyzer = require('./KeyAnalyzer');
const fs = require('fs');

// Load the test data
const testData = JSON.parse(fs.readFileSync('test-validation.json', 'utf8'));

console.log('Testing Key Analyzer on validation data...');
console.log('Piece info:', {
    ppq: testData.ppq,
    tempo: testData.tempo,
    voices: testData.voices.length,
    totalNotes: testData.voices.reduce((sum, v) => sum + v.length, 0)
});

const analyzer = new KeyAnalyzer();

// Analyze the key structure
const analysis = analyzer.analyzeAllVoices(testData.voices, {
    windowSize: 6,
    minConfidence: 0.5
});

console.log('\n=== KEY ANALYSIS RESULTS ===');
console.log('Global key:', analysis.globalKey);

console.log('\nPer-voice analysis:');
analysis.voiceKeys.forEach((voice, index) => {
    console.log(`\nVoice ${index}:`);
    voice.keyAnalysis.forEach((segment, segIndex) => {
        console.log(`  Segment ${segIndex}: ${segment.key} ${segment.mode} (confidence: ${segment.confidence.toFixed(2)}) [notes ${segment.startNote}-${segment.endNote}]`);
    });
});

// Test on individual voice samples
console.log('\n=== SAMPLE ANALYSIS ===');
testData.voices.forEach((voice, index) => {
    if (voice.length >= 5) {
        const sample = voice.slice(0, Math.min(10, voice.length));
        const pitches = sample.map(n => n.pitch);
        console.log(`Voice ${index} first pitches:`, pitches);
        
        const windowAnalysis = analyzer.analyzeWindow(sample);
        if (windowAnalysis) {
            console.log(`  → ${windowAnalysis.key} ${windowAnalysis.mode} (${(windowAnalysis.confidence * 100).toFixed(1)}%)`);
        }
    }
});