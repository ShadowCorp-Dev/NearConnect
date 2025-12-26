/**
 * Hardware Wallet Module
 */

// Types
export * from './types';

// Errors
export {
  HardwareError,
  createHardwareError,
  handleLedgerStatus,
  isHardwareError,
  isUserRejection,
  isDeviceNotFound,
  isAppNotOpen,
} from './errors';

// Transport
export { LedgerTransport, detectLedgerModel } from './transport';

// NEAR App
export {
  LedgerNearApp,
  type NearAppVersion,
  type PublicKeyResult,
  type SignatureResult,
} from './near-app';
