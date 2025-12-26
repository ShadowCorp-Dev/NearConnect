/**
 * Error codes for wallet connection errors
 */
export enum ErrorCode {
  // Connection errors
  WALLET_NOT_FOUND = "WALLET_NOT_FOUND",
  EXTENSION_NOT_INSTALLED = "EXTENSION_NOT_INSTALLED",
  EXTENSION_LOCKED = "EXTENSION_LOCKED",
  USER_REJECTED = "USER_REJECTED",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",

  // Network errors
  NETWORK_MISMATCH = "NETWORK_MISMATCH",
  NETWORK_ERROR = "NETWORK_ERROR",
  RPC_ERROR = "RPC_ERROR",

  // Session errors
  SESSION_EXPIRED = "SESSION_EXPIRED",
  SESSION_INVALID = "SESSION_INVALID",
  NO_ACTIVE_SESSION = "NO_ACTIVE_SESSION",

  // Transaction errors
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  INVALID_TRANSACTION = "INVALID_TRANSACTION",
  GAS_EXCEEDED = "GAS_EXCEEDED",

  // Sandbox errors
  SANDBOX_BLOCKED = "SANDBOX_BLOCKED",
  SANDBOX_TIMEOUT = "SANDBOX_TIMEOUT",
  EXECUTOR_LOAD_FAILED = "EXECUTOR_LOAD_FAILED",

  // Signing errors
  SIGN_MESSAGE_FAILED = "SIGN_MESSAGE_FAILED",
  SIGN_TRANSACTION_FAILED = "SIGN_TRANSACTION_FAILED",

  // Account errors
  NO_ACCOUNTS = "NO_ACCOUNTS",
  ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND",

  // Manifest errors
  MANIFEST_LOAD_FAILED = "MANIFEST_LOAD_FAILED",
  INVALID_MANIFEST = "INVALID_MANIFEST",

  // Generic
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Recovery actions that can be suggested to users
 */
export type RecoveryAction =
  | "install"
  | "unlock"
  | "retry"
  | "switch_network"
  | "reconnect"
  | "clear_session"
  | "select_different_wallet"
  | "check_balance"
  | "contact_support"
  | "open_app"
  | "refresh";

/**
 * Recovery option with action and metadata
 */
export interface RecoveryOption {
  action: RecoveryAction;
  label: string;
  description?: string;
  url?: string;
  handler?: () => Promise<void>;
}

/**
 * Base error class for all wallet connection errors
 */
export class WalletError extends Error {
  readonly code: ErrorCode;
  readonly walletId?: string;
  readonly userMessage: string;
  readonly recoveryOptions: RecoveryOption[];
  readonly originalError?: Error;
  readonly timestamp: number;

  constructor(options: {
    code: ErrorCode;
    message: string;
    userMessage?: string;
    walletId?: string;
    recoveryOptions?: RecoveryOption[];
    originalError?: Error;
  }) {
    super(options.message);
    this.name = "WalletError";
    this.code = options.code;
    this.walletId = options.walletId;
    this.userMessage = options.userMessage ?? this.getDefaultUserMessage(options.code);
    this.recoveryOptions = options.recoveryOptions ?? this.getDefaultRecoveryOptions(options.code);
    this.originalError = options.originalError;
    this.timestamp = Date.now();

    // Maintain proper stack trace (V8 engines only)
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (target: object, constructor: Function) => void;
    };
    if (typeof ErrorWithCapture.captureStackTrace === "function") {
      ErrorWithCapture.captureStackTrace(this, WalletError);
    }
  }

