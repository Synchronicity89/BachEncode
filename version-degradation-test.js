const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const TEST_INPUT_DIR = './test_input';
const OUTPUT_DIR = './degradation_test_output';
const TEMP_DIR = './temp_degradation';
const CYCLES = 3; // Number of compression/decompression cycles to perform

// Versions to test (in chronological order - all commits that modified EncodeDecode.js)
const VERSIONS_TO_TEST = [
  '1f06cc5', // 01 - First commit
  '18ca0b6', // 02 - Add quantization to note timings and implement motif processing
  'b1449c5', // 03 - Implement key detection and diatonic pitch conversion
  '50544ae', // 04 - Add key signature detection  
  'e4838fe', // 05 - Ensure output directories exist (last known good version)
  '305fee0', // 06 - Enhance MIDI Compression System with Batch Processing and Motif Transformations (octave bug introduced)
  'c8a0f17', // 07 - Enhance motif detection by making minLength and minOccurrences configurable
  '64a30b2', // 08 - Implement detailed motif debugging and octave fix verification
];

// Create output directories
function createDirectories() {
  [OUTPUT_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Get list of MIDI files in test_input directory
function getMidiFiles() {
  if (!fs.existsSync(TEST_INPUT_DIR)) {
    console.error(`Test input directory ${TEST_INPUT_DIR} not found!`);
    return [];
  }
  
  return fs.readdirSync(TEST_INPUT_DIR)
    .filter(file => file.toLowerCase().endsWith('.mid'))
    .sort();
}

// Execute command and capture output
function executeCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options 
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      output: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

// Comment out quantization code if it's not already commented out
function disableQuantization() {
  const encodeDecodeFile = './EncodeDecode.js';
  
  if (!fs.existsSync(encodeDecodeFile)) {
    console.warn('EncodeDecode.js not found, skipping quantization disable');
    return false;
  }
  
  try {
    let fileContent = fs.readFileSync(encodeDecodeFile, 'utf8');
    
    // Check if quantization is already commented out
    if (fileContent.includes('// const quant_unit = 120;')) {
      console.log('  Quantization already commented out');
      return true;
    }
    
    // Look for active quantization code patterns
    const quantPatterns = [
      /(\s+)(const quant_unit = 120;)/g,
      /(\s+)(notes\.forEach\(note => \{)/g
    ];
    
    let modified = false;
    
    // Comment out the quantization block
    if (fileContent.includes('const quant_unit = 120;') && !fileContent.includes('// const quant_unit = 120;')) {
      console.log('  Commenting out quantization code...');
      
      // Find the quantization block and comment it out
      fileContent = fileContent.replace(
        /([ \t]*)(\/\/ Quantize timings\n)([ \t]*)(const quant_unit = 120;\n)([ \t]*)(notes\.forEach\(note => \{[\s\S]*?\}\);)/g,
        '$1$2$3// $4$5// $6'.replace(/\n([ \t]*)/g, '\n$1// ')
      );
      
      // Line by line approach - more reliable
      const lines = fileContent.split('\n');
      let inQuantBlock = false;
      let quantStartLine = -1;
      let braceDepth = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Start of quantization block
        if (line.includes('const quant_unit = 120;') && !trimmedLine.startsWith('//')) {
          quantStartLine = i;
          inQuantBlock = true;
          lines[i] = line.replace(/^(\s*)(.*)$/, '$1// $2');
          modified = true;
          continue;
        }
        
        // Inside quantization block
        if (inQuantBlock && !trimmedLine.startsWith('//') && trimmedLine.length > 0) {
          // Track braces to know when forEach block ends
          const openBraces = (line.match(/\{/g) || []).length;
          const closeBraces = (line.match(/\}/g) || []).length;
          braceDepth += openBraces - closeBraces;
          
          // Comment out lines that are part of the quantization block
          if (line.includes('notes.forEach') || 
              line.includes('note.start = Math.round') ||
              line.includes('const end = note.start') ||
              line.includes('const quant_end = Math.round') ||
              line.includes('note.dur = quant_end') ||
              line.includes('if (note.dur <= 0)') ||
              braceDepth > 0 ||
              (trimmedLine === '});' && i > quantStartLine)) {
            lines[i] = line.replace(/^(\s*)(.*)$/, '$1// $2');
            
            // End of quantization block when we close the forEach
            if (trimmedLine === '});' && braceDepth <= 0) {
              inQuantBlock = false;
            }
          }
        }
      }
      
      if (modified) {
        fileContent = lines.join('\n');
      }
      
      if (modified) {
        fs.writeFileSync(encodeDecodeFile, fileContent, 'utf8');
        console.log('  ✅ Quantization code commented out successfully');
        return true;
      } else {
        console.log('  ⚠️  Could not find quantization code to comment out');
        return true; // Don't fail the test if we can't find it
      }
    } else {
      console.log('  No active quantization code found');
      return true;
    }
  } catch (error) {
    console.error(`  ❌ Error disabling quantization: ${error.message}`);
    return false;
  }
}

// Analyze JSON file for motif information and note data
function analyzeJsonFile(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const analysis = {
      noteCount: 0,
      motifCount: data.motifs ? data.motifs.length : 0,
      voiceCount: data.voices ? data.voices.length : 0,
      tempo: data.tempo || 0,
      key: data.key || null,
      pitchRange: { min: Infinity, max: -Infinity },
      avgPitch: 0
    };
    
    // Count notes and analyze pitch data
    let totalPitch = 0;
    if (data.voices) {
      for (const voice of data.voices) {
        for (const item of voice) {
          if (item.motif_id === undefined) {
            // Single note
            analysis.noteCount++;
            if (item.pitch && typeof item.pitch === 'string') {
              // Convert note name to MIDI number for analysis
              const midiNum = convertNoteTomidi(item.pitch);
              if (midiNum !== null) {
                analysis.pitchRange.min = Math.min(analysis.pitchRange.min, midiNum);
                analysis.pitchRange.max = Math.max(analysis.pitchRange.max, midiNum);
                totalPitch += midiNum;
              }
            }
          }
        }
      }
    }
    
    if (analysis.noteCount > 0) {
      analysis.avgPitch = totalPitch / analysis.noteCount;
    }
    
    // If no single notes found, estimate from motifs
    if (analysis.noteCount === 0 && data.motifs) {
      for (const motif of data.motifs) {
        analysis.noteCount += motif.deg_rels ? motif.deg_rels.length : 0;
      }
    }
    
    return analysis;
  } catch (error) {
    console.error(`Error analyzing JSON file ${jsonPath}:`, error.message);
    return null;
  }
}

// Simple note name to MIDI conversion (approximation)
function convertNoteTomidi(noteName) {
  const noteMap = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  };
  
  const match = noteName.match(/^([A-G][#b]?)(\d+)$/);
  if (!match) return null;
  
  const [, note, octave] = match;
  const noteValue = noteMap[note];
  if (noteValue === undefined) return null;
  
  return noteValue + (parseInt(octave) + 1) * 12;
}

// Compare two analysis objects and detect degradation
function compareAnalyses(original, current, cycle) {
  const comparison = {
    cycle: cycle,
    noteCountChange: current.noteCount - original.noteCount,
    motifCountChange: current.motifCount - original.motifCount,
    voiceCountChange: current.voiceCount - original.voiceCount,
    pitchRangeChange: {
      min: current.pitchRange.min - original.pitchRange.min,
      max: current.pitchRange.max - original.pitchRange.max
    },
    avgPitchChange: current.avgPitch - original.avgPitch,
    hasDegradation: false
  };
  
  // Detect significant changes that indicate degradation
  comparison.hasDegradation = (
    Math.abs(comparison.noteCountChange) > 0 ||
    Math.abs(comparison.avgPitchChange) > 1 || // More than 1 semitone average change
    Math.abs(comparison.pitchRangeChange.min) > 0 ||
    Math.abs(comparison.pitchRangeChange.max) > 0
  );
  
  return comparison;
}

// Test a specific version
async function testVersion(version, versionIndex) {
  console.log(`\n=== Testing Version ${versionIndex + 1}/${VERSIONS_TO_TEST.length}: ${version} ===`);
  
  // Checkout the specific version
  console.log(`Checking out version ${version}...`);
  const checkoutResult = executeCommand(`git checkout ${version} -- EncodeDecode.js`);
  if (!checkoutResult.success) {
    console.error(`Failed to checkout version ${version}:`, checkoutResult.error);
    return null;
  }
  
  // Disable quantization to eliminate it as a source of degradation
  console.log(`Disabling quantization for version ${version}...`);
  const quantizationDisabled = disableQuantization();
  if (!quantizationDisabled) {
    console.warn(`Warning: Could not disable quantization for version ${version}`);
  }
  
  const versionDir = path.join(OUTPUT_DIR, `${String(versionIndex + 1).padStart(2, '0')}_${version}`);
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
  }
  
  const midiFiles = getMidiFiles();
  console.log(`Found ${midiFiles.length} MIDI files to test`);
  
  const versionReport = {
    version: version,
    timestamp: new Date().toISOString(),
    quantizationDisabled: quantizationDisabled,
    files: {},
    summary: {
      totalFiles: midiFiles.length,
      successfulFiles: 0,
      filesWithDegradation: 0,
      avgDegradationScore: 0
    }
  };
  
  for (const midiFile of midiFiles) {
    console.log(`\nTesting file: ${midiFile}`);
    const baseName = path.basename(midiFile, '.mid');
    const inputPath = path.join(TEST_INPUT_DIR, midiFile);
    
    const fileReport = {
      fileName: midiFile,
      cycles: [],
      originalAnalysis: null,
      hasDegradation: false,
      degradationScore: 0
    };
    
    let currentMidiPath = inputPath;
    let originalAnalysis = null;
    
    // Perform compression/decompression cycles
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      console.log(`  Cycle ${cycle + 1}/${CYCLES}`);
      
      const cycleBaseName = `${baseName}_v${version}_cycle${cycle + 1}`;
      const jsonPath = path.join(versionDir, `${cycleBaseName}.json`);
      const midiOutputPath = path.join(versionDir, `${cycleBaseName}.mid`);
      
      // Compress MIDI to JSON
      const compressResult = executeCommand(
        `node EncodeDecode.js compress "${currentMidiPath}" "${jsonPath}"`
      );
      
      if (!compressResult.success) {
        console.error(`    Compression failed:`, compressResult.error);
        fileReport.cycles.push({
          cycle: cycle + 1,
          compressionFailed: true,
          error: compressResult.error
        });
        break;
      }
      
      // Analyze JSON
      const analysis = analyzeJsonFile(jsonPath);
      if (!analysis) {
        console.error(`    JSON analysis failed`);
        fileReport.cycles.push({
          cycle: cycle + 1,
          analysisFailed: true
        });
        break;
      }
      
      // Store original analysis for comparison
      if (cycle === 0) {
        originalAnalysis = analysis;
        fileReport.originalAnalysis = analysis;
      }
      
      // Decompress JSON to MIDI
      const decompressResult = executeCommand(
        `node EncodeDecode.js decompress "${jsonPath}" "${midiOutputPath}"`
      );
      
      if (!decompressResult.success) {
        console.error(`    Decompression failed:`, decompressResult.error);
        fileReport.cycles.push({
          cycle: cycle + 1,
          decompressionFailed: true,
          error: decompressResult.error,
          analysis: analysis
        });
        break;
      }
      
      // Compare with original
      const comparison = compareAnalyses(originalAnalysis, analysis, cycle + 1);
      
      const cycleReport = {
        cycle: cycle + 1,
        analysis: analysis,
        comparison: comparison,
        compressionSuccess: true,
        decompressionSuccess: true
      };
      
      fileReport.cycles.push(cycleReport);
      
      if (comparison.hasDegradation) {
        fileReport.hasDegradation = true;
        fileReport.degradationScore += Math.abs(comparison.avgPitchChange) + 
                                       Math.abs(comparison.noteCountChange) * 0.1;
        console.log(`    ⚠️  Degradation detected in cycle ${cycle + 1}`);
        console.log(`        Note count change: ${comparison.noteCountChange}`);
        console.log(`        Avg pitch change: ${comparison.avgPitchChange.toFixed(2)} semitones`);
      }
      
      // Use the output MIDI as input for next cycle
      currentMidiPath = midiOutputPath;
    }
    
    versionReport.files[midiFile] = fileReport;
    
    if (fileReport.cycles.length > 0 && !fileReport.cycles.some(c => c.compressionFailed || c.decompressionFailed)) {
      versionReport.summary.successfulFiles++;
    }
    
    if (fileReport.hasDegradation) {
      versionReport.summary.filesWithDegradation++;
      versionReport.summary.avgDegradationScore += fileReport.degradationScore;
    }
  }
  
  if (versionReport.summary.filesWithDegradation > 0) {
    versionReport.summary.avgDegradationScore /= versionReport.summary.filesWithDegradation;
  }
  
  // Save version report
  const reportPath = path.join(versionDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(versionReport, null, 2));
  
  console.log(`\nVersion ${version} Summary:`);
  console.log(`  Quantization disabled: ${quantizationDisabled ? '✅' : '❌'}`);
  console.log(`  Successful files: ${versionReport.summary.successfulFiles}/${versionReport.summary.totalFiles}`);
  console.log(`  Files with degradation: ${versionReport.summary.filesWithDegradation}`);
  console.log(`  Average degradation score: ${versionReport.summary.avgDegradationScore.toFixed(3)}`);
  
  return versionReport;
}

// Generate final summary report
function generateSummaryReport(versionReports) {
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY REPORT');
  console.log('='.repeat(60));
  
  const summary = {
    testDate: new Date().toISOString(),
    versionsTested: VERSIONS_TO_TEST.length,
    cyclesPerFile: CYCLES,
    results: {}
  };
  
  console.log('\nVersion Comparison:');
  console.log('Version'.padEnd(12) + 'Success Rate'.padEnd(15) + 'Degradation Files'.padEnd(20) + 'Avg Degradation');
  console.log('-'.repeat(75));
  
  for (let i = 0; i < VERSIONS_TO_TEST.length; i++) {
    const version = VERSIONS_TO_TEST[i];
    const versionLabel = `${String(i + 1).padStart(2, '0')}_${version}`;
    const report = versionReports[version];
    if (!report) {
      console.log(`${versionLabel.padEnd(12)} FAILED - Could not test this version`);
      continue;
    }
    
    const successRate = ((report.summary.successfulFiles / report.summary.totalFiles) * 100).toFixed(1);
    const degradationFiles = report.summary.filesWithDegradation;
    const avgDegradation = report.summary.avgDegradationScore.toFixed(3);
    
    console.log(
      `${versionLabel.padEnd(12)} ${(successRate + '%').padEnd(15)} ${degradationFiles.toString().padEnd(20)} ${avgDegradation}`
    );
    
    summary.results[version] = {
      versionIndex: i + 1,
      successRate: parseFloat(successRate),
      degradationFiles: degradationFiles,
      avgDegradationScore: report.summary.avgDegradationScore,
      totalFiles: report.summary.totalFiles
    };
  }
  
  // Identify most problematic versions
  console.log('\n' + '='.repeat(40));
  console.log('ANALYSIS:');
  console.log('='.repeat(40));
  
  let maxDegradation = 0;
  let mostProblematicVersion = null;
  let firstDegradationVersion = null;
  
  for (const version of VERSIONS_TO_TEST) {
    const result = summary.results[version];
    if (!result) continue;
    
    if (result.degradationFiles > 0 && !firstDegradationVersion) {
      firstDegradationVersion = version;
    }
    
    if (result.avgDegradationScore > maxDegradation) {
      maxDegradation = result.avgDegradationScore;
      mostProblematicVersion = version;
    }
  }
  
  if (firstDegradationVersion) {
    const firstIndex = VERSIONS_TO_TEST.indexOf(firstDegradationVersion) + 1;
    console.log(`🔍 First version with degradation: ${String(firstIndex).padStart(2, '0')}_${firstDegradationVersion}`);
  }
  
  if (mostProblematicVersion) {
    const mostIndex = VERSIONS_TO_TEST.indexOf(mostProblematicVersion) + 1;
    console.log(`⚠️  Most lossy version: ${String(mostIndex).padStart(2, '0')}_${mostProblematicVersion} (score: ${maxDegradation.toFixed(3)})`);
  }
  
  // Check for specific patterns
  console.log('\nDegradation Patterns:');
  for (let i = 0; i < VERSIONS_TO_TEST.length; i++) {
    const version = VERSIONS_TO_TEST[i];
    const result = summary.results[version];
    if (!result || result.degradationFiles === 0) continue;
    
    console.log(`\n${String(i + 1).padStart(2, '0')}_${version}:`);
    const report = versionReports[version];
    
    let pitchShiftCount = 0;
    let noteCountChangeCount = 0;
    
    for (const [fileName, fileReport] of Object.entries(report.files)) {
      if (!fileReport.hasDegradation) continue;
      
      for (const cycle of fileReport.cycles) {
        if (cycle.comparison && cycle.comparison.hasDegradation) {
          if (Math.abs(cycle.comparison.avgPitchChange) > 1) {
            pitchShiftCount++;
          }
          if (cycle.comparison.noteCountChange !== 0) {
            noteCountChangeCount++;
          }
        }
      }
    }
    
    if (pitchShiftCount > 0) {
      console.log(`  - Octave/pitch shifts detected in ${pitchShiftCount} cycles`);
    }
    if (noteCountChangeCount > 0) {
      console.log(`  - Note count changes detected in ${noteCountChangeCount} cycles`);
    }
  }
  
  // Save summary report
  const summaryPath = path.join(OUTPUT_DIR, 'summary_report.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  console.log(`\n📊 Detailed reports saved in: ${OUTPUT_DIR}`);
  console.log(`📋 Summary report saved as: ${summaryPath}`);
}

// Main execution
async function main() {
  console.log('Version Degradation Test Starting...');
  console.log(`Testing ${VERSIONS_TO_TEST.length} versions with ${CYCLES} cycles each`);
  
  createDirectories();
  
  const midiFiles = getMidiFiles();
  if (midiFiles.length === 0) {
    console.error('No MIDI files found in test_input directory!');
    return;
  }
  
  console.log(`Found ${midiFiles.length} MIDI files: ${midiFiles.join(', ')}`);
  
  const versionReports = {};
  
  // Test each version
  for (let i = 0; i < VERSIONS_TO_TEST.length; i++) {
    const version = VERSIONS_TO_TEST[i];
    try {
      const report = await testVersion(version, i);
      if (report) {
        versionReports[version] = report;
      }
    } catch (error) {
      console.error(`Error testing version ${version}:`, error.message);
    }
  }
  
  // Generate final summary
  generateSummaryReport(versionReports);
  
  console.log('\n✅ Version degradation test completed!');
}

// Run the test
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}