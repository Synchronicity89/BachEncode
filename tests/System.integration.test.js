/**
 * System-Wide Integration Tests
 * Complete end-to-end testing of all BachEncode modules working together
 */

const fs = require('fs');
const path = require('path');
const { 
  parseMidi, 
  extractTempoAndPPQAndNotes, 
  separateVoices,
  compressMidiToJson,
  decompressJsonToMidi,
  createCompressionConfig
} = require('../EncodeDecode');

const MotifCompressor = require('../MotifCompressor');
const MotifDetector = require('../MotifDetector');
const KeyAnalyzer = require('../KeyAnalyzer');

describe('BachEncode System - Complete Integration Tests', () => {
  const tempFiles = [];

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

  describe('Complete Musical Analysis Pipeline', () => {
    test('should perform complete musical analysis workflow', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Complete analysis test file not found, skipping workflow test');
        return;
      }

      console.log('\n=== COMPLETE MUSICAL ANALYSIS WORKFLOW ===');

      // Step 1: Parse MIDI
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      console.log(`Step 1 - MIDI Parsing: ${voices.length} voices, ${musicData.notes.length} notes`);

      // Step 2: Key Analysis
      const keyAnalyzer = new KeyAnalyzer();
      const keyAnalyses = voices.map((voice, index) => {
        if (voice.length > 5) {
          const analysis = keyAnalyzer.analyzeVoiceKey(voice);
          console.log(`  Voice ${index + 1}: ${analysis.key} ${analysis.mode} (confidence: ${analysis.confidence.toFixed(3)})`);
          return analysis;
        }
        return null;
      }).filter(Boolean);

      expect(keyAnalyses.length).toBeGreaterThan(0);

      // Step 3: Motif Detection  
      const motifDetector = new MotifDetector();
      const motifAnalysis = motifDetector.analyzeMotifs(voices);
      
      console.log(`Step 3 - Motif Detection: ${motifAnalysis.statistics.totalMotifs} motifs found`);
      expect(motifAnalysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);

      // Step 4: Motif Compression
      const motifCompressor = new MotifCompressor({
        compressionThreshold: 0.5,
        minMotifMatches: 2
      });

      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = motifCompressor.compress(inputData);
      console.log(`Step 4 - Motif Compression: ${compressed.motifCompression.compressionStats.compressionRatio.toFixed(3)} ratio`);

      // Step 5: Decompression and Validation
      const decompressed = motifCompressor.decompress(compressed);
      
      const originalNoteCount = voices.reduce((sum, voice) => sum + voice.length, 0);
      const decompressedNoteCount = decompressed.voices.reduce((sum, voice) => sum + voice.length, 0);
      
      console.log(`Step 5 - Validation: ${originalNoteCount} → ${decompressedNoteCount} notes (${(decompressedNoteCount/originalNoteCount*100).toFixed(1)}% preservation)`);

      // Verify complete workflow integrity
      expect(decompressed.voices).toHaveLength(voices.length);
      expect(decompressedNoteCount).toBeGreaterThanOrEqual(originalNoteCount * 0.8); // 80% minimum preservation
      expect(decompressed.tempo).toBe(musicData.tempo);
      expect(decompressed.ppq).toBe(musicData.ppq);
    });

    test('should handle complete compression/decompression cycle with all features', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Full cycle test file not found, skipping');
        return;
      }

      console.log('\n=== COMPLETE COMPRESSION/DECOMPRESSION CYCLE ===');

      const jsonPath = 'test-system-complete-cycle.json';
      const outputPath = 'test-system-complete-cycle-output.mid';
      tempFiles.push(jsonPath, outputPath);

      // Use all available features
      const config = createCompressionConfig({
        useMotifCompression: true,
        compressionThreshold: 0.4,
        minMotifMatches: 2,
        motifOptions: {
          conservativeMode: false,
          exactMatchesOnly: false
        }
      });

      // Parse original
      const originalMidi = parseMidi('test-christus.mid');
      const originalData = extractTempoAndPPQAndNotes(originalMidi);
      const originalVoices = separateVoices(originalData.notes);

      console.log(`Original: ${originalData.notes.length} notes, ${originalVoices.length} voices`);

      // Full compression with all features
      const compressionResults = compressMidiToJson('test-christus.mid', jsonPath, config);
      
      // Verify JSON structure
      expect(fs.existsSync(jsonPath)).toBe(true);
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      
      // Should have all expected components
      expect(jsonData).toHaveProperty('voices');
      expect(jsonData).toHaveProperty('tempo');
      expect(jsonData).toHaveProperty('ppq');
      
      if (config.useMotifCompression) {
        expect(jsonData).toHaveProperty('motifCompression');
        expect(jsonData.motifCompression).toHaveProperty('enabled', true);
      }

      console.log(`Compression: ${compressionResults.originalNoteCount} notes, ${compressionResults.compressionRatio.toFixed(3)} ratio`);

      // Full decompression
      decompressJsonToMidi(jsonPath, outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify result integrity
      const outputMidi = parseMidi(outputPath);
      const outputData = extractTempoAndPPQAndNotes(outputMidi);
      const outputVoices = separateVoices(outputData.notes);

      console.log(`Result: ${outputData.notes.length} notes, ${outputVoices.length} voices`);

      // Complete system should preserve essential musical properties
      expect(outputData.tempo).toBeCloseTo(originalData.tempo, 1);
      expect(outputData.ppq).toBe(originalData.ppq);
      expect(outputData.notes.length).toBeGreaterThanOrEqual(originalData.notes.length * 0.85); // 85% preservation
      expect(outputVoices.length).toBeLessThanOrEqual(originalVoices.length * 3); // Prevent excessive voice explosion
    });
  });

  describe('Cross-Module Data Flow', () => {
    test('should maintain data consistency across all modules', () => {
      if (!fs.existsSync('test-minimal-motif.mid')) {
        console.warn('Data consistency test file not found, skipping');
        return;
      }

      console.log('\n=== CROSS-MODULE DATA CONSISTENCY TEST ===');

      // Parse and extract data
      const midi = parseMidi('test-minimal-motif.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      // Track data through each module
      const dataSnapshot = {
        original: {
          noteCount: musicData.notes.length,
          voiceCount: voices.length,
          tempo: musicData.tempo,
          ppq: musicData.ppq
        }
      };

      // Key Analysis
      const keyAnalyzer = new KeyAnalyzer();
      const firstVoiceKey = voices.length > 0 && voices[0].length > 0 ? 
        keyAnalyzer.analyzeVoiceKey(voices[0]) : null;
      
      if (firstVoiceKey) {
        dataSnapshot.keyAnalysis = {
          key: firstVoiceKey.key,
          mode: firstVoiceKey.mode,
          confidence: firstVoiceKey.confidence
        };
      }

      // Motif Detection
      const motifDetector = new MotifDetector();
      const motifAnalysis = motifDetector.analyzeMotifs(voices);
      dataSnapshot.motifDetection = {
        totalMotifs: motifAnalysis.statistics.totalMotifs,
        totalMatches: motifAnalysis.statistics.totalMatches
      };

      // Motif Compression
      const motifCompressor = new MotifCompressor();
      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };

      const compressed = motifCompressor.compress(inputData);
      dataSnapshot.compression = {
        compressionRatio: compressed.motifCompression.compressionStats.compressionRatio,
        motifLibrarySize: compressed.motifCompression.motifLibrary.length
      };

      // Decompression
      const decompressed = motifCompressor.decompress(compressed);
      dataSnapshot.decompression = {
        noteCount: decompressed.voices.reduce((sum, voice) => sum + voice.length, 0),
        voiceCount: decompressed.voices.length,
        tempo: decompressed.tempo,
        ppq: decompressed.ppq
      };

      console.log('Data flow snapshot:', JSON.stringify(dataSnapshot, null, 2));

      // Verify data consistency
      expect(dataSnapshot.decompression.tempo).toBe(dataSnapshot.original.tempo);
      expect(dataSnapshot.decompression.ppq).toBe(dataSnapshot.original.ppq);
      expect(dataSnapshot.decompression.voiceCount).toBe(dataSnapshot.original.voiceCount);
      
      // Note count may vary due to compression, but should be reasonable
      const preservationRatio = dataSnapshot.decompression.noteCount / dataSnapshot.original.noteCount;
      expect(preservationRatio).toBeGreaterThan(0.7); // 70% minimum
      expect(preservationRatio).toBeLessThanOrEqual(1.1); // 110% maximum (allowing for minor expansions)
    });

    test('should handle complex musical structures across all modules', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Complex structure test file not found, skipping');
        return;
      }

      console.log('\n=== COMPLEX MUSICAL STRUCTURE TEST ===');

      // Parse complex musical data
      const midi = parseMidi('test-christus.mid');
      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);

      console.log(`Processing complex structure: ${voices.length} voices, ${musicData.notes.length} notes`);

      // Test each module with complex data
      const moduleResults = {};

      // Key Analysis on all voices
      const keyAnalyzer = new KeyAnalyzer();
      moduleResults.keyAnalysis = voices.map((voice, index) => {
        if (voice.length > 3) {
          const analysis = keyAnalyzer.analyzeVoiceKey(voice);
          return {
            voice: index,
            key: analysis.key,
            mode: analysis.mode,
            confidence: analysis.confidence
          };
        }
        return null;
      }).filter(Boolean);

      console.log(`Key analysis: ${moduleResults.keyAnalysis.length} voices analyzed`);

      // Motif Detection on complex polyphony
      const motifDetector = new MotifDetector();
      const motifAnalysis = motifDetector.analyzeMotifs(voices);
      moduleResults.motifDetection = {
        motifs: motifAnalysis.statistics.totalMotifs,
        matches: motifAnalysis.statistics.totalMatches,
        averageLength: motifAnalysis.statistics.averageMotifLength
      };

      console.log(`Motif detection: ${moduleResults.motifDetection.motifs} motifs, avg length ${moduleResults.motifDetection.averageLength.toFixed(1)}`);

      // Motif Compression with complex settings
      const motifCompressor = new MotifCompressor({
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

      const compressed = motifCompressor.compress(inputData);
      const decompressed = motifCompressor.decompress(compressed);

      moduleResults.compression = {
        original: inputData.originalNoteCount,
        compressed: compressed.motifCompression.compressionStats.compressedReferences,
        decompressed: decompressed.voices.reduce((sum, voice) => sum + voice.length, 0),
        ratio: compressed.motifCompression.compressionStats.compressionRatio
      };

      console.log(`Compression: ${moduleResults.compression.original} → ${moduleResults.compression.decompressed} (${(moduleResults.compression.ratio * 100).toFixed(1)}%)`);

      // All modules should handle complex data without errors
      expect(moduleResults.keyAnalysis.length).toBeGreaterThan(0);
      expect(moduleResults.motifDetection.motifs).toBeGreaterThanOrEqual(0);
      expect(moduleResults.compression.decompressed).toBeGreaterThan(0);
      expect(moduleResults.compression.ratio).toBeGreaterThan(0);
      expect(moduleResults.compression.ratio).toBeLessThanOrEqual(1);
    });
  });

  describe('System Error Handling', () => {
    test('should handle errors gracefully across all modules', () => {
      console.log('\n=== SYSTEM ERROR HANDLING TEST ===');

      // Test with problematic data
      const problematicVoices = [
        [], // Empty voice
        [{ pitch: 60, duration: 120 }], // Single note
        [{ pitch: null, duration: 120 }, { pitch: 62, duration: 0 }], // Invalid data
        [{ pitch: 60, duration: 120 }, { pitch: 62, duration: 120 }] // Valid data
      ];

      // Test Key Analysis error handling
      const keyAnalyzer = new KeyAnalyzer();
      expect(() => {
        problematicVoices.forEach(voice => {
          const analysis = keyAnalyzer.analyzeVoiceKey(voice);
          expect(analysis).toHaveProperty('key');
          expect(analysis).toHaveProperty('mode');
        });
      }).not.toThrow();

      // Test Motif Detection error handling
      const motifDetector = new MotifDetector();
      expect(() => {
        const analysis = motifDetector.analyzeMotifs(problematicVoices);
        expect(analysis.statistics.totalMotifs).toBeGreaterThanOrEqual(0);
      }).not.toThrow();

      // Test Motif Compression error handling
      const motifCompressor = new MotifCompressor();
      const problematicData = {
        voices: problematicVoices,
        tempo: 120,
        ppq: 480,
        originalNoteCount: 4
      };

      expect(() => {
        const compressed = motifCompressor.compress(problematicData);
        const decompressed = motifCompressor.decompress(compressed);
        expect(decompressed.voices).toHaveLength(problematicVoices.length);
      }).not.toThrow();
    });

    test('should provide meaningful error messages for invalid inputs', () => {
      console.log('\n=== ERROR MESSAGE QUALITY TEST ===');

      const motifCompressor = new MotifCompressor();

      // Test with completely invalid data
      const invalidData = {
        voices: "not an array",
        tempo: "not a number",
        ppq: null
      };

      expect(() => {
        motifCompressor.compress(invalidData);
      }).toThrow();

      // Test with missing required properties
      const incompleteData = {
        voices: [[{ pitch: 60, duration: 120 }]]
        // Missing tempo and ppq
      };

      // Should either work with defaults or provide clear error
      try {
        const result = motifCompressor.compress(incompleteData);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error.message).toBeTruthy();
        expect(typeof error.message).toBe('string');
      }
    });
  });

  describe('Performance Integration', () => {
    test('should maintain good performance with all modules active', () => {
      if (!fs.existsSync('test-christus.mid')) {
        console.warn('Performance integration test file not found, skipping');
        return;
      }

      console.log('\n=== SYSTEM PERFORMANCE INTEGRATION TEST ===');

      const startTime = Date.now();

      // Full system workflow with timing
      const midi = parseMidi('test-christus.mid');
      const parseTime = Date.now();

      const musicData = extractTempoAndPPQAndNotes(midi);
      const voices = separateVoices(musicData.notes);
      const extractTime = Date.now();

      // Key analysis
      const keyAnalyzer = new KeyAnalyzer();
      const keyAnalyses = voices.filter(v => v.length > 0).map(voice => 
        keyAnalyzer.analyzeVoiceKey(voice)
      );
      const keyTime = Date.now();

      // Motif detection
      const motifDetector = new MotifDetector();
      const motifAnalysis = motifDetector.analyzeMotifs(voices);
      const motifTime = Date.now();

      // Compression
      const motifCompressor = new MotifCompressor();
      const inputData = {
        voices: voices,
        tempo: musicData.tempo,
        ppq: musicData.ppq,
        originalNoteCount: musicData.notes.length
      };
      const compressed = motifCompressor.compress(inputData);
      const compressTime = Date.now();

      // Decompression
      const decompressed = motifCompressor.decompress(compressed);
      const decompressTime = Date.now();

      // Report timing breakdown
      const timings = {
        parsing: parseTime - startTime,
        extraction: extractTime - parseTime,
        keyAnalysis: keyTime - extractTime,
        motifDetection: motifTime - keyTime,
        compression: compressTime - motifTime,
        decompression: decompressTime - compressTime,
        total: decompressTime - startTime
      };

      console.log('Performance breakdown:');
      Object.entries(timings).forEach(([phase, time]) => {
        console.log(`  ${phase}: ${time}ms`);
      });

      const notesProcessed = musicData.notes.length;
      const notesPerSecond = notesProcessed / (timings.total / 1000);
      console.log(`Overall rate: ${notesPerSecond.toFixed(1)} notes/second`);

      // Performance expectations
      expect(timings.total).toBeLessThan(20000); // 20 seconds max for complete system
      expect(notesPerSecond).toBeGreaterThan(5); // Minimum 5 notes/second
      
      // No single phase should dominate excessively
      expect(timings.parsing).toBeLessThan(timings.total * 0.5); // Max 50% of total time
      expect(timings.compression).toBeLessThan(timings.total * 0.8); // Max 80% of total time
    });

    test('should scale reasonably with different file sizes', () => {
      // Test with available files of different sizes
      const testFiles = [
        'test-minimal-one-note.mid',
        'test-minimal-motif.mid',
        'test-christus.mid'
      ].filter(file => fs.existsSync(file));

      if (testFiles.length < 2) {
        console.warn('Insufficient test files for scaling test, skipping');
        return;
      }

      console.log('\n=== SYSTEM SCALING TEST ===');

      const results = [];

      testFiles.forEach(filename => {
        const startTime = Date.now();
        
        const midi = parseMidi(filename);
        const musicData = extractTempoAndPPQAndNotes(midi);
        const voices = separateVoices(musicData.notes);

        // Quick system test
        const motifDetector = new MotifDetector();
        const motifAnalysis = motifDetector.analyzeMotifs(voices);
        
        const motifCompressor = new MotifCompressor();
        const inputData = {
          voices: voices,
          tempo: musicData.tempo,
          ppq: musicData.ppq,
          originalNoteCount: musicData.notes.length
        };
        const compressed = motifCompressor.compress(inputData);
        const decompressed = motifCompressor.decompress(compressed);

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        results.push({
          filename,
          noteCount: musicData.notes.length,
          processingTime,
          notesPerSecond: musicData.notes.length / (processingTime / 1000)
        });
      });

      console.log('Scaling results:');
      results.forEach(result => {
        console.log(`  ${result.filename}: ${result.noteCount} notes in ${result.processingTime}ms (${result.notesPerSecond.toFixed(1)} notes/sec)`);
      });

      // Verify scaling is reasonable (not exponential)
      results.forEach(result => {
        expect(result.notesPerSecond).toBeGreaterThan(1); // At least 1 note per second
        expect(result.processingTime).toBeLessThan(result.noteCount * 100); // Max 100ms per note
      });
    });
  });

  describe('Data Integrity Across System', () => {
    test('should preserve musical meaning through complete system', () => {
      if (!fs.existsSync('test-different-octaves.mid')) {
        console.warn('Musical meaning test file not found, skipping');
        return;
      }

      console.log('\n=== MUSICAL MEANING PRESERVATION TEST ===');

      const jsonPath = 'test-system-meaning.json';
      const outputPath = 'test-system-meaning-output.mid';
      tempFiles.push(jsonPath, outputPath);

      // Parse original musical content
      const originalMidi = parseMidi('test-different-octaves.mid');
      const originalData = extractTempoAndPPQAndNotes(originalMidi);
      const originalVoices = separateVoices(originalData.notes);

      // Extract musical characteristics
      const originalCharacteristics = {
        noteCount: originalData.notes.length,
        voiceCount: originalVoices.length,
        pitchRange: {
          min: Math.min(...originalData.notes.map(n => n.pitch)),
          max: Math.max(...originalData.notes.map(n => n.pitch))
        },
        durationRange: {
          min: Math.min(...originalData.notes.map(n => n.dur)),
          max: Math.max(...originalData.notes.map(n => n.dur))
        },
        tempo: originalData.tempo,
        ppq: originalData.ppq
      };

      console.log('Original characteristics:', originalCharacteristics);

      // Process through complete system
      const config = createCompressionConfig({
        useMotifCompression: true,
        compressionThreshold: 0.6,
        minMotifMatches: 2
      });

      compressMidiToJson('test-different-octaves.mid', jsonPath, config);
      decompressJsonToMidi(jsonPath, outputPath);

      // Analyze result
      const resultMidi = parseMidi(outputPath);
      const resultData = extractTempoAndPPQAndNotes(resultMidi);
      const resultVoices = separateVoices(resultData.notes);

      const resultCharacteristics = {
        noteCount: resultData.notes.length,
        voiceCount: resultVoices.length,
        pitchRange: {
          min: Math.min(...resultData.notes.map(n => n.pitch)),
          max: Math.max(...resultData.notes.map(n => n.pitch))
        },
        durationRange: {
          min: Math.min(...resultData.notes.map(n => n.dur)),
          max: Math.max(...resultData.notes.map(n => n.dur))
        },
        tempo: resultData.tempo,
        ppq: resultData.ppq
      };

      console.log('Result characteristics:', resultCharacteristics);

      // Verify essential musical properties are preserved
      expect(resultCharacteristics.tempo).toBe(originalCharacteristics.tempo);
      expect(resultCharacteristics.ppq).toBe(originalCharacteristics.ppq);
      
      // Pitch range should be preserved or expanded slightly
      expect(resultCharacteristics.pitchRange.min).toBeLessThanOrEqual(originalCharacteristics.pitchRange.min + 1);
      expect(resultCharacteristics.pitchRange.max).toBeGreaterThanOrEqual(originalCharacteristics.pitchRange.max - 1);
      
      // Note count should be reasonably preserved
      const preservationRatio = resultCharacteristics.noteCount / originalCharacteristics.noteCount;
      expect(preservationRatio).toBeGreaterThan(0.8); // At least 80% preservation
      expect(preservationRatio).toBeLessThan(1.2); // No more than 20% expansion

      console.log(`Musical preservation: ${(preservationRatio * 100).toFixed(1)}%`);
    });
  });
});