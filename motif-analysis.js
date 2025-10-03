const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Motif Analysis Utility
 * Analyzes how well the motif detection algorithm is performing on MIDI files
 */

function analyzeMotifDetection(midiFilePath, outputJsonPath) {
  console.log(`\n=== Analyzing Motif Detection for ${path.basename(midiFilePath)} ===`);
  
  // Compress the MIDI file
  const startTime = Date.now();
  execSync(`node EncodeDecode.js compress "${midiFilePath}" "${outputJsonPath}"`, {
    cwd: process.cwd(), // Use current working directory instead of MIDI file directory
    stdio: 'inherit'
  });
  const compressionTime = Date.now() - startTime;
  
  // Load and analyze the compressed data
  const compressed = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
  
  const analysis = {
    file: path.basename(midiFilePath),
    compressionTimeMs: compressionTime,
    motifs: analyzeMotifs(compressed),
    compression: analyzeCompression(compressed),
    voices: analyzeVoices(compressed),
    efficiency: calculateEfficiencyMetrics(compressed)
  };
  
  printAnalysis(analysis);
  return analysis;
}

function analyzeMotifs(compressed) {
  const motifs = compressed.motifs || [];
  const motifUsage = {};
  
  // Count motif usage
  for (const voice of compressed.voices) {
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        motifUsage[item.motif_id] = (motifUsage[item.motif_id] || 0) + 1;
      }
    }
  }
  
  const motifLengths = motifs.map(m => m.deg_rels.length);
  const usageCounts = Object.values(motifUsage);
  
  return {
    totalMotifs: motifs.length,
    avgLength: motifLengths.length > 0 ? motifLengths.reduce((a, b) => a + b, 0) / motifLengths.length : 0,
    minLength: motifLengths.length > 0 ? Math.min(...motifLengths) : 0,
    maxLength: motifLengths.length > 0 ? Math.max(...motifLengths) : 0,
    avgUsage: usageCounts.length > 0 ? usageCounts.reduce((a, b) => a + b, 0) / usageCounts.length : 0,
    minUsage: usageCounts.length > 0 ? Math.min(...usageCounts) : 0,
    maxUsage: usageCounts.length > 0 ? Math.max(...usageCounts) : 0,
    wellUsedMotifs: usageCounts.filter(count => count >= 3).length,
    motifDetails: motifs.map((motif, idx) => ({
      id: idx,
      length: motif.deg_rels.length,
      usage: motifUsage[idx] || 0,
      savings: (motif.deg_rels.length - 1) * (motifUsage[idx] || 0)
    }))
  };
}

function analyzeCompression(compressed) {
  let originalNoteCount = 0;
  let compressedItemCount = 0;
  let motifNoteCount = 0;
  let singleNoteCount = 0;
  
  for (const voice of compressed.voices) {
    compressedItemCount += voice.length;
    
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        const motifLength = compressed.motifs[item.motif_id].deg_rels.length;
        originalNoteCount += motifLength;
        motifNoteCount += motifLength;
      } else {
        originalNoteCount += 1;
        singleNoteCount += 1;
      }
    }
  }
  
  return {
    originalNoteCount,
    compressedItemCount,
    motifNoteCount,
    singleNoteCount,
    compressionRatio: compressedItemCount / originalNoteCount,
    motifCoverage: motifNoteCount / originalNoteCount,
    spaceSavings: 1 - (compressedItemCount / originalNoteCount)
  };
}

function analyzeVoices(compressed) {
  const voiceStats = compressed.voices.map((voice, idx) => {
    let motifItems = 0;
    let singleNotes = 0;
    let totalOriginalNotes = 0;
    
    for (const item of voice) {
      if (item.motif_id !== undefined) {
        motifItems++;
        totalOriginalNotes += compressed.motifs[item.motif_id].deg_rels.length;
      } else {
        singleNotes++;
        totalOriginalNotes++;
      }
    }
    
    return {
      voice: idx,
      totalItems: voice.length,
      motifItems,
      singleNotes,
      totalOriginalNotes,
      compressionRatio: voice.length / totalOriginalNotes
    };
  });
  
  return {
    voiceCount: compressed.voices.length,
    voiceStats,
    avgCompressionRatio: voiceStats.reduce((sum, v) => sum + v.compressionRatio, 0) / voiceStats.length
  };
}

