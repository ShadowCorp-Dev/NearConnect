import type { FinalExecutionOutcome } from "@near-js/types";
import type { Action } from "@near-js/transactions";
import type { ConnectorAction } from "./actions/types";

// Re-export for convenience
export type { FinalExecutionOutcome, Action };

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make specific keys optional in a type
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys required in a type
 */
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Deep partial - makes all nested properties optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// ============================================================================
// Core Types
// ============================================================================

/**
 * NEAR network identifier
 */
export type Network = "mainnet" | "testnet";

/**
 * Logger interface for debugging
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

/**
 * NEAR account with optional public key
 */
export interface Account {
  /** The account ID (e.g., "alice.near") */
  accountId: string;
  /** The public key associated with this account (base58 encoded) */
  publicKey?: string;
}

/**
 * Extended account info with additional metadata
 */
export interface AccountInfo extends Account {
  /** Account balance in yoctoNEAR */
  balance?: string;
  /** Whether this is a named account */
  isNamed?: boolean;
  /** Contract deployed on this account */
  contractId?: string;
}

// ============================================================================
// Message Signing
// ============================================================================

/**
 * Parameters for signing a message (NEP-413)
 * @see https://github.com/near/NEPs/blob/master/neps/nep-0413.md
 */
export interface SignMessageParams {
  /** The message to sign (will be prefixed per NEP-413) */
  message: string;
  /** The intended recipient of the signed message */
  recipient: string;
  /** A unique nonce to prevent replay attacks (32 bytes) */
  nonce: Uint8Array;
  /** Network to use for signing */
  network?: Network;
  /** Account to sign with (if wallet supports multiple accounts) */
  signerId?: string;
  /** Optional callback URL for redirect-based wallets */
  callbackUrl?: string;
}

/**
 * Result of signing a message
 */
