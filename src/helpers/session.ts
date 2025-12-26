import { DataStorage, LocalStorage } from "./storage";
import { Session } from "../types";

export type { Session };

/**
 * Session validation result
 */
export type SessionValidationResult =
  | { valid: true; session: Session }
  | { valid: false; reason: "expired" | "invalid" | "missing" };

/**
 * Multi-tab sync message types
 */
interface SyncMessage {
  type: "session:updated" | "session:cleared" | "session:disconnected";
  session?: Session;
  timestamp: number;
}

export interface SessionManagerOptions {
  storage?: DataStorage;
  storageKey?: string;
  maxAge?: number; // Session expiry in ms (default: 7 days)
  idleTimeout?: number; // Idle timeout in ms (default: disabled)
  autoReconnect?: boolean;
  enableMultiTabSync?: boolean; // Enable cross-tab sync (default: true)
  onSessionRestored?: (session: Session) => void;
  onSessionExpired?: (session: Session) => void;
  onSessionInvalid?: (session: Session) => void;
  onSessionCleared?: () => void;
  onSessionSynced?: (session: Session) => void;
  onIdleTimeout?: (session: Session) => void;
}

const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_STORAGE_KEY = "near-connect-session";
const BROADCAST_CHANNEL_NAME = "near-connect-session-sync";

export class SessionManager {
  private storage: DataStorage;
  private storageKey: string;
  private maxAge: number;
  private idleTimeout: number | null;
  private autoReconnect: boolean;
  private enableMultiTabSync: boolean;
  private cachedSession: Session | null = null;

  private broadcastChannel: BroadcastChannel | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activityHandler: (() => void) | null = null;

  private onSessionRestored?: (session: Session) => void;
  private onSessionExpired?: (session: Session) => void;
  private onSessionInvalid?: (session: Session) => void;
  private onSessionCleared?: () => void;
  private onSessionSynced?: (session: Session) => void;
  private onIdleTimeout?: (session: Session) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.storage = options.storage ?? new LocalStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    this.idleTimeout = options.idleTimeout ?? null;
    this.autoReconnect = options.autoReconnect ?? true;
    this.enableMultiTabSync = options.enableMultiTabSync ?? true;

    this.onSessionRestored = options.onSessionRestored;
    this.onSessionExpired = options.onSessionExpired;
    this.onSessionInvalid = options.onSessionInvalid;
    this.onSessionCleared = options.onSessionCleared;
    this.onSessionSynced = options.onSessionSynced;
    this.onIdleTimeout = options.onIdleTimeout;