  private getDefaultUserMessage(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.WALLET_NOT_FOUND]: "The selected wallet is not available.",
      [ErrorCode.EXTENSION_NOT_INSTALLED]: "Please install the wallet extension to continue.",
      [ErrorCode.EXTENSION_LOCKED]: "Please unlock your wallet extension.",
      [ErrorCode.USER_REJECTED]: "You cancelled the connection request.",
      [ErrorCode.CONNECTION_TIMEOUT]: "Connection timed out. Please try again.",
      [ErrorCode.NETWORK_MISMATCH]: "Please switch to the correct network in your wallet.",
      [ErrorCode.NETWORK_ERROR]: "Network error. Please check your connection.",
      [ErrorCode.RPC_ERROR]: "Failed to communicate with the blockchain.",
      [ErrorCode.SESSION_EXPIRED]: "Your session has expired. Please reconnect.",
      [ErrorCode.SESSION_INVALID]: "Invalid session. Please reconnect.",
      [ErrorCode.NO_ACTIVE_SESSION]: "No active wallet connection.",
      [ErrorCode.TRANSACTION_FAILED]: "Transaction failed. Please try again.",
      [ErrorCode.INSUFFICIENT_FUNDS]: "Insufficient balance for this transaction.",
      [ErrorCode.INVALID_TRANSACTION]: "Invalid transaction parameters.",
      [ErrorCode.GAS_EXCEEDED]: "Transaction would exceed gas limit.",
      [ErrorCode.SANDBOX_BLOCKED]: "Wallet connection was blocked for security.",
      [ErrorCode.SANDBOX_TIMEOUT]: "Wallet took too long to respond.",
      [ErrorCode.EXECUTOR_LOAD_FAILED]: "Failed to load wallet connector.",
      [ErrorCode.SIGN_MESSAGE_FAILED]: "Failed to sign the message.",
      [ErrorCode.SIGN_TRANSACTION_FAILED]: "Failed to sign the transaction.",
      [ErrorCode.NO_ACCOUNTS]: "No accounts found in wallet.",
      [ErrorCode.ACCOUNT_NOT_FOUND]: "The specified account was not found.",
      [ErrorCode.MANIFEST_LOAD_FAILED]: "Failed to load wallet list.",
      [ErrorCode.INVALID_MANIFEST]: "Invalid wallet configuration.",
      [ErrorCode.UNKNOWN_ERROR]: "An unexpected error occurred.",
    };
    return messages[code] ?? messages[ErrorCode.UNKNOWN_ERROR];
  }

  private getDefaultRecoveryOptions(code: ErrorCode): RecoveryOption[] {
    const options: Partial<Record<ErrorCode, RecoveryOption[]>> = {
      [ErrorCode.EXTENSION_NOT_INSTALLED]: [
        { action: "install", label: "Install Extension" },
        { action: "select_different_wallet", label: "Use Different Wallet" },
      ],
      [ErrorCode.EXTENSION_LOCKED]: [
        { action: "unlock", label: "Unlock Wallet" },
        { action: "retry", label: "Try Again" },
      ],
      [ErrorCode.USER_REJECTED]: [
        { action: "retry", label: "Try Again" },
        { action: "select_different_wallet", label: "Use Different Wallet" },
      ],
      [ErrorCode.CONNECTION_TIMEOUT]: [
        { action: "retry", label: "Try Again" },
      ],
      [ErrorCode.NETWORK_MISMATCH]: [
        { action: "switch_network", label: "Switch Network" },
      ],
      [ErrorCode.NETWORK_ERROR]: [
        { action: "retry", label: "Retry Connection" },
      ],
      [ErrorCode.SESSION_EXPIRED]: [
        { action: "reconnect", label: "Reconnect Wallet" },
      ],
      [ErrorCode.NO_ACTIVE_SESSION]: [
        { action: "reconnect", label: "Connect Wallet" },
      ],
      [ErrorCode.INSUFFICIENT_FUNDS]: [
        { action: "check_balance", label: "Check Balance" },
      ],
      [ErrorCode.SANDBOX_BLOCKED]: [
        { action: "select_different_wallet", label: "Use Different Wallet" },
        { action: "refresh", label: "Refresh Page" },
      ],
      [ErrorCode.SANDBOX_TIMEOUT]: [
        { action: "retry", label: "Try Again" },
        { action: "refresh", label: "Refresh Page" },
      ],
      [ErrorCode.EXECUTOR_LOAD_FAILED]: [
        { action: "retry", label: "Retry Loading" },
        { action: "refresh", label: "Refresh Page" },
      ],
      [ErrorCode.MANIFEST_LOAD_FAILED]: [
        { action: "retry", label: "Retry Loading" },
        { action: "refresh", label: "Refresh Page" },
      ],
      [ErrorCode.INVALID_MANIFEST]: [
        { action: "contact_support", label: "Contact Support" },
      ],
      [ErrorCode.RPC_ERROR]: [
        { action: "retry", label: "Retry" },
        { action: "switch_network", label: "Try Different Network" },
      ],
      [ErrorCode.SIGN_MESSAGE_FAILED]: [
        { action: "retry", label: "Try Again" },
        { action: "reconnect", label: "Reconnect Wallet" },
      ],
      [ErrorCode.SIGN_TRANSACTION_FAILED]: [
        { action: "retry", label: "Try Again" },
        { action: "reconnect", label: "Reconnect Wallet" },
      ],
      [ErrorCode.GAS_EXCEEDED]: [
        { action: "retry", label: "Try with Less Gas" },
      ],
      [ErrorCode.TRANSACTION_FAILED]: [
        { action: "retry", label: "Try Again" },
        { action: "check_balance", label: "Check Balance" },
      ],
      [ErrorCode.SESSION_INVALID]: [
        { action: "clear_session", label: "Clear Session" },
        { action: "reconnect", label: "Reconnect Wallet" },
      ],
      [ErrorCode.NO_ACCOUNTS]: [
        { action: "reconnect", label: "Connect Wallet" },
        { action: "select_different_wallet", label: "Use Different Wallet" },
      ],
      [ErrorCode.ACCOUNT_NOT_FOUND]: [
        { action: "reconnect", label: "Reconnect Wallet" },
      ],
      [ErrorCode.WALLET_NOT_FOUND]: [
        { action: "install", label: "Install Wallet" },
        { action: "select_different_wallet", label: "Use Different Wallet" },
      ],
    };

    return options[code] ?? [{ action: "retry", label: "Try Again" }];
  }

  /**
   * Check if the error is recoverable
   */
  get isRecoverable(): boolean {
    const nonRecoverable = [
      ErrorCode.INVALID_MANIFEST,
      ErrorCode.INVALID_TRANSACTION,
    ];
    return !nonRecoverable.includes(this.code);
  }

  /**
   * Check if the error was caused by user action
   */
  get isUserAction(): boolean {
    return this.code === ErrorCode.USER_REJECTED;
  }

  /**
   * Serialize error for logging/analytics
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      walletId: this.walletId,
      recoveryOptions: this.recoveryOptions.map((o) => o.action),
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Specific error classes for common scenarios
 */

