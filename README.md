# BachEncode

Motif-aware MIDI compression/decompression for two-track Bach inventions and similar input. The tool mines repeated motifs, encodes them structurally, and roundtrips back to MIDI while enforcing modulo-12 pitch-class fidelity.

## 🎧 Quick Listen: Original vs Motifs-Reversed MIDIs

Compare the original two-track MIDIs against versions where notes inside detected motifs are reversed. Each pair links to the original MIDI (source) and the transformed MIDI (destination), plus the JSON behind the reversal.

[Open the interactive HTML preview](preview-twoTrackMIDI.html) to play files in your browser.

- bach-No01
  - Original: twoTrackMIDISource/bach-No01.mid
  - Motifs Reversed: twoTrackMIDIDestination/bach-No01.reversed.mid
  - Reversal JSON: twoTrackMIDIDestination/bach-No01.reversed.JSON
- bach-No02
  - Original: twoTrackMIDISource/bach-No02.mid
  - Motifs Reversed: twoTrackMIDIDestination/bach-No02.reversed.mid
  - Reversal JSON: twoTrackMIDIDestination/bach-No02.reversed.JSON
- bach-No03
  - Original: twoTrackMIDISource/bach-No03.mid
  - Motifs Reversed: twoTrackMIDIDestination/bach-No03.reversed.mid
  - Reversal JSON: twoTrackMIDIDestination/bach-No03.reversed.JSON
- bach-No04
  - Original: twoTrackMIDISource/bach-No04.mid
  - Motifs Reversed: twoTrackMIDIDestination/bach-No04.reversed.mid
  - Reversal JSON: twoTrackMIDIDestination/bach-No04.reversed.JSON
- bach-No12
  - Original: twoTrackMIDISource/bach-No12.mid
  - Motifs Reversed: twoTrackMIDIDestination/bach-No12.reversed.mid
  - Reversal JSON: twoTrackMIDIDestination/bach-No12.reversed.JSON

Tip: Most Git hosting UIs will let you click and play .mid files directly in the browser. If not, download them or drag the links into a DAW.

## What it does (capabilities)

- MIDI → JSON compression and JSON → MIDI decompression.
- Voice handling:
  - Two-track inputs are preserved as two voices (one voice per track).
  - Single-track inputs are heuristically split into voices and can be reconstructed using embedded metadata.
- Motif mining and reuse:
  - Detects repeated subsequences (motifs) using diatonic structure and stores exact chromatic deltas (midi_rels) plus rhythmic shape.
  - Annotates each motif reference with a key choice (strict search over 24 keys with base_midi ±1 retries; approximate fallback prefers octave errors by default).
  - Safety expansion: any motif reference that would introduce non-octave (semitone) mismatches is expanded back to its literal notes automatically to preserve fidelity.
- Modulo-12 validation (MVP guarantee):
  - After compression, the encoded-with-motifs form is decoded and compared against a motifless baseline modulo 12; compression aborts on any semitone mismatches.
  - A concise summary line is printed and a sidecar summary JSON is written next to the output file.
- Deterministic MIDI writer:
  - Custom SMF writer preserves PPQ, tempo, velocity, and tick timings for stable roundtrips.

Notes and caveats (verified):
- Modulo-12 fidelity is enforced by default. No flags are required; safety expansion automatically prevents any non-octave (semitone) pitch errors.
- Optional CLI switches exist for diagnostics only (e.g., --prefer-semitone, --debug-key-selection). They do not disable the modulo-12 check.
- Batch decompression ignores the sidecar summary files (*.summary.json) that are written next to compressed outputs.

## Input MIDI requirements

For best results (and to meet the MVP constraints), input MIDI should satisfy:
- Two tracks total (typical for Bach inventions):
  - Exactly one monophonic voice per track (no overlapping notes within a track).
- Key signature metadata present (MIDI meta 0x59) to anchor key detection; additional local key changes are inferred heuristically.
- Reasonable PPQ and properly paired note-on/off events (well-formed SMF).

Notes:
- Single-track files are supported; the tool will heuristically separate voices and embed metadata to reconstruct the same segmentation on decompression. However, the MVP constraint above (two monophonic tracks) provides the clearest results today.
- If any motif reference cannot maintain modulo-12 equivalence, it is safely expanded back to literals, and compression still succeeds.

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/bach-encode.git
cd bach-encode
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Single File Processing

#### Compress MIDI to JSON
```bash
node EncodeDecode.js compress input.mid output.json
```

#### Decompress JSON to MIDI
```bash
node EncodeDecode.js decompress input.json output.midi
```

#### Roundtrip with modulo-12 fidelity (default)
Compression enforces modulo-12 equivalence and will abort on any semitone mismatches. If compression completes, decompression will produce a modulo-12–equivalent MIDI. One-line roundtrip (PowerShell-friendly):

```powershell
# Replace paths as needed
node EncodeDecode.js compress input.mid output.json; node EncodeDecode.js decompress output.json output.mid
```

#### Using npm scripts
```bash
# Compress
npm run compress input.mid output.json

# Decompress
npm run decompress input.json output.midi
```

