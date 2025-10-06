const fs = require('fs');

// Check the compressed file lengths
const data = JSON.parse(fs.readFileSync('bwv785-fixed-motif-compressed.json'));

console.log('=== COMPRESSED FILE ANALYSIS ===');
console.log('Voice lengths:');
data.voices.forEach((voice, i) => {
    console.log(`Voice ${i+1}: ${voice.length} items`);
});

const totalItems = data.voices.reduce((sum, voice) => sum + voice.length, 0);
console.log(`Total items: ${totalItems}`);

// Check voice 2 item types
console.log('\n=== VOICE 2 ITEM TYPES ===');
const voice2Types = {};
data.voices[1].forEach(item => {
    const type = item.type || 'unknown';
    voice2Types[type] = (voice2Types[type] || 0) + 1;
});

console.log('Voice 2 item type counts:');
Object.entries(voice2Types).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
});