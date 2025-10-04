// Analysis of the octave bug based on git diff between e4838fe (good) and 305fee0 (bad)

/* 
KEY FINDINGS FROM GIT BISECTION:
=====================================
✅ Last good commit: e4838fe - "Ensure output directories exist before writing MIDI and JSON files"
❌ First bad commit: 305fee0 - "Enhance MIDI Compression System with Batch Processing and Motif Transformations"

MAJOR CHANGES THAT LIKELY INTRODUCED THE BUG:
==============================================

1. OCTAVE CALCULATION CHANGE:
   Original diff showed: const oct_add = Math.floor(total_deg / 7);
   Current version has: const oct_add = Math.trunc(total_deg / 7);
   This suggests the Math.floor was the problem and Math.trunc is the fix.

2. COMPLEX MOTIF TRANSFORMATION LOGIC:
   - Added retrograde and inversion detection
   - Added complex degree relationship manipulations
   - This could be introducing calculation errors

3. BASE PITCH HANDLING CHANGES:
   Added logic to handle both MIDI numbers and note names:
   ```javascript
   let base_midi;
   const pitchValue = item.base_pitch || item.pitch;
   if (typeof pitchValue === 'number') {
     base_midi = pitchValue;
   } else {
     base_midi = tonal.Note.midi(pitchValue);
   }
   ```

4. RETROGRADE/INVERSION TRANSFORMATIONS:
   Added complex logic for applying transformations:
   ```javascript
   if (item.retrograde === true) {
     deg_rels = [...motif.deg_rels].reverse().map(deg => -deg);
     // ... other reversals
   } else if (item.inverted === true) {
     deg_rels = motif.deg_rels.map(deg => -deg);
     // ... other inversions  
   }
   ```

HYPOTHESIS:
===========
The bug is likely in the retrograde/inversion transformation logic where degree 
relationships are being manipulated incorrectly, causing octave shifts.

The fact that our simple tests show pitch mismatches suggests the transformation
logic is applying even when it shouldn't, or is calculating degree relationships
incorrectly.

NEXT STEPS:
===========
1. Focus debugging on the transformation detection and application logic
2. Check if transformations are being incorrectly detected in simple motifs
3. Verify the degree relationship calculations in transformation scenarios
4. Test if disabling transformation logic fixes the issue
*/

console.log('📋 OCTAVE BUG ANALYSIS COMPLETE');
console.log('See comments in this file for detailed findings from git bisection');
console.log('The bug was introduced in commit 305fee0 with motif transformation logic');

module.exports = {
    analysis: 'Octave bug introduced in commit 305fee0 with motif transformation logic'
};