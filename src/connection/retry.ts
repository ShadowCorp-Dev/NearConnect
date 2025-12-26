import { WalletError, ErrorCode, wrapError } from "../errors";

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelay: number;
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelay: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Whether to add jitter to prevent thundering herd (default: true) */
  jitter: boolean;
  /** Error codes that should trigger a retry */
  retryableErrors: ErrorCode[];
  /** Custom retry condition function */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
  /** Callback when all retries exhausted */
  onExhausted?: (error: unknown, attempts: number) => void;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /** Connection timeout in ms (default: 30000) */
  connection: number;
  /** Sign transaction timeout in ms (default: 120000) */
  signTransaction: number;
  /** Sign message timeout in ms (default: 60000) */
  signMessage: number;
  /** Broadcast timeout in ms (default: 60000) */
  broadcast: number;
  /** Show warning at this percentage of timeout (default: 0.8) */
  warningThreshold: number;
  /** Callback when warning threshold reached */
  onWarning?: (operation: string, elapsed: number, timeout: number) => void;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit (default: 60000) */
  cooldownPeriod: number;
  /** Interval for health checks in ms (default: 10000) */
  healthCheckInterval: number;
  /** Callback when circuit opens */
  onOpen?: (walletId: string, failures: number) => void;
  /** Callback when circuit closes */
  onClose?: (walletId: string) => void;
  /** Callback when circuit is half-open (testing) */
  onHalfOpen?: (walletId: string) => void;
}

/**
 * Circuit breaker state
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker entry for a wallet
 */
interface CircuitEntry {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  openedAt: number | null;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    ErrorCode.CONNECTION_TIMEOUT,
    ErrorCode.RPC_ERROR,
    ErrorCode.NETWORK_MISMATCH,
  ],
};

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  connection: 30000,
  signTransaction: 120000,
  signMessage: 60000,
  broadcast: 60000,
  warningThreshold: 0.8,
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownPeriod: 60000,
  healthCheckInterval: 10000,
};

/**
 * Calculate delay for a given attempt with exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Pick<RetryConfig, "baseDelay" | "maxDelay" | "backoffMultiplier" | "jitter">
): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

  // Cap at maxDelay
  delay = Math.min(delay, config.maxDelay);

  // Add jitter (±25% randomization)
  if (config.jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Check if an error is retryable based on config
 */
export function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (config.shouldRetry) {
    return config.shouldRetry(error, 0);
  }

  if (error instanceof WalletError) {
    return config.retryableErrors.includes(error.code);
  }

  // Network errors are generally retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  return false;
}

/**
 * Execute an operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = fullConfig.shouldRetry
        ? fullConfig.shouldRetry(error, attempt)
        : isRetryableError(error, fullConfig);

      if (!shouldRetry || attempt >= fullConfig.maxAttempts - 1) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(attempt, fullConfig);

      // Notify about retry
      fullConfig.onRetry?.(attempt + 1, delay, error);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  fullConfig.onExhausted?.(lastError, fullConfig.maxAttempts);
  throw lastError;
}

/**
 * Execute an operation with timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = "operation",
  onWarning?: (elapsed: number, timeout: number) => void,
  warningThreshold: number = 0.8
): Promise<T> {
  return new Promise((resolve, reject) => {
    let warningTimer: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    // Set up warning timer
    if (onWarning && warningThreshold > 0 && warningThreshold < 1) {
      const warningTime = timeoutMs * warningThreshold;
      warningTimer = setTimeout(() => {
        if (!completed) {
          onWarning(warningTime, timeoutMs);
        }
      }, warningTime);
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        if (warningTimer) clearTimeout(warningTimer);
        reject(
          new WalletError({
            code: ErrorCode.CONNECTION_TIMEOUT,
            message: `${operationName} timed out after ${timeoutMs}ms`,
          })
        );
      }
    }, timeoutMs);

    // Execute operation
    operation()
      .then((result) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          if (warningTimer) clearTimeout(warningTimer);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          if (warningTimer) clearTimeout(warningTimer);
          reject(error);
        }
      });
  });
}

/**
 * Combine retry and timeout
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  retryConfig: Partial<RetryConfig> = {},
  operationName: string = "operation"
): Promise<T> {
  return withRetry(
    () => withTimeout(operation, timeoutMs, operationName),
    retryConfig
  );
}

/**
 * Circuit Breaker
 *
 * Prevents hammering a failing wallet by temporarily disabling connections
 */
export class CircuitBreaker {
  private circuits: Map<string, CircuitEntry> = new Map();
  private config: CircuitBreakerConfig;
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get or create circuit entry for a wallet
   */
  private getCircuit(walletId: string): CircuitEntry {
    let circuit = this.circuits.get(walletId);
    if (!circuit) {
      circuit = {
        state: "closed",
        failures: 0,
        lastFailure: 0,
        lastSuccess: 0,
        openedAt: null,
      };
      this.circuits.set(walletId, circuit);
    }
    return circuit;
  }

