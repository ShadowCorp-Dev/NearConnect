import { WalletError, ErrorCode } from "../errors";
import { Account } from "../types";

/**
 * Connection state types
 */
export type ConnectionStatus =
  | "idle"
  | "detecting"
  | "connecting"
  | "authenticating"
  | "connected"
  | "signing"
  | "reconnecting"
  | "disconnecting"
  | "error";

/**
 * Connection state with context
 */
export type ConnectionState =
  | { status: "idle" }
  | { status: "detecting"; walletId: string; startedAt: number }
  | { status: "connecting"; walletId: string; startedAt: number }
  | { status: "authenticating"; walletId: string; startedAt: number }
  | { status: "connected"; walletId: string; accounts: Account[]; connectedAt: number }
  | { status: "signing"; walletId: string; operation: string; startedAt: number }
  | { status: "reconnecting"; walletId: string; attempt: number; startedAt: number }
  | { status: "disconnecting"; walletId: string; startedAt: number }
  | { status: "error"; walletId?: string; error: WalletError; occurredAt: number };

/**
 * State transition history entry
 */
export interface StateHistoryEntry {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: number;
  reason?: string;
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ConnectionStatus, ConnectionStatus[]> = {
  idle: ["detecting", "connecting"],
  detecting: ["connecting", "error", "idle"],
  connecting: ["authenticating", "connected", "error", "idle"],
  authenticating: ["connected", "error", "idle"],
  connected: ["signing", "disconnecting", "reconnecting", "error"],
  signing: ["connected", "error"],
  reconnecting: ["connected", "error", "idle"],
  disconnecting: ["idle", "error"],
  error: ["idle", "connecting", "reconnecting"],
};

/**
 * State machine configuration
 */
export interface StateMachineConfig {
  /** Maximum history entries to keep (default: 50) */
  maxHistorySize: number;
  /** Persist state to storage (default: false) */
  persistState: boolean;
  /** Storage key for persistence */
  storageKey: string;
  /** State expiration in ms (default: 24 hours) */
  stateExpiration: number;
  /** Callback when state changes */
  onStateChange?: (from: ConnectionState, to: ConnectionState) => void;
  /** Callback when invalid transition attempted */
  onInvalidTransition?: (current: ConnectionStatus, attempted: ConnectionStatus) => void;
}

/**
 * Default state machine configuration
 */
export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  maxHistorySize: 50,
  persistState: false,
  storageKey: "near-connect:state",
  stateExpiration: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Connection State Machine
 *
 * Manages connection lifecycle with proper state transitions
 */
export class ConnectionStateMachine {
  private state: ConnectionState = { status: "idle" };
  private history: StateHistoryEntry[] = [];
  private config: StateMachineConfig;
  private listeners: {
    enter: Map<ConnectionStatus, Set<(state: ConnectionState) => void>>;
    exit: Map<ConnectionStatus, Set<(state: ConnectionState) => void>>;
    transition: Set<(from: ConnectionState, to: ConnectionState) => void>;
  } = {
    enter: new Map(),
    exit: new Map(),
    transition: new Set(),
  };

  constructor(config: Partial<StateMachineConfig> = {}) {
    this.config = { ...DEFAULT_STATE_MACHINE_CONFIG, ...config };
    this.restoreState();
  }

  /**
   * Get current state
   */
  get current(): ConnectionState {
    return this.state;
  }

  /**
   * Get current status (convenience getter)
   */
  get status(): ConnectionStatus {
    return this.state.status;
  }

  /**
   * Check if currently in a specific status
   */
  is(status: ConnectionStatus): boolean {
    return this.state.status === status;
  }

  /**
   * Check if in any of the given statuses
   */
  isAnyOf(...statuses: ConnectionStatus[]): boolean {
    return statuses.includes(this.state.status);
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: ConnectionStatus): boolean {
    return VALID_TRANSITIONS[this.state.status]?.includes(to) ?? false;
  }

  /**
   * Transition to a new state
   */
  transition(to: ConnectionState, reason?: string): void {
    const from = this.state;

    // Validate transition
    if (!this.canTransition(to.status)) {
      this.config.onInvalidTransition?.(from.status, to.status);
      throw new WalletError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `Invalid state transition from ${from.status} to ${to.status}`,
      });
    }

