/**
 * Secure Storage Layer
 * Encrypts sensitive session data to protect against localStorage theft
 */

export interface SecureStorageOptions {
  /** Whether to encrypt the data */
  encrypt?: boolean;
  /** Time to live in milliseconds */
  ttl?: number;
}

interface StorageWrapper<T> {
  data: T;
  timestamp: number;
  ttl?: number;
  encrypted?: boolean;
}

export class SecureStorage {
  private namespace: string;
  private encryptionKey: CryptoKey | null = null;
  private initialized = false;

  constructor(namespace: string = 'near-connect') {
    this.namespace = namespace;
  }

  /**
   * Initialize encryption (call once on app start)
   * Must be called before using encrypted storage
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const keyMaterial = await this.getKeyMaterial();
      this.encryptionKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode(this.namespace + ':salt'),
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      this.initialized = true;
    } catch (error) {
      console.warn('[SecureStorage] Encryption initialization failed, falling back to unencrypted storage', error);
      this.initialized = true;
    }
  }

  /**
   * Get key material from session-specific entropy
   */
  private async getKeyMaterial(): Promise<CryptoKey> {
    // Combine multiple entropy sources for key derivation
    const entropy = [
      navigator.userAgent,
      window.screen.width.toString(),
      window.screen.height.toString(),
      new Date().getTimezoneOffset().toString(),
      this.getOrCreateSessionEntropy(),
    ].join('|');

    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(entropy),
      'PBKDF2',
      false,
      ['deriveKey']
    );
  }

  /**
   * Get or create session-specific entropy
   */
  private getOrCreateSessionEntropy(): string {
    const key = `${this.namespace}:entropy`;
    let entropy = sessionStorage.getItem(key);
    if (!entropy) {
      entropy = crypto.randomUUID() + crypto.randomUUID();
      sessionStorage.setItem(key, entropy);
    }
    return entropy;
  }

  /**
   * Store data securely
   */
  async set<T>(key: string, value: T, options: SecureStorageOptions = {}): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

    const fullKey = `${this.namespace}:${key}`;

    const wrapper: StorageWrapper<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: options.ttl,
      encrypted: options.encrypt && this.encryptionKey !== null,
    };

    let stored: string;

    if (options.encrypt && this.encryptionKey) {
      stored = await this.encrypt(JSON.stringify(wrapper));
    } else {
      stored = JSON.stringify(wrapper);
    }

    try {
      localStorage.setItem(fullKey, stored);
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.cleanup();
        localStorage.setItem(fullKey, stored);
      } else {
        throw error;
      }
    }
  }

  /**
   * Retrieve data
   */
  async get<T>(key: string, options: SecureStorageOptions = {}): Promise<T | null> {
    if (!this.initialized) {
      await this.init();
    }

    const fullKey = `${this.namespace}:${key}`;
    const stored = localStorage.getItem(fullKey);

    if (!stored) return null;

    try {
      let parsed: string;

      // Try to decrypt if it looks encrypted (base64)
      if (options.encrypt && this.encryptionKey && this.looksEncrypted(stored)) {
        parsed = await this.decrypt(stored);
      } else {
        parsed = stored;
      }

      const wrapper: StorageWrapper<T> = JSON.parse(parsed);

      // Check TTL
      if (wrapper.ttl && Date.now() - wrapper.timestamp > wrapper.ttl) {
        this.remove(key);
        return null;
      }

      return wrapper.data;
    } catch (error) {
      // Corrupted or tampered data, remove it
      console.warn(`[SecureStorage] Failed to retrieve ${key}, removing corrupted data`);
      this.remove(key);
      return null;
    }
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return localStorage.getItem(`${this.namespace}:${key}`) !== null;
  }

  /**
   * Remove data
   */
  remove(key: string): void {
    localStorage.removeItem(`${this.namespace}:${key}`);
  }

  /**
   * Clear all data for this namespace
   */
  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(`${this.namespace}:`));
    keys.forEach(k => localStorage.removeItem(k));
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const prefix = `${this.namespace}:`;
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;

      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        // Only cleanup non-encrypted entries (we can't easily check encrypted ones)
        if (!this.looksEncrypted(stored)) {
          const wrapper = JSON.parse(stored);
          if (wrapper.ttl && now - wrapper.timestamp > wrapper.ttl) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // Skip malformed entries
      }
    }
  }

  /**
   * Get all keys in this namespace
   */
  keys(): string[] {
    const prefix = `${this.namespace}:`;
    return Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }

  /**
   * Encrypt plaintext using AES-GCM
   */
  private async encrypt(plaintext: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encoded
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return 'enc:' + btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt ciphertext
   */
  private async decrypt(ciphertext: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    // Remove prefix
    const data = ciphertext.startsWith('enc:') ? ciphertext.slice(4) : ciphertext;

    const combined = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Check if data looks encrypted
   */
  private looksEncrypted(data: string): boolean {
    return data.startsWith('enc:');
  }

  /**
   * Check if encryption is available
   */
  isEncryptionAvailable(): boolean {
    return this.encryptionKey !== null;
  }
}

/**
 * Create and initialize a secure storage instance
 */
export async function createSecureStorage(namespace?: string): Promise<SecureStorage> {
  const storage = new SecureStorage(namespace);
  await storage.init();
  return storage;
}
