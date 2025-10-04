const fs = require('fs');

// Simple script to analyze motif sizes in a specific file
const filePath = process.argv[2] || 'output/bach-invention-13-test.json';

try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`File: ${filePath}`);
  console.log(`Total motifs: ${data.motifs.length}`);
  
  const motifSizes = {};
  data.motifs.forEach((motif, index) => {
    const size = motif.deg_rels.length;
    motifSizes[size] = (motifSizes[size] || 0) + 1;
    if (index < 10) { // Show first 10 motifs
      console.log(`  Motif ${index}: ${size} notes`);
    }
  });
  
  console.log('\nMotif size distribution:');
  Object.keys(motifSizes).sort((a,b) => a-b).forEach(size => {
    console.log(`  ${size} notes: ${motifSizes[size]} motifs`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
}