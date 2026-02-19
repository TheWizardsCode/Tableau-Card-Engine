/**
 * TranscriptStore -- browser-based persistence for game transcripts.
 *
 * Saves transcripts to IndexedDB (preferred) with a localStorage
 * fallback. Maintains a rolling window of the most recent transcripts
 * per game type to prevent unbounded storage growth.
 *
 * This module is game-agnostic: it stores arbitrary JSON-serializable
 * transcript objects keyed by game type.
 */

// ── Types ──────────────────────────────────────────────────

/** Metadata wrapper stored alongside each transcript. */
export interface StoredTranscript<T = unknown> {
  /** Unique ID for this stored transcript. */
  id: string;
  /** Game type identifier (e.g. 'golf', 'beleaguered-castle'). */
  gameType: string;
  /** ISO 8601 timestamp when the transcript was saved. */
  savedAt: string;
  /** Monotonic sequence number for stable ordering (higher = newer). */
  seq: number;
  /** The full transcript data. */
  transcript: T;
}

/** Options for configuring the TranscriptStore. */
export interface TranscriptStoreOptions {
  /** Maximum number of transcripts to retain per game type. Defaults to 10. */
  maxPerGame?: number;
  /** IndexedDB database name. Defaults to 'transcript-store'. */
  dbName?: string;
  /** IndexedDB object store name. Defaults to 'transcripts'. */
  storeName?: string;
  /** localStorage key prefix. Defaults to 'tce-transcripts'. */
  localStoragePrefix?: string;
}

// ── Constants ──────────────────────────────────────────────

const DEFAULT_MAX_PER_GAME = 10;
const DEFAULT_DB_NAME = 'transcript-store';
const DEFAULT_STORE_NAME = 'transcripts';
const DEFAULT_LS_PREFIX = 'tce-transcripts';

// ── Storage backend interface ──────────────────────────────

interface StorageBackend {
  save(entry: StoredTranscript): Promise<void>;
  list(gameType: string): Promise<StoredTranscript[]>;
  get(id: string): Promise<StoredTranscript | null>;
  remove(id: string): Promise<void>;
  clear(gameType?: string): Promise<void>;
  readonly name: string;
}

// ── IndexedDB backend ──────────────────────────────────────

