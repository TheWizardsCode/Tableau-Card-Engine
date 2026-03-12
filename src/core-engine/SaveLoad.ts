/**
 * Save/Load infrastructure for versioned game-state persistence.
 *
 * Persists versioned payloads to IndexedDB (preferred) with a localStorage
 * fallback. Supports separate save domains for run checkpoints and campaign
 * progression data.
 *
 * ## Design Notes for M6 Extraction
 *
 * This module is designed to be fully game-agnostic. The `SaveSerializer<TState, TSerialized>`
 * interface parameterizes over both the in-memory state type and the serialized
 * wire format, allowing any game to plug in its own serializer with schema
 * versioning. The `SaveLoadStore` class handles all storage backend concerns
 * (IndexedDB with localStorage fallback, domain separation, slot management).
 *
 * At M6, this module should be published as part of the `@core-engine` package
 * without modification. Game-specific code (e.g., `MainStreetSaveLoad.ts`)
 * provides only the concrete serializer and state types.
 *
 * Key API surface for extraction:
 * - `SaveSerializer<TState, TSerialized>` — game implements this interface
 * - `SaveLoadStore` — instantiated with optional config, shared across games
 * - `SaveDomain` — `'run-checkpoint'` | `'campaign'` for data isolation
 * - `serializeWithVersion` / `deserializeWithVersion` — versioning helpers
 */

export type SaveDomain = 'run-checkpoint' | 'campaign';

export interface StoredSave<T = unknown> {
  id: string;
  slotId: string;
  gameType: string;
  domain: SaveDomain;
  schemaVersion: number;
  savedAt: string;
  seq: number;
  payload: T;
}

export interface SaveLoadStoreOptions {
  dbName?: string;
  storeName?: string;
  localStoragePrefix?: string;
}

export interface VersionedPayload<T> {
  schemaVersion: number;
  data: T;
}

export interface SaveSerializer<TState, TSerialized> {
  readonly schemaVersion: number;
  serialize(state: TState): TSerialized;
  deserialize(data: TSerialized): TState;
}

const DEFAULT_DB_NAME = 'save-load-store';
const DEFAULT_STORE_NAME = 'saves';
const DEFAULT_LS_PREFIX = 'tce-saves';

