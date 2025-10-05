// Debug script to test extractMotifAtPosition
const MotifDetector = require('../MotifDetector');

const motifDetector = new MotifDetector();

// Simple test case: C-D-E repeated twice
const testVoice = [
    { pitch: 'C4', dur: 480, start: 0, delta: 0 },
    { pitch: 'D4', dur: 480, start: 480, delta: 480 },
    { pitch: 'E4', dur: 480, start: 960, delta: 480 },
    { pitch: 'C4', dur: 480, start: 1440, delta: 480 },
    { pitch: 'D4', dur: 480, start: 1920, delta: 480 },
    { pitch: 'E4', dur: 480, start: 2400, delta: 480 }
];

console.log('=== TESTING EXTRACTMOTIFATPOSITION ===');

// Extract the original 3-note motif (C-D-E)
const originalMotif = motifDetector.extractMotifAtPosition(testVoice, 0, 3, 0);
console.log('Original motif (pos 0, length 3):', {
    startIndex: originalMotif.startIndex,
    length: originalMotif.length,
    intervalPattern: originalMotif.intervalPattern,
    pitches: originalMotif.notes.map(n => n.pitch)
});

// Extract the matching 3-note motif (C-D-E) at position 3
const matchingMotif = motifDetector.extractMotifAtPosition(testVoice, 3, 3, 0);
console.log('Matching motif (pos 3, length 3):', {
    startIndex: matchingMotif.startIndex,
    length: matchingMotif.length,
    intervalPattern: matchingMotif.intervalPattern,
    pitches: matchingMotif.notes.map(n => n.pitch)
});

// Compare them directly
const similarity = motifDetector.compareMotifs(originalMotif, matchingMotif, 'exact');
console.log('Comparison result:', similarity);
console.log('Should match!', similarity.pitch >= motifDetector.similarityThreshold);

console.log('\n=== CHECKING INTERVAL CALCULATION ===');
console.log('Original intervals:', originalMotif.intervalPattern);
console.log('Matching intervals:', matchingMotif.intervalPattern);
console.log('Intervals equal?', JSON.stringify(originalMotif.intervalPattern) === JSON.stringify(matchingMotif.intervalPattern));