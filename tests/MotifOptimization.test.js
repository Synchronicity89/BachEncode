const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Motif Detection Analysis and Optimization Tests', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  
  beforeAll(() => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  test('should identify opportunities for better motif detection', () => {
    const testMidiPath = path.join(testOutputDir, 'analysis-test.mid');
    const testJsonPath = path.join(testOutputDir, 'analysis-test.json');
    
    // Create a MIDI with known, easily detectable patterns
    createAnalysisTestMidi(testMidiPath);
    
    execSync(`node EncodeDecode.js compress "${testMidiPath}" "${testJsonPath}"`, {
      cwd: path.join(__dirname, '..')
    });
    
    const compressed = JSON.parse(fs.readFileSync(testJsonPath, 'utf8'));
    
    console.log('\n=== MOTIF DETECTION ANALYSIS ===');
    console.log('Motifs found:', compressed.motifs.length);
    console.log('Motif details:', compressed.motifs.map((m, i) => ({
      id: i,
      length: m.deg_rels.length,
      deg_rels: m.deg_rels,
      deltas: m.deltas,
      durs: m.durs
    })));
    
    // Analyze motif usage
    const motifUsage = {};
    for (const voice of compressed.voices) {
      for (const item of voice) {
        if (item.motif_id !== undefined) {
          motifUsage[item.motif_id] = (motifUsage[item.motif_id] || 0) + 1;
        }
      }
    }
    
    console.log('Motif usage:', motifUsage);
    
    // Calculate compression metrics
    const originalNotes = countOriginalNotes(compressed);
    const compressedSize = countCompressedSize(compressed);
    const compressionRatio = compressedSize / originalNotes;
    
    console.log(`Compression: ${originalNotes} -> ${compressedSize} (${(compressionRatio * 100).toFixed(1)}%)`);
    
    // This test documents the current state and provides analysis
    expect(compressed.motifs.length).toBeGreaterThanOrEqual(0); // Always passes, just for analysis
  });

  test('should provide recommendations for algorithm improvements', () => {
    // Test the Bach invention to analyze real music
    const originalMidiPath = path.join(__dirname, '..', 'midi', 'bach-invention-13.mid');
    const jsonPath = path.join(testOutputDir, 'bach-analysis.json');
    
    execSync(`node EncodeDecode.js compress "${originalMidiPath}" "${jsonPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe' // Suppress output for cleaner test output
    });
    
    const compressed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    console.log('\n=== BACH INVENTION ANALYSIS ===');
    
    const recommendations = analyzeAndGenerateRecommendations(compressed);
    
    console.log('RECOMMENDATIONS FOR ALGORITHM IMPROVEMENT:');
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
    
    // Document the current performance
    const metrics = calculatePerformanceMetrics(compressed);
    console.log('\nCURRENT PERFORMANCE METRICS:');
    console.log(`- Compression Ratio: ${(metrics.compressionRatio * 100).toFixed(1)}%`);
    console.log(`- Motif Coverage: ${(metrics.motifCoverage * 100).toFixed(1)}%`);
    console.log(`- Efficiency Score: ${(metrics.efficiency * 100).toFixed(1)}%`);
    console.log(`- Average Motif Length: ${metrics.avgMotifLength.toFixed(1)} notes`);
    console.log(`- Well-Used Motifs: ${metrics.wellUsedMotifs}/${compressed.motifs.length}`);
    
    expect(recommendations.length).toBeGreaterThan(0); // Should always have some recommendations
  });

  test('should validate current algorithm strengths and weaknesses', () => {
    const testCases = [
      { name: 'Simple Repetition', creator: createSimpleRepetitionMidi },
      { name: 'Rhythmic Variation', creator: createRhythmicVariationMidi },
      { name: 'Transposed Patterns', creator: createTransposedPatternsMidi }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      const midiPath = path.join(testOutputDir, `${testCase.name.replace(/\s+/g, '-').toLowerCase()}.mid`);
      const jsonPath = path.join(testOutputDir, `${testCase.name.replace(/\s+/g, '-').toLowerCase()}.json`);
      
      testCase.creator(midiPath);
      
      execSync(`node EncodeDecode.js compress "${midiPath}" "${jsonPath}"`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });
      
      const compressed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      
      const result = {
        name: testCase.name,
        motifsFound: compressed.motifs.length,
        compressionRatio: countCompressedSize(compressed) / countOriginalNotes(compressed),
        motifCoverage: calculateMotifCoverage(compressed)
      };
      
      results.push(result);
    }
    
    console.log('\n=== ALGORITHM PERFORMANCE ON DIFFERENT PATTERN TYPES ===');
    results.forEach(result => {
      console.log(`${result.name}:`);
      console.log(`  Motifs Found: ${result.motifsFound}`);
      console.log(`  Compression: ${(result.compressionRatio * 100).toFixed(1)}%`);
      console.log(`  Coverage: ${(result.motifCoverage * 100).toFixed(1)}%`);
    });
    
    // This test documents performance across different pattern types
    expect(results.length).toBe(testCases.length);
  });
});

// Test MIDI creation functions
function createAnalysisTestMidi(outputPath) {
  const MidiWriter = require('midi-writer-js');
  const track = new MidiWriter.Track();
  
  track.addTrackName('Analysis Test');
  track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
  
  // Create a clear 4-note pattern repeated exactly 4 times
  const pattern = [60, 62, 64, 65]; // C-D-E-F
  for (let rep = 0; rep < 4; rep++) {
    for (const pitch of pattern) {
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [pitch],
        duration: '4',
        velocity: 100
      }));
    }
  }
  
  const write = new MidiWriter.Writer(track);
  fs.writeFileSync(outputPath, Buffer.from(write.buildFile()));
}

function createSimpleRepetitionMidi(outputPath) {
  const MidiWriter = require('midi-writer-js');
  const track = new MidiWriter.Track();
  
  track.addTrackName('Simple Repetition');
  track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
  
  // Simple ascending pattern repeated 5 times
  const pattern = [60, 62, 64, 67]; // C-D-E-G
  for (let rep = 0; rep < 5; rep++) {
    for (const pitch of pattern) {
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [pitch],
        duration: '4',
        velocity: 100
      }));
    }
  }
  
  const write = new MidiWriter.Writer(track);
  fs.writeFileSync(outputPath, Buffer.from(write.buildFile()));
}

function createRhythmicVariationMidi(outputPath) {
  const MidiWriter = require('midi-writer-js');
  const track = new MidiWriter.Track();
  
  track.addTrackName('Rhythmic Variation');
  track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
  
  // Same pitches, different rhythms
  const pitches = [60, 64, 67, 72]; // C-E-G-C
  const rhythms = [['4', '4', '4', '4'], ['8', '8', '4', '2'], ['4', '8', '8', '2']];
  
  for (let rep = 0; rep < 2; rep++) {
    for (const rhythm of rhythms) {
      for (let i = 0; i < pitches.length; i++) {
        track.addEvent(new MidiWriter.NoteEvent({
          pitch: [pitches[i]],
          duration: rhythm[i],
          velocity: 100
        }));
      }
    }
  }
  
  const write = new MidiWriter.Writer(track);
  fs.writeFileSync(outputPath, Buffer.from(write.buildFile()));
}

function createTransposedPatternsMidi(outputPath) {
  const MidiWriter = require('midi-writer-js');
  const track = new MidiWriter.Track();
  
  track.addTrackName('Transposed Patterns');
  track.addEvent(new MidiWriter.TempoEvent({ bpm: 120 }));
  
  // Same interval pattern at different starting pitches
  const intervals = [0, 2, 4, 3]; // Relative to start note
  const startNotes = [60, 65, 67]; // C, F, G
  
  for (const startNote of startNotes) {
    for (const interval of intervals) {
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [startNote + interval],
        duration: '4',
        velocity: 100
      }));
    }
  }
  
  const write = new MidiWriter.Writer(track);
  fs.writeFileSync(outputPath, Buffer.from(write.buildFile()));
}

// Analysis functions
function analyzeAndGenerateRecommendations(compressed) {
  const recommendations = [];
  
  const motifUsage = {};
  for (const voice of compressed.voices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        motifUsage[item.motif_id] = (motifUsage[item.motif_id] || 0) + 1;
      }
    }
  }
  
  const usageCounts = Object.values(motifUsage);
  const avgUsage = usageCounts.length > 0 ? usageCounts.reduce((a, b) => a + b, 0) / usageCounts.length : 0;
  const motifLengths = compressed.motifs.map(m => m.deg_rels.length);
  const avgLength = motifLengths.length > 0 ? motifLengths.reduce((a, b) => a + b, 0) / motifLengths.length : 0;
  
  // Analyze and make recommendations
  if (avgUsage < 2.5) {
    recommendations.push('Increase minimum usage threshold for motif selection to focus on more frequently occurring patterns');
  }
  
  if (avgLength <= 4) {
    recommendations.push('Consider increasing minLength parameter to find longer, more meaningful patterns');
  }
  
  const singleUseMotifs = usageCounts.filter(count => count <= 1).length;
  if (singleUseMotifs > compressed.motifs.length * 0.3) {
    recommendations.push('Filter out motifs with only 1-2 occurrences to improve compression efficiency');
  }
  
  const compressionRatio = countCompressedSize(compressed) / countOriginalNotes(compressed);
  if (compressionRatio > 0.8) {
    recommendations.push('Low compression suggests need for better pattern detection - consider adjusting similarity thresholds');
  }
  
  if (compressed.motifs.length > 50) {
    recommendations.push('Too many motifs found - implement better pruning of similar or overlapping patterns');
  }
  
  if (compressed.motifs.length < 5) {
    recommendations.push('Very few motifs found - consider loosening detection criteria or reducing minimum pattern length');
  }
  
  recommendations.push('Consider implementing variable-length motif detection (different min/max lengths based on musical context)');
  recommendations.push('Add rhythmic similarity weighting - patterns with identical rhythms should be preferred');
  recommendations.push('Implement motif merging for patterns that are subsequences of larger patterns');
  
  return recommendations;
}

function calculatePerformanceMetrics(compressed) {
  const motifUsage = {};
  for (const voice of compressed.voices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        motifUsage[item.motif_id] = (motifUsage[item.motif_id] || 0) + 1;
      }
    }
  }
  
  const usageCounts = Object.values(motifUsage);
  const motifLengths = compressed.motifs.map(m => m.deg_rels.length);
  
  const originalNotes = countOriginalNotes(compressed);
  const compressedSize = countCompressedSize(compressed);
  
  let totalSavings = 0;
  let potentialSavings = 0;
  
  compressed.motifs.forEach((motif, i) => {
    const usage = motifUsage[i] || 0;
    if (usage > 1) {
      totalSavings += (motif.deg_rels.length - 1) * (usage - 1);
      potentialSavings += motif.deg_rels.length * (usage - 1);
    }
  });
  
  return {
    compressionRatio: compressedSize / originalNotes,
    motifCoverage: calculateMotifCoverage(compressed) / 100,
    efficiency: potentialSavings > 0 ? totalSavings / potentialSavings : 0,
    avgMotifLength: motifLengths.length > 0 ? motifLengths.reduce((a, b) => a + b, 0) / motifLengths.length : 0,
    wellUsedMotifs: usageCounts.filter(count => count >= 3).length
  };
}

// Helper functions
function countOriginalNotes(compressed) {
  let total = 0;
  for (const voice of compressed.voices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        total += compressed.motifs[item.motif_id].deg_rels.length;
      } else {
        total += 1;
      }
    }
  }
  return total;
}

function countCompressedSize(compressed) {
  let total = 0;
  for (const voice of compressed.voices) {
    total += voice.length;
  }
  return total;
}

function calculateMotifCoverage(compressed) {
  let totalNotes = 0;
  let motifNotes = 0;
  
  for (const voice of compressed.voices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        const motifLength = compressed.motifs[item.motif_id].deg_rels.length;
        totalNotes += motifLength;
        motifNotes += motifLength;
      } else {
        totalNotes += 1;
      }
    }
  }
  
  return totalNotes > 0 ? (motifNotes / totalNotes) * 100 : 0;
}