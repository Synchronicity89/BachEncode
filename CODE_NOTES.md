# Engineering Notes and MVP Scope

Date: 2025-10-09

This document outlines the current guarantees, limits, and non-goals for the MVP, as well as deferred ideas for future exploration.

## MVP Support (guaranteed behavior)

- Input: multi-track MIDI with exactly one monophonic voice per track
   - No overlapping notes within a track
   - Correct key signature metadata present (MIDI meta 0x59)
- Output: modulo-12 pitch-class fidelity by default
   - Compression aborts if any non-octave (semitone) mismatches would be introduced
   - Unsafe motif references are automatically expanded back to literal notes
- Track handling:
   - Multi-track inputs are preserved as multiple voices (one voice per source track)
   - Track names are carried through when available

These constraints are the only claims for the MVP. Staying within them should yield stable roundtrips and deterministic output.

## Limited/Best-effort behavior (not MVP-guaranteed)

- Single-track inputs or tracks with overlapping notes
   - We may attempt a heuristic separation into voices, but this is not part of the MVP guarantee
   - Overlaps within a track are not supported in the MVP; results may degrade or be expanded to maintain fidelity
- Inferred local key changes
   - We infer key-change segments heuristically; this helps key selection for motif references but is not relied upon for MVP correctness

## Non-goals for MVP (deferred)

- Automatic voice separation for complex polyphony
- Overlap “layering” or multi-layer reconstruction within a single track
- Negative-delta encodings or advanced overlap semantics
- Zero-loss structural equality for arbitrary polyphonic sources

These topics are valuable for future work, but they’re out of scope for the MVP. Any references to them in earlier design notes should be considered exploratory, not committed behavior.

## Implementation highlights (current)

- Exact chromatic motif capture (midi_rels + sample_base_midi) to avoid semitone drift
- Strict key reconstruction over 24 keys with base_midi ±1 retry; approximate fallback prefers octave-only differences by default
- Modulo-12 guard and targeted safety expansion to ensure correctness by default
- Custom MIDI writer retaining PPQ/tempo and embedding metadata for stable roundtrips

## Practical guidance

- For MVP reliability, provide: multi-track, one monophonic voice per track, no overlaps, valid key signature meta
- If you have a single-track file or overlapping notes, consider preparing the MIDI to conform to the MVP constraints prior to compression

## Future considerations (if/when revisited)

- Robust voice separation with measurable accuracy and reproducibility
- Overlap-aware export/import (layering) with clear roundtrip guarantees
- Enhanced key-change modeling and diagnostics
These will be documented and reintroduced once they meet the same level of correctness and reproducibility as the MVP.