interface StorageBackend {
  save(entry: StoredSave): Promise<void>;
  list(domain: SaveDomain, gameType: string): Promise<StoredSave[]>;
  getBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<StoredSave | null>;
  removeBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<void>;
  clear(domain?: SaveDomain, gameType?: string): Promise<void>;
  readonly name: string;
}

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
          store.createIndex('domain_gameType', ['domain', 'gameType'], { unique: false });
          store.createIndex('domain_gameType_slot', ['domain', 'gameType', 'slotId'], { unique: true });
          store.createIndex('savedAt', 'savedAt', { unique: false });
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

  async save(entry: StoredSave): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const index = store.index('domain_gameType_slot');
      const key = [entry.domain, entry.gameType, entry.slotId] as [SaveDomain, string, string];
      const existingReq = index.getKey(key);

      existingReq.onsuccess = () => {
        const existingKey = existingReq.result as string | undefined;
        if (existingKey && existingKey !== entry.id) {
          store.delete(existingKey);
        }
        store.put(entry);
      };

      existingReq.onerror = () => reject(existingReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(domain: SaveDomain, gameType: string): Promise<StoredSave[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const index = tx.objectStore(this.storeName).index('domain_gameType');
      const request = index.getAll([domain, gameType]);
      request.onsuccess = () => {
        const results = request.result as StoredSave[];
        results.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<StoredSave | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const index = tx.objectStore(this.storeName).index('domain_gameType_slot');
      const request = index.get([domain, gameType, slotId]);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async removeBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const index = store.index('domain_gameType_slot');
      const keyReq = index.getKey([domain, gameType, slotId]);

      keyReq.onsuccess = () => {
        const id = keyReq.result as string | undefined;
        if (id) store.delete(id);
      };
      keyReq.onerror = () => reject(keyReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(domain?: SaveDomain, gameType?: string): Promise<void> {
    if (!domain || !gameType) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const entries = await this.list(domain, gameType);
    const db = await this.openDB();
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

  async save(entry: StoredSave): Promise<void> {
    const existing = await this.getBySlot(entry.domain, entry.gameType, entry.slotId);
    if (existing && existing.id !== entry.id) {
      await this.removeBySlot(entry.domain, entry.gameType, entry.slotId);
    }

    localStorage.setItem(this.entryKey(entry.id), JSON.stringify(entry));
    const index = this.getIndex();
    if (!index.includes(entry.id)) {
      index.push(entry.id);
      this.setIndex(index);
    }
  }

  async list(domain: SaveDomain, gameType: string): Promise<StoredSave[]> {
    const index = this.getIndex();
    const results: StoredSave[] = [];
    for (const id of index) {
      const entry = await this.getById(id);
      if (entry && entry.domain === domain && entry.gameType === gameType) {
        results.push(entry);
      }
    }
    results.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
    return results;
  }

  async getBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<StoredSave | null> {
    const index = this.getIndex();
    for (const id of index) {
      const entry = await this.getById(id);
      if (entry && entry.domain === domain && entry.gameType === gameType && entry.slotId === slotId) {
        return entry;
      }
    }
    return null;
  }

  async removeBySlot(domain: SaveDomain, gameType: string, slotId: string): Promise<void> {
    const existing = await this.getBySlot(domain, gameType, slotId);
    if (!existing) return;
    localStorage.removeItem(this.entryKey(existing.id));
    const nextIndex = this.getIndex().filter((id) => id !== existing.id);
    this.setIndex(nextIndex);
  }

  async clear(domain?: SaveDomain, gameType?: string): Promise<void> {
    if (!domain || !gameType) {
      const index = this.getIndex();
      for (const id of index) {
        localStorage.removeItem(this.entryKey(id));
      }
      localStorage.removeItem(this.indexKey());
      return;
    }

    const entries = await this.list(domain, gameType);
    for (const entry of entries) {
      localStorage.removeItem(this.entryKey(entry.id));
    }
    const removeIds = new Set(entries.map((e) => e.id));
    const nextIndex = this.getIndex().filter((id) => !removeIds.has(id));
    this.setIndex(nextIndex);
  }

  private async getById(id: string): Promise<StoredSave | null> {
    try {
      const raw = localStorage.getItem(this.entryKey(id));
      return raw ? (JSON.parse(raw) as StoredSave) : null;
    } catch {
      return null;
    }
  }
}

export function serializeWithVersion<TState, TSerialized>(
  serializer: SaveSerializer<TState, TSerialized>,
  state: TState,
): VersionedPayload<TSerialized> {
  return {
    schemaVersion: serializer.schemaVersion,
    data: serializer.serialize(state),
  };
}

export function deserializeWithVersion<TState, TSerialized>(
  serializer: SaveSerializer<TState, TSerialized>,
  payload: VersionedPayload<TSerialized>,
): TState {
  if (payload.schemaVersion !== serializer.schemaVersion) {
    throw new Error(
      `Incompatible save version: expected ${serializer.schemaVersion}, got ${payload.schemaVersion}`,
    );
  }
  return serializer.deserialize(payload.data);
}

export class SaveLoadStore {
  private backend: StorageBackend | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly localStoragePrefix: string;
  private seqCounter: number = 0;

  constructor(options: SaveLoadStoreOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.localStoragePrefix = options.localStoragePrefix ?? DEFAULT_LS_PREFIX;
  }

  private init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (typeof indexedDB !== 'undefined') {
        try {
          const backend = new IndexedDBBackend(this.dbName, this.storeName);
          await backend.list('run-checkpoint', '__probe__');
          this.backend = backend;
          return;
        } catch (e) {
          console.warn('[SaveLoadStore] IndexedDB unavailable, falling back to localStorage:', e);
        }
      }

      if (typeof localStorage !== 'undefined') {
        try {
          const probeKey = `${this.localStoragePrefix}:__probe__`;
          localStorage.setItem(probeKey, '1');
          localStorage.removeItem(probeKey);
          this.backend = new LocalStorageBackend(this.localStoragePrefix);
          return;
        } catch (e) {
          console.warn('[SaveLoadStore] localStorage unavailable:', e);
        }
      }

      console.warn('[SaveLoadStore] No storage backend available. Saves will not persist.');
    })();

    return this.initPromise;
  }

  private generateId(domain: SaveDomain, gameType: string, slotId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${domain}:${gameType}:${slotId}:${timestamp}:${random}`;
  }

  async save<T>(
    domain: SaveDomain,
    gameType: string,
    slotId: string,
    schemaVersion: number,
    payload: T,
  ): Promise<StoredSave<T> | null> {
    await this.init();
    if (!this.backend) return null;

    const entry: StoredSave<T> = {
      id: this.generateId(domain, gameType, slotId),
      slotId,
      gameType,
      domain,
      schemaVersion,
      savedAt: new Date().toISOString(),
      seq: this.seqCounter++,
      payload,
    };
    await this.backend.save(entry as StoredSave);
    return entry;
  }

  async load<T>(domain: SaveDomain, gameType: string, slotId: string): Promise<StoredSave<T> | null> {
    await this.init();
    if (!this.backend) return null;
    return (await this.backend.getBySlot(domain, gameType, slotId)) as StoredSave<T> | null;
  }

  async list<T>(domain: SaveDomain, gameType: string): Promise<StoredSave<T>[]> {
    await this.init();
    if (!this.backend) return [];
    return (await this.backend.list(domain, gameType)) as StoredSave<T>[];
  }

  async remove(domain: SaveDomain, gameType: string, slotId: string): Promise<void> {
    await this.init();
    if (!this.backend) return;
    await this.backend.removeBySlot(domain, gameType, slotId);
  }

  async clear(domain?: SaveDomain, gameType?: string): Promise<void> {
    await this.init();
    if (!this.backend) return;
    await this.backend.clear(domain, gameType);
  }

  async getBackendName(): Promise<string | null> {
    await this.init();
    return this.backend?.name ?? null;
  }

  async saveSerialized<TState, TSerialized>(
    domain: SaveDomain,
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
    state: TState,
  ): Promise<StoredSave<VersionedPayload<TSerialized>> | null> {
    const payload = serializeWithVersion(serializer, state);
    return this.save(domain, gameType, slotId, serializer.schemaVersion, payload);
  }

  async loadSerialized<TState, TSerialized>(
    domain: SaveDomain,
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
  ): Promise<TState | null> {
    const stored = await this.load<VersionedPayload<TSerialized>>(domain, gameType, slotId);
    if (!stored) return null;
    if (stored.schemaVersion !== serializer.schemaVersion) {
      throw new Error(
        `Incompatible save version: expected ${serializer.schemaVersion}, got ${stored.schemaVersion}`,
      );
    }
    return deserializeWithVersion(serializer, stored.payload);
  }

  async saveRunCheckpoint<TState, TSerialized>(
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
    state: TState,
  ): Promise<StoredSave<VersionedPayload<TSerialized>> | null> {
    return this.saveSerialized('run-checkpoint', gameType, slotId, serializer, state);
  }

  async loadRunCheckpoint<TState, TSerialized>(
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
  ): Promise<TState | null> {
    return this.loadSerialized('run-checkpoint', gameType, slotId, serializer);
  }

  async saveCampaignProgress<TState, TSerialized>(
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
    state: TState,
  ): Promise<StoredSave<VersionedPayload<TSerialized>> | null> {
    return this.saveSerialized('campaign', gameType, slotId, serializer, state);
  }

  async loadCampaignProgress<TState, TSerialized>(
    gameType: string,
    slotId: string,
    serializer: SaveSerializer<TState, TSerialized>,
  ): Promise<TState | null> {
    return this.loadSerialized('campaign', gameType, slotId, serializer);
  }
}
