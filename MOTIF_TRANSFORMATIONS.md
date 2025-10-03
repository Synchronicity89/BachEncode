# Motif Transformations Implementation

## Overview
This document describes the enhanced motif detection system that supports both **retrograde** and **inversion** transformations in the BachEncode MIDI compression system.

## Musical Theory Background

### Retrograde (Time Reversal)
- **Definition**: A motif played backwards in time with intervals inverted
- **Musical Effect**: Horizontal flipping + pitch inversion 
- **Interval Pattern**: Reversed order with negated intervals
- **Example**: C-D-E-D becomes D-C-B-C (reversed time + inverted intervals)

### Inversion (Pitch Inversion)
- **Definition**: A motif with inverted intervals but same time order
- **Musical Effect**: Vertical flipping only
- **Interval Pattern**: Same order with negated intervals  
- **Example**: C-D-E-D becomes C-B-A-B (same time + inverted intervals)

## Implementation Details

### New Functions Added

#### `areMotifRetrogrades(motif1, motif2)`
- Detects retrograde pairs (previously called `areMotifInversions`)
- Checks for reversed time order AND inverted intervals
- Validates matching rhythm patterns in reverse

#### `areMotifInversions(motif1, motif2)`
- Detects true inversion pairs
- Checks for same time order with inverted intervals
- Validates matching rhythm patterns in same order

### Enhanced Consolidation Logic
- Unified transformation detection system
- Maps pattern keys to transformation types: 'none', 'retrograde', 'inverted'
- Eliminates duplicate motifs by keeping one and marking usage with transformation flags

### JSON Compression Format
Motif usages are now marked with transformation flags:
```json
{
  "motif_id": 5,
  "base_pitch": "C4",
  "retrograde": true  // Applied during decompression
}
```

```json
{
  "motif_id": 8,  
  "base_pitch": "F4",
  "inverted": true   // Applied during decompression
}
```

### Decompression Logic
- **Retrograde**: Reverses and negates degree relationships, reverses all timing arrays
- **Inversion**: Negates degree relationships, preserves original timing order
- **Normal**: Uses motif exactly as stored

## Performance Results

### Bach Invention No. 13 Analysis
- **Total Motifs Found**: 216 unique patterns
- **Retrograde Pairs Detected**: 4 pairs
- **Inversion Pairs Detected**: 0 pairs (expected for Bach's style)
- **Compression Improvement**: Additional 4 motifs eliminated through transformation detection

### Detected Retrograde Pairs
1. Motif 30 ↔ Motif 176: Pattern `0,-9,-5,-9`
2. Motif 35 ↔ Motif 208: Pattern `0,-9,0,2`  
3. Motif 37 ↔ Motif 80: Pattern `0,9,0,-1`
4. Motif 191 ↔ Motif 192: Pattern `0,1,0,-9`

## Technical Implementation

### Key Code Changes
1. **Renamed Functions**: `areMotifInversions` → `areMotifRetrogrades`
2. **Added New Function**: `areMotifInversions` for true pitch inversion
3. **Enhanced Consolidation**: `keyTransformationMap` replaces `keyRetrogradeMap`
4. **Dual Flag Support**: Both `retrograde` and `inverted` flags in compression format
5. **Updated Decompression**: Handles both transformation types correctly

### Backward Compatibility
- Existing compressed files continue to work
- New format is backward compatible with older decompression code (ignores unknown flags)

## Usage Examples

### Compression
```bash
node EncodeDecode.js compress "input.mid" "output.json"
```

### Decompression  
```bash
node EncodeDecode.js decompress "output.json" "restored.mid"
```

## Musical Applications

This enhancement allows the compression system to:
- Recognize Bach's use of retrograde inversion in counterpoint
- Detect motivic transformations common in Baroque music
- Achieve better compression ratios for contrapuntal compositions
- Preserve musical structure while reducing file size

## Future Enhancements

Potential extensions to the transformation system:
- **Augmentation/Diminution**: Rhythm scaling transformations
- **Transposition**: Automatic pitch level adjustment
- **Modal Transformations**: Major/minor mode changes
- **Stretto Detection**: Overlapping motif entries
- **Canon Recognition**: Systematic imitative patterns