  /**
   * Check if a wallet's circuit allows requests
   */
  isAllowed(walletId: string): boolean {
    const circuit = this.getCircuit(walletId);

    switch (circuit.state) {
      case "closed":
        return true;

      case "open":
        // Check if cooldown has passed
        if (circuit.openedAt && Date.now() - circuit.openedAt >= this.config.cooldownPeriod) {
          this.transitionTo(walletId, "half-open");
          return true; // Allow one test request
        }
        return false;

      case "half-open":
        // Only allow one request at a time in half-open state
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(walletId: string): void {
    const circuit = this.getCircuit(walletId);
    circuit.lastSuccess = Date.now();

    if (circuit.state === "half-open") {
      // Success in half-open state closes the circuit
      this.transitionTo(walletId, "closed");
      circuit.failures = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(walletId: string): void {
    const circuit = this.getCircuit(walletId);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === "half-open") {
      // Failure in half-open state re-opens the circuit
      this.transitionTo(walletId, "open");
    } else if (
      circuit.state === "closed" &&
      circuit.failures >= this.config.failureThreshold
    ) {
      // Too many failures, open the circuit
      this.transitionTo(walletId, "open");
    }
  }

  /**
   * Transition circuit to a new state
   */
  private transitionTo(walletId: string, state: CircuitState): void {
    const circuit = this.getCircuit(walletId);
    const previousState = circuit.state;
    circuit.state = state;

    // Handle state-specific actions
    switch (state) {
      case "open":
        circuit.openedAt = Date.now();
        this.config.onOpen?.(walletId, circuit.failures);
        this.scheduleHealthCheck(walletId);
        break;

      case "closed":
        circuit.openedAt = null;
        circuit.failures = 0;
        this.config.onClose?.(walletId);
        this.cancelHealthCheck(walletId);
        break;

      case "half-open":
        this.config.onHalfOpen?.(walletId);
        break;
    }
  }

  /**
   * Schedule health check for an open circuit
   */
  private scheduleHealthCheck(walletId: string): void {
    // Cancel existing timer
    this.cancelHealthCheck(walletId);

    // Schedule check at cooldown period
    const timer = setTimeout(() => {
      const circuit = this.getCircuit(walletId);
      if (circuit.state === "open") {
        this.transitionTo(walletId, "half-open");
      }
    }, this.config.cooldownPeriod);

    this.healthCheckTimers.set(walletId, timer);
  }

  /**
   * Cancel health check timer
   */
  private cancelHealthCheck(walletId: string): void {
    const timer = this.healthCheckTimers.get(walletId);
    if (timer) {
      clearTimeout(timer);
      this.healthCheckTimers.delete(walletId);
    }
  }

  /**
   * Manually reset a circuit
   */
  reset(walletId: string): void {
    this.cancelHealthCheck(walletId);
    const circuit = this.getCircuit(walletId);
    circuit.state = "closed";
    circuit.failures = 0;
    circuit.openedAt = null;
  }

  /**
   * Manually reset all circuits
   */
  resetAll(): void {
    for (const walletId of this.circuits.keys()) {
      this.reset(walletId);
    }
  }

  /**
   * Get circuit state for a wallet
   */
  getState(walletId: string): CircuitState {
    return this.getCircuit(walletId).state;
  }

  /**
   * Get circuit info for a wallet
   */
  getInfo(walletId: string): {
    state: CircuitState;
    failures: number;
    lastFailure: number;
    lastSuccess: number;
    remainingCooldown: number | null;
  } {
    const circuit = this.getCircuit(walletId);
    let remainingCooldown: number | null = null;

    if (circuit.state === "open" && circuit.openedAt) {
      const elapsed = Date.now() - circuit.openedAt;
      remainingCooldown = Math.max(0, this.config.cooldownPeriod - elapsed);
    }

    return {
      state: circuit.state,
      failures: circuit.failures,
      lastFailure: circuit.lastFailure,
      lastSuccess: circuit.lastSuccess,
      remainingCooldown,
    };
  }

  /**
   * Get all circuit states
   */
  getAllStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};
    for (const [walletId, circuit] of this.circuits) {
      states[walletId] = circuit.state;
    }
    return states;
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(
    walletId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.isAllowed(walletId)) {
      const info = this.getInfo(walletId);
      throw new WalletError({
        code: ErrorCode.CONNECTION_TIMEOUT,
        message: `Circuit breaker open for wallet ${walletId}. Try again in ${info.remainingCooldown}ms`,
        walletId,
      });
    }

    try {
      const result = await operation();
      this.recordSuccess(walletId);
      return result;
    } catch (error) {
      this.recordFailure(walletId);
      throw error;
    }
  }

  /**
   * Cleanup all timers
   */
  destroy(): void {
    for (const timer of this.healthCheckTimers.values()) {
      clearTimeout(timer);
    }
    this.healthCheckTimers.clear();
    this.circuits.clear();
  }
}

/**
 * Create a retry wrapper with default configuration
 */
export function createRetryWrapper(config: Partial<RetryConfig> = {}) {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  return <T>(operation: () => Promise<T>) => withRetry(operation, fullConfig);
}

/**
 * Create a timeout wrapper with default configuration
 */
export function createTimeoutWrapper(
  timeoutMs: number,
  operationName?: string,
  onWarning?: (elapsed: number, timeout: number) => void
) {
  return <T>(operation: () => Promise<T>) =>
    withTimeout(operation, timeoutMs, operationName, onWarning);
}

/**
 * Cancellable operation wrapper
 */
export interface CancellableOperation<T> {
  promise: Promise<T>;
  cancel: () => void;
  isCancelled: () => boolean;
}

/**
 * Create a cancellable operation
 */
export function makeCancellable<T>(
  operation: () => Promise<T>
): CancellableOperation<T> {
  let cancelled = false;
  let rejectFn: (reason: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    rejectFn = reject;

    operation()
      .then((result) => {
        if (!cancelled) {
          resolve(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          reject(error);
        }
      });
  });

  return {
    promise,
    cancel: () => {
      if (!cancelled) {
        cancelled = true;
        rejectFn(
          new WalletError({
            code: ErrorCode.USER_REJECTED,
            message: "Operation cancelled by user",
          })
        );
      }
    },
    isCancelled: () => cancelled,
  };
}