export interface SignedMessage {
  /** The account that signed the message */
  accountId: string;
  /** The public key used for signing (base58 encoded) */
  publicKey: string;
  /** The signature (base64 encoded) */
  signature: string;
  /** The original message that was signed */
  message?: string;
  /** The nonce used */
  nonce?: string;
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction to be signed and sent
 */
export interface Transaction {
  /** The account receiving the transaction */
  receiverId: string;
  /** Actions to execute */
  actions: Array<Action | ConnectorAction>;
}

/**
 * Parameters for signing and sending a single transaction
 */
export interface SignAndSendTransactionParams {
  /** Network to send transaction on */
  network?: Network;
  /** Account to sign with (if wallet supports multiple accounts) */
  signerId?: string;
  /** The account receiving the transaction */
  receiverId: string;
  /** Actions to execute */
  actions: Array<Action | ConnectorAction>;
  /** Optional callback URL for redirect-based wallets */
  callbackUrl?: string;
}

/**
 * Parameters for signing and sending multiple transactions
 */
export interface SignAndSendTransactionsParams {
  /** Network to send transactions on */
  network?: Network;
  /** Account to sign with (if wallet supports multiple accounts) */
  signerId?: string;
  /** Transactions to sign and send */
  transactions: Array<Transaction>;
  /** Optional callback URL for redirect-based wallets */
  callbackUrl?: string;
}

/**
 * Parameters for signing in to a wallet
 */
export interface SignInParams {
  /** Network to sign in on */
  network?: Network;
  /** Contract to request access key for (optional) */
  contractId?: string;
  /** Methods to allow access key to call (requires contractId) */
  methodNames?: string[];
  /** Optional callback URL for redirect-based wallets */
  callbackUrl?: string;
}

/**
 * Parameters for signing out
 */
export interface SignOutParams {
  /** Network to sign out from */
  network?: Network;
}

/**
 * Parameters for getting accounts
 */
export interface GetAccountsParams {
  /** Network to get accounts for */
  network?: Network;
}

// ============================================================================
// Wallet Manifest Types
// ============================================================================

/**
 * Wallet permissions for sandboxed execution
 */
export interface WalletPermissions {
  /** Allow access to localStorage-like storage */
  storage?: boolean;
  /** External window.near objects the wallet can access */
  external?: string[];
  /** Allow WalletConnect integration */
  walletConnect?: boolean;
  /** URLs the wallet is allowed to open */
  allowsOpen?: string[];
  /** Allow reading from clipboard */
  clipboardRead?: boolean;
  /** Allow writing to clipboard */
  clipboardWrite?: boolean;
  /** Allow WebUSB access (for hardware wallets) */
  usb?: boolean;
  /** Allow WebHID access (for hardware wallets) */
  hid?: boolean;
  /** Allow access to current page location */
  location?: boolean;
}

/**
 * Wallet feature flags
 */
export interface WalletFeatures {
  /** Supports NEP-413 message signing */
  signMessage: boolean;
  /** Supports signing transactions without sending */
  signTransaction: boolean;
  /** Supports signing and sending a single transaction */
  signAndSendTransaction: boolean;
  /** Supports signing and sending multiple transactions */
  signAndSendTransactions: boolean;
  /** Can sign in without adding an access key */
  signInWithoutAddKey: boolean;
  /** Supports mainnet */
  mainnet: boolean;
  /** Supports testnet */
  testnet: boolean;
  /** Supports verifyOwner (deprecated) */
  verifyOwner?: boolean;
}

/**
 * Platform availability for a wallet
 */
export interface WalletPlatform {
  /** Web app URL */
  web?: string;
  /** Chrome extension URL */
  chrome?: string;
  /** Firefox extension URL */
  firefox?: string;
  /** Edge extension URL */
  edge?: string;
  /** iOS app URL */
  ios?: string;
  /** Android app URL */
  android?: string;
  /** Telegram app URL */
  tga?: string;
}

/**
 * Wallet manifest describing a wallet's capabilities
 */
export interface WalletManifest {
  /** Unique wallet identifier */
  id: string;
  /** Human-readable wallet name */
  name: string;
  /** Wallet icon URL */
  icon: string;
  /** Short description of the wallet */
  description: string;
  /** Wallet website */
  website: string;
  /** Manifest version */
  version: string;
  /** URL to the wallet executor script */
  executor: string;
  /** Wallet type */
  type: "sandbox" | "injected" | "privileged";
  /** Required permissions */
  permissions: WalletPermissions;
  /** Supported features */
  features: WalletFeatures;
  /** Platform availability */
  platform?: WalletPlatform;
  /** Whether this is a debug wallet */
  debug?: boolean;
}

/**
 * Wallet manifest from repository
 */
export interface WalletManifestRepository {
  /** Manifest schema version */
  version: string;
  /** Available wallets */
  wallets: WalletManifest[];
}

// ============================================================================
// Wallet Interface
// ============================================================================

/**
 * Base interface that all wallet implementations must satisfy
 */
export interface NearWalletBase {
  /** The wallet's manifest */
  manifest: WalletManifest;

  /**
   * Sign in to the wallet
   * @param data - Optional sign in parameters
   * @returns Array of connected accounts
   */
  signIn(data?: SignInParams): Promise<Account[]>;

  /**
   * Sign out from the wallet
   * @param data - Optional sign out parameters
   */
  signOut(data?: SignOutParams): Promise<void>;

  /**
   * Get connected accounts
   * @param data - Optional parameters
   * @returns Array of connected accounts
   */
  getAccounts(data?: GetAccountsParams): Promise<Account[]>;

  /**
   * Sign and send a single transaction
   * @param params - Transaction parameters
   * @returns Transaction execution outcome
   */
  signAndSendTransaction(params: SignAndSendTransactionParams): Promise<FinalExecutionOutcome>;

  /**
   * Sign and send multiple transactions
   * @param params - Transactions parameters
   * @returns Array of transaction execution outcomes
   */
  signAndSendTransactions(params: SignAndSendTransactionsParams): Promise<FinalExecutionOutcome[]>;

