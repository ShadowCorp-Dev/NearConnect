/**
 * Privileged Wallet Tier (Hardware Wallets)
 */

export {
  LedgerWallet,
  createLedgerWallet,
  type LedgerWalletAccount,
  type LedgerTransactionResult,
  type LedgerSignedTransaction,
  type LedgerSignMessageParams,
  type LedgerSignedMessage,
} from './ledger';

export {
  PrivilegedWalletManager,
  type PrivilegedWalletManagerConfig,
  type PrivilegedWalletManagerEvents,
  type WalletManifest,
} from './manager';
