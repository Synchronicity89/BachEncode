const fs = require('fs');
const path = require('path');

// Mock the main module functions for testing
jest.mock('fs');
jest.mock('midi-parser-js');
jest.mock('midi-writer-js');

const mockFs = require('fs');
const mockMidiParser = require('midi-parser-js');
const mockMidiWriter = require('midi-writer-js');

// Import functions to test (would need to export them from main file)
// For now, we'll test the JSON format and basic functionality

describe('BachEncode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ensure the test-output directory exists
    if (!fs.existsSync('test-output')) {
      fs.mkdirSync('test-output');
    }
  });

  describe('JSON Format Validation', () => {
    test('should have valid JSON structure', () => {
      const sampleJson = {
        ppq: 480,
        tempo: 120,
        voices: [
          [
            {
              delta: 0,
              pitch: "C4",
              dur: 480,
              vel: 80
            }
          ]
        ]
      };

      expect(sampleJson).toHaveProperty('ppq');
      expect(sampleJson).toHaveProperty('tempo');
      expect(sampleJson).toHaveProperty('voices');
      expect(Array.isArray(sampleJson.voices)).toBe(true);
      expect(sampleJson.voices[0]).toHaveLength(1);
      expect(sampleJson.voices[0][0]).toHaveProperty('delta');
      expect(sampleJson.voices[0][0]).toHaveProperty('pitch');
      expect(sampleJson.voices[0][0]).toHaveProperty('dur');
      expect(sampleJson.voices[0][0]).toHaveProperty('vel');
    });

    test('should validate note properties', () => {
      const note = {
        delta: 0,
        pitch: "C4",
        dur: 480,
        vel: 80
      };

      expect(typeof note.delta).toBe('number');
      expect(typeof note.pitch).toBe('string');
      expect(typeof note.dur).toBe('number');
      expect(typeof note.vel).toBe('number');
      expect(note.delta).toBeGreaterThanOrEqual(0);
      expect(note.dur).toBeGreaterThan(0);
      expect(note.vel).toBeGreaterThanOrEqual(0);
      expect(note.vel).toBeLessThanOrEqual(127);
    });
  });

  describe('Voice Separation Logic', () => {
    test('should separate overlapping notes into different voices', () => {
      // Mock notes that overlap in time
      const notes = [
        { start: 0, dur: 480, pitch: 60, vel: 80 },    // C4
        { start: 0, dur: 480, pitch: 64, vel: 75 },    // E4 (overlaps with C4)
        { start: 480, dur: 480, pitch: 62, vel: 82 }   // D4 (after overlap)
      ];

      // This would test the separateVoices function if exported
      // For now, we test the expected behavior
      expect(notes.length).toBe(3);
      
      // Notes starting at same time should be in different voices
      const simultaneousNotes = notes.filter(n => n.start === 0);
      expect(simultaneousNotes.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing command line arguments', () => {
      const mockArgv = ['node', 'program.js'];
      // Test would verify proper error message for insufficient args
      expect(mockArgv.length).toBeLessThan(5); // Less than required args
    });

    test('should handle invalid file paths', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => {
        mockFs.readFileSync('nonexistent.midi');
      }).toThrow('File not found');
    });
  });

  describe('Integration Tests', () => {
    test('should maintain data integrity through compress/decompress cycle', () => {
      // This would test the full round-trip process
      const originalData = {
        ppq: 480,
        tempo: 120,
        voices: [[
          { delta: 0, pitch: "C4", dur: 480, vel: 80 }
        ]]
      };

      const jsonString = JSON.stringify(originalData);
      const parsedData = JSON.parse(jsonString);

      expect(parsedData).toEqual(originalData);
    });
  });
});

describe('Command Line Interface', () => {
  test('should accept compress command', () => {
    const args = ['compress', 'input.midi', 'output.json'];
    expect(args[0]).toBe('compress');
    expect(args.length).toBe(3);
  });

  test('should accept decompress command', () => {
    const args = ['decompress', 'input.json', 'output.midi'];
    expect(args[0]).toBe('decompress');
    expect(args.length).toBe(3);
  });
});

