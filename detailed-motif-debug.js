const fs = require('fs');
const path = require('path');
const { compressMidiToJson, decompressMidiFromJson } = require('./EncodeDecode');

// Test with a simple file
const testFile = '06Christus';
const originalMidi = path.join('./midi', testFile + '.mid');
const compressedJson = path.join('./output', testFile + '.json');

console.log('=== DETAILED MOTIF DEBUG ===');
console.log(`Testing file: ${testFile}`);

// First, let's examine the compressed JSON to see the motif data
try {
    const jsonData = JSON.parse(fs.readFileSync(compressedJson, 'utf8'));
    
    console.log('\n--- Compressed Data Structure ---');
    console.log(`PPQ: ${jsonData.ppq}`);
    console.log(`Key: ${JSON.stringify(jsonData.key)}`);
    console.log(`Motifs count: ${jsonData.motifs ? jsonData.motifs.length : 0}`);
    console.log(`Voices count: ${jsonData.voices ? jsonData.voices.length : 0}`);
    
    if (jsonData.motifs && jsonData.motifs.length > 0) {
        console.log('\n--- First Few Motifs ---');
        for (let i = 0; i < Math.min(3, jsonData.motifs.length); i++) {
            const motif = jsonData.motifs[i];
            console.log(`Motif ${i}:`);
            console.log(`  deg_rels: [${motif.deg_rels.join(', ')}]`);
            console.log(`  accs: [${motif.accs.join(', ')}]`);
            console.log(`  deltas: [${motif.deltas.join(', ')}]`);
            console.log(`  durs: [${motif.durs.join(', ')}]`);
            console.log(`  vels: [${motif.vels.join(', ')}]`);
        }
    }
    
    // Look at the first voice to see motif usage
    if (jsonData.voices && jsonData.voices.length > 0) {
        console.log('\n--- First Voice (first 5 items) ---');
        const firstVoice = jsonData.voices[0];
        for (let i = 0; i < Math.min(5, firstVoice.length); i++) {
            const item = firstVoice[i];
            console.log(`Item ${i}:`, JSON.stringify(item));
            
            if (item.motif_id !== undefined) {
                console.log(`  -> This is a motif reference (ID: ${item.motif_id})`);
                console.log(`  -> base_pitch: ${item.base_pitch} (type: ${typeof item.base_pitch})`);
                if (jsonData.motifs && jsonData.motifs[item.motif_id]) {
                    const motif = jsonData.motifs[item.motif_id];
                    console.log(`  -> Motif deg_rels: [${motif.deg_rels.join(', ')}]`);
                }
            }
        }
    }
    
} catch (error) {
    console.error(`Error reading compressed file: ${error.message}`);
}

// Now let's create a test function to debug the motif decoding process
function debugMotifDecoding() {
    try {
        console.log('\n=== DEBUGGING MOTIF DECODING ===');
        
        // Load the JSON data
        const jsonData = JSON.parse(fs.readFileSync(compressedJson, 'utf8'));
        
        // Manual decoding with debug output
        const tonic_pc = require('tonal').Note.midi(jsonData.key.tonic + '4') % 12;
        const mode = jsonData.key.mode;
        const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
        
        console.log(`Key: ${jsonData.key.tonic} ${mode}`);
        console.log(`Tonic PC: ${tonic_pc}`);
        console.log(`Scale offsets: [${scale_offsets.join(', ')}]`);
        
        // Look at the first motif usage in the first voice
        const firstVoice = jsonData.voices[0];
        let motifFound = false;
        
        for (let i = 0; i < firstVoice.length && !motifFound; i++) {
            const item = firstVoice[i];
            if (item.motif_id !== undefined) {
                motifFound = true;
                console.log(`\n--- Processing Motif at position ${i} ---`);
                console.log(`Motif ID: ${item.motif_id}`);
                console.log(`Base pitch: ${item.base_pitch} (type: ${typeof item.base_pitch})`);
                
                const motif = jsonData.motifs[item.motif_id];
                console.log(`Motif deg_rels: [${motif.deg_rels.join(', ')}]`);
                console.log(`Motif accs: [${motif.accs.join(', ')}]`);
                
                // Manual base_diatonic calculation
                const base_midi = item.base_pitch;
                console.log(`Base MIDI: ${base_midi}`);
                
                // Use the pitchToDiatonic function 
                const tonal = require('@tonaljs/tonal');
                function pitchToDiatonic(midi, tonic_pc, mode) {
                    const pc = midi % 12;
                    const oct = Math.floor(midi / 12) - 1; // This is where we fixed the octave calculation
                    const scale_offsets = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
                    const abs_scale = scale_offsets.map(off => (tonic_pc + off) % 12);
                    let best_idx = 0;
                    let best_acc = pc - abs_scale[0];
                    if (best_acc > 6) best_acc -= 12;
                    if (best_acc < -6) best_acc += 12;
                    for (let i = 1; i < abs_scale.length; i++) {
                        let acc = pc - abs_scale[i];
                        if (acc > 6) acc -= 12;
                        if (acc < -6) acc += 12;
                        if (Math.abs(acc) < Math.abs(best_acc)) {
                            best_idx = i;
                            best_acc = acc;
                        }
                    }
                    return { degree: best_idx, oct: oct, acc: best_acc };
                }
                
                const base_diatonic = pitchToDiatonic(base_midi, tonic_pc, mode);
                console.log(`Base diatonic: degree=${base_diatonic.degree}, oct=${base_diatonic.oct}, acc=${base_diatonic.acc}`);
                
                // Calculate the first few notes from the motif
                console.log('\n--- Calculating motif notes ---');
                for (let j = 0; j < Math.min(3, motif.deg_rels.length); j++) {
                    const total_deg = base_diatonic.degree + motif.deg_rels[j];
                    const deg_mod = ((total_deg % 7) + 7) % 7;
                    const oct_add = Math.trunc(total_deg / 7); // Our octave fix
                    let exp_pc = (tonic_pc + scale_offsets[deg_mod]) % 12;
                    let pc = (exp_pc + motif.accs[j]) % 12;
                    if (pc < 0) pc += 12;
                    const oct = base_diatonic.oct + oct_add;
                    const p = pc + oct * 12;
                    
                    console.log(`  Note ${j}:`);
                    console.log(`    deg_rel: ${motif.deg_rels[j]}`);
                    console.log(`    total_deg: ${total_deg}`);
                    console.log(`    deg_mod: ${deg_mod}`);
                    console.log(`    oct_add: ${oct_add}`);
                    console.log(`    exp_pc: ${exp_pc}`);
                    console.log(`    acc: ${motif.accs[j]}`);
                    console.log(`    pc: ${pc}`);
                    console.log(`    oct: ${oct}`);
                    console.log(`    final pitch: ${p}`);
                }
            }
        }
        
        if (!motifFound) {
            console.log('No motifs found in first voice');
        }
        
    } catch (error) {
        console.error(`Error in motif debugging: ${error.message}`);
    }
}

debugMotifDecoding();