  /**
   * Sign a message (NEP-413)
   * @param params - Message signing parameters
   * @returns Signed message
   */
  signMessage(params: SignMessageParams): Promise<SignedMessage>;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Persisted session data
 */
export interface Session {
  /** ID of the connected wallet */
  walletId: string;
  /** Connected accounts */
  accounts: Account[];
  /** Network the session is on */
  network: Network;
  /** Timestamp when session was created */
  connectedAt: number;
  /** Timestamp of last activity */
  lastActiveAt: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitted when wallet injection occurs
 */
export type EventNearWalletInjected = CustomEvent<NearWalletBase>;

/**
 * Wallet event payloads for internal wallet communication
 */
export interface WalletEvents {
  signedIn: { contractId: string; methodNames: string[]; accounts: Account[] };
  accountsChanged: { accounts: Account[] };
  networkChanged: { networkId: string };
  signedOut: null;
}

/**
 * Map of event names to their payload types
 */
export interface EventMap {
  /** Emitted when wallet sign in completes */
  "wallet:signIn": {
    wallet: NearWalletBase;
    accounts: Account[];
    success: boolean;
  };
  /** Emitted when wallet sign out completes */
  "wallet:signOut": {
    success: boolean;
  };
  /** Emitted when a wallet error occurs */
  "wallet:error": {
    error: Error;
    walletId?: string;
    action?: string;
  };
  /** Emitted when wallet accounts change */
  "wallet:accountsChanged": {
    wallet: NearWalletBase;
    accounts: Account[];
  };
  /** Emitted when manifest is updated */
  "selector:manifestUpdated": {
    version: string;
    walletCount: number;
  };
  /** Emitted when available wallets change */
  "selector:walletsChanged": {
    wallets?: NearWalletBase[];
  };
  /** Emitted when a session is restored */
  "session:restored": {
    session: Session;
  };
  /** Emitted when a session expires */
  "session:expired": {
    session: Session;
  };

  // Multi-account events
  /** Emitted when active account is switched */
  "account:switched": {
    account: Account;
    previousAccountId: string | null;
  };
  /** Emitted when new account(s) are added */
  "account:added": {
    accounts: Account[];
  };
  /** Emitted when an account is removed */
  "account:removed": {
    account: Account;
  };
  /** Emitted when all accounts are cleared */
  "account:cleared": Record<string, never>;
}

/**
 * Event type names
 */
export type EventType = keyof EventMap;

/**
 * Callback type for a specific event
 */
export type EventCallback<K extends EventType> = (payload: EventMap[K]) => void;

// ============================================================================
// WalletConnect Types
// ============================================================================

/**
 * Abstract WalletConnect client interface
 */
export interface AbstractWalletConnect {
  connect: (params: {
    requiredNamespaces?: Record<string, { chains: string[]; methods: string[]; events: string[] }>;
    optionalNamespaces?: Record<string, { chains: string[]; methods: string[]; events: string[] }>;
  }) => Promise<{
    uri?: string;
    approval: () => Promise<unknown>;
  }>;
  disconnect: (params: { topic: string }) => Promise<void>;
  request: <T = unknown>(params: {
    topic: string;
    chainId: string;
    request: { method: string; params: unknown[] };
  }) => Promise<T>;
  session: {
    keys: string[];
    get: (key: string) => { topic: string; namespaces: Record<string, unknown> };
  };
  core: {
    projectId?: string;
  };
}

/**
 * WalletConnect metadata
 */
export interface WalletConnectMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

// ============================================================================
// Connector Options Types
// ============================================================================

/**
 * Options for session persistence
 */
export interface PersistenceOptions {
  /** Enable session persistence (default: true) */
  enabled?: boolean;
  /** Custom storage implementation */
  storage?: DataStorage;
  /** Storage key for session data */
  storageKey?: string;
  /** Session max age in milliseconds (default: 7 days) */
  maxAge?: number;
  /** Auto-reconnect on page load (default: true) */
  autoReconnect?: boolean;
}

/**
 * Data storage interface for persistence
 */
export interface DataStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Options for NearConnector
 */
export interface NearConnectorOptions {
  /** RPC providers by network */
  providers?: { mainnet?: string[]; testnet?: string[] };
  /** Filter wallets by features */
  features?: Partial<WalletFeatures>;
  /** Wallet IDs to exclude */
  excludedWallets?: string[];
  /** Auto-connect to injected wallets (default: true) */
  autoConnect?: boolean;
  /** Initial network (default: "mainnet") */
  network?: Network;
  /** Custom manifest URL or object */
  manifest?: string | WalletManifestRepository;
  /** WalletConnect client */
  walletConnect?: Promise<AbstractWalletConnect> | AbstractWalletConnect;
  /** Custom storage implementation */
  storage?: DataStorage;
  /** Logger for debugging */
  logger?: Logger;
  /** Session persistence options */
  persistence?: PersistenceOptions;
  /**
   * @deprecated Use persistence options instead
   * Sign in data for initial connection
   */
  signIn?: { contractId?: string; methodNames?: string[] };
}
