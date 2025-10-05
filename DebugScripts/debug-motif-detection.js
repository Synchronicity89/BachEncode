const MotifDetector = require('../MotifDetector');
const KeyAnalyzer = require('../KeyAnalyzer');

// Debug the motif detection step
const keyAnalyzer = new KeyAnalyzer();
const motifDetector = new MotifDetector({
    minMotifLength: 2,
    maxMotifLength: 8,
    maxMotifOccurrences: 200, 
    similarityThreshold: 0.3
});

const musicData = {
    voices: [
        [
            { pitch: 'C4', dur: 480, start: 0 },
            { pitch: 'D4', dur: 480, start: 480 },
            { pitch: 'E4', dur: 480, start: 960 },
            { pitch: 'F4', dur: 480, start: 1440 },
            { pitch: 'G4', dur: 480, start: 1920 },
            { pitch: 'A4', dur: 480, start: 2400 }
        ]
    ]
};

// Analyze key first
const keyAnalysis = keyAnalyzer.analyzeAllVoices(musicData.voices);
console.log('Key analysis:', JSON.stringify(keyAnalysis, null, 2));

// Analyze motifs
const motifAnalysis = motifDetector.analyzeMotifs(musicData.voices, {}, keyAnalysis);

console.log('\n=== MOTIF DETECTION RESULT ===');
console.log(`Found ${motifAnalysis.voiceMotifs.length} voice(s) with motifs`);

motifAnalysis.voiceMotifs.forEach((voiceData, voiceIndex) => {
    console.log(`\nVoice ${voiceIndex}:`);
    console.log(`  ${voiceData.motifs.length} motifs found`);
    
    voiceData.motifs.forEach((motif, index) => {
        console.log(`  Motif ${index}: pos=${motif.startIndex}, len=${motif.length}, pattern=[${motif.intervalPattern.join(',')}]`);
    });
});

console.log(`\nTotal matches found: ${motifAnalysis.motifMatches.length}`);
console.log('All matches:');
motifAnalysis.motifMatches.forEach((match, index) => {
    console.log(`  Match ${index}: motif1@${match.motif1.startIndex}(len=${match.motif1.length}) vs motif2@${match.motif2.startIndex}(len=${match.motif2.length}), conf=${match.confidence.toFixed(2)}`);
});