function calculateEfficiencyMetrics(compressed) {
  const motifs = compressed.motifs || [];
  let totalSavings = 0;
  let potentialSavings = 0;
  
  // Calculate actual savings from motifs
  for (let i = 0; i < motifs.length; i++) {
    const motif = motifs[i];
    let usage = 0;
    
    for (const voice of compressed.voices) {
      for (const item of voice) {
        if (item.motif_id === i) {
          usage++;
        }
      }
    }
    
    if (usage > 1) {
      const actualSaving = (motif.deg_rels.length - 1) * (usage - 1);
      totalSavings += actualSaving;
      potentialSavings += motif.deg_rels.length * (usage - 1);
    }
  }
  
  return {
    totalSavings,
    potentialSavings,
    efficiency: potentialSavings > 0 ? totalSavings / potentialSavings : 0,
    avgSavingsPerMotif: motifs.length > 0 ? totalSavings / motifs.length : 0
  };
}

function printAnalysis(analysis) {
  console.log(`
📊 MOTIF DETECTION ANALYSIS REPORT
=================================

📁 File: ${analysis.file}
⏱️  Compression Time: ${analysis.compressionTimeMs}ms

🎵 MOTIF STATISTICS:
  • Total Motifs Found: ${analysis.motifs.totalMotifs}
  • Average Motif Length: ${analysis.motifs.avgLength.toFixed(1)} notes
  • Length Range: ${analysis.motifs.minLength}-${analysis.motifs.maxLength} notes
  • Average Usage: ${analysis.motifs.avgUsage.toFixed(1)} times
  • Well-Used Motifs (≥3 uses): ${analysis.motifs.wellUsedMotifs}

📦 COMPRESSION RESULTS:
  • Original Notes: ${analysis.compression.originalNoteCount}
  • Compressed Items: ${analysis.compression.compressedItemCount}
  • Compression Ratio: ${(analysis.compression.compressionRatio * 100).toFixed(1)}%
  • Space Savings: ${(analysis.compression.spaceSavings * 100).toFixed(1)}%
  • Motif Coverage: ${(analysis.compression.motifCoverage * 100).toFixed(1)}%

🎼 VOICE ANALYSIS:
  • Number of Voices: ${analysis.voices.voiceCount}
  • Average Voice Compression: ${(analysis.voices.avgCompressionRatio * 100).toFixed(1)}%

⚡ EFFICIENCY METRICS:
  • Total Savings: ${analysis.efficiency.totalSavings} notes
  • Efficiency Score: ${(analysis.efficiency.efficiency * 100).toFixed(1)}%
  • Avg Savings per Motif: ${analysis.efficiency.avgSavingsPerMotif.toFixed(1)} notes

🏆 TOP MOTIFS BY SAVINGS:`);

  // Sort motifs by savings and show top 5
  const topMotifs = analysis.motifs.motifDetails
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 5);
    
  topMotifs.forEach((motif, idx) => {
    console.log(`  ${idx + 1}. Motif #${motif.id}: ${motif.length} notes × ${motif.usage} uses = ${motif.savings} savings`);
  });
  
  console.log(`\n💡 RECOMMENDATIONS:`);
  
  if (analysis.compression.spaceSavings < 0.1) {
    console.log('  • Low compression achieved - consider adjusting motif detection parameters');
  }
  
  if (analysis.motifs.wellUsedMotifs < analysis.motifs.totalMotifs * 0.5) {
    console.log('  • Many motifs are rarely used - algorithm may be finding too many short patterns');
  }
  
  if (analysis.motifs.avgLength < 5) {
    console.log('  • Short average motif length - may benefit from favoring longer patterns');
  }
  
  if (analysis.efficiency.efficiency < 0.7) {
    console.log('  • Low efficiency score - motif selection could be optimized');
  }
  
  console.log('=================================\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node motif-analysis.js <midi-file> [output-json]');
    console.log('Example: node motif-analysis.js midi/bach-invention-13.mid output/analysis.json');
    process.exit(1);
  }
  
  const midiFile = args[0];
  const outputJson = args[1] || midiFile.replace('.mid', '-analysis.json');
  
  if (!fs.existsSync(midiFile)) {
    console.error(`Error: MIDI file not found: ${midiFile}`);
    process.exit(1);
  }
  
  analyzeMotifDetection(midiFile, outputJson);
}

module.exports = {
  analyzeMotifDetection,
  analyzeMotifs,
  analyzeCompression,
  analyzeVoices,
  calculateEfficiencyMetrics
};