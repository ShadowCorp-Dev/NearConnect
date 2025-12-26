export interface DataStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * localStorage adapter - persists across browser sessions
 */
export class LocalStorage implements DataStorage {
  async get(key: string) {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  }

  async set(key: string, value: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value);
  }

  async remove(key: string) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  }
}

/**
 * sessionStorage adapter - cleared when browser tab closes
 */
export class SessionStorage implements DataStorage {
  async get(key: string) {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(key);
  }

  async set(key: string, value: string) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(key, value);
  }

  async remove(key: string) {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(key);
  }
}

/**
 * Memory-only adapter - no persistence, lost on page refresh
 */
export class MemoryStorage implements DataStorage {
  private data = new Map<string, string>();

  async get(key: string) {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.data.set(key, value);
  }

  async remove(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

/**
 * IndexedDB adapter - for larger data, survives browser sessions
 */
export class IndexedDBStorage implements DataStorage {
  private dbName: string;
  private storeName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName = "near-connect", storeName = "storage") {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB not available");
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });

    return this.dbPromise;
  }

  async get(key: string): Promise<string | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

/**
 * Encrypted storage wrapper - encrypts data before storing
 * Uses AES-GCM with a derived key from password
 */
export class EncryptedStorage implements DataStorage {
  private storage: DataStorage;
  private keyPromise: Promise<CryptoKey> | null = null;
  private password: string;

  constructor(storage: DataStorage, password: string) {
    this.storage = storage;
    this.password = password;
  }

  private async getKey(): Promise<CryptoKey> {
    if (this.keyPromise) return this.keyPromise;

    this.keyPromise = (async () => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.password),
        "PBKDF2",
        false,
        ["deriveKey"]
      );

      return crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode("near-connect-salt"),
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();

    return this.keyPromise;
  }

  async get(key: string): Promise<string | null> {
    const encrypted = await this.storage.get(key);
    if (!encrypted) return null;

    try {
      const cryptoKey = await this.getKey();
      const data = JSON.parse(encrypted) as { iv: string; data: string };

      const iv = Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0));
      const encryptedData = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encryptedData
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const cryptoKey = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(value)
    );

    const data = {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    };

    await this.storage.set(key, JSON.stringify(data));
  }

  async remove(key: string): Promise<void> {
    await this.storage.remove(key);
  }
}
