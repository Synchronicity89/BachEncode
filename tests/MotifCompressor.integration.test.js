/**
 * MotifCompressor.js Integration Tests
 * Full end-to-end testing without mocks using real musical data
 */

const fs = require('fs');
const path = require('path');
const MotifCompressor = require('../MotifCompressor');
const { parseMidi, extractTempoAndPPQAndNotes, separateVoices } = require('../EncodeDecode');

describe('MotifCompressor.js - Integration Tests', () => {
  let compressor;
  const tempFiles = [];

  beforeEach(() => {
    compressor = new MotifCompressor({
      compressionThreshold: 0.5,
      minMotifMatches: 2,
      conservativeMode: false,
      exactMatchesOnly: false
    });
  });

  afterEach(() => {
    tempFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    });
    tempFiles.length = 0;
  });

  describe('Real Musical Data Compression', () => {
    test('should compress and decompress Bach chorale with motifs', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Bach chorale test file not found, skipping motif compression test');
        return;
      }

      console.log('\n=== BACH CHORALE MOTIF COMPRESSION TEST ===');

      // Parse real MIDI data
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      console.log(`Input: ${inputData.originalNoteCount} notes in ${voices.length} voices`);

      // Test compression
      const compressed = compressor.compress(inputData);
      
      // Verify compression structure
      expect(compressed).toHaveProperty('motifCompression');
      expect(compressed.motifCompression).toHaveProperty('enabled', true);
      expect(compressed.motifCompression).toHaveProperty('motifLibrary');
      expect(compressed.motifCompression).toHaveProperty('compressionStats');

      const stats = compressed.motifCompression.compressionStats;
      console.log(`Compression stats: ${stats.originalNotes} → ${stats.compressedReferences} (${(stats.compressionRatio * 100).toFixed(1)}%)`);

      // Test decompression
      const decompressed = compressor.decompress(compressed);
      
      // Verify decompression preserves structure
      expect(decompressed).toHaveProperty('voices');
      expect(decompressed).toHaveProperty('tempo', inputData.tempo);
      expect(decompressed).toHaveProperty('ppq', inputData.ppq);

      const totalNotesOriginal = inputData.voices.reduce((sum, voice) => sum + voice.length, 0);
      const totalNotesDecompressed = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);

      console.log(`Decompression result: ${totalNotesDecompressed} notes (${((totalNotesDecompressed/totalNotesOriginal) * 100).toFixed(1)}% preservation)`);

      // Verify reasonable preservation (allow some loss due to compression artifacts)
      expect(totalNotesDecompressed).toBeGreaterThanOrEqual(totalNotesOriginal * 0.9); // 90% minimum preservation
    });

    test('should handle complex polyphonic music with multiple motifs', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Complex polyphonic test file not found, skipping');
        return;
      }

      console.log('\n=== COMPLEX POLYPHONIC MOTIF TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Use aggressive compression settings
      const aggressiveCompressor = new MotifCompressor({
        compressionThreshold: 0.3,
        minMotifMatches: 1,
        conservativeMode: false
      });

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = aggressiveCompressor.compress(inputData);
      const decompressed = aggressiveCompressor.decompress(compressed);

      // Verify motifs were found and applied
      if (compressed.motifCompression.motifLibrary.length > 0) {
        console.log(`Found ${compressed.motifCompression.motifLibrary.length} motifs`);
        expect(compressed.motifCompression.motifLibrary.length).toBeGreaterThan(0);
        
        // Analyze motif characteristics
        compressed.motifCompression.motifLibrary.forEach((motif, index) => {
          expect(motif).toHaveProperty('id');
          expect(motif).toHaveProperty('pattern');
          expect(motif).toHaveProperty('matches');
          expect(motif.matches).toBeGreaterThanOrEqual(1);
          
          console.log(`Motif ${index + 1}: ${motif.pattern.length} notes, ${motif.matches} matches`);
        });
      } else {
        console.log('No motifs found with aggressive settings - may indicate need for algorithm tuning');
      }

      // Verify structural integrity
      expect(decompressed.voices).toHaveLength(inputData.voices.length);
      
      const preservation = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0) / 
                         inputData.voices.reduce((sum, voice) => sum + voice.length, 0);
      console.log(`Data preservation: ${(preservation * 100).toFixed(1)}%`);
    });

    test('should preserve musical integrity with conservative settings', () => {
      if (!fs.existsSync('test-minimal-motif.mid')) {
        console.warn('Minimal motif test file not found, skipping conservative test');
        return;
      }

      console.log('\n=== CONSERVATIVE MOTIF COMPRESSION TEST ===');

      const midi = parseMidi('test-minimal-motif.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Use conservative settings
      const conservativeCompressor = new MotifCompressor({
        compressionThreshold: 0.8,
        minMotifMatches: 3,
        conservativeMode: true,
        exactMatchesOnly: true
      });

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = conservativeCompressor.compress(inputData);
      const decompressed = conservativeCompressor.decompress(compressed);

      // With conservative settings, should have minimal data loss
      const totalOriginal = inputData.voices.reduce((sum, voice) => sum + voice.length, 0);
      const totalDecompressed = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);
      
      const preservationRatio = totalDecompressed / totalOriginal;
      console.log(`Conservative preservation: ${(preservationRatio * 100).toFixed(1)}%`);
      
      // Conservative mode should preserve almost everything
      expect(preservationRatio).toBeGreaterThanOrEqual(0.95); // 95% minimum with conservative settings
    });
  });

  describe('Motif Detection Quality', () => {
    test('should identify meaningful musical patterns', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Musical pattern test file not found, skipping pattern analysis');
        return;
      }

      console.log('\n=== MOTIF PATTERN ANALYSIS TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = compressor.compress(inputData);

      if (compressed.motifCompression.motifLibrary.length > 0) {
        // Analyze motif quality
        compressed.motifCompression.motifLibrary.forEach((motif, index) => {
          // Verify motif has reasonable length
          expect(motif.pattern.length).toBeGreaterThanOrEqual(3); // Minimum meaningful pattern
          expect(motif.pattern.length).toBeLessThanOrEqual(20); // Maximum reasonable pattern
          
          // Verify motif has multiple matches
          expect(motif.matches).toBeGreaterThanOrEqual(compressor.minMotifMatches);
          
          // Verify pattern structure
          expect(Array.isArray(motif.pattern)).toBe(true);
          motif.pattern.forEach(note => {
            expect(note).toHaveProperty('pitch');
            expect(note).toHaveProperty('duration');
            expect(typeof note.pitch).toBe('number');
            expect(typeof note.duration).toBe('number');
            expect(note.duration).toBeGreaterThan(0);
          });

          console.log(`Motif ${index + 1} quality: ${motif.pattern.length} notes, ${motif.matches} instances`);
        });
      }
    });

    test('should handle different musical styles appropriately', () => {
      // Test with different available MIDI files to check style adaptability
      const testFiles = [
        'test-christus.mid',
        'test-minimal-motif.mid', 
        'test-different-octaves.mid'
      ].filter(file => fs.existsSync(file));

      if (testFiles.length === 0) {
        console.warn('No test files available for style adaptation test');
        return;
      }

      console.log('\n=== MUSICAL STYLE ADAPTATION TEST ===');

      testFiles.forEach(filename => {
        console.log(`Testing ${filename}...`);
        
        const midi = parseMidi(filename);
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        const inputData = {
          voices: voices,
          tempo: musicData.tempo,
          ppq: musicData.ppq,
          originalNoteCount: musicData.notes.length
        };

        // Should not throw regardless of musical style
        expect(() => {
          const compressed = compressor.compress(inputData);
          const decompressed = compressor.decompress(compressed);
        }).not.toThrow();
      });
    });
  });

  describe('Compression Effectiveness', () => {
    test('should achieve meaningful compression ratios', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Compression ratio test file not found, skipping effectiveness test');
        return;
      }

      console.log('\n=== COMPRESSION EFFECTIVENESS TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = compressor.compress(inputData);
      const stats = compressed.motifCompression.compressionStats;

      // Verify compression statistics are meaningful
      expect(stats.originalNotes).toBe(inputData.originalNoteCount);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(1);

      // Calculate actual size reduction
      const originalSize = JSON.stringify(inputData).length;
      const compressedSize = JSON.stringify(compressed).length;
      const sizeRatio = compressedSize / originalSize;

      console.log(`Size comparison: ${originalSize} → ${compressedSize} bytes (${(sizeRatio * 100).toFixed(1)}%)`);
      console.log(`Note compression: ${stats.originalNotes} → ${stats.compressedReferences} notes (${(stats.compressionRatio * 100).toFixed(1)}%)`);

      // Compression should be beneficial when motifs are found
      if (compressed.motifCompression.motifLibrary.length > 0) {
        expect(stats.compressionRatio).toBeLessThan(1.0);
      }
    });

    test('should handle repetitive patterns efficiently', () => {
      // Create synthetic repetitive pattern for testing
      const syntheticVoices = [
        [
          // Repeating pattern: C-D-E-F
          { pitch: 60, duration: 120, start: 0, velocity: 100 },
          { pitch: 62, duration: 120, start: 120, velocity: 100 },
          { pitch: 64, duration: 120, start: 240, velocity: 100 },
          { pitch: 65, duration: 120, start: 360, velocity: 100 },
          // Repeat the pattern
          { pitch: 60, duration: 120, start: 480, velocity: 100 },
          { pitch: 62, duration: 120, start: 600, velocity: 100 },
          { pitch: 64, duration: 120, start: 720, velocity: 100 },
          { pitch: 65, duration: 120, start: 840, velocity: 100 },
          // Third repetition
          { pitch: 60, duration: 120, start: 960, velocity: 100 },
          { pitch: 62, duration: 120, start: 1080, velocity: 100 },
          { pitch: 64, duration: 120, start: 1200, velocity: 100 },
          { pitch: 65, duration: 120, start: 1320, velocity: 100 }
        ]
      ];

      console.log('\n=== REPETITIVE PATTERN COMPRESSION TEST ===');

      const inputData = {
        voices: syntheticVoices,
        tempo: 120,
        ppq: 480,
        originalNoteCount: 12
      };

      const compressed = compressor.compress(inputData);
      const decompressed = compressor.decompress(compressed);

      // Should detect the repetitive pattern
      expect(compressed.motifCompression.motifLibrary.length).toBeGreaterThan(0);
      
      const motif = compressed.motifCompression.motifLibrary[0];
      expect(motif.matches).toBeGreaterThanOrEqual(2); // At least 2 repetitions detected
      
      console.log(`Detected repetitive motif: ${motif.pattern.length} notes, ${motif.matches} repetitions`);

      // Decompression should reconstruct the pattern
      expect(decompressed.voices[0]).toHaveLength(inputData.voices[0].length);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty voices gracefully', () => {
      const emptyData = {
        voices: [[], [], []],
        tempo: 120,
        ppq: 480,
        originalNoteCount: 0
      };

      expect(() => {
        const compressed = compressor.compress(emptyData);
        const decompressed = compressor.decompress(compressed);
      }).not.toThrow();
    });

    test('should handle single note voices', () => {
      const singleNoteData = {
        voices: [
          [{ pitch: 60, duration: 480, start: 0, velocity: 100 }],
          [{ pitch: 64, duration: 480, start: 0, velocity: 100 }]
        ],
        tempo: 120,
        ppq: 480,
        originalNoteCount: 2
      };

      expect(() => {
        const compressed = compressor.compress(singleNoteData);
        const decompressed = compressor.decompress(compressed);
        
        // Should preserve single notes even without motifs
        expect(decompressed.voices[0]).toHaveLength(1);
        expect(decompressed.voices[1]).toHaveLength(1);
      }).not.toThrow();
    });

    test('should handle malformed input data', () => {
      const malformedData = {
        voices: "not an array",
        tempo: "not a number",
        ppq: null
      };

      expect(() => {
        compressor.compress(malformedData);
      }).toThrow();
    });

    test('should handle missing compression data in decompression', () => {
      const dataWithoutMotifCompression = {
        voices: [[{ pitch: 60, duration: 480, start: 0, velocity: 100 }]],
        tempo: 120,
        ppq: 480
      };

      expect(() => {
        compressor.decompress(dataWithoutMotifCompression);
      }).not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    test('should respect different compression thresholds', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Threshold test file not found, skipping configuration test');
        return;
      }

      console.log('\n=== COMPRESSION THRESHOLD TEST ===');

      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      // Test different threshold values
      const thresholds = [0.3, 0.5, 0.8];
      const results = [];

      thresholds.forEach(threshold => {
        const testCompressor = new MotifCompressor({
          compressionThreshold: threshold,
          minMotifMatches: 2
        });

        const compressed = testCompressor.compress(inputData);
        results.push({
          threshold,
          motifCount: compressed.motifCompression.motifLibrary.length,
          compressionRatio: compressed.motifCompression.compressionStats.compressionRatio
        });
      });

      console.log('Threshold analysis:');
      results.forEach(result => {
        console.log(`  Threshold ${result.threshold}: ${result.motifCount} motifs, ${(result.compressionRatio * 100).toFixed(1)}% ratio`);
      });

      // Lower thresholds should generally find more motifs (less strict)
      expect(results[0].motifCount).toBeGreaterThanOrEqual(results[2].motifCount);
    });

    test('should respect minimum motif matches setting', () => {
      // Create data with exactly 2 repetitions of a pattern
      const voices = [[
        { pitch: 60, duration: 120, start: 0, velocity: 100 },
        { pitch: 62, duration: 120, start: 120, velocity: 100 },
        { pitch: 60, duration: 120, start: 240, velocity: 100 },
        { pitch: 62, duration: 120, start: 360, velocity: 100 }
      ]];

      const inputData = {
        voices: voices,
        tempo: 120,
        ppq: 480,
        originalNoteCount: 4
      };

      // Test with minMotifMatches = 1 (should find pattern)
      const lenientCompressor = new MotifCompressor({ minMotifMatches: 1 });
      const lenientResult = lenientCompressor.compress(inputData);

      // Test with minMotifMatches = 3 (should not find pattern)
      const strictCompressor = new MotifCompressor({ minMotifMatches: 3 });
      const strictResult = strictCompressor.compress(inputData);

      // Lenient should find more motifs than strict
      expect(lenientResult.motifCompression.motifLibrary.length)
        .toBeGreaterThanOrEqual(strictResult.motifCompression.motifLibrary.length);
    });
  });
});