### Batch Processing

The `BatchProcess.js` utility allows you to process entire directories of files at once.

#### Batch Compress (MIDI → JSON)
```bash
# Compress all .MID files from source directory to destination directory
node BatchProcess.js compress /path/to/midi/files /path/to/output/directory

# Example: Compress files from 'midi' folder to 'compressed' folder
node BatchProcess.js compress midi compressed
```

#### Batch Decompress (JSON → MIDI)
```bash
# Decompress all .json files from source directory to destination directory
node BatchProcess.js decompress /path/to/json/files /path/to/output/directory

# Example: Decompress files from 'json_files' folder to 'restored_midi' folder
node BatchProcess.js decompress json_files restored_midi
```

#### Overwrite Protection
By default, BatchProcess will overwrite existing files. Use the `--no-overwrite` flag to skip existing files:

```bash
# Skip files that already exist in the output directory
node BatchProcess.js compress midi_files output --no-overwrite
node BatchProcess.js decompress json_files midi_output --no-overwrite
```

#### Batch Processing Features
- **Flexible Directories**: Use any folder names - no "midi" folder requirement
- **Progress Tracking**: See real-time progress and completion statistics
- **Error Handling**: Continue processing even if individual files fail
- **Overwrite Control**: Choose whether to overwrite existing files
- **Summary Reports**: Get detailed statistics when processing completes

For detailed batch processing documentation, see [BATCH_PROCESSING.md](BATCH_PROCESSING.md).

### Roundtrip sanity script (optional)

A small PowerShell helper is available to run a compress → decompress roundtrip and surface KeyStrict logs:

```powershell
scripts/roundtrip-mod12.ps1 -InputMidi midi/bach_BWV785_TwoTracks.mid -OutputMid output/BWV785-roundtrip.mid
```

## How It Works

1. **MIDI Parsing**: Reads MIDI files and extracts note events, timing, tempo, and key signature when present.
2. **Voice Separation**: Two-track inputs map to two voices; otherwise notes are separated heuristically into voices.
3. **Motif Mining**: Finds repeated structural patterns; stores diatonic relations, exact chromatic offsets (midi_rels), durations, deltas, and velocities.
4. **Key Annotation**: For each motif reference, exhaustively searches 24 keys (with base_midi ±1) to match original pitches; falls back to an approximate choice with octave preference when needed.
5. **Safety Expansion**: If a reference would introduce semitone mismatches, it is expanded to literal notes.
6. **Delta Encoding & JSON Output**: Stores timing as deltas and writes a structured, editable JSON representation.

## JSON Format

The compressed format includes:
```json
{
  "ppq": 480,
  "tempo": 120,
  "voices": [
    [
      {
        "delta": 0,
        "pitch": "C4",
        "dur": 480,
        "vel": 80
      }
    ]
  ]
}
```

- `ppq`: Pulses per quarter note (timing resolution)
- `tempo`: Beats per minute
- `voices`: Array of voice tracks
- `delta`: Time offset from previous event
- `pitch`: Note name (e.g., "C4", "F#5")
- `dur`: Note duration in ticks
- `vel`: MIDI velocity (0-127)

## Examples

### Single File Examples
See the `examples/` directory for sample MIDI files and their compressed JSON counterparts.

### Batch Processing Examples

```bash
# Process Bach inventions from midi folder
node BatchProcess.js compress midi output

# Restore all compressed files with overwrite protection
node BatchProcess.js decompress compressed_files restored_midi --no-overwrite

# Process files from any directory structure
node BatchProcess.js compress /Users/musician/compositions /Users/musician/compressed
```

Example output:
```
🎵 Starting batch compression...
📁 Source: test_input (2 files found)
📁 Destination: test_output

Processing BWV772.MID... ✅ Success
Processing BWV773.MID... ✅ Success

=== COMPRESSION SUMMARY ===
Total files found: 2
Successful: 2
Failed: 0
Skipped: 0
```

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

## Dependencies

- Runtime:
  - midi-parser-js: MIDI file parsing
  - @tonaljs/tonal: Music theory utilities for notes/keys
  - Custom MIDI writer (internal) for precise SMF output
- Dev/test:
  - jest, eslint, prettier
  - midi-writer-js (only used in some legacy tests; not used at runtime)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Files

- **`EncodeDecode.js`**: Core compression/decompression engine for single files
- **`BatchProcess.js`**: Batch processing utility for directories
- **`motif-analysis.js`**: Motif detection and analysis tools
- **`reverse-motifs.js`**: Motif inversion and transformation utilities
- **`BATCH_PROCESSING.md`**: Detailed batch processing documentation
- **`MOTIF_TESTING.md`**: Motif analysis feature documentation

## Roadmap

- [ ] Support for multiple tracks
- [ ] Chord detection and encoding
- [ ] Time signature preservation
- [ ] Key signature analysis
- [ ] Advanced voice separation algorithms
- [ ] Web interface for batch processing
- [ ] Real-time MIDI compression streaming