export class WalletNotFoundError extends WalletError {
  constructor(walletId: string, installUrl?: string) {
    const recoveryOptions: RecoveryOption[] = [
      { action: "select_different_wallet", label: "Use Different Wallet" },
    ];

    if (installUrl) {
      recoveryOptions.unshift({
        action: "install",
        label: "Install Wallet",
        url: installUrl,
      });
    }

    super({
      code: ErrorCode.WALLET_NOT_FOUND,
      message: `Wallet "${walletId}" not found`,
      walletId,
      recoveryOptions,
    });
    this.name = "WalletNotFoundError";
  }
}

export class UserRejectedError extends WalletError {
  constructor(walletId?: string, action?: string) {
    super({
      code: ErrorCode.USER_REJECTED,
      message: `User rejected ${action ?? "the request"}`,
      walletId,
    });
    this.name = "UserRejectedError";
  }
}

export class ConnectionTimeoutError extends WalletError {
  constructor(walletId?: string, timeoutMs?: number) {
    super({
      code: ErrorCode.CONNECTION_TIMEOUT,
      message: `Connection timed out${timeoutMs ? ` after ${timeoutMs}ms` : ""}`,
      walletId,
    });
    this.name = "ConnectionTimeoutError";
  }
}

export class NetworkMismatchError extends WalletError {
  readonly expectedNetwork: string;
  readonly actualNetwork?: string;

