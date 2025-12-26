/**
 * Ledger NEAR App Interface
 *
 * High-level interface for the NEAR app on Ledger devices
 */

import { LedgerTransport, detectLedgerModel } from './transport';
import {
  NEAR_CLA,
  NEAR_INS,
  LEDGER_STATUS,
  HardwareErrorCode,
  type LedgerDeviceInfo,
  type APDUResponse,
} from './types';
import { createHardwareError, handleLedgerStatus } from './errors';

// =============================================================================
// Types
// =============================================================================

export interface NearAppVersion {
  major: number;
  minor: number;
  patch: number;
  version: string;
}

export interface PublicKeyResult {
  publicKey: string; // hex encoded
  address: string;   // ed25519 public key as base58
}

export interface SignatureResult {
  signature: Uint8Array;
}

// =============================================================================
// Ledger NEAR App
// =============================================================================

/**
 * High-level interface to the NEAR app on Ledger devices
 */
export class LedgerNearApp {
  private transport: LedgerTransport;

  constructor(transport: LedgerTransport) {
    this.transport = transport;
  }

  /**
   * Create a new instance and connect to device
   */
  static async connect(): Promise<LedgerNearApp> {
    const transport = new LedgerTransport();
    await transport.connect();
    return new LedgerNearApp(transport);
  }

