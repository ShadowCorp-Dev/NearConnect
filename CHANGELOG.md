# Changelog

All notable changes to NearConnect will be documented in this file.

## [1.0.3]

### Added

- **Proactive injected wallet detection** - Detects browser extension wallets (Meteor, Sender, HERE, Nightly) by checking window globals
  - No longer relies solely on wallets firing `near-wallet-injected` event
  - Automatic wrapper creation for detected extensions
  - `wallet:detected` event emitted when extensions are found

### Fixed

- **Meteor extension not detected** - Extensions that don't fire injection events are now detected via window global polling

## [1.0.2]

### Added

- **`init()` method** - Proper async initialization that waits for manifest and session restoration
- **`tryGetConnectedWallet()`** - Non-throwing version that returns `null` if no wallet connected
- **`isConnected()`** - Simple boolean check for connection state
- **`isReady` getter** - Check if connector is ready (manifest loaded)

### Fixed

- **Initialization errors** - `getConnectedWallet()` no longer breaks initialization when no previous session exists
- Graceful handling of missing sessions during startup

## [1.0.1]

### Fixed

- **WalletConnect optional dependency** - Fixed bundler error when `@walletconnect/sign-client` is not installed
  - Added `@vite-ignore` and `webpackIgnore` comments to prevent static analysis
  - Use variable for module name to prevent bundler resolution
  - Added try-catch with helpful error message
  - Declared as optional peer dependency in package.json

## [1.0.0] 

### Overview

This is the first major release of NearConnect, an enhanced fork of [azbang/near-connect](https://github.com/azbang/near-connect) (commit c72689d). This release introduces a four-tier wallet architecture and comprehensive security layers.

### Added

#### Four-Tier Wallet Architecture

The original library relied heavily on iframe sandboxing. This release introduces a tiered approach that handles each wallet type according to its trust level:

- **Tier 1: Sandboxed (Web Wallets)** - Iframe isolation with origin verification
- **Tier 2: Injected (Browser Extensions)** - Browser extension sandbox with permission model
- **Tier 3: Privileged (Hardware Wallets)** - Physical device confirmation required
- **Tier 4: External (Mobile Wallets)** - Cryptographic signatures with callback verification

#### Hardware Wallet Support (Tier 3)

- `LedgerWallet` - Full Ledger hardware wallet integration
- `LedgerTransport` - WebHID transport layer for browser communication
- `LedgerNearApp` - NEAR app APDU protocol implementation
- Full borsh serialization for NEAR transactions
- NEP-413 message signing support
- Device event callbacks (`waiting`, `confirm`, `rejected`)
- `PrivilegedWalletManager` - Unified hardware wallet management

#### Mobile Wallet Support (Tier 4)

- `ExternalWalletManager` - Mobile wallet connection manager
- Deep link support for Meteor and HERE wallets
- WalletConnect v2 integration
- Redirect flow handling with callback verification
- Mobile device detection

#### Security Layers

- **TransactionGuard** - Transaction risk analysis before signing
  - Detects dangerous methods (`add_full_access_key`, `delete_account`, `deploy_contract`)
  - Identifies large transfers (configurable threshold)
  - Blocks known scam contracts
  - Custom blocklists and allowlists

- **OriginGuard** - Message origin verification
  - postMessage origin validation
  - Callback URL verification
  - Pre-configured trusted wallet origins
  - Secure message handler factory

- **RateLimiter** - Request throttling
  - Configurable request windows
  - Automatic blocking on limit exceeded
  - Pre-configured limiters (`connectLimiter`, `signLimiter`, `rpcLimiter`)
  - Peek without recording for status checks

- **AuditLog** - Security event tracking
  - Comprehensive event types (wallet, transaction, security, hardware)
  - Filtering and querying capabilities
  - JSON and CSV export
  - Optional remote endpoint for server-side logging
  - localStorage persistence

- **SecureStorage** - Encrypted browser storage
  - AES-GCM encryption
  - Non-exportable CryptoKey storage
  - Secure key derivation

- **CSP Helpers** - Content Security Policy utilities
  - CSP header generation
  - Recommended CSP for NEAR apps
  - Security checklist runner

#### Session & Storage

- `SessionManager` - Session lifecycle management with validation and expiry
- Multiple storage backends:
  - `MemoryStorage` - In-memory (testing/SSR)
  - `LocalStorage` - Browser localStorage wrapper
  - `SessionStorage` - Browser sessionStorage wrapper
  - `IndexedDBStorage` - IndexedDB for larger data
  - `EncryptedStorage` - AES-GCM encrypted storage
- Multi-tab synchronization via BroadcastChannel
- Idle timeout tracking

#### Error Handling

- `WalletError` - Base error class with typed error codes
- Specific error classes:
  - `WalletNotFoundError`
  - `UserRejectedError`
  - `ConnectionTimeoutError`
  - `NetworkMismatchError`
  - `TransactionError`
  - `SessionError`
  - `SandboxError`
  - `SigningError`
  - `RpcError`
  - `ManifestError`
- `getUserFriendlyMessage()` - Human-readable error messages
- `getRecoveryOptions()` - Suggested recovery actions
- Error serialization/deserialization for cross-context communication

#### UI Components

- `WalletSelectorModal` - Wallet selection with categories and search
- `TransactionModal` - Transaction confirmation with risk display
- `AccountSwitcherModal` - Multi-account management
- Theme system:
  - `darkTheme` and `lightTheme` presets
  - `createDarkTheme()` / `createLightTheme()` factories
  - `mergeTheme()` for customization
  - `themeToCssVars()` for CSS variable generation
- Icon set for wallet types and actions

#### Connection Reliability

- `withRetry()` - Retry with exponential backoff
- `withTimeout()` - Operation timeout wrapper
- `withRetryAndTimeout()` - Combined retry and timeout
- `CircuitBreaker` - Prevents hammering failing wallets
- `ConnectionStateMachine` - Connection state management
- `HealthMonitor` - Connection health monitoring
- `ReconnectionManager` - Automatic reconnection handling

#### Other Features

- `TransactionSimulator` - Gas estimation and simulation
- `TrustScorer` - Wallet reputation scoring
- `FederatedManifestManager` - Multiple manifest source support
- `Analytics` - Pluggable analytics with batching adapter
- Multi-account support across all wallet types

### Changed

- Package renamed to `@shadowcorp/near-connect`
- Restructured exports for better tree-shaking
- TypeScript strict mode enabled throughout

### Removed

- GitHub Actions workflows (not needed for library distribution)

---

## Pre-fork History

The following versions are from the original [azbang/near-connect](https://github.com/azbang/near-connect):

### [0.8.0]
- Remove WalletConnect as optional dep
- Change types for UseGlobalContractAction and DeployGlobalContractAction

### [0.7.0]
- Add UseGlobalContractAction, DeployGlobalContractAction
- Support Actions from @near-js

### [0.6.11]
- Add `signIn` to setup limited access key (deprecated flow)

### [0.6.10]
- Fix SSR issues
- Fix random class name

### [0.6.9]
- Fix SSR issues
- Move styles to isolated className

### [0.6.8]
- Add fallback for manifest
- Remove contractId and methods from signIn method

### [0.6.7]
- Move all intents specific code and multichain connector to @hot-labs/wibe3
- Remove connectWithKey option
- Add excludeWallets, providers and isBannedNearAddress options
- Some cache improvements