  constructor(expectedNetwork: string, actualNetwork?: string, walletId?: string) {
    super({
      code: ErrorCode.NETWORK_MISMATCH,
      message: `Network mismatch: expected ${expectedNetwork}${actualNetwork ? `, got ${actualNetwork}` : ""}`,
      walletId,
      recoveryOptions: [
        {
          action: "switch_network",
          label: `Switch to ${expectedNetwork}`,
        },
      ],
    });
    this.name = "NetworkMismatchError";
    this.expectedNetwork = expectedNetwork;
    this.actualNetwork = actualNetwork;
  }
}

export class TransactionError extends WalletError {
  readonly transactionHash?: string;

  constructor(options: {
    code?: ErrorCode;
    message: string;
    walletId?: string;
    transactionHash?: string;
    originalError?: Error;
  }) {
    super({
      code: options.code ?? ErrorCode.TRANSACTION_FAILED,
      message: options.message,
      walletId: options.walletId,
      originalError: options.originalError,
    });
    this.name = "TransactionError";
    this.transactionHash = options.transactionHash;
  }
}

export class SessionError extends WalletError {
  constructor(code: ErrorCode.SESSION_EXPIRED | ErrorCode.SESSION_INVALID | ErrorCode.NO_ACTIVE_SESSION, walletId?: string) {
    super({
      code,
      message: `Session error: ${code}`,
      walletId,
    });
    this.name = "SessionError";
  }
}

export class SandboxError extends WalletError {
  constructor(
    code: ErrorCode.SANDBOX_BLOCKED | ErrorCode.SANDBOX_TIMEOUT | ErrorCode.EXECUTOR_LOAD_FAILED,
    walletId?: string,
    originalError?: Error
  ) {
    super({
      code,
      message: `Sandbox error: ${code}`,
      walletId,
      originalError,
    });
    this.name = "SandboxError";
  }
}

export class SigningError extends WalletError {
  readonly action: "message" | "transaction";

  constructor(options: {
    action: "message" | "transaction";
    message: string;
    walletId?: string;
    originalError?: Error;
  }) {
    super({
      code: options.action === "message" ? ErrorCode.SIGN_MESSAGE_FAILED : ErrorCode.SIGN_TRANSACTION_FAILED,
      message: options.message,
      walletId: options.walletId,
      originalError: options.originalError,
    });
    this.name = "SigningError";
    this.action = options.action;
  }
}

export class RpcError extends WalletError {
  readonly endpoint?: string;
  readonly statusCode?: number;

  constructor(options: {
    message: string;
    endpoint?: string;
    statusCode?: number;
    originalError?: Error;
  }) {
    super({
      code: ErrorCode.RPC_ERROR,
      message: options.message,
      originalError: options.originalError,
    });
    this.name = "RpcError";
    this.endpoint = options.endpoint;
    this.statusCode = options.statusCode;
  }
}

export class ManifestError extends WalletError {
  readonly manifestUrl?: string;

  constructor(options: {
    code: ErrorCode.MANIFEST_LOAD_FAILED | ErrorCode.INVALID_MANIFEST;
    message: string;
    manifestUrl?: string;
    originalError?: Error;
  }) {
    super({
      code: options.code,
      message: options.message,
      originalError: options.originalError,
    });
    this.name = "ManifestError";
    this.manifestUrl = options.manifestUrl;
  }
}

/**
 * Type guard to check if an error is a WalletError
 */
export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
}

/**
 * Type guard to check if error has a specific code
 */
export function hasErrorCode<C extends ErrorCode>(error: unknown, code: C): error is WalletError & { code: C } {
  return isWalletError(error) && error.code === code;
}

/**
 * Serialized error format for storage/transmission
 */
export interface SerializedWalletError {
  name: string;
  code: ErrorCode;
  message: string;
  userMessage: string;
  walletId?: string;
  recoveryOptions: RecoveryAction[];
  timestamp: number;
  originalMessage?: string;
}

/**
 * Deserialize a WalletError from JSON
 */
