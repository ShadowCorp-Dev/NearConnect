/**
 * Hardware Wallet Error Handling
 */

import { HardwareErrorCode, LEDGER_STATUS } from './types';

/**
 * Hardware wallet error class
 */
export class HardwareError extends Error {
  readonly code: HardwareErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: HardwareErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HardwareError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Create a hardware error with standard message
 */
export function createHardwareError(
  code: HardwareErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): HardwareError {
  const message = customMessage || getDefaultMessage(code);
  return new HardwareError(code, message, details);
}

/**
 * Get default user-friendly message for error code
 */
function getDefaultMessage(code: HardwareErrorCode): string {
  switch (code) {
    case HardwareErrorCode.DEVICE_NOT_FOUND:
      return 'Hardware wallet not found. Please connect your device and try again.';
    case HardwareErrorCode.DEVICE_LOCKED:
      return 'Device is locked. Please unlock your hardware wallet.';
    case HardwareErrorCode.DEVICE_BUSY:
      return 'Device is busy. Please close other applications using the device.';
    case HardwareErrorCode.CONNECTION_FAILED:
      return 'Failed to connect to hardware wallet.';
    case HardwareErrorCode.DISCONNECTED:
      return 'Hardware wallet disconnected unexpectedly.';
    case HardwareErrorCode.APP_NOT_OPEN:
      return 'Please open the NEAR app on your hardware wallet.';
    case HardwareErrorCode.WRONG_APP:
      return 'Wrong app open on device. Please open the NEAR app.';
    case HardwareErrorCode.APP_VERSION_UNSUPPORTED:
      return 'NEAR app version is not supported. Please update the app.';
    case HardwareErrorCode.USER_REJECTED:
      return 'Transaction rejected on device.';
    case HardwareErrorCode.TIMEOUT:
      return 'Operation timed out. Please try again.';
    case HardwareErrorCode.INVALID_DATA:
      return 'Invalid data received from device.';
    case HardwareErrorCode.DERIVATION_PATH_ERROR:
      return 'Invalid derivation path.';
    case HardwareErrorCode.TRANSACTION_TOO_LARGE:
      return 'Transaction is too large for the device to sign.';
    case HardwareErrorCode.TRANSPORT_ERROR:
      return 'Communication error with device.';
    case HardwareErrorCode.WEBHID_NOT_SUPPORTED:
      return 'WebHID is not supported in this browser. Please use Chrome or Edge.';
    default:
      return 'Unknown hardware wallet error.';
  }
}

/**
 * Map Ledger status code to error
 */
export function handleLedgerStatus(statusCode: number): void {
  if (statusCode === LEDGER_STATUS.OK) {
    return;
  }

  switch (statusCode) {
    case LEDGER_STATUS.USER_REJECTED:
    case LEDGER_STATUS.CONDITIONS_NOT_SATISFIED:
      throw createHardwareError(HardwareErrorCode.USER_REJECTED);

    case LEDGER_STATUS.DEVICE_LOCKED:
      throw createHardwareError(HardwareErrorCode.DEVICE_LOCKED);

    case LEDGER_STATUS.APP_NOT_OPEN:
    case LEDGER_STATUS.CLA_NOT_SUPPORTED:
      throw createHardwareError(HardwareErrorCode.APP_NOT_OPEN);

    case LEDGER_STATUS.INS_NOT_SUPPORTED:
      throw createHardwareError(
        HardwareErrorCode.APP_VERSION_UNSUPPORTED,
        'This operation is not supported by your NEAR app version'
      );

    case LEDGER_STATUS.WRONG_LENGTH:
    case LEDGER_STATUS.INVALID_DATA:
      throw createHardwareError(HardwareErrorCode.INVALID_DATA);

    case LEDGER_STATUS.COMMAND_NOT_ALLOWED:
      throw createHardwareError(
        HardwareErrorCode.DEVICE_BUSY,
        'Device rejected the command. Please try again.'
      );

    default:
      throw createHardwareError(
        HardwareErrorCode.UNKNOWN,
        `Unknown Ledger error: 0x${statusCode.toString(16)}`
      );
  }
}

/**
 * Check if an error is a HardwareError
 */
export function isHardwareError(error: unknown): error is HardwareError {
  return error instanceof HardwareError;
}

/**
 * Check if error indicates user rejection
 */
export function isUserRejection(error: unknown): boolean {
  return isHardwareError(error) && error.code === HardwareErrorCode.USER_REJECTED;
}

/**
 * Check if error indicates device not connected
 */
export function isDeviceNotFound(error: unknown): boolean {
  return isHardwareError(error) && error.code === HardwareErrorCode.DEVICE_NOT_FOUND;
}

/**
 * Check if error indicates app not open
 */
export function isAppNotOpen(error: unknown): boolean {
  return (
    isHardwareError(error) &&
    (error.code === HardwareErrorCode.APP_NOT_OPEN ||
      error.code === HardwareErrorCode.WRONG_APP)
  );
}