    this.initMultiTabSync();
  }

  /**
   * Initialize multi-tab synchronization via BroadcastChannel
   */
  private initMultiTabSync(): void {
    if (!this.enableMultiTabSync) return;
    if (typeof BroadcastChannel === "undefined") return;

    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
        this.handleSyncMessage(event.data);
      };
    } catch {
      // BroadcastChannel not supported
    }
  }

  /**
   * Handle incoming sync messages from other tabs
   */
  private handleSyncMessage(message: SyncMessage): void {
    switch (message.type) {
      case "session:updated":
        if (message.session) {
          this.cachedSession = message.session;
          this.onSessionSynced?.(message.session);
        }
        break;
      case "session:cleared":
      case "session:disconnected":
        this.cachedSession = null;
        this.onSessionCleared?.();
        break;
    }
  }

  /**
   * Broadcast session change to other tabs
   */
  private broadcast(message: SyncMessage): void {
    this.broadcastChannel?.postMessage(message);
  }

  /**
   * Start idle timeout tracking
   */
  private startIdleTracking(): void {
    if (!this.idleTimeout || typeof window === "undefined") return;

    this.stopIdleTracking();

    const resetTimer = () => {
      if (this.idleTimer) clearTimeout(this.idleTimer);

      this.idleTimer = setTimeout(async () => {
        const session = await this.get();
        if (session) {
          this.onIdleTimeout?.(session);
          await this.clear();
        }
      }, this.idleTimeout!);

      // Touch session on activity
      this.touch().catch(() => {});
    };

    this.activityHandler = resetTimer;

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();
  }

  /**
   * Stop idle timeout tracking
   */
  private stopIdleTracking(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.activityHandler && typeof window !== "undefined") {
      const events = ["mousedown", "keydown", "touchstart", "scroll"];
      events.forEach((event) => {
        window.removeEventListener(event, this.activityHandler!);
      });
      this.activityHandler = null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopIdleTracking();
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
  }

  /**
   * Save a new session
   */
  async save(session: Omit<Session, "connectedAt" | "lastActiveAt">): Promise<Session> {
    const now = Date.now();
    const fullSession: Session = {
      ...session,
      connectedAt: now,
      lastActiveAt: now,
    };

    await this.storage.set(this.storageKey, JSON.stringify(fullSession));
    this.cachedSession = fullSession;

    // Broadcast to other tabs
    this.broadcast({ type: "session:updated", session: fullSession, timestamp: now });

    // Start idle tracking if configured
    this.startIdleTracking();

    return fullSession;
  }

  /**
   * Get the current session if valid
   */
  async get(): Promise<Session | null> {
    if (this.cachedSession && this.isValid(this.cachedSession)) {
      return this.cachedSession;
    }

    const raw = await this.storage.get(this.storageKey);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw) as Session;
      const validation = this.validate(session);

      if (!validation.valid) {
        if (validation.reason === "expired") {
          this.onSessionExpired?.(session);
        } else if (validation.reason === "invalid") {
          this.onSessionInvalid?.(session);
        }
        await this.clear();
        return null;
      }

      this.cachedSession = session;
      return session;
    } catch {
      await this.clear();
      return null;
    }
  }

  /**
   * Validate a session and return detailed result
   */
  validate(session: Session): SessionValidationResult {
    if (!session.walletId || !session.accounts?.length) {
      return { valid: false, reason: "invalid" };
    }

    const age = Date.now() - session.connectedAt;
    if (age > this.maxAge) {
      return { valid: false, reason: "expired" };
    }

    return { valid: true, session };
  }

  /**
   * Update the last active timestamp
   */
  async touch(): Promise<void> {
    const session = await this.get();
    if (!session) return;

    session.lastActiveAt = Date.now();
    await this.storage.set(this.storageKey, JSON.stringify(session));
    this.cachedSession = session;
  }

  /**
   * Update session data (e.g., accounts changed)
   */
  async update(updates: Partial<Pick<Session, "accounts" | "network" | "metadata">>): Promise<Session | null> {
    const session = await this.get();
    if (!session) return null;

    const updatedSession: Session = {
      ...session,
      ...updates,
      lastActiveAt: Date.now(),
    };

    await this.storage.set(this.storageKey, JSON.stringify(updatedSession));
    this.cachedSession = updatedSession;
    return updatedSession;
  }

  /**
   * Clear the session
   */
  async clear(): Promise<void> {
    await this.storage.remove(this.storageKey);
    this.cachedSession = null;

    // Stop idle tracking
    this.stopIdleTracking();

    // Broadcast to other tabs
    this.broadcast({ type: "session:cleared", timestamp: Date.now() });

    this.onSessionCleared?.();
  }

  /**
   * Check if a session is still valid (simple boolean check)
   */
  isValid(session: Session): boolean {
    return this.validate(session).valid;
  }

  /**
   * Check if we should auto-reconnect
   */
  shouldAutoReconnect(): boolean {
    return this.autoReconnect;
  }

  /**
   * Try to restore a previous session
   * Returns the session if valid and autoReconnect is enabled
   */
  async tryRestore(): Promise<Session | null> {
    if (!this.autoReconnect) return null;

    const session = await this.get();
    if (session) {
      this.onSessionRestored?.(session);

      // Start idle tracking for restored session
      this.startIdleTracking();

      return session;
    }

    return null;
  }

  /**
   * Get session age in milliseconds
   */
  async getAge(): Promise<number | null> {
    const session = await this.get();
    if (!session) return null;
    return Date.now() - session.connectedAt;
  }

  /**
   * Get time since last activity
   */
  async getIdleTime(): Promise<number | null> {
    const session = await this.get();
    if (!session) return null;
    return Date.now() - session.lastActiveAt;
  }

  /**
   * Check if session exists (without full validation)
   */
  async exists(): Promise<boolean> {
    const raw = await this.storage.get(this.storageKey);
    return raw !== null;
  }
}