export function deserializeError(data: SerializedWalletError): WalletError {
  return new WalletError({
    code: data.code,
    message: data.message,
    userMessage: data.userMessage,
    walletId: data.walletId,
    originalError: data.originalMessage ? new Error(data.originalMessage) : undefined,
  });
}

/**
 * Helper to wrap unknown errors with improved pattern detection
 */
export function wrapError(error: unknown, walletId?: string): WalletError {
  if (error instanceof WalletError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // User rejection patterns
    if (
      message.includes("user rejected") ||
      message.includes("user denied") ||
      message.includes("cancelled") ||
      message.includes("canceled") ||
      message.includes("user closed") ||
      message.includes("popup closed")
    ) {
      return new UserRejectedError(walletId);
    }

    // Timeout patterns
    if (message.includes("timeout") || message.includes("timed out")) {
      return new ConnectionTimeoutError(walletId);
    }

    // Network mismatch patterns
    if (message.includes("network") && (message.includes("mismatch") || message.includes("wrong") || message.includes("invalid"))) {
      return new NetworkMismatchError("unknown", undefined, walletId);
    }

    // Insufficient funds patterns
    if (
      (message.includes("insufficient") && (message.includes("fund") || message.includes("balance"))) ||
      message.includes("not enough balance") ||
      message.includes("doesn't have enough")
    ) {
      return new WalletError({
        code: ErrorCode.INSUFFICIENT_FUNDS,
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Gas patterns
    if (
      message.includes("gas") &&
      (message.includes("exceed") || message.includes("limit") || message.includes("not enough"))
    ) {
      return new WalletError({
        code: ErrorCode.GAS_EXCEEDED,
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Signing patterns
    if (message.includes("sign") && (message.includes("failed") || message.includes("error"))) {
      const isMessage = message.includes("message");
      return new SigningError({
        action: isMessage ? "message" : "transaction",
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Sandbox patterns
    if (message.includes("sandbox") || message.includes("iframe") || message.includes("blocked")) {
      return new SandboxError(ErrorCode.SANDBOX_BLOCKED, walletId, error);
    }

    // Executor patterns
    if (message.includes("executor") || message.includes("failed to load")) {
      return new SandboxError(ErrorCode.EXECUTOR_LOAD_FAILED, walletId, error);
    }

    // RPC patterns
    if (
      message.includes("rpc") ||
      message.includes("jsonrpc") ||
      message.includes("fetch failed") ||
      message.includes("network request")
    ) {
      return new RpcError({
        message: error.message,
        originalError: error,
      });
    }

    // Session patterns
    if (message.includes("session") && (message.includes("expired") || message.includes("invalid"))) {
      const code = message.includes("expired") ? ErrorCode.SESSION_EXPIRED : ErrorCode.SESSION_INVALID;
      return new SessionError(code, walletId);
    }

    // Account patterns
    if (message.includes("no account") || message.includes("account not found")) {
      return new WalletError({
        code: message.includes("not found") ? ErrorCode.ACCOUNT_NOT_FOUND : ErrorCode.NO_ACCOUNTS,
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Extension patterns
    if (message.includes("extension") && message.includes("not installed")) {
      return new WalletError({
        code: ErrorCode.EXTENSION_NOT_INSTALLED,
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    if (message.includes("extension") && message.includes("locked")) {
      return new WalletError({
        code: ErrorCode.EXTENSION_LOCKED,
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Transaction patterns
    if (message.includes("transaction") && (message.includes("failed") || message.includes("error"))) {
      return new TransactionError({
        message: error.message,
        walletId,
        originalError: error,
      });
    }

    // Default to unknown
    return new WalletError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: error.message,
      walletId,
      originalError: error,
    });
  }

  return new WalletError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: String(error),
    walletId,
  });
}

/**
 * Get a user-friendly message for any error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isWalletError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

/**
 * Get recovery options for any error
 */
export function getRecoveryOptions(error: unknown): RecoveryOption[] {
  if (isWalletError(error)) {
    return error.recoveryOptions;
  }
  return [{ action: "retry", label: "Try Again" }];
}
