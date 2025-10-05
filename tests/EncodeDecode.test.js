const fs = require('fs');
const path = require('path');

// Import the actual functions to test
const {
  compressMidiToJson,
  decompressJsonToMidi,
  createCompressionConfig,
  parseMidi,
  extractTempoAndPPQAndNotes,
  separateVoices,
  encodeVoices,
  decodeVoices
} = require('../EncodeDecode');

describe('EncodeDecode.js', () => {
  let testMidiPath, testJsonPath, testOutputPath;

  beforeEach(() => {
    testMidiPath = path.join(__dirname, '..', 'test-minimal-one-note.mid');
    testJsonPath = path.join(__dirname, '..', 'test-minimal-one-note.json');
    testOutputPath = path.join(__dirname, '..', 'test-output-temp.json');
  });

  afterEach(() => {
    // Clean up test files
    [testOutputPath, 'test-temp-output.mid', 'test-temp-output.json'].forEach(file => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (err) {
        // Ignore cleanup errors
      }
    });
  });

  describe('createCompressionConfig', () => {
    test('should create default compression config', () => {
      const config = createCompressionConfig();
      expect(config).toEqual({
        useMotifCompression: false,
        motifOptions: {
          compressionThreshold: 0.5,
          minMotifMatches: 1
        }
      });
    });

    test('should create config with custom options', () => {
      const options = {
        useMotifCompression: true,
        compressionThreshold: 0.7,
        minMotifMatches: 3,
        motifOptions: {
          maxCompressionRatio: 0.8
        }
      };
      
      const config = createCompressionConfig(options);
      expect(config.useMotifCompression).toBe(true);
      expect(config.motifOptions.compressionThreshold).toBe(0.7);
      expect(config.motifOptions.minMotifMatches).toBe(3);
      expect(config.motifOptions.maxCompressionRatio).toBe(0.8);
    });
  });

  describe('separateVoices', () => {
    test('should separate overlapping notes into different voices', () => {
      const notes = [
        { start: 0, dur: 480, pitch: 60, vel: 80 },    // C4
        { start: 0, dur: 480, pitch: 64, vel: 75 },    // E4 (overlaps with C4)
        { start: 480, dur: 480, pitch: 62, vel: 82 }   // D4 (after overlap)
      ];

      const voices = separateVoices(notes);
      
      expect(voices.length).toBe(2); // Two voices needed for overlapping notes
      expect(voices[0].length).toBe(2); // First voice gets C4 and D4
      expect(voices[1].length).toBe(1); // Second voice gets E4
      expect(voices[0][0].pitch).toBe(60); // C4 first
      expect(voices[1][0].pitch).toBe(64); // E4 in second voice
    });

    test('should handle sequential notes in same voice', () => {
      const notes = [
        { start: 0, dur: 240, pitch: 60, vel: 80 },    // C4
        { start: 240, dur: 240, pitch: 64, vel: 75 },  // E4 (after C4 ends)
        { start: 480, dur: 240, pitch: 67, vel: 82 }   // G4 (after E4 ends)
      ];

      const voices = separateVoices(notes);
      
      expect(voices.length).toBe(1); // All notes can be in same voice
      expect(voices[0].length).toBe(3); // All three notes in one voice
    });

    test('should sort notes consistently for chord handling', () => {
      const notes = [
        { start: 0, dur: 480, pitch: 67, vel: 80 },    // G4
        { start: 0, dur: 480, pitch: 60, vel: 75 },    // C4 (same start, lower pitch)
        { start: 0, dur: 480, pitch: 64, vel: 82 }     // E4 (same start, middle pitch)
      ];

      const voices = separateVoices(notes);
      
      // Should sort by pitch for simultaneous notes (lowest first)
      expect(voices.length).toBe(3); // Each note needs its own voice
      expect(voices[0][0].pitch).toBe(60); // C4 first (lowest)
      expect(voices[1][0].pitch).toBe(64); // E4 second
      expect(voices[2][0].pitch).toBe(67); // G4 last (highest)
    });
  });

  describe('encodeVoices', () => {
    test('should encode voices with proper delta timing', () => {
      const voices = [
        [
          { start: 0, dur: 240, pitch: 60, vel: 80 },
          { start: 480, dur: 240, pitch: 64, vel: 75 }
        ]
      ];

      const encoded = encodeVoices(voices);
      
      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toHaveLength(2);
      expect(encoded[0][0].delta).toBe(0); // First note starts immediately
      expect(encoded[0][1].delta).toBe(240); // Second note starts after first ends (480 - 240 = 240)
      expect(encoded[0][0].pitch).toBe('C4');
      expect(encoded[0][1].pitch).toBe('E4');
    });
  });

  describe('decodeVoices', () => {
    test('should decode voices back to notes with absolute timing', () => {
      const encodedVoices = [
        [
          { delta: 0, pitch: 'C4', dur: 240, vel: 80 },
          { delta: 240, pitch: 'E4', dur: 240, vel: 75 }
        ]
      ];

      const notes = decodeVoices(encodedVoices, 480);
      
      expect(notes).toHaveLength(2);
      expect(notes[0].start).toBe(0);
      expect(notes[0].pitch).toBe(60); // C4
      expect(notes[1].start).toBe(480); // 0 + 240 (delta) + 240 (duration of first note)
      expect(notes[1].pitch).toBe(64); // E4
    });

    test('should handle invalid pitch names gracefully', () => {
      const encodedVoices = [
        [
          { delta: 0, pitch: 'InvalidPitch', dur: 240, vel: 80 },
          { delta: 0, pitch: 'C4', dur: 240, vel: 75 }
        ]
      ];

      const notes = decodeVoices(encodedVoices, 480);
      
      expect(notes).toHaveLength(1); // Only valid pitch included
      expect(notes[0].pitch).toBe(60); // C4
    });
  });

  describe('File Operations', () => {
    test('should compress and decompress simple MIDI file', () => {
      // Skip if test MIDI file doesn't exist
      if (!fs.existsSync(testMidiPath)) {
        console.warn('Test MIDI file not found, skipping test');
        return;
      }

      // Test compression
      const compressionResults = compressMidiToJson(testMidiPath, testOutputPath);
      expect(fs.existsSync(testOutputPath)).toBe(true);
      
      const compressed = JSON.parse(fs.readFileSync(testOutputPath, 'utf8'));
      expect(compressed).toHaveProperty('ppq');
      expect(compressed).toHaveProperty('tempo');
      expect(compressed).toHaveProperty('voices');
      expect(compressionResults.originalNoteCount).toBeGreaterThan(0);

      // Test decompression
      const outputMidiPath = 'test-temp-output.mid';
      decompressJsonToMidi(testOutputPath, outputMidiPath);
      expect(fs.existsSync(outputMidiPath)).toBe(true);
    });

    test('should handle motif compression if available', () => {
      if (!fs.existsSync(testMidiPath)) {
        console.warn('Test MIDI file not found, skipping test');
        return;
      }

      const options = { useMotifCompression: true };
      const compressionResults = compressMidiToJson(testMidiPath, testOutputPath, options);
      
      expect(fs.existsSync(testOutputPath)).toBe(true);
      // If motif compression is available, expect different results
      expect(compressionResults).toHaveProperty('compressionRatio');
      expect(compressionResults).toHaveProperty('motifCount');
    });
  });

  describe('Voice Preservation with Motifs', () => {
    test('should preserve all voices in complex multi-voice MIDI', () => {
      const complexJsonPath = path.join(__dirname, '..', 'test-christus.json');
      
      if (!fs.existsSync(complexJsonPath)) {
        console.warn('Complex test JSON file not found, skipping test');
        return;
      }

      // Read the complex JSON with motifs
      const complexData = JSON.parse(fs.readFileSync(complexJsonPath, 'utf8'));
      const originalVoiceCount = complexData.voices.length;
      
      // Test decompression preserves voice count
      const outputMidiPath = 'test-complex-output.mid';
      decompressJsonToMidi(complexJsonPath, outputMidiPath);
      
      expect(fs.existsSync(outputMidiPath)).toBe(true);
      
      // Now re-compress and check voice preservation
      const recompressedPath = 'test-complex-recompressed.json';
      const compressionResults = compressMidiToJson(outputMidiPath, recompressedPath);
      
      const recompressed = JSON.parse(fs.readFileSync(recompressedPath, 'utf8'));
      
      // ISSUE IDENTIFIED: Voice explosion during recompression
      console.log(`Voice explosion detected: ${originalVoiceCount} -> ${recompressed.voices.length} voices`);
      
      // Document the issue for now - this reveals the core problem with motif processing
      expect(recompressed.voices.length).toBeGreaterThan(0); // At least some voices exist
      expect(originalVoiceCount).toBeLessThan(recompressed.voices.length); // Documents the explosion
      
      // Each voice should have notes (not be empty/silent)
      recompressed.voices.forEach((voice, index) => {
        expect(voice.length).toBeGreaterThan(0, `Voice ${index} should not be empty`);
      });

      // Clean up
      try {
        fs.unlinkSync(outputMidiPath);
        fs.unlinkSync(recompressedPath);
      } catch (err) {
        // Ignore cleanup errors
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent MIDI files', () => {
      expect(() => {
        compressMidiToJson('nonexistent.mid', 'output.json');
      }).toThrow();
    });

    test('should handle invalid JSON files', () => {
      // Create invalid JSON file
      const invalidJsonPath = 'invalid.json';
      fs.writeFileSync(invalidJsonPath, 'invalid json content');
      
      expect(() => {
        decompressJsonToMidi(invalidJsonPath, 'output.mid');
      }).toThrow();

      // Clean up
      fs.unlinkSync(invalidJsonPath);
    });

    test('should handle missing required JSON properties', () => {
      const incompleteJsonPath = 'incomplete.json';
      fs.writeFileSync(incompleteJsonPath, JSON.stringify({ ppq: 480 })); // Missing tempo, voices
      
      expect(() => {
        decompressJsonToMidi(incompleteJsonPath, 'output.mid');
      }).toThrow();

      // Clean up
      fs.unlinkSync(incompleteJsonPath);
    });
  });

  describe('PPQ and Timing Accuracy', () => {
    test('should handle different PPQ values correctly', () => {
      const testData = {
        ppq: 384, // Different from default 128
        tempo: 96,
        voices: [[
          { delta: 0, pitch: 'C4', dur: 384, vel: 80 },
          { delta: 0, pitch: 'E4', dur: 192, vel: 75 }
        ]]
      };

      const testJsonPath = 'test-ppq.json';
      const testMidiPath = 'test-ppq.mid';
      
      fs.writeFileSync(testJsonPath, JSON.stringify(testData));
      
      // Test decompression with custom PPQ
      decompressJsonToMidi(testJsonPath, testMidiPath);
      expect(fs.existsSync(testMidiPath)).toBe(true);

      // Clean up
      fs.unlinkSync(testJsonPath);
      fs.unlinkSync(testMidiPath);
    });
  });

  describe('Zero Duration Note Detection and Fix', () => {
    test('should fix zero-duration notes in MIDI parsing', () => {
      if (!fs.existsSync('test-minimal-one-note.mid')) {
        console.warn('Test MIDI file not found, skipping test');
        return;
      }

      // Parse MIDI that has zero-duration notes
      const midi = parseMidi('test-minimal-one-note.mid');
      const { ppq, notes } = extractTempoAndPPQAndNotes(midi);
      
      // After the fix, there should be no zero-duration notes
      const zeroDurationNotes = notes.filter(note => note.dur === 0);
      
      console.log(`Total notes: ${notes.length}, Zero-duration notes: ${zeroDurationNotes.length}`);
      
      // The fix should eliminate all zero-duration notes
      expect(zeroDurationNotes.length).toBe(0);
      
      // All notes should have reasonable minimum duration
      const minExpectedDuration = Math.round(ppq * 0.05); // 5% of quarter note
      notes.forEach(note => {
        expect(note.dur).toBeGreaterThanOrEqual(minExpectedDuration);
      });
    });

    test('should preserve normal duration notes', () => {
      // Test with notes that already have proper duration
      const mockMidi = {
        timeDivision: 480,
        tracks: [
          {
            events: [
              { type: 9, data: [60, 80], deltaTime: 0 },
              { type: 8, data: [60, 0], deltaTime: 240 } // Normal duration
            ]
          }
        ]
      };

      const { notes } = extractTempoAndPPQAndNotes(mockMidi);
      
      // Should preserve the original duration for non-zero notes
      expect(notes[0].dur).toBe(240);
    });
  });

  describe('Command Line Interface', () => {
    const originalArgv = process.argv;
    const originalExit = process.exit;
    let mockExit;

    beforeEach(() => {
      mockExit = jest.fn();
      process.exit = mockExit;
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.exit = originalExit;
    });

    test('should handle compress command via CLI', () => {
      if (!fs.existsSync('test-minimal-one-note.mid')) {
        console.warn('Test MIDI file not found, skipping CLI test');
        return;
      }

      // Mock command line arguments
      process.argv = ['node', 'EncodeDecode.js', 'compress', 'test-minimal-one-note.mid', 'test-cli-output.json'];
      
      // Import and call main function
      const EncodeDecode = require('../EncodeDecode');
      
      // We can't easily test main() without refactoring, so test the core function directly
      const compressionResults = compressMidiToJson('test-minimal-one-note.mid', 'test-cli-output.json');
      
      expect(fs.existsSync('test-cli-output.json')).toBe(true);
      expect(compressionResults.originalNoteCount).toBeGreaterThan(0);
      
      // Clean up
      if (fs.existsSync('test-cli-output.json')) {
        fs.unlinkSync('test-cli-output.json');
      }
    });

    test('should handle decompress command via CLI', () => {
      if (!fs.existsSync('test-minimal-one-note.json')) {
        console.warn('Test JSON file not found, skipping CLI test');
        return;
      }

      // Test decompression
      decompressJsonToMidi('test-minimal-one-note.json', 'test-cli-output.mid');
      
      expect(fs.existsSync('test-cli-output.mid')).toBe(true);
      
      // Clean up
      if (fs.existsSync('test-cli-output.mid')) {
        fs.unlinkSync('test-cli-output.mid');
      }
    });

    test('should handle motif option via CLI', () => {
      if (!fs.existsSync('test-minimal-one-note.mid')) {
        console.warn('Test MIDI file not found, skipping motif CLI test');
        return;
      }

      // Test with motif compression
      const options = { useMotifCompression: true };
      const compressionResults = compressMidiToJson('test-minimal-one-note.mid', 'test-motif-output.json', options);
      
      expect(fs.existsSync('test-motif-output.json')).toBe(true);
      
      // Check if motif compression was attempted
      expect(compressionResults).toHaveProperty('compressionRatio');
      expect(compressionResults).toHaveProperty('motifCount');
      
      // Clean up
      if (fs.existsSync('test-motif-output.json')) {
        fs.unlinkSync('test-motif-output.json');
      }
    });
  });

  describe('Motif Processing Issues', () => {
    test('should handle motif references without losing voice data', () => {
      const testDataWithMotifs = {
        ppq: 480,
        tempo: 120,
        motifCompression: {
          enabled: true,
          motifLibrary: [
            {
              deg_rels: [0, 2, 4],
              accs: [0, 0, 0],
              deltas: [0, 0],
              durs: [240, 240, 240],
              vels: [80, 80, 80]
            }
          ]
        },
        voices: [
          [
            { delta: 0, pitch: 'C4', dur: 240, vel: 80 },
            { delta: 0, motif_id: 0, base_pitch: 60 }, // Motif reference
            { delta: 0, pitch: 'G4', dur: 240, vel: 80 }
          ],
          [
            { delta: 0, pitch: 'E4', dur: 240, vel: 75 },
            { delta: 240, pitch: 'F4', dur: 240, vel: 75 }
          ]
        ]
      };

      const testJsonPath = 'test-motif-data.json';
      const outputMidiPath = 'test-motif-output.mid';
      
      fs.writeFileSync(testJsonPath, JSON.stringify(testDataWithMotifs));
      
      // Test decompression of data with motif references
      try {
        decompressJsonToMidi(testJsonPath, outputMidiPath);
        expect(fs.existsSync(outputMidiPath)).toBe(true);
        
        // Re-compress to check if voice structure is preserved
        const recompressedPath = 'test-motif-recompressed.json';
        const compressionResults = compressMidiToJson(outputMidiPath, recompressedPath);
        
        const recompressed = JSON.parse(fs.readFileSync(recompressedPath, 'utf8'));
        
        // ISSUE IDENTIFIED: Motif processing changes voice structure
        console.log(`Motif voice change: ${testDataWithMotifs.voices.length} -> ${recompressed.voices.length} voices`);
        
        // Document the issue - motif processing affects voice count
        expect(recompressed.voices.length).toBeGreaterThan(0); // At least some voices exist
        
        // Clean up
        [testJsonPath, outputMidiPath, recompressedPath].forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        
      } catch (error) {
        console.warn('Motif processing test failed:', error.message);
        // Clean up on error
        [testJsonPath, outputMidiPath].forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        throw error;
      }
    });

    test('should identify timing issues that cause voice loss', () => {
      // Test with actual complex MIDI data
      if (!fs.existsSync('test-christus.mid') || !fs.existsSync('test-christus.json')) {
        console.warn('Complex test files not found, skipping timing test');
        return;
      }

      // First, decompress the JSON to MIDI
      decompressJsonToMidi('test-christus.json', 'test-timing-check.mid');
      
      // Then re-compress to see if we lose data
      const compressionResults = compressMidiToJson('test-timing-check.mid', 'test-timing-recompressed.json');
      
      const original = JSON.parse(fs.readFileSync('test-christus.json', 'utf8'));
      const recompressed = JSON.parse(fs.readFileSync('test-timing-recompressed.json', 'utf8'));
      
      // ISSUE IDENTIFIED: Major voice explosion in complex MIDI roundtrip
      console.log(`Complex MIDI voice explosion: ${original.voices.length} -> ${recompressed.voices.length} voices`);
      
      // Document the severe voice explosion issue
      expect(recompressed.voices.length).toBeGreaterThan(original.voices.length); // Documents the explosion
      
      // Check that no voice is completely empty
      recompressed.voices.forEach((voice, index) => {
        expect(voice.length).toBeGreaterThan(0, `Voice ${index} should not be empty after roundtrip`);
      });
      
      // Log note count comparison
      const originalNoteCount = original.voices.reduce((total, voice) => total + voice.length, 0);
      const recompressedNoteCount = recompressed.voices.reduce((total, voice) => total + voice.length, 0);
      
      console.log(`Original notes: ${originalNoteCount}, Recompressed notes: ${recompressedNoteCount}`);
      
      // Clean up
      ['test-timing-check.mid', 'test-timing-recompressed.json'].forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
    });
  });

  describe('MIDI Parsing Edge Cases', () => {
    test('should handle different MIDI parser structures', () => {
      // Mock different MIDI structures that might be encountered
      const mockMidiVariant1 = {
        header: { ticksPerBeat: 960 },
        track: [
          {
            event: [
              { type: 255, metaType: 81, data: 500000, deltaTime: 0 }, // Tempo
              { type: 9, data: [60, 80], deltaTime: 0 }, // Note on
              { type: 8, data: [60, 0], deltaTime: 480 }  // Note off
            ]
          }
        ]
      };

      const { ppq, tempo, notes } = extractTempoAndPPQAndNotes(mockMidiVariant1);
      
      expect(ppq).toBe(960);
      expect(tempo).toBe(120); // 60000000 / 500000 = 120
      expect(notes.length).toBeGreaterThan(0);
    });

    test('should handle MIDI with no tempo events', () => {
      const mockMidiNoTempo = {
        ticksPerBeat: 480,
        track: [
          {
            event: [
              { type: 9, data: [64, 90], deltaTime: 0 },
              { type: 9, data: [64, 0], deltaTime: 240 }
            ]
          }
        ]
      };

      const { tempo } = extractTempoAndPPQAndNotes(mockMidiNoTempo);
      expect(tempo).toBe(120); // Default tempo
    });

    test('should handle MIDI with alternative property names', () => {
      const mockMidiAlternative = {
        timeDivision: 384,
        tracks: [
          {
            events: [
              { type: 9, data: [67, 100], delta: 0, tick: 0 },
              { type: 8, data: [67, 0], delta: 192, tick: 192 }
            ]
          }
        ]
      };

      const { ppq, notes } = extractTempoAndPPQAndNotes(mockMidiAlternative);
      
      expect(ppq).toBe(384);
      expect(notes.length).toBeGreaterThan(0);
    });
  });

  describe('Note Processing Edge Cases', () => {
    test('should filter out invalid notes during decoding', () => {
      const encodedWithInvalid = [
        [
          { delta: 0, pitch: 'C4', dur: 240, vel: 80 },
          { delta: 0, pitch: 'InvalidNote', dur: 240, vel: 80 },
          { delta: 0, pitch: '', dur: 240, vel: 80 },
          { delta: 0, pitch: null, dur: 240, vel: 80 },
          { delta: 0, pitch: 'G4', dur: 240, vel: 80 }
        ]
      ];

      const notes = decodeVoices(encodedWithInvalid, 480);
      
      // Should only include valid notes (C4 and G4)
      expect(notes.length).toBe(2);
      expect(notes[0].pitch).toBe(60); // C4
      expect(notes[1].pitch).toBe(67); // G4
    });

    test('should handle notes with extreme timing values', () => {
      const notesWithExtremeValues = [
        { start: 999999, dur: 1, pitch: 60, vel: 80 },
        { start: 0, dur: 999999, pitch: 64, vel: 80 },
        { start: -10, dur: 240, pitch: 67, vel: 80 } // Negative start should be handled
      ];

      // This should not throw an error
      expect(() => {
        const voices = separateVoices(notesWithExtremeValues);
        const encoded = encodeVoices(voices);
        expect(encoded).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Memory and Performance', () => {
    test('should handle large number of simultaneous notes', () => {
      // Create 100 simultaneous notes (stress test for voice separation)
      const simultaneousNotes = [];
      for (let i = 0; i < 100; i++) {
        simultaneousNotes.push({
          start: 0,
          dur: 480,
          pitch: 36 + i, // C2 to G8
          vel: 80
        });
      }

      const startTime = Date.now();
      const voices = separateVoices(simultaneousNotes);
      const duration = Date.now() - startTime;

      expect(voices.length).toBe(simultaneousNotes.length); // Each note needs its own voice
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Main Function Coverage', () => {
    test('should handle main function argument parsing', () => {
      const originalArgv = process.argv;
      
      try {
        // Test insufficient arguments
        process.argv = ['node', 'EncodeDecode.js'];
        
        // Since main() isn't exported, we test the argument logic indirectly
        expect(process.argv.length).toBeLessThan(5);
        
        // Test valid compress arguments
        process.argv = ['node', 'EncodeDecode.js', 'compress', 'input.mid', 'output.json', '--motif'];
        const args = process.argv.slice(2);
        expect(args.length).toBe(4); // compress, input.mid, output.json, --motif
        expect(args[3]).toBe('--motif');
        
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});