class IndexedDBBackend implements StorageBackend {
  readonly name = 'IndexedDB';
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string,
    private readonly storeName: string,
  ) {}

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('gameType', 'gameType', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
          store.createIndex('gameType_savedAt', ['gameType', 'savedAt'], { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async save(entry: StoredTranscript): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(gameType: string): Promise<StoredTranscript[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const index = tx.objectStore(this.storeName).index('gameType');
      const request = index.getAll(gameType);
      request.onsuccess = () => {
        const results = request.result as StoredTranscript[];
        // Sort by seq descending (newest first); stable even when timestamps collide
        results.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<StoredTranscript | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(gameType?: string): Promise<void> {
    const db = await this.openDB();
    if (!gameType) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // Clear only entries for a specific game type
    const entries = await this.list(gameType);
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    for (const entry of entries) {
      store.delete(entry.id);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ── localStorage backend ───────────────────────────────────

class LocalStorageBackend implements StorageBackend {
  readonly name = 'localStorage';

  constructor(private readonly prefix: string) {}

  private indexKey(): string {
    return `${this.prefix}:index`;
  }

  private entryKey(id: string): string {
    return `${this.prefix}:entry:${id}`;
  }

  private getIndex(): string[] {
    try {
      const raw = localStorage.getItem(this.indexKey());
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private setIndex(ids: string[]): void {
    localStorage.setItem(this.indexKey(), JSON.stringify(ids));
  }

  async save(entry: StoredTranscript): Promise<void> {
    const data = JSON.stringify(entry);
    const estimatedSize = data.length * 2; // rough UTF-16 size
    if (estimatedSize > 1_000_000) {
      console.warn(
        `[TranscriptStore] Large transcript (${Math.round(estimatedSize / 1024)}KB) may exceed localStorage limits`,
      );
    }

    try {
      localStorage.setItem(this.entryKey(entry.id), data);
      const index = this.getIndex();
      if (!index.includes(entry.id)) {
        index.push(entry.id);
        this.setIndex(index);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.error('[TranscriptStore] localStorage quota exceeded. Cannot save transcript.');
      }
      throw e;
    }
  }

  async list(gameType: string): Promise<StoredTranscript[]> {
    const index = this.getIndex();
    const results: StoredTranscript[] = [];

    for (const id of index) {
      const entry = await this.get(id);
      if (entry && entry.gameType === gameType) {
        results.push(entry);
      }
    }

    // Sort by seq descending (newest first); stable even when timestamps collide
    results.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
    return results;
  }

  async get(id: string): Promise<StoredTranscript | null> {
    try {
      const raw = localStorage.getItem(this.entryKey(id));
      return raw ? (JSON.parse(raw) as StoredTranscript) : null;
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(this.entryKey(id));
    const index = this.getIndex().filter((i) => i !== id);
    this.setIndex(index);
  }

  async clear(gameType?: string): Promise<void> {
    if (!gameType) {
      // Remove all entries
      const index = this.getIndex();
      for (const id of index) {
        localStorage.removeItem(this.entryKey(id));
      }
      localStorage.removeItem(this.indexKey());
      return;
    }

    // Remove entries for a specific game type
    const entries = await this.list(gameType);
    for (const entry of entries) {
      await this.remove(entry.id);
    }
  }
}

// ── TranscriptStore ────────────────────────────────────────

/**
 * Browser-based transcript persistence with rolling window eviction.
 *
 * Uses IndexedDB when available, falls back to localStorage.
 * Maintains at most `maxPerGame` transcripts per game type,
 * evicting the oldest when the limit is exceeded.
 *
 * Usage:
 *   const store = new TranscriptStore();
 *   await store.save('golf', transcript);
 *   const recent = await store.list('golf');
 */
export class TranscriptStore {
  private backend: StorageBackend | null = null;
  private readonly maxPerGame: number;
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly localStoragePrefix: string;
  private initPromise: Promise<void> | null = null;
  private seqCounter: number = 0;

  constructor(options: TranscriptStoreOptions = {}) {
    this.maxPerGame = options.maxPerGame ?? DEFAULT_MAX_PER_GAME;
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.localStoragePrefix = options.localStoragePrefix ?? DEFAULT_LS_PREFIX;
  }

  /**
   * Initialize the store backend. Called automatically on first operation.
   * Safe to call multiple times (idempotent).
   */
  private init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Try IndexedDB first
      if (typeof indexedDB !== 'undefined') {
        try {
          const backend = new IndexedDBBackend(this.dbName, this.storeName);
          // Probe: try opening the database to verify it works
          await backend.list('__probe__');
          this.backend = backend;
          return;
        } catch (e) {
          console.warn(
            '[TranscriptStore] IndexedDB unavailable, falling back to localStorage:',
            e,
          );
        }
      }

      // Try localStorage
      if (typeof localStorage !== 'undefined') {
        try {
          // Probe: try a write/read/delete cycle
          const probeKey = `${this.localStoragePrefix}:__probe__`;
          localStorage.setItem(probeKey, '1');
          localStorage.removeItem(probeKey);
          this.backend = new LocalStorageBackend(this.localStoragePrefix);
          console.warn(
            '[TranscriptStore] Using localStorage fallback. Large transcripts may exceed storage limits.',
          );
          return;
        } catch (e) {
          console.warn('[TranscriptStore] localStorage unavailable:', e);
        }
      }

      // Neither available
      console.warn(
        '[TranscriptStore] No storage backend available. Transcripts will not be persisted.',
      );
    })();

    return this.initPromise;
  }

  /** Generate a unique ID for a stored transcript. */
  private generateId(gameType: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${gameType}-${timestamp}-${random}`;
  }

  /**
   * Save a transcript, enforcing the rolling window limit.
   *
   * @param gameType - Game identifier (e.g. 'golf')
   * @param transcript - The transcript data to store
   * @returns The stored transcript wrapper, or null if storage is unavailable
   */
  async save<T>(gameType: string, transcript: T): Promise<StoredTranscript<T> | null> {
    await this.init();
    if (!this.backend) return null;

    const entry: StoredTranscript<T> = {
      id: this.generateId(gameType),
      gameType,
      savedAt: new Date().toISOString(),
      seq: this.seqCounter++,
      transcript,
    };

    await this.backend.save(entry as StoredTranscript);

    // Enforce rolling window: evict oldest if over limit
    await this.evict(gameType);

    return entry;
  }

  /**
   * List all stored transcripts for a game type, newest first.
   */
  async list<T = unknown>(gameType: string): Promise<StoredTranscript<T>[]> {
    await this.init();
    if (!this.backend) return [];
    return (await this.backend.list(gameType)) as StoredTranscript<T>[];
  }

  /**
   * Retrieve a specific transcript by ID.
   */
  async get<T = unknown>(id: string): Promise<StoredTranscript<T> | null> {
    await this.init();
    if (!this.backend) return null;
    return (await this.backend.get(id)) as StoredTranscript<T> | null;
  }

  /**
   * Remove a specific transcript by ID.
   */
  async remove(id: string): Promise<void> {
    await this.init();
    if (!this.backend) return;
    await this.backend.remove(id);
  }

  /**
   * Clear all transcripts, optionally for a specific game type.
   */
  async clear(gameType?: string): Promise<void> {
    await this.init();
    if (!this.backend) return;
    await this.backend.clear(gameType);
  }

  /**
   * Get the name of the active storage backend.
   * Returns null if no backend is available.
   */
  async getBackendName(): Promise<string | null> {
    await this.init();
    return this.backend?.name ?? null;
  }

  /**
   * Evict oldest transcripts if the count exceeds maxPerGame.
   */
  private async evict(gameType: string): Promise<void> {
    if (!this.backend) return;

    const entries = await this.backend.list(gameType);
    // entries are sorted newest-first; remove from the end (oldest)
    while (entries.length > this.maxPerGame) {
      const oldest = entries.pop()!;
      await this.backend.remove(oldest.id);
    }
  }
}
