const fs = require('fs');

function reverseMotifPitches(jsonFilePath) {
  console.log(`Processing file: ${jsonFilePath}`);
  
  // Read and parse the JSON file
  const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  
  if (!data.motifs || !Array.isArray(data.motifs)) {
    console.log('No motifs found in the file');
    return;
  }
  
  console.log(`Found ${data.motifs.length} motifs`);
  
  // Count motif usage by scanning voices
  const motifUsageCount = new Array(data.motifs.length).fill(0);
  
  // Count how many times each motif is used in the voices
  if (data.voices && Array.isArray(data.voices)) {
    for (const voice of data.voices) {
      for (const item of voice) {
        if (item.motif_id !== undefined && item.motif_id < motifUsageCount.length) {
          motifUsageCount[item.motif_id]++;
        }
      }
    }
  }
  
  // Reverse the pitch intervals and accidentals in each motif
  for (let i = 0; i < data.motifs.length; i++) {
    const motif = data.motifs[i];
    
    if (motif.intervals && Array.isArray(motif.intervals)) {
      console.log(`Motif ${i}: Original intervals = [${motif.intervals.join(', ')}]`);
      
      // Reverse the intervals array
      const originalIntervals = [...motif.intervals];
      motif.intervals = originalIntervals.reverse();
      
      console.log(`Motif ${i}: Reversed intervals = [${motif.intervals.join(', ')}]`);
      
      // Also reverse the accidentals array if it exists
      if (motif.accs && Array.isArray(motif.accs)) {
        console.log(`Motif ${i}: Original accs = [${motif.accs.join(', ')}]`);
        
        const originalAccs = [...motif.accs];
        motif.accs = originalAccs.reverse();
        
        console.log(`Motif ${i}: Reversed accs = [${motif.accs.join(', ')}]`);
      } else {
        console.log(`Motif ${i}: No accidentals found`);
      }
      
      console.log(`Motif ${i}: Used ${motifUsageCount[i]} times`);
    } else {
      console.log(`Motif ${i}: No intervals found`);
    }
  }
  
  // Write the modified data back to the same file
  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2));
  console.log(`\nFile updated successfully: ${jsonFilePath}`);
  
  // Report usage statistics
  console.log('\n=== MOTIF USAGE REPORT ===');
  let totalUsages = 0;
  for (let i = 0; i < data.motifs.length; i++) {
    console.log(`Motif ${i}: ${motifUsageCount[i]} occurrences`);
    totalUsages += motifUsageCount[i];
  }
  console.log(`Total motif occurrences: ${totalUsages}`);
  
  // Find most and least used motifs
  if (data.motifs.length > 0) {
    const maxUsage = Math.max(...motifUsageCount);
    const minUsage = Math.min(...motifUsageCount);
    const mostUsedIndex = motifUsageCount.indexOf(maxUsage);
    const leastUsedIndex = motifUsageCount.indexOf(minUsage);
    
    console.log(`\nMost used motif: Motif ${mostUsedIndex} (${maxUsage} times)`);
    console.log(`Least used motif: Motif ${leastUsedIndex} (${minUsage} times)`);
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.log('Usage: node reverse-motifs.js <json-file-path>');
    console.log('Example: node reverse-motifs.js output/bach-invention-13.json');
    process.exit(1);
  }
  
  const jsonFilePath = args[0];
  
  // Check if file exists
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`Error: File not found: ${jsonFilePath}`);
    process.exit(1);
  }
  
  try {
    reverseMotifPitches(jsonFilePath);
  } catch (error) {
    console.error('Error processing file:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}