    // Exit callbacks for old state
    const exitListeners = this.listeners.exit.get(from.status);
    if (exitListeners) {
      for (const listener of exitListeners) {
        try {
          listener(from);
        } catch (e) {
          console.error("Error in exit listener:", e);
        }
      }
    }

    // Update state
    this.state = to;

    // Record history
    this.recordHistory(from, to, reason);

    // Enter callbacks for new state
    const enterListeners = this.listeners.enter.get(to.status);
    if (enterListeners) {
      for (const listener of enterListeners) {
        try {
          listener(to);
        } catch (e) {
          console.error("Error in enter listener:", e);
        }
      }
    }

    // Transition callbacks
    for (const listener of this.listeners.transition) {
      try {
        listener(from, to);
      } catch (e) {
        console.error("Error in transition listener:", e);
      }
    }

    // Config callback
    this.config.onStateChange?.(from, to);

    // Persist state
    if (this.config.persistState) {
      this.persistState();
    }
  }

  /**
   * Convenience methods for common transitions
   */

  toDetecting(walletId: string): void {
    this.transition({ status: "detecting", walletId, startedAt: Date.now() });
  }

  toConnecting(walletId: string): void {
    this.transition({ status: "connecting", walletId, startedAt: Date.now() });
  }

  toAuthenticating(walletId: string): void {
    this.transition({ status: "authenticating", walletId, startedAt: Date.now() });
  }

  toConnected(walletId: string, accounts: Account[]): void {
    this.transition({ status: "connected", walletId, accounts, connectedAt: Date.now() });
  }

  toSigning(walletId: string, operation: string): void {
    this.transition({ status: "signing", walletId, operation, startedAt: Date.now() });
  }

  toReconnecting(walletId: string, attempt: number = 1): void {
    this.transition({ status: "reconnecting", walletId, attempt, startedAt: Date.now() });
  }

  toDisconnecting(walletId: string): void {
    this.transition({ status: "disconnecting", walletId, startedAt: Date.now() });
  }

  toError(error: WalletError, walletId?: string): void {
    this.transition({ status: "error", walletId, error, occurredAt: Date.now() });
  }

  toIdle(): void {
    this.transition({ status: "idle" });
  }

  /**
   * Reset to idle state (bypasses transition validation)
   */
  reset(): void {
    const from = this.state;
    this.state = { status: "idle" };
    this.recordHistory(from, this.state, "reset");

    if (this.config.persistState) {
      this.clearPersistedState();
    }
  }

  /**
   * Record state transition in history
   */
  private recordHistory(from: ConnectionState, to: ConnectionState, reason?: string): void {
    this.history.push({
      from,
      to,
      timestamp: Date.now(),
      reason,
    });

    // Trim history if needed
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get state history
   */
  getHistory(): StateHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get last N history entries
   */
  getRecentHistory(count: number = 10): StateHistoryEntry[] {
    return this.history.slice(-count);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Register callback for entering a state
   */
  onEnter(status: ConnectionStatus, callback: (state: ConnectionState) => void): () => void {
    if (!this.listeners.enter.has(status)) {
      this.listeners.enter.set(status, new Set());
    }
    this.listeners.enter.get(status)!.add(callback);

    return () => {
      this.listeners.enter.get(status)?.delete(callback);
    };
  }

  /**
   * Register callback for exiting a state
   */
  onExit(status: ConnectionStatus, callback: (state: ConnectionState) => void): () => void {
    if (!this.listeners.exit.has(status)) {
      this.listeners.exit.set(status, new Set());
    }
    this.listeners.exit.get(status)!.add(callback);

    return () => {
      this.listeners.exit.get(status)?.delete(callback);
    };
  }

  /**
   * Register callback for any transition
   */
  onTransition(callback: (from: ConnectionState, to: ConnectionState) => void): () => void {
    this.listeners.transition.add(callback);
    return () => {
      this.listeners.transition.delete(callback);
    };
  }

  /**
   * Get connected wallet ID if in connected state
   */
  getConnectedWalletId(): string | null {
    if (this.state.status === "connected") {
      return this.state.walletId;
    }
    return null;
  }

  /**
   * Get connected accounts if in connected state
   */
  getConnectedAccounts(): Account[] {
    if (this.state.status === "connected") {
      return this.state.accounts;
    }
    return [];
  }

  /**
   * Get error if in error state
   */
  getError(): WalletError | null {
    if (this.state.status === "error") {
      return this.state.error;
    }
    return null;
  }

  /**
   * Get time spent in current state
   */
  getTimeInCurrentState(): number {
    const stateWithTime = this.state as { startedAt?: number; connectedAt?: number; occurredAt?: number };
    const startTime = stateWithTime.startedAt ?? stateWithTime.connectedAt ?? stateWithTime.occurredAt;
    if (!startTime) return 0;
    return Date.now() - startTime;
  }

  /**
   * Check if current state has timed out
   */
  hasTimedOut(timeoutMs: number): boolean {
    return this.getTimeInCurrentState() > timeoutMs;
  }

  /**
   * Persist state to storage
   */
  private persistState(): void {
    if (typeof localStorage === "undefined") return;

    try {
      const data = {
        state: this.state,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.config.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to persist state:", e);
    }
  }

  /**
   * Restore state from storage
   */
  private restoreState(): void {
    if (!this.config.persistState || typeof localStorage === "undefined") return;

    try {
      const raw = localStorage.getItem(this.config.storageKey);
      if (!raw) return;

      const data = JSON.parse(raw);

      // Check expiration
      if (Date.now() - data.timestamp > this.config.stateExpiration) {
        this.clearPersistedState();
        return;
      }

      // Only restore "connected" state (others are transient)
      if (data.state.status === "connected") {
        this.state = data.state;
      }
    } catch (e) {
      console.warn("Failed to restore state:", e);
      this.clearPersistedState();
    }
  }

  /**
   * Clear persisted state
   */
  private clearPersistedState(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (e) {
      console.warn("Failed to clear persisted state:", e);
    }
  }

  /**
   * Create a snapshot of current state
   */
  snapshot(): {
    state: ConnectionState;
    history: StateHistoryEntry[];
    timestamp: number;
  } {
    return {
      state: { ...this.state } as ConnectionState,
      history: this.getHistory(),
      timestamp: Date.now(),
    };
  }

  /**
   * Check if currently processing (not idle or connected)
   */
  isProcessing(): boolean {
    return !["idle", "connected"].includes(this.state.status);
  }

  /**
   * Check if in a stable state (idle or connected)
   */
  isStable(): boolean {
    return ["idle", "connected"].includes(this.state.status);
  }

  /**
   * Wait for state to become stable
   */
  async waitForStable(timeoutMs: number = 30000): Promise<ConnectionState> {
    if (this.isStable()) {
      return this.state;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new WalletError({
          code: ErrorCode.CONNECTION_TIMEOUT,
          message: "Timed out waiting for stable state",
        }));
      }, timeoutMs);

      const unsubscribe = this.onTransition((_, to) => {
        if (["idle", "connected", "error"].includes(to.status)) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(to);
        }
      });
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.listeners.enter.clear();
    this.listeners.exit.clear();
    this.listeners.transition.clear();
    this.history = [];
  }
}

/**
 * Create a simple state machine instance
 */
export function createStateMachine(
  config?: Partial<StateMachineConfig>
): ConnectionStateMachine {
  return new ConnectionStateMachine(config);
}

/**
 * Get human-readable status description
 */
export function getStatusDescription(status: ConnectionStatus): string {
  switch (status) {
    case "idle":
      return "Not connected";
    case "detecting":
      return "Detecting wallet";
    case "connecting":
      return "Connecting to wallet";
    case "authenticating":
      return "Waiting for approval";
    case "connected":
      return "Connected";
    case "signing":
      return "Signing transaction";
    case "reconnecting":
      return "Reconnecting";
    case "disconnecting":
      return "Disconnecting";
    case "error":
      return "Error occurred";
    default:
      return "Unknown";
  }
}
