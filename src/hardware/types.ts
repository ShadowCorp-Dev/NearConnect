/**
 * Hardware Wallet Types
 *
 * Types, constants, and interfaces for hardware wallet support
 */

// =============================================================================
// Hardware Wallet Types
// =============================================================================

export type HardwareWalletType = 'ledger' | 'trezor';

// =============================================================================
// Ledger Constants
// =============================================================================

/** NEAR app CLA byte */
export const NEAR_CLA = 0x80;

/** NEAR app instruction codes */
export const NEAR_INS = {
  GET_VERSION: 0x00,
  GET_PUBLIC_KEY: 0x04,
  SIGN_TRANSACTION: 0x02,
  SIGN_NEP413_MESSAGE: 0x07,
} as const;

/** Ledger status codes */
export const LEDGER_STATUS = {
  OK: 0x9000,
  WRONG_LENGTH: 0x6700,
  INVALID_DATA: 0x6a80,
  CONDITIONS_NOT_SATISFIED: 0x6985,
  COMMAND_NOT_ALLOWED: 0x6986,
  INS_NOT_SUPPORTED: 0x6d00,
  CLA_NOT_SUPPORTED: 0x6e00,
  APP_NOT_OPEN: 0x6e01,
  UNKNOWN: 0x6f00,
  USER_REJECTED: 0x6985,
  DEVICE_LOCKED: 0x6982,
} as const;

/** Default BIP44 derivation path for NEAR */
export const DEFAULT_DERIVATION_PATH = "44'/397'/0'/0'/1'";

/** Ledger device product IDs for model detection */
export const LEDGER_PRODUCT_IDS = {
  NANO_S: 0x1011,
  NANO_S_PLUS: 0x5011,
  NANO_X: 0x4011,
  STAX: 0x6011,
} as const;

// =============================================================================
// Hardware Error Codes
// =============================================================================

export enum HardwareErrorCode {
  // Device errors
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_LOCKED = 'DEVICE_LOCKED',
  DEVICE_BUSY = 'DEVICE_BUSY',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  DISCONNECTED = 'DISCONNECTED',

  // App errors
  APP_NOT_OPEN = 'APP_NOT_OPEN',
  WRONG_APP = 'WRONG_APP',
  APP_VERSION_UNSUPPORTED = 'APP_VERSION_UNSUPPORTED',

  // User errors
  USER_REJECTED = 'USER_REJECTED',
  TIMEOUT = 'TIMEOUT',

  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  DERIVATION_PATH_ERROR = 'DERIVATION_PATH_ERROR',
  TRANSACTION_TOO_LARGE = 'TRANSACTION_TOO_LARGE',

  // Transport errors
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
  WEBHID_NOT_SUPPORTED = 'WEBHID_NOT_SUPPORTED',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface LedgerConfig {
  enabled?: boolean;
  derivationPath?: string;
}

export interface TrezorConfig {
  enabled?: boolean;
  derivationPath?: string;
}

export interface HardwareConfig {
  ledger?: LedgerConfig | boolean;
  trezor?: TrezorConfig | boolean;
}

// =============================================================================
// Device Types
// =============================================================================

export type LedgerModel = 'nano-s' | 'nano-s-plus' | 'nano-x' | 'stax' | 'unknown';

export interface LedgerDeviceInfo {
  model: LedgerModel;
  nearAppVersion?: string;
}

// =============================================================================
// APDU Types
// =============================================================================

export interface APDUCommand {
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  data?: Uint8Array;
}

export interface APDUResponse {
  data: Uint8Array;
  statusCode: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface HardwareWaitingEvent {
  walletId: string;
  action: 'connect' | 'get_public_key' | 'sign' | 'sign_message';
  message: string;
}

export interface HardwareConfirmEvent {
  walletId: string;
  action: 'connect' | 'get_public_key' | 'sign' | 'sign_message';
}

export interface HardwareRejectedEvent {
  walletId: string;
  action: 'connect' | 'get_public_key' | 'sign' | 'sign_message';
  reason: string;
}
