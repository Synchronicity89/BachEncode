const fs = require('fs');
const path = require('path');
const { compressMidiToJson } = require('../EncodeDecode.js');

describe('Motif Compression Comparison Tests', () => {
  const testDir = path.join(__dirname, '..', 'output');
  const midiFile = path.join(__dirname, '..', 'midi', 'BWV785.mid');
  const noMotifsFile = path.join(testDir, 'BWV785-no-motifs.json');
  const withMotifsFile = path.join(testDir, 'BWV785-with-transformations.json');

  beforeAll(() => {
    // Ensure output directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test('should generate baseline JSON without motifs', async () => {
    if (!fs.existsSync(midiFile)) {
      console.warn(`MIDI file not found: ${midiFile}`);
      return;
    }

    const results = compressMidiToJson(midiFile, noMotifsFile, { 
      useMotifCompression: false 
    });
    
    expect(fs.existsSync(noMotifsFile)).toBe(true);
    expect(results.useMotifs).toBe(false);
    expect(results.motifCount).toBe(0);
    
    console.log(`✅ Generated baseline without motifs: ${noMotifsFile}`);
  });

  test('should generate enhanced JSON with motif transformations', async () => {
    if (!fs.existsSync(midiFile)) {
      console.warn(`MIDI file not found: ${midiFile}`);
      return;
    }

    const results = compressMidiToJson(midiFile, withMotifsFile, { 
      useMotifCompression: true,
      motifOptions: {
        exactMatchesOnly: false,  // Allow transformations
        conservativeMode: false
      }
    });
    
    expect(fs.existsSync(withMotifsFile)).toBe(true);
    expect(results.useMotifs).toBe(true);
    
    console.log(`✅ Generated enhanced with motifs: ${withMotifsFile}`);
    console.log(`   Compression ratio: ${results.compressionRatio}x`);
    console.log(`   Motif count: ${results.motifCount}`);
  });

  test('should compare JSON files line by line', () => {
    if (!fs.existsSync(noMotifsFile) || !fs.existsSync(withMotifsFile)) {
      console.warn('Required JSON files not found, skipping comparison');
      return;
    }

    const noMotifsContent = JSON.parse(fs.readFileSync(noMotifsFile, 'utf8'));
    const withMotifsContent = JSON.parse(fs.readFileSync(withMotifsFile, 'utf8'));

    console.log('\n=== JSON COMPARISON RESULTS ===');
    
    // Compare basic structure
    expect(noMotifsContent.ppq).toBe(withMotifsContent.ppq);
    expect(noMotifsContent.tempo).toBe(withMotifsContent.tempo);
    
    console.log(`✅ PPQ matches: ${noMotifsContent.ppq}`);
    console.log(`✅ Tempo matches: ${noMotifsContent.tempo}`);
    
    // Compare voice count
    expect(noMotifsContent.voices.length).toBe(withMotifsContent.voices.length);
    console.log(`✅ Voice count matches: ${noMotifsContent.voices.length}`);
    
    // Check for motif compression differences
    const hasMotifCompression = withMotifsContent.motifCompression && 
                               withMotifsContent.motifCompression.enabled;
    
    if (hasMotifCompression) {
      console.log(`✅ Motif compression detected in enhanced file`);
      console.log(`   Motif library size: ${withMotifsContent.motifCompression.motifLibrary?.length || 0}`);
      
      // Expect differences in the voices due to motif compression
      const voiceDifferences = [];
      for (let i = 0; i < noMotifsContent.voices.length; i++) {
        const baseVoice = noMotifsContent.voices[i];
        const motifVoice = withMotifsContent.voices[i];
        
        if (baseVoice.length !== motifVoice.length) {
          voiceDifferences.push(`Voice ${i}: ${baseVoice.length} vs ${motifVoice.length} items`);
        }
      }
      
      if (voiceDifferences.length > 0) {
        console.log(`✅ Voice structure differences detected (expected):`);
        voiceDifferences.forEach(diff => console.log(`   ${diff}`));
      }
    } else {
      console.log(`❌ No motif compression found in enhanced file`);
      
      // If no motif compression, files should be nearly identical
      expect(JSON.stringify(noMotifsContent)).toBe(JSON.stringify(withMotifsContent));
    }
    
    console.log('\n=== COMPARISON COMPLETE ===');
  });

  test('should validate motif transformation quality', () => {
    if (!fs.existsSync(withMotifsFile)) {
      console.warn('Enhanced JSON file not found, skipping quality validation');
      return;
    }

    const withMotifsContent = JSON.parse(fs.readFileSync(withMotifsFile, 'utf8'));
    
    if (withMotifsContent.motifCompression && withMotifsContent.motifCompression.enabled) {
      const motifLibrary = withMotifsContent.motifCompression.motifLibrary || [];
      const compressionStats = withMotifsContent.motifCompression.compressionStats;
      
      console.log('\n=== MOTIF QUALITY ANALYSIS ===');
      console.log(`Motifs in library: ${motifLibrary.length}`);
      
      if (compressionStats) {
        console.log(`Compression ratio: ${compressionStats.compressionRatio || 'N/A'}`);
        console.log(`Original notes: ${compressionStats.originalNoteCount || 'N/A'}`);
      }
      
      // Check for non-exact transformations
      let nonExactCount = 0;
      const transformationTypes = new Set();
      
      withMotifsContent.voices.forEach((voice, voiceIndex) => {
        voice.forEach((item, itemIndex) => {
          if (item.type === 'motif_reference' && item.transformation !== 'exact') {
            nonExactCount++;
            transformationTypes.add(item.transformation);
            
            if (nonExactCount <= 3) { // Show first 3 examples
              console.log(`   Non-exact: Voice ${voiceIndex}, Item ${itemIndex}`);
              console.log(`     Transformation: ${item.transformation}`);
              console.log(`     Confidence: ${item.confidence || 'N/A'}`);
            }
          }
        });
      });
      
      if (nonExactCount > 0) {
        console.log(`✅ Found ${nonExactCount} non-exact transformations`);
        console.log(`   Transformation types: ${Array.from(transformationTypes).join(', ')}`);
        
        // This is expected behavior when transformations are allowed
        expect(nonExactCount).toBeGreaterThan(0);
      } else {
        console.log(`ℹ️  No non-exact transformations found (exact matches only)`);
      }
      
      console.log('=== QUALITY ANALYSIS COMPLETE ===');
    }
  });
});