  /**
   * Check if transport is supported
   */
  static isSupported(): boolean {
    return LedgerTransport.isSupported();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.transport.isConnected();
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  /**
   * Get device info
   */
  async getDeviceInfo(): Promise<LedgerDeviceInfo> {
    const deviceInfo = this.transport.getDeviceInfo();
    const version = await this.getVersion();

    return {
      model: deviceInfo ? detectLedgerModel(deviceInfo.productId) : 'unknown',
      nearAppVersion: version.version,
    };
  }

  /**
   * Get NEAR app version
   */
  async getVersion(): Promise<NearAppVersion> {
    const response = await this.transport.send({
      cla: NEAR_CLA,
      ins: NEAR_INS.GET_VERSION,
      p1: 0x00,
      p2: 0x00,
    });

    handleLedgerStatus(response.statusCode);

    if (response.data.length < 3) {
      throw createHardwareError(
        HardwareErrorCode.INVALID_DATA,
        'Invalid version response'
      );
    }

    const major = response.data[0]!;
    const minor = response.data[1]!;
    const patch = response.data[2]!;

    return {
      major,
      minor,
      patch,
      version: `${major}.${minor}.${patch}`,
    };
  }

  /**
   * Get public key from device
   *
   * @param path - BIP44 derivation path (e.g., "44'/397'/0'/0'/1'")
   * @param display - Whether to display address on device for verification
   */
  async getPublicKey(path: string, display: boolean = false): Promise<PublicKeyResult> {
    const pathBuffer = this.serializePath(path);

    const response = await this.transport.send(
      {
        cla: NEAR_CLA,
        ins: NEAR_INS.GET_PUBLIC_KEY,
        p1: display ? 0x01 : 0x00,
        p2: 0x00,
        data: pathBuffer,
      },
      display ? 60000 : 10000 // Longer timeout if displaying on device
    );

    handleLedgerStatus(response.statusCode);

    // Response format: 32 bytes public key
    if (response.data.length < 32) {
      throw createHardwareError(
        HardwareErrorCode.INVALID_DATA,
        'Invalid public key response'
      );
    }

    const publicKeyBytes = response.data.slice(0, 32);
    const publicKeyHex = this.bytesToHex(publicKeyBytes);
    const publicKeyBase58 = this.bytesToBase58(publicKeyBytes);

    return {
      publicKey: publicKeyHex,
      address: `ed25519:${publicKeyBase58}`,
    };
  }

  /**
   * Sign a transaction
   *
   * @param path - BIP44 derivation path
   * @param txBytes - Serialized transaction bytes (borsh encoded)
   */
  async signTransaction(path: string, txBytes: Uint8Array): Promise<SignatureResult> {
    const pathBuffer = this.serializePath(path);

    // Combine path and transaction data
    const data = new Uint8Array(pathBuffer.length + txBytes.length);
    data.set(pathBuffer, 0);
    data.set(txBytes, pathBuffer.length);

    // Send in chunks if needed (Ledger has packet size limits)
    const response = await this.sendChunked(
      NEAR_INS.SIGN_TRANSACTION,
      data,
      60000 // 60 second timeout for user confirmation
    );

    handleLedgerStatus(response.statusCode);

    // Response is 64 bytes signature
    if (response.data.length < 64) {
      throw createHardwareError(
        HardwareErrorCode.INVALID_DATA,
        'Invalid signature response'
      );
    }

    return {
      signature: response.data.slice(0, 64),
    };
  }

  /**
   * Sign a NEP-413 message
   *
   * @param path - BIP44 derivation path
   * @param message - Message to sign
   * @param nonce - 32-byte nonce for replay protection
   * @param recipient - Intended recipient
   * @param callbackUrl - Optional callback URL
   */
  async signMessage(
    path: string,
    message: string,
    nonce: Uint8Array,
    recipient: string,
    callbackUrl?: string
  ): Promise<SignatureResult> {
    const pathBuffer = this.serializePath(path);

    // Encode message payload according to NEP-413
    const messageBytes = new TextEncoder().encode(message);
    const recipientBytes = new TextEncoder().encode(recipient);
    const callbackBytes = callbackUrl ? new TextEncoder().encode(callbackUrl) : new Uint8Array(0);

    // Build payload
    const totalLength =
      pathBuffer.length +
      32 + // nonce
      4 + recipientBytes.length +
      4 + messageBytes.length +
      4 + callbackBytes.length;

    const data = new Uint8Array(totalLength);
    let offset = 0;

    // Path
    data.set(pathBuffer, offset);
    offset += pathBuffer.length;

    // Nonce (32 bytes)
    data.set(nonce.slice(0, 32), offset);
    offset += 32;

    // Recipient
    this.writeUint32LE(data, offset, recipientBytes.length);
    offset += 4;
    data.set(recipientBytes, offset);
    offset += recipientBytes.length;

    // Message
    this.writeUint32LE(data, offset, messageBytes.length);
    offset += 4;
    data.set(messageBytes, offset);
    offset += messageBytes.length;

    // Callback
    this.writeUint32LE(data, offset, callbackBytes.length);
    offset += 4;
    data.set(callbackBytes, offset);

    const response = await this.sendChunked(
      NEAR_INS.SIGN_NEP413_MESSAGE,
      data,
      60000
    );

    handleLedgerStatus(response.statusCode);

    if (response.data.length < 64) {
      throw createHardwareError(
        HardwareErrorCode.INVALID_DATA,
        'Invalid signature response'
      );
    }

    return {
      signature: response.data.slice(0, 64),
    };
  }

  /**
   * Send data in chunks for large payloads
   */
  private async sendChunked(
    instruction: number,
    data: Uint8Array,
    timeout: number
  ): Promise<APDUResponse> {
    const CHUNK_SIZE = 250; // Max data per APDU
    let offset = 0;
    let response: APDUResponse | null = null;

    while (offset < data.length) {
      const isFirst = offset === 0;
      const isLast = offset + CHUNK_SIZE >= data.length;
      const chunk = data.slice(offset, offset + CHUNK_SIZE);

      // P1: 0x00 = first/only, 0x01 = more, 0x02 = last
      const p1 = isFirst && isLast ? 0x00 : isFirst ? 0x00 : isLast ? 0x02 : 0x01;

      response = await this.transport.send(
        {
          cla: NEAR_CLA,
          ins: instruction,
          p1,
          p2: 0x00,
          data: chunk,
        },
        isLast ? timeout : 10000
      );

      // Check for early errors (except for "more data needed" responses)
      if (!isLast && response.statusCode !== LEDGER_STATUS.OK) {
        handleLedgerStatus(response.statusCode);
      }

      offset += CHUNK_SIZE;
    }

    if (!response) {
      throw createHardwareError(
        HardwareErrorCode.INVALID_DATA,
        'No response from device'
      );
    }

    return response;
  }

  /**
   * Serialize BIP44 path to bytes
   */
  private serializePath(path: string): Uint8Array {
    // Remove 'm/' prefix if present
    const cleanPath = path.startsWith('m/') ? path.slice(2) : path;
    const elements = cleanPath.split('/');

    // 1 byte for length + 4 bytes per element
    const buffer = new Uint8Array(1 + elements.length * 4);
    buffer[0] = elements.length;

    let offset = 1;
    for (const element of elements) {
      const hardened = element.endsWith("'");
      const index = parseInt(hardened ? element.slice(0, -1) : element, 10);

      if (isNaN(index)) {
        throw createHardwareError(
          HardwareErrorCode.DERIVATION_PATH_ERROR,
          `Invalid path element: ${element}`
        );
      }

      const value = hardened ? index + 0x80000000 : index;

      // Big-endian
      buffer[offset++] = (value >> 24) & 0xff;
      buffer[offset++] = (value >> 16) & 0xff;
      buffer[offset++] = (value >> 8) & 0xff;
      buffer[offset++] = value & 0xff;
    }

    return buffer;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert bytes to base58 (for NEAR public key format)
   */
  private bytesToBase58(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    let num = BigInt(0);
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }

    let result = '';
    while (num > 0) {
      const remainder = Number(num % BigInt(58));
      num = num / BigInt(58);
      result = ALPHABET[remainder] + result;
    }

    // Add leading '1's for leading zero bytes
    for (const byte of bytes) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Write uint32 little-endian to buffer
   */
  private writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
    buffer[offset + 3] = (value >> 24) & 0xff;
  }
}
