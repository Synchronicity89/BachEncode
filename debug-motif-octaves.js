const fs = require('fs');

console.log('=== MOTIF OCTAVE DEBUG ===');

// Read the compressed JSON to see what motifs were created
const jsonPath = 'output/06Christus-octave-test.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Compression info:');
console.log(`PPQ: ${data.ppq}`);
console.log(`Tempo: ${data.tempo}`);
console.log(`Key: ${data.key.tonic} ${data.key.mode}`);
console.log(`Number of motifs: ${data.motifs.length}`);
console.log(`Number of voices: ${data.voices.length}`);

// Show the motifs
console.log('\nMotifs found:');
data.motifs.forEach((motif, i) => {
  console.log(`\nMotif ${i}:`);
  console.log(`  deg_rels: [${motif.deg_rels.join(', ')}]`);
  console.log(`  accs: [${motif.accs.join(', ')}]`);
  console.log(`  deltas: [${motif.deltas.join(', ')}]`);
  console.log(`  durs: [${motif.durs.join(', ')}]`);
  console.log(`  vels: [${motif.vels.join(', ')}]`);
});

// Show voice structure
console.log('\nVoice structure:');
data.voices.forEach((voice, i) => {
  console.log(`\nVoice ${i}: ${voice.length} items`);
  voice.forEach((item, j) => {
    if (item.motif_id !== undefined) {
      console.log(`  [${j}] Motif ${item.motif_id}, base_pitch: ${item.base_pitch || item.pitch}, start: ${item.start}`);
    } else {
      console.log(`  [${j}] Single note: ${item.pitch}, delta: ${item.delta}, dur: ${item.dur}, vel: ${item.vel}`);
    }
  });
});

// Try to manually decode a problematic motif
console.log('\n=== MANUAL MOTIF DECODE TEST ===');

const tonal = require('@tonaljs/tonal');

function manualDecodeMotif(motifIndex, basePitch, key) {
  const motif = data.motifs[motifIndex];
  if (!motif) {
    console.log(`Motif ${motifIndex} not found`);
    return;
  }
  
  console.log(`\nDecoding Motif ${motifIndex} with base_pitch ${basePitch}:`);
  console.log(`  Motif deg_rels: [${motif.deg_rels.join(', ')}]`);
  
  const tonic_pc = tonal.Note.midi(key.tonic + '4') % 12;
  const mode = key.mode;
  const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
  
  // Handle base pitch
  let base_midi;
  if (typeof basePitch === 'number') {
    base_midi = basePitch;
  } else {
    base_midi = tonal.Note.midi(basePitch);
  }
  
  console.log(`  Base MIDI: ${base_midi} (${tonal.Note.fromMidi(base_midi)})`);
  
  // Apply pitchToDiatonic to base pitch
  function pitchToDiatonic(midi, tonic_pc, mode) {
    const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
    const pc = midi % 12;
    const oct = Math.floor(midi / 12) - 1; // Fixed version
    let best_deg = 0;
    let best_acc = 0;
    let best_dist = Infinity;

    for (let d = -14; d <= 21; d++) {
      const d_mod = ((d % 7) + 7) % 7;
      let exp_pc = (tonic_pc + scale_offsets[d_mod]) % 12;
      let acc = pc - exp_pc;
      if (acc < -6) acc += 12;
      else if (acc > 5) acc -= 12;
      if (Math.abs(acc) > 2) continue;
      const dist = Math.abs(acc);
      if (dist < best_dist || (dist === best_dist && Math.abs(d) < Math.abs(best_deg))) {
        best_dist = dist;
        best_acc = acc;
        best_deg = d;
      }
    }

    return { degree: best_deg, acc: best_acc, oct: oct };
  }
  
  const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
  console.log(`  Base diatonic: degree=${base_diatonic.degree}, acc=${base_diatonic.acc}, oct=${base_diatonic.oct}`);
  
  // Decode each note in the motif
  console.log(`  Decoded notes:`);
  for (let j = 0; j < motif.deg_rels.length; j++) {
    const total_deg = base_diatonic.degree + motif.deg_rels[j];
    const deg_mod = ((total_deg % 7) + 7) % 7;
    const oct_add = Math.floor(total_deg / 7);
    let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
    let pc = (exp_pc + motif.accs[j]) % 12;
    if (pc < 0) pc += 12;
    const oct = base_diatonic.oct + oct_add;
    const p = pc + oct * 12;
    
    console.log(`    [${j}] deg_rel=${motif.deg_rels[j]}, total_deg=${total_deg}, oct_add=${oct_add}, final_oct=${oct}, pitch=${p} (${tonal.Note.fromMidi(p)})`);
  }
}

// Test some motifs that appear in the voices
for (let voiceIndex = 0; voiceIndex < data.voices.length; voiceIndex++) {
  const voice = data.voices[voiceIndex];
  for (let itemIndex = 0; itemIndex < Math.min(3, voice.length); itemIndex++) {
    const item = voice[itemIndex];
    if (item.motif_id !== undefined) {
      manualDecodeMotif(item.motif_id, item.base_pitch || item.pitch, data.key);
      break; // Just test the first motif in each voice
    }
  }
}