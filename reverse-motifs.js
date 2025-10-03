const fs = require('fs');
const path = require('path');

function reverseMotifPitches(jsonFilePath) {
  console.log(`Processing file: ${jsonFilePath}`);
  
  // Read and parse the JSON file
  // This function reverses all pertinent arrays in each motif definition:
  // - deg_rels: degree relationships (pitch intervals)
  // - accs: accidentals 
  // - deltas: timing deltas
  // - durs: note durations
  // - vels: note velocities
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
  
  // Reverse all pertinent arrays in each motif
  for (let i = 0; i < data.motifs.length; i++) {
    const motif = data.motifs[i];
    let hasArrays = false;
    
    // Reverse deg_rels (degree relationships - the pitch intervals)
    if (motif.deg_rels && Array.isArray(motif.deg_rels)) {
      console.log(`Motif ${i}: Original deg_rels = [${motif.deg_rels.join(', ')}]`);
      motif.deg_rels = [...motif.deg_rels].reverse();
      console.log(`Motif ${i}: Reversed deg_rels = [${motif.deg_rels.join(', ')}]`);
      hasArrays = true;
    }
    
    // Reverse accidentals array
    if (motif.accs && Array.isArray(motif.accs)) {
      console.log(`Motif ${i}: Original accs = [${motif.accs.join(', ')}]`);
      motif.accs = [...motif.accs].reverse();
      console.log(`Motif ${i}: Reversed accs = [${motif.accs.join(', ')}]`);
      hasArrays = true;
    }
    
    // Reverse timing deltas array
    if (motif.deltas && Array.isArray(motif.deltas)) {
      console.log(`Motif ${i}: Original deltas = [${motif.deltas.join(', ')}]`);
      motif.deltas = [...motif.deltas].reverse();
      console.log(`Motif ${i}: Reversed deltas = [${motif.deltas.join(', ')}]`);
      hasArrays = true;
    }
    
    // Reverse durations array
    if (motif.durs && Array.isArray(motif.durs)) {
      console.log(`Motif ${i}: Original durs = [${motif.durs.join(', ')}]`);
      motif.durs = [...motif.durs].reverse();
      console.log(`Motif ${i}: Reversed durs = [${motif.durs.join(', ')}]`);
      hasArrays = true;
    }
    
    // Reverse velocities array
    if (motif.vels && Array.isArray(motif.vels)) {
      console.log(`Motif ${i}: Original vels = [${motif.vels.join(', ')}]`);
      motif.vels = [...motif.vels].reverse();
      console.log(`Motif ${i}: Reversed vels = [${motif.vels.join(', ')}]`);
      hasArrays = true;
    }
    
    if (hasArrays) {
      console.log(`Motif ${i}: Used ${motifUsageCount[i]} times`);
    } else {
      console.log(`Motif ${i}: No arrays found to reverse`);
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
    console.log('Usage: node reverse-motifs.js <json-file-path-or-directory>');
    console.log('Examples:');
    console.log('  node reverse-motifs.js output/bach-invention-13.json');
    console.log('  node reverse-motifs.js output/');
    process.exit(1);
  }
  
  const inputPath = args[0];
  
  // Check if path exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Path not found: ${inputPath}`);
    process.exit(1);
  }
  
  try {
    const stats = fs.statSync(inputPath);
    
    if (stats.isDirectory()) {
      // Process all JSON files in the directory
      console.log(`Processing directory: ${inputPath}`);
      const files = fs.readdirSync(inputPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
      
      if (jsonFiles.length === 0) {
        console.log('No JSON files found in the directory');
        return;
      }
      
      console.log(`Found ${jsonFiles.length} JSON files to process:`);
      jsonFiles.forEach(file => console.log(`  - ${file}`));
      console.log('');
      
      let processedCount = 0;
      for (const jsonFile of jsonFiles) {
        const fullPath = path.join(inputPath, jsonFile);
        try {
          console.log(`\n${'='.repeat(60)}`);
          reverseMotifPitches(fullPath);
          processedCount++;
        } catch (error) {
          console.error(`Error processing ${jsonFile}: ${error.message}`);
        }
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`SUMMARY: Successfully processed ${processedCount} of ${jsonFiles.length} JSON files`);
      
    } else if (stats.isFile()) {
      // Process single file
      if (path.extname(inputPath).toLowerCase() !== '.json') {
        console.error('Error: File must have .json extension');
        process.exit(1);
      }
      reverseMotifPitches(inputPath);
    } else {
      console.error('Error: Path is neither a file nor a directory');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error processing path:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}