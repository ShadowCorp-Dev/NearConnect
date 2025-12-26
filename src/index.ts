export {
  type DataStorage,
  LocalStorage,
  SessionStorage,
  MemoryStorage,
  IndexedDBStorage,
  EncryptedStorage,
} from "./helpers/storage";
export { SessionManager, type SessionManagerOptions, type SessionValidationResult } from "./helpers/session";
export {
  Analytics,
  type AnalyticsAdapter,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type AnalyticsOptions,
  ConsoleAnalyticsAdapter,
  NoopAnalyticsAdapter,
  BatchingAnalyticsAdapter,
} from "./helpers/analytics";
export {
  TransactionSimulator,
  quickGasEstimate,
  type SimulationResult,
  type GasEstimate,
  type ActionGasEstimate,
  type SimulationWarning,
  type SimulationWarningType,
} from "./helpers/simulation";
export {
  FederatedManifestManager,
  validateManifest,
  mergeManifests,
  DEFAULT_MANIFEST_SOURCES,
  type ManifestSource,
  type FetchedManifest,
  type CombinedManifest,
  type FederatedManifestOptions,
} from "./helpers/manifest";
export {
  TrustScorer,
  quickTrustCheck,
  type TrustScore,
  type TrustScoreComponents,
  type TrustLevel,
  type TrustWarning,
  type TrustWarningType,
  type TrustSignal,
  type TrustSignalType,
  type TrustScorerOptions,
} from "./helpers/trust";
export { ParentFrameWallet } from "./ParentFrameWallet";
export { SandboxWallet } from "./SandboxedWallet";
export { InjectedWallet } from "./InjectedWallet";
export { NearConnector, type ConnectedAccount } from "./NearConnector";

export { nearActionsToConnectorActions } from "./actions";
export type { ConnectorAction } from "./actions/types";

// Error handling
export {
  // Error codes
  ErrorCode,

  // Base error class
  WalletError,

  // Specific error classes
  WalletNotFoundError,
  UserRejectedError,
  ConnectionTimeoutError,
  NetworkMismatchError,
  TransactionError,
  SessionError,
  SandboxError,
  SigningError,
  RpcError,
  ManifestError,

  // Utility functions
  wrapError,
  isWalletError,
  hasErrorCode,
  deserializeError,
  getUserFriendlyMessage,
  getRecoveryOptions,
} from "./errors";
export type { RecoveryAction, RecoveryOption, SerializedWalletError } from "./errors";

export type {
  // Core types
  Network,
  Account,
  AccountInfo,
  Logger,

  // Utility types
  Optional,
  RequiredKeys,
  DeepPartial,
  Awaited,

  // Message signing
  SignMessageParams,
  SignedMessage,

  // Transaction types
  Transaction,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignInParams,
  SignOutParams,
  GetAccountsParams,

  // Wallet manifest
  WalletManifest,
  WalletManifestRepository,
  WalletFeatures,
  WalletPermissions,
  WalletPlatform,

  // Wallet interface
  NearWalletBase,

  // Session
  Session,

  // Events
  EventMap,
  EventType,
  EventCallback,
  EventNearWalletInjected,
  WalletEvents,

  // WalletConnect
  AbstractWalletConnect,
  WalletConnectMetadata,

  // Connector options
  NearConnectorOptions,
  PersistenceOptions,

  // Re-exports
  FinalExecutionOutcome,
  Action,
} from "./types";

// UI components
export {
  // Theme system
  type ThemeMode,
  type ThemeColors,
  type ThemeTypography,
  type ThemeSpacing,
  type ThemeBorderRadius,
  type ThemeAnimation,
  type ThemeBranding,
  type Theme,
  type ThemeOverrides,
  createDarkTheme,
  createLightTheme,
  mergeTheme,
  getSystemTheme,
  themeToCssVars,
  darkTheme,
  lightTheme,

  // Icons
  icons,
  type IconName,

  // Styles
  generateStyles,

  // Modals
  Modal,
  type ModalOptions,
  WalletSelectorModal,
  type WalletSelectorOptions,
  type WalletUIInfo,
  type WalletCategory,
  TransactionModal,
  type TransactionModalOptions,
  AccountSwitcherModal,
  type AccountSwitcherOptions,
  type AccountUIInfo,
} from "./ui";

