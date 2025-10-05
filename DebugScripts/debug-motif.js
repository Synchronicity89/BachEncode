// Debug script to investigate motif matching issues
const MotifDetector = require('../MotifDetector');

const motifDetector = new MotifDetector();

// Simple test case: C-D-E repeated twice
const testVoices = [
    [
        { pitch: 'C4', dur: 480, start: 0, delta: 0 },
        { pitch: 'D4', dur: 480, start: 480, delta: 480 },
        { pitch: 'E4', dur: 480, start: 960, delta: 480 },
        { pitch: 'C4', dur: 480, start: 1440, delta: 480 },
        { pitch: 'D4', dur: 480, start: 1920, delta: 480 },
        { pitch: 'E4', dur: 480, start: 2400, delta: 480 }
    ]
];

console.log('=== DEBUGGING MOTIF DETECTION ===');
console.log('Test data:', testVoices[0].map(n => n.pitch).join('-'));

const result = motifDetector.analyzeMotifs(testVoices);

console.log(`\nFound ${result.statistics.totalMotifs} motifs:`);
result.voiceMotifs.forEach(voiceData => {
    console.log(`Voice ${voiceData.voiceIndex}:`);
    voiceData.motifs.forEach((motif, i) => {
        console.log(`  Motif ${i}: length=${motif.length}, start=${motif.startIndex}, pattern=[${motif.intervalPattern?.join(',')}]`);
    });
});

console.log(`\nFound ${result.statistics.totalMatches} matches`);
result.motifMatches.forEach((match, i) => {
    console.log(`  Match ${i}: confidence=${match.confidence}, transformation=${match.transformation}`);
});

// Test compareMotifs directly
console.log('\n=== TESTING COMPAREMOTIFS DIRECTLY ===');
if (result.voiceMotifs[0]?.motifs.length >= 2) {
    const motif1 = result.voiceMotifs[0].motifs[0];
    const motif2 = result.voiceMotifs[0].motifs[1];
    
    console.log('Motif 1:', {
        startIndex: motif1.startIndex,
        length: motif1.length,
        intervalPattern: motif1.intervalPattern
    });
    
    console.log('Motif 2:', {
        startIndex: motif2.startIndex,
        length: motif2.length,  
        intervalPattern: motif2.intervalPattern
    });
    
    const similarity = motifDetector.compareMotifs(motif1, motif2, 'exact');
    console.log('Direct comparison result:', similarity);
    console.log('Similarity threshold:', motifDetector.similarityThreshold);
    console.log('Passes threshold?', similarity.pitch >= motifDetector.similarityThreshold);
}