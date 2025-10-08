Baseline degradation snapshot (2025-10-07)

Source commit: (manual revert to snapshot EncodeDecode-950271d baseline + helper restoration)

Artifacts copied from tests/test-output/roundtrip after running motifless roundtrip test:
- bwv785_roundtrip_original.json (NOT COPIED due to size; refer to test-output directory)
- bwv785_roundtrip_recompressed.json (NOT COPIED due to size; refer to test-output directory)
- bwv785_roundtrip_diffs.txt (first 200 diffs, cap reached)
- bwv785_roundtrip_pitch_analysis.txt (if present)

Reason for not copying large JSON files: reduce repository churn; they are reproducible via:
  npm test --silent -- BWV785MotiflessRoundTrip

Summary:
- 200 diffs (cap) including voice count mismatch (7 vs 6) and numerous pitch/delta/duration divergences.
- Indicates current baseline is far from zero-loss; layering & multi-track preservation previously eliminated pitch diffs but code was reverted.

Next steps (tracked in TODO):
1. Re-document layering/export strategy.
2. Reintroduce clean multi-track export (no layering) to restore pitch fidelity.
3. Add optional overlap layering to fix sustained duration truncation.
4. Implement import-time merging of layering tracks and validate zero-diff motifless roundtrip.
