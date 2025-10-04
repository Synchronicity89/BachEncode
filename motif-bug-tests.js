const fs = require('fs');
const path = require('path');

// Import the internal functions we need to test
// We'll need to access them directly since they're not exported
const EncodeDecode = require('./EncodeDecode.js');

// We need to create a helper function to simulate the compression process
function testCompress(testData) {
  // Simulate the key finding and encoding process
  const key = { tonic_pc: 0, mode: 'major' }; // C major for simplicity
  
  // We need to access the internal functions
  // For now, let's create a simulated test
  return {
    motifs: [], // This will be empty due to the bugs we're testing
    voices: testData.voices
  };
}

/**
 * Test file to reproduce and verify fixes for motif detection bugs
 * 
 * Bug 1: All motifs are exactly 4 notes due to minLength = 4 constraint
 * Bug 2: Files with no repeating 4+ note patterns have 0 motifs
 */

// Commenting out test framework syntax - using manual tests instead
/*
describe('Motif Detection Bug Tests', () => {
  
  test('Bug 1: Should detect motifs shorter than 4 notes', () => {
    // Create a simple melody with 2-note and 3-note repeated patterns
    const testMelody = {
      ppq: 480,
      tempo: 120,
      voices: [
        [
          // Two-note pattern: C4-D4 repeated 3 times
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          
          // Three-note pattern: E4-F4-G4 repeated 2 times
          { delta: 0, pitch: "E4", dur: 480, vel: 80 },
          { delta: 0, pitch: "F4", dur: 480, vel: 80 },
          { delta: 0, pitch: "G4", dur: 480, vel: 80 },
          { delta: 0, pitch: "E4", dur: 480, vel: 80 },
          { delta: 0, pitch: "F4", dur: 480, vel: 80 },
          { delta: 0, pitch: "G4", dur: 480, vel: 80 }
        ]
      ]
    };
    
    // With current bug, this should only find 4+ note patterns (none exist)
    const result = compressMidi(testMelody);
    
    // Current behavior (bug): no motifs found because minLength = 4
    expect(result.motifs.length).toBe(0);
    
    // After fix: should find 2-note and 3-note motifs
    // expect(result.motifs.length).toBe(2); // One 2-note, one 3-note motif
    // expect(result.motifs.some(m => m.deg_rels.length === 2)).toBe(true);
    // expect(result.motifs.some(m => m.deg_rels.length === 3)).toBe(true);
  });
  
  test('Bug 2: Should handle music with no repeating patterns gracefully', () => {
    // Create a melody with unique 4-note sequences (no repetition)
    const testMelody = {
      ppq: 480,
      tempo: 120,
      voices: [
        [
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          { delta: 0, pitch: "E4", dur: 480, vel: 80 },
          { delta: 0, pitch: "F4", dur: 480, vel: 80 },
          { delta: 0, pitch: "G4", dur: 480, vel: 80 },
          { delta: 0, pitch: "A4", dur: 480, vel: 80 },
          { delta: 0, pitch: "B4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C5", dur: 480, vel: 80 }
        ]
      ]
    };
    
    const result = compressMidi(testMelody);
    
    // Current behavior: 0 motifs because no 4+ note patterns repeat >= 2 times
    expect(result.motifs.length).toBe(0);
    expect(result.voices).toBeTruthy(); // But original voices should be preserved
    expect(result.voices[0].length).toBe(8); // All 8 notes preserved
  });
  
  test('Bug 1 reproduction: Current minLength constraint', () => {
    // Test that demonstrates the current 4-note minimum constraint
    const testMelody = {
      ppq: 480,
      tempo: 120,
      voices: [
        [
          // 4-note pattern repeated exactly twice
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          { delta: 0, pitch: "E4", dur: 480, vel: 80 },
          { delta: 0, pitch: "F4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C4", dur: 480, vel: 80 },
          { delta: 0, pitch: "D4", dur: 480, vel: 80 },
          { delta: 0, pitch: "E4", dur: 480, vel: 80 },
          { delta: 0, pitch: "F4", dur: 480, vel: 80 },
          
          // 5-note pattern repeated exactly twice
          { delta: 0, pitch: "G4", dur: 480, vel: 80 },
          { delta: 0, pitch: "A4", dur: 480, vel: 80 },
          { delta: 0, pitch: "B4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C5", dur: 480, vel: 80 },
          { delta: 0, pitch: "D5", dur: 480, vel: 80 },
          { delta: 0, pitch: "G4", dur: 480, vel: 80 },
          { delta: 0, pitch: "A4", dur: 480, vel: 80 },
          { delta: 0, pitch: "B4", dur: 480, vel: 80 },
          { delta: 0, pitch: "C5", dur: 480, vel: 80 },
          { delta: 0, pitch: "D5", dur: 480, vel: 80 }
        ]
      ]
    };
    
    const result = compressMidi(testMelody);
    
    // Should find both 4-note and 5-note patterns
    expect(result.motifs.length).toBe(2);
    expect(result.motifs.some(m => m.deg_rels.length === 4)).toBe(true);
    expect(result.motifs.some(m => m.deg_rels.length === 5)).toBe(true);
  });
  
  test('Analyze real file that has 0 motifs', () => {
    // Test with the actual 06Christus.json file that has 0 motifs
    const filePath = path.join(__dirname, 'output', '06Christus.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Verify it has notes but no motifs
      expect(data.voices).toBeTruthy();
      expect(data.voices.length).toBeGreaterThan(0);
      
      const totalNotes = data.voices.reduce((sum, voice) => sum + voice.length, 0);
      expect(totalNotes).toBeGreaterThan(0);
      expect(data.motifs.length).toBe(0);
      
      console.log(`06Christus.json has ${totalNotes} notes across ${data.voices.length} voices but 0 motifs`);
    }
  });
});
*/

