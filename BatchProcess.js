const fs = require('fs');
const path = require('path');
const { compressMidiToJson, decompressJsonToMidi } = require('./EncodeDecode.js');

/**
 * Batch processing utility for MIDI compression/decompression
 * Processes all files in specified folders based on the command
 */

function batchProcess() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log('Usage: node BatchProcess.js compress <inputDir> <outputDir> [--no-overwrite]');
      console.log('Or: node BatchProcess.js decompress <inputDir> <outputDir> [--no-overwrite]');
      console.log('');
      console.log('compress: Converts all *.MID files in inputDir to JSON in outputDir');
      console.log('decompress: Converts all *.json files in inputDir to MIDI in outputDir');
      console.log('');
      console.log('Options:');
      console.log('  --no-overwrite    Prevent overwriting existing files (skip them instead)');
      console.log('');
      console.log('Examples:');
      console.log('  node BatchProcess.js compress ./music ./compressed');
      console.log('  node BatchProcess.js decompress ./compressed ./restored --no-overwrite');
      return;
    }

    const command = args[0];
    const inputDir = path.resolve(args[1]);
    const outputDir = path.resolve(args[2]);
    const noOverwrite = args.includes('--no-overwrite');

    // Check if input directory exists
    if (!fs.existsSync(inputDir)) {
      console.error(`Error: Input directory does not exist: ${inputDir}`);
      process.exitCode = 1;
      return;
    }

    if (command === 'compress') {
      batchCompress(inputDir, outputDir, noOverwrite);
    } else if (command === 'decompress') {
      batchDecompress(inputDir, outputDir, noOverwrite);
    } else {
      console.error('Error: Unknown command. Use "compress" or "decompress"');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Error occurred:', error.message);
    console.error('Stack trace:', error.stack);
    process.exitCode = 1;
  }
}

function batchCompress(inputDir, outputDir, noOverwrite = false) {
  console.log('=== BATCH COMPRESSION ===');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Overwrite mode: ${noOverwrite ? 'Skip existing files' : 'Overwrite existing files'}`);
  console.log('');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Find all MIDI files (case-insensitive)
  const files = fs.readdirSync(inputDir);
  const midiFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.mid' || ext === '.midi';
  });

  if (midiFiles.length === 0) {
    console.log('No MIDI files found in the input directory');
    return;
  }

  console.log(`Found ${midiFiles.length} MIDI files:`);
  midiFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });
  console.log('');

  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Process each MIDI file
  midiFiles.forEach((file, index) => {
    const inputPath = path.join(inputDir, file);
    const baseName = path.parse(file).name;
    const outputPath = path.join(outputDir, `${baseName}.json`);

    try {
      console.log(`[${index + 1}/${midiFiles.length}] Processing: ${file}`);
      
      // Check if output file already exists and no-overwrite is enabled
      if (noOverwrite && fs.existsSync(outputPath)) {
        console.log(`  ⚠️  Output file already exists: ${baseName}.json`);
        console.log(`  ⏭️  Skipping (--no-overwrite enabled)...`);
        console.log('');
        skipped++;
        return;
      }

      // Show overwrite warning if file exists but we're going to overwrite
      if (!noOverwrite && fs.existsSync(outputPath)) {
        console.log(`  ⚠️  Overwriting existing file: ${baseName}.json`);
      }

      compressMidiToJson(inputPath, outputPath);
      console.log(`  ✅ Successfully compressed to: ${baseName}.json`);
      successful++;
    } catch (error) {
      console.log(`  ❌ Failed to compress: ${error.message}`);
      failed++;
    }
    console.log('');
  });

  // Summary
  console.log('=== COMPRESSION SUMMARY ===');
  console.log(`Total files found: ${midiFiles.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

function batchDecompress(inputDir, outputDir, noOverwrite = false) {
  console.log('=== BATCH DECOMPRESSION ===');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Overwrite mode: ${noOverwrite ? 'Skip existing files' : 'Overwrite existing files'}`);
  console.log('');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Find all JSON files, excluding sidecar summary files ("*.summary.json")
  const files = fs.readdirSync(inputDir);
  const jsonFiles = files.filter(file => {
    const lower = file.toLowerCase();
    return path.extname(lower) === '.json' && !lower.endsWith('.summary.json');
  });

  if (jsonFiles.length === 0) {
    console.log('No JSON files found in the input directory');
    return;
  }

  console.log(`Found ${jsonFiles.length} JSON files:`);
  jsonFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });
  console.log('');

  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Process each JSON file
  jsonFiles.forEach((file, index) => {
    const inputPath = path.join(inputDir, file);
    const baseName = path.parse(file).name;
    const outputPath = path.join(outputDir, `${baseName}.mid`);

    try {
      console.log(`[${index + 1}/${jsonFiles.length}] Processing: ${file}`);
      
      // Check if output file already exists and no-overwrite is enabled
      if (noOverwrite && fs.existsSync(outputPath)) {
        console.log(`  ⚠️  Output file already exists: ${baseName}.mid`);
        console.log(`  ⏭️  Skipping (--no-overwrite enabled)...`);
        console.log('');
        skipped++;
        return;
      }

      // Show overwrite warning if file exists but we're going to overwrite
      if (!noOverwrite && fs.existsSync(outputPath)) {
        console.log(`  ⚠️  Overwriting existing file: ${baseName}.mid`);
      }

      decompressJsonToMidi(inputPath, outputPath);
      console.log(`  ✅ Successfully decompressed to: ${baseName}.mid`);
      successful++;
    } catch (error) {
      console.log(`  ❌ Failed to decompress: ${error.message}`);
      failed++;
    }
    console.log('');
  });

  // Summary
  console.log('=== DECOMPRESSION SUMMARY ===');
  console.log(`Total files found: ${jsonFiles.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

// Only run if this file is executed directly
if (require.main === module) {
  batchProcess();
}

module.exports = {
  batchProcess,
  batchCompress,
  batchDecompress
};