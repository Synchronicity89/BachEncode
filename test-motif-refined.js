// test-motif-refined.js - Test refined motif detection with better filtering
const MotifDetector = require('./MotifDetector');
const fs = require('fs');

// Load the test data  
const testData = JSON.parse(fs.readFileSync('test-validation.json', 'utf8'));

console.log('Testing Refined Motif Detection...');

const detector = new MotifDetector();

// More selective options for meaningful motifs
const refinedOptions = {
    keyOptions: {
        windowSize: 8,
        minConfidence: 0.7  // Higher confidence threshold
    },
    motifOptions: {
        minLength: 4,       // Longer minimum length
        maxLength: 8        // Shorter maximum for focus
    },
    matchOptions: {
        transformations: ['exact', 'retrograde', 'inversion', 'retrograde-inversion'],
        allowTimeDilation: false  // Disable time dilation for cleaner matches
    }
};

// Increase similarity thresholds in the detector
detector.similarityThreshold = 0.9;  // Higher pitch similarity required
detector.rhythmSimilarityThreshold = 0.5;  // Lower rhythm requirement

console.log('\n=== REFINED MOTIF ANALYSIS ===');
const results = detector.analyzeMotifs(testData.voices, refinedOptions);

console.log('\nRefined Results:');
console.log(`Total motifs: ${results.statistics.totalMotifs}`);
console.log(`Total matches: ${results.statistics.totalMatches}`);
console.log('Transformations:', results.statistics.transformationCounts);

if (results.motifMatches.length > 0) {
    console.log('\n=== HIGH-QUALITY MATCHES ===');
    // Filter for higher quality matches
    const qualityMatches = results.motifMatches
        .filter(match => match.pitchSimilarity >= 0.9)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
    
    if (qualityMatches.length > 0) {
        qualityMatches.forEach((match, index) => {
            console.log(`\nQuality Match ${index + 1}:`);
            console.log(`  Transformation: ${match.transformation}`);
            console.log(`  Confidence: ${(match.confidence * 100).toFixed(1)}%`);
            console.log(`  Pitch similarity: ${(match.pitchSimilarity * 100).toFixed(1)}%`);
            console.log(`  Voice: ${match.voiceIndex}`);
            console.log(`  Pattern 1: [${match.motif1.intervalPattern.map(i => i.toFixed(1)).join(', ')}]`);
            console.log(`  Pattern 2: [${match.motif2.intervalPattern.map(i => i.toFixed(1)).join(', ')}]`);
            console.log(`  Original pitches 1: [${match.motif1.originalNotes.map(n => n.originalPitch).join(', ')}]`);
            console.log(`  Original pitches 2: [${match.motif2.originalNotes.map(n => n.originalPitch).join(', ')}]`); 
        });
    } else {
        console.log('No high-quality matches found with current thresholds.');
    }
}

// Show some example motifs for analysis
console.log('\n=== SAMPLE MOTIFS FOR ANALYSIS ===');
results.voiceMotifs.forEach((voice, vIndex) => {
    if (voice.motifs.length > 0) {
        console.log(`\nVoice ${vIndex} sample motifs:`);
        voice.motifs.slice(0, 2).forEach((motif, mIndex) => {
            console.log(`  Motif ${mIndex + 1}: ${motif.originalNotes.map(n => n.originalPitch).join('-')} → Scale degrees: [${motif.pitchPattern.map(p => p?.toFixed(1) || 'X').join(', ')}]`);
        });
    }
});