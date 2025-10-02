# Example Files

This directory contains sample MIDI files and their compressed JSON representations to demonstrate the BachEncode tool.

## Files

### simple-melody.json
A basic two-voice example showing:
- Voice 1: Simple melodic line (C4-D4-E4-F4)
- Voice 2: Bass accompaniment (G3-C3)
- Demonstrates delta timing and voice separation

### Usage

To test the decompression:
```bash
node ../EncodeDecode.js decompress simple-melody.json simple-melody.midi
```

To test compression (if you have a MIDI file):
```bash
node ../EncodeDecode.js compress your-file.midi output.json
```

## Creating Your Own Examples

1. Use any MIDI sequencer to create a simple MIDI file
2. Compress it with BachEncode: `node EncodeDecode.js compress input.midi output.json`
3. Edit the JSON manually if needed
4. Decompress back to MIDI: `node EncodeDecode.js decompress output.json result.midi`

This workflow allows you to:
- Inspect the voice separation algorithm results
- Manually adjust timing or pitches in JSON format
- Create programmatically generated music