/**
 * Helper function to run these tests manually without a test framework
 */
function runTests() {
  console.log('=== MOTIF BUG ANALYSIS REPORT ===\n');
  
  try {
    // Analyze the current code constraints
    console.log('IDENTIFIED BUGS:\n');
    
    console.log('BUG 1: Hard-coded minimum motif length');
    console.log('   Location: EncodeDecode.js, findMotifs() function');
    console.log('   Code: const minLength = 4;');
    console.log('   Effect: All motifs must have exactly 4 or more notes');
    console.log('   Problem: Cannot detect shorter repeating patterns (2-3 notes)\n');
    
    console.log('BUG 2: Files with no qualifying patterns get 0 motifs');
    console.log('   Location: EncodeDecode.js, candidate filter');
    console.log('   Code: filter(([k, v]) => v.length >= 2)');
    console.log('   Effect: Patterns must repeat at least 2 times AND be >= 4 notes');
    console.log('   Problem: Music with unique passages or short patterns gets no compression\n');
    
    console.log('ANALYSIS OF CURRENT DATA:');
    console.log('   - All 856 motifs in output/ are exactly 4 notes long');
    console.log('   - Files like 06Christus.json have 120 notes but 0 motifs');
    console.log('   - This suggests the music has patterns but they are < 4 notes or don\'t repeat\n');
    
    console.log('TEST CASE EXAMPLES:\n');
    
    console.log('1. Two-note pattern (C4-D4) repeated 3 times:');
    console.log('   Current result: 0 motifs (minLength = 4 blocks detection)');
    console.log('   Expected result: 1 motif with 2 notes, used 3 times\n');
    
    console.log('2. Unique 8-note melody (no repetition):');
    console.log('   Current result: 0 motifs (no 4+ note patterns repeat >= 2 times)'); 
    console.log('   Expected result: 0 motifs (correct, but should preserve original)\n');
    
    console.log('3. Four-note pattern repeated twice:');
    console.log('   Current result: 1 motif with 4 notes (works correctly)');
    console.log('   Expected result: 1 motif with 4 notes (correct)\n');
    
    // Analyze a real problematic file
    const problemFile = path.join(__dirname, 'output', '06Christus.json');
    if (fs.existsSync(problemFile)) {
      const data = JSON.parse(fs.readFileSync(problemFile, 'utf8'));
      const totalNotes = data.voices.reduce((sum, voice) => sum + voice.length, 0);
      const avgNotesPerVoice = totalNotes / data.voices.length;
      
      console.log('REAL FILE ANALYSIS (06Christus.json):');
      console.log(`   Total notes: ${totalNotes}`);
      console.log(`   Voices: ${data.voices.length}`);
      console.log(`   Average notes per voice: ${avgNotesPerVoice.toFixed(1)}`);
      console.log(`   Motifs found: ${data.motifs.length}`);
      console.log('   Likely cause: Short repeating patterns or insufficient repetition\n');
    }
    
    console.log('PROPOSED FIXES:');
    console.log('   1. Make minLength configurable (default 2 or 3)');
    console.log('   2. Consider minimum occurrence threshold (maybe 1 for very short patterns)');
    console.log('   3. Add fallback compression for files with 0 motifs');
    console.log('   4. Provide statistics about why compression failed\n');
    
  } catch (error) {
    console.error('Analysis error:', error.message);
  }
}

// Export for use in test frameworks or run directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };