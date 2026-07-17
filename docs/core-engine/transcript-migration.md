# Transcript & SaveLoad Consolidation — Migration Guide

**Work Item:** CG-0MP12WI75001L9P4
**Date:** 2026-05-24

## Summary

All transcript-related functionality has been consolidated into a single
sub-module at `src/core-engine/transcript/`. The original top-level files
(`TranscriptRecorder.ts`, `TranscriptStore.ts`, `TranscriptTypes.ts`,
`autoSaveTranscript.ts`) remain as backward-compatible re-exports so that
existing imports continue to work without changes.

## What Changed

### New canonical location

All transcript exports are now available from `src/core-engine/transcript/`:

```
src/core-engine/transcript/
├── index.ts                  # Barrel file (canonical import target)
├── TranscriptRecorder.ts     # TranscriptRecorderBase, BaseTranscript
├── TranscriptStore.ts        # TranscriptStore, StoredTranscript, TranscriptStoreOptions
├── TranscriptTypes.ts        # CardSnapshot, snapshotCard()
└── autoSaveTranscript.ts     # autoSaveTranscript()
```

### Backward compatibility

The legacy top-level files now re-export from the consolidated location:

| Legacy path | Re-exports from |
|---|---|
| `src/core-engine/TranscriptRecorder.ts` | `./transcript/TranscriptRecorder.ts` |
| `src/core-engine/TranscriptStore.ts` | `./transcript/TranscriptStore.ts` |
| `src/core-engine/TranscriptTypes.ts` | `./transcript/TranscriptTypes.ts` |
| `src/core-engine/autoSaveTranscript.ts` | `./transcript/autoSaveTranscript.ts` |

The core-engine barrel (`src/core-engine/index.ts`) also exports everything
from the consolidated transcript barrel, so `import { ... } from '@core-engine'`
continues to work.

## Migration

### No action required (recommended for now)

Existing imports will continue to work without any changes. The re-export
shims ensure full backward compatibility.

### Optional: update to the consolidated import (new code)

When adding new code or refactoring, prefer the consolidated import:

**Before (old per-file imports):**

```ts
import { TranscriptRecorderBase, type BaseTranscript } from '../../src/core-engine/TranscriptRecorder';
import { TranscriptStore, type StoredTranscript } from '../../src/core-engine/TranscriptStore';
import { autoSaveTranscript } from '../../src/core-engine/autoSaveTranscript';
import { CardSnapshot, snapshotCard } from '../../src/core-engine/TranscriptTypes';
```

**After (consolidated import):**

```ts
import {
  TranscriptRecorderBase,
  BaseTranscript,
  TranscriptStore,
  StoredTranscript,
  TranscriptStoreOptions,
  autoSaveTranscript,
  CardSnapshot,
  snapshotCard,
} from '@core-engine/transcript';
```

Or via relative path:

```ts
import {
  TranscriptRecorderBase,
  TranscriptStore,
  autoSaveTranscript,
  snapshotCard,
} from '../../../src/core-engine/transcript';
```

### Via the core-engine barrel

The consolidated exports are also available through the main barrel:

```ts
import {
  TranscriptRecorderBase,
  TranscriptStore,
  autoSaveTranscript,
  snapshotCard,
  BaseTranscript,
  CardSnapshot,
  StoredTranscript,
  TranscriptStoreOptions,
} from '@core-engine';
```

## Main Street Integration

Main Street now uses `autoSaveTranscript` from the consolidated module.
When a game ends, the transcript is automatically finalized and persisted
to browser storage (IndexedDB with localStorage fallback).

This was added in `MainStreetTurnController.ts`:

```ts
import { finalizeMainStreetTranscript } from '../MainStreetTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';

// In the game-end branch:
const transcript = finalizeMainStreetTranscript({
  gameResult: result.gameResult,
  finalScore: result.finalScore,
});
if (transcript) {
  const transcriptStore = new TranscriptStore();
  autoSaveTranscript(transcriptStore, 'main-street', transcript, '[MainStreet]');
}
```

Two new helper functions were added to `MainStreetTranscript.ts`:

- `finalizeMainStreetTranscript(result)` — finalizes the global recorder's
  transcript and returns it (or null if no recorder is set).
- `getMainStreetTranscript()` — returns the current (possibly un-finalized)
  transcript from the global recorder.

## API Stability

No public APIs were renamed or removed. All existing imports continue to work.
The only change is the addition of the consolidated `transcript/` sub-module.

## Tests

- All existing tests continue to pass (the re-export shims preserve behavior).
- A new integration test was added:
  `tests/main-street/transcript-autosave.integration.test.ts`
  This exercises autosave, save/load round-trips, and the consolidated barrel.