// Connection reliability
export {
  // Retry logic
  type RetryConfig,
  type TimeoutConfig,
  type CircuitBreakerConfig,
  type CircuitState,
  type CancellableOperation,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  calculateBackoffDelay,
  isRetryableError,
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  createRetryWrapper,
  createTimeoutWrapper,
  makeCancellable,
  CircuitBreaker,

  // State machine
  type ConnectionStatus,
  type ConnectionState,
  type StateHistoryEntry,
  type StateMachineConfig,
  DEFAULT_STATE_MACHINE_CONFIG,
  createStateMachine,
  getStatusDescription,
  ConnectionStateMachine,

  // Health monitoring
  type HealthStatus,
  type ConnectionHealth,
  type HealthCheckResult,
  type HealthConfig,
  type HealthEventMap,
  type HealthCheckFn,
  DEFAULT_HEALTH_CONFIG,
  createWalletHealthCheck,
  createHealthMonitor,
  HealthMonitor,

  // Reconnection
  type ReconnectTriggers,
  type ReconnectConfig,
  type QueuedOperation,
  type ReconnectState,
  type ReconnectEventMap,
  type ReconnectFn,
  DEFAULT_RECONNECT_TRIGGERS,
  DEFAULT_RECONNECT_CONFIG,
  createReconnectionManager,
  ReconnectionManager,
} from "./connection";

// Hardware wallet support (Privileged tier)
export {
  // Types
  type HardwareWalletType,
  type HardwareConfig,
  type LedgerConfig,
  type TrezorConfig,
  type LedgerModel,
  type LedgerDeviceInfo,
  type APDUCommand,
  type APDUResponse,
  type HardwareWaitingEvent,
  type HardwareConfirmEvent,
  type HardwareRejectedEvent,
  HardwareErrorCode,
  NEAR_CLA,
  NEAR_INS,
  LEDGER_STATUS,
  DEFAULT_DERIVATION_PATH,
  LEDGER_PRODUCT_IDS,

  // Errors
  HardwareError,
  createHardwareError,
  handleLedgerStatus,
  isHardwareError,
  isUserRejection,
  isDeviceNotFound,
  isAppNotOpen,

  // Transport
  LedgerTransport,
  detectLedgerModel,

  // NEAR App
  LedgerNearApp,
  type NearAppVersion,
  type PublicKeyResult,
  type SignatureResult,
} from "./hardware";

// Privileged wallet tier (hardware wallets)
export {
  LedgerWallet,
  createLedgerWallet,
  type LedgerWalletAccount,
  type LedgerTransactionResult,
  type LedgerSignedTransaction,
  type LedgerSignMessageParams,
  type LedgerSignedMessage,
  PrivilegedWalletManager,
  type PrivilegedWalletManagerConfig,
  type PrivilegedWalletManagerEvents,
} from "./wallets/privileged";

// External wallet tier (mobile + WalletConnect)
export {
  ExternalWalletManager,
  type ExternalWalletType,
  type ExternalWalletConfig,
  type ExternalWalletManagerConfig,
  type ExternalWalletAccount,
  type ExternalTransactionResult,
  type ExternalSignMessageParams,
  type ExternalSignedMessage,
  type ExternalWalletManifest,
  type PendingRequest,
} from "./wallets/external";

// Security layers
export {
  // Transaction verification
  TransactionGuard,
  createDefaultTransactionGuard,
  type SecurityTransaction,
  type TransactionLimits,
  type TransactionRisk,

  // Origin verification
  OriginGuard,
  createSecureMessageHandler,
  type TrustedOrigins,
  type OriginGuardConfig,

  // Secure storage
  SecureStorage,
  createSecureStorage,
  type SecureStorageOptions,

  // Rate limiting
  RateLimiter,
  connectLimiter,
  signLimiter,
  rpcLimiter,
  rateLimit,
  withRateLimit,
  type RateLimitConfig,
  type RateLimitResult,

  // Audit logging
  AuditLog,
  createAuditLog,
  type AuditEvent,
  type AuditEventType,
  type AuditLogConfig,

  // CSP and security checklist
  generateCSP,
  getRecommendedCSP,
  mergeCSP,
  applyCSPMetaTag,
  runSecurityChecklist,
  getSecuritySummary,
  verifySecureContext,
  DEFAULT_CSP_DIRECTIVES,
  type CSPDirectives,
  type SecurityCheck,
} from "./security";