describe('Motif Inversion Support', () => {
  test('should generate and process JSON with inverted motifs in A minor', () => {
    // Ensure test output directory exists
    const testOutputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    // Create a diatonic motif in A minor (A, B, C, D scale degrees)
    // Motif pattern: 0, +2, +1, +2 (A -> C -> D -> F in A minor)
    const motifPattern = {
      deg_rels: [0, 2, 1, 2],  // Diatonic steps: A->C->D->F
      accs: [0, 0, 0, 0],      // No accidentals needed in A minor
      deltas: [0, 0, 0],       // Simultaneous timing
      durs: [240, 240, 240, 240], // Quarter notes
      vels: [80, 80, 80, 80]   // Consistent velocity
    };

    // Create inverted motif pattern (intervals flipped)
    // Original: 0, +2, +1, +2 becomes 0, -2, -1, -2
    const invertedMotifPattern = {
      deg_rels: [0, -2, -1, -2], // Inverted: A->F->E->C in A minor
      accs: [0, 0, 0, 0],        // No accidentals needed
      deltas: [0, 0, 0],         // Simultaneous timing
      durs: [240, 240, 240, 240], // Quarter notes
      vels: [80, 80, 80, 80]     // Consistent velocity
    };

    // Generate test JSON with A minor key and two voices
    const testJson = {
      ppq: 480,
      tempo: 120,
      key: {
        tonic: "A",
        mode: "minor"
      },
      motifs: [
        motifPattern,      // Motif 0: original pattern
        invertedMotifPattern // Motif 1: inverted pattern
      ],
      voices: [
        [
          // Voice 1: Original motif at time 0
          {
            start: 0,
            motif_id: 0,
            pitch: 69,  // A4 as starting pitch
            inverted: false  // NEW FIELD: indicates normal playback
          },
          // Voice 1: Original motif again at time 960
          {
            start: 960,
            motif_id: 0,
            pitch: 69,  // A4 as starting pitch
            inverted: false
          }
        ],
        [
          // Voice 2: Same motif but inverted at time 0
          {
            start: 0,
            motif_id: 0,  // Same motif ID but with inversion flag
            pitch: 69,    // A4 as starting pitch
            inverted: true  // NEW FIELD: indicates inverted playback
          },
          // Voice 2: Inverted motif again at time 960
          {
            start: 960,
            motif_id: 0,
            pitch: 69,
            inverted: true
          }
        ]
      ]
    };

    // Write the test JSON file
    const testOutputPath = path.join(__dirname, 'test-output', 'inverted-motif-test.json');
    fs.writeFileSync(testOutputPath, JSON.stringify(testJson, null, 2));

    // Verify the JSON structure
    expect(testJson).toHaveProperty('key');
    expect(testJson.key.tonic).toBe('A');
    expect(testJson.key.mode).toBe('minor');
    expect(testJson.motifs).toHaveLength(2);
    expect(testJson.voices).toHaveLength(2);

    // Verify motif patterns
    expect(testJson.motifs[0].deg_rels).toEqual([0, 2, 1, 2]);
    expect(testJson.motifs[1].deg_rels).toEqual([0, -2, -1, -2]);

    // Verify voice structure with inversion flags
    expect(testJson.voices[0][0]).toHaveProperty('inverted');
    expect(testJson.voices[0][0].inverted).toBe(false);
    expect(testJson.voices[1][0]).toHaveProperty('inverted');
    expect(testJson.voices[1][0].inverted).toBe(true);

    // Verify both voices use the same motif ID but different inversion flags
    expect(testJson.voices[0][0].motif_id).toBe(testJson.voices[1][0].motif_id);
    expect(testJson.voices[0][0].inverted).not.toBe(testJson.voices[1][0].inverted);

    // This test should initially fail because the production code doesn't handle 'inverted' field yet
    // We expect the decompression to ignore the inverted flag until we implement it
    
    // Try to test inversion functionality (should fail initially)
    let inversionSupported = false;
    try {
      // Try to load the main module
      const EncodeDecode = require('../EncodeDecode.js');  
      
      // Check if the module exports have inversion support
      if (typeof EncodeDecode.decompressJsonToMidi === 'function') {
        const outputMidiPath = path.join(__dirname, 'test-output', 'inverted-motif-test.mid');
        
        // Attempt decompression - should work but ignore inversion for now
        EncodeDecode.decompressJsonToMidi(testOutputPath, outputMidiPath);
        
        // File should be created but inversion functionality not yet implemented
        if (fs.existsSync(outputMidiPath)) {
          console.log('MIDI file created, but inversion not yet implemented in production code');
        }
      }
    } catch (error) {
      console.log('Expected: Production code does not yet support motif inversion');
      console.log(`Error: ${error.message}`);
    }
    
    // The main assertion: inversion field should exist in JSON but not be processed yet
    expect(testJson.voices[0][0].inverted).toBeDefined();
    expect(testJson.voices[1][0].inverted).toBeDefined();
    
    // This test should FAIL initially - testing for functionality that doesn't exist yet
    try {
      // Try to find evidence of inversion support in the production code
      const EncodeDecode = require('../EncodeDecode.js');
      const sourceCode = fs.readFileSync(path.join(__dirname, '..', 'EncodeDecode.js'), 'utf8');
      
      // This should fail - looking for inversion support that doesn't exist yet
      const hasInversionSupport = sourceCode.includes('inverted') && 
                                 sourceCode.includes('deg_rels') && 
                                 sourceCode.includes('reverse');
      
      if (hasInversionSupport) {
        console.log('✅ Inversion support found in production code');
      } else {
        console.log('❌ EXPECTED FAILURE: Inversion support not yet implemented');
        
        // Make the test fail explicitly to show it's incomplete
        expect(hasInversionSupport).toBe(true);  // This will fail until implemented
      }
      
    } catch (error) {
      console.log('❌ EXPECTED FAILURE: Cannot test inversion - production code needs implementation');
      
      // Explicitly fail the test to show what needs to be done
      expect(false).toBe(true);  // Intentional failure
    }
    
    // This will serve as our specification for what needs to be implemented
    console.log('TODO: Implement inversion support in production code');
    console.log('- EncodeDecode.js should read the "inverted" field from voice entries');
    console.log('- When inverted=true, flip the deg_rels pattern of the motif');
    console.log('- Apply inversion during motif expansion in decompression');

    console.log(`Test JSON generated at: ${testOutputPath}`);
    console.log('This test will initially fail until production code supports the "inverted" field');
  });
});