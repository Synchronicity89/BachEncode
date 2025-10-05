const MotifCompressor = require('../MotifCompressor');

// Simple test case
const musicData = {
    voices: [
        [
            { pitch: 'C4', dur: 480, start: 0, delta: 0 },
            { pitch: 'D4', dur: 480, start: 480, delta: 480 },
            { pitch: 'E4', dur: 480, start: 960, delta: 480 },
            { pitch: 'C4', dur: 480, start: 1440, delta: 480 },
            { pitch: 'D4', dur: 480, start: 1920, delta: 480 },
            { pitch: 'E4', dur: 480, start: 2400, delta: 480 }
        ]
    ]
};

console.log('Original data:', JSON.stringify(musicData, null, 2));

const motifCompressor = new MotifCompressor({ exactMatchesOnly: true });
const compressed = motifCompressor.compress(musicData);

console.log('\nCompressed data:');
console.log('- Motif library:', JSON.stringify(compressed.motifCompression?.motifLibrary, null, 2));
console.log('- Voices:', JSON.stringify(compressed.voices, null, 2));

const decompressed = motifCompressor.decompress(compressed);
console.log('\nDecompressed data:', JSON.stringify(decompressed, null, 2));

// Check properties
console.log('\nProperty comparison:');
musicData.voices[0].forEach((orig, i) => {
    const recon = decompressed.voices[0][i];
    console.log(`Note ${i}:`);
    console.log(`  Original: pitch=${orig.pitch}, dur=${orig.dur}, start=${orig.start}, delta=${orig.delta}`);
    console.log(`  Reconstructed: pitch=${recon.pitch}, dur=${recon.dur}, start=${recon.start}, delta=${recon.delta}`);
});