// Retry logic and circuit breaker
export {
  // Types
  type RetryConfig,
  type TimeoutConfig,
  type CircuitBreakerConfig,
  type CircuitState,
  type CancellableOperation,

  // Defaults
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,

  // Functions
  calculateBackoffDelay,
  isRetryableError,
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  createRetryWrapper,
  createTimeoutWrapper,
  makeCancellable,

  // Classes
  CircuitBreaker,
} from "./retry";

// Connection state machine
export {
  // Types
  type ConnectionStatus,
  type ConnectionState,
  type StateHistoryEntry,
  type StateMachineConfig,

  // Defaults
  DEFAULT_STATE_MACHINE_CONFIG,

  // Functions
  createStateMachine,
  getStatusDescription,

  // Classes
  ConnectionStateMachine,
} from "./state";

// Health monitoring
export {
  // Types
  type HealthStatus,
  type ConnectionHealth,
  type HealthCheckResult,
  type HealthConfig,
  type HealthEventMap,
  type HealthCheckFn,

  // Defaults
  DEFAULT_HEALTH_CONFIG,

  // Functions
  createWalletHealthCheck,
  createHealthMonitor,

  // Classes
  HealthMonitor,
} from "./health";

// Reconnection strategies
export {
  // Types
  type ReconnectTriggers,
  type ReconnectConfig,
  type QueuedOperation,
  type ReconnectState,
  type ReconnectEventMap,
  type ReconnectFn,

  // Defaults
  DEFAULT_RECONNECT_TRIGGERS,
  DEFAULT_RECONNECT_CONFIG,

  // Functions
  createReconnectionManager,

  // Classes
  ReconnectionManager,
} from "./reconnect";
