/**
 * Ledger Transport Layer
 *
 * Low-level WebHID communication with Ledger devices
 */

import {
  HardwareErrorCode,
  LEDGER_PRODUCT_IDS,
  type APDUCommand,
  type APDUResponse,
  type LedgerModel,
} from './types';
import { createHardwareError } from './errors';

// WebHID type declarations for browsers that support it
declare global {
  interface Navigator {
    hid?: HID;
  }

  interface HID {
    requestDevice(options: { filters: Array<{ vendorId: number }> }): Promise<HIDDevice[]>;
  }

  interface HIDDevice {
    opened: boolean;
    vendorId: number;
    productId: number;
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: Uint8Array): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
  }

  interface HIDInputReportEvent {
    data: DataView;
  }
}

// =============================================================================
// Constants
// =============================================================================

const LEDGER_VENDOR_ID = 0x2c97;
const HID_PACKET_SIZE = 64;
const CHANNEL_ID = 0x0101;
const TAG_APDU = 0x05;

// =============================================================================
// Transport Class
// =============================================================================

/**
 * Ledger WebHID Transport
 *
 * Handles low-level communication with Ledger devices via WebHID API.
 * Implements the Ledger HID framing protocol.
 */
export class LedgerTransport {
  private device: HIDDevice | null = null;
  private responseBuffer: Uint8Array = new Uint8Array(0);
  private pendingResolve: ((data: Uint8Array) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  constructor() {
    // Check WebHID support on construction
    if (!LedgerTransport.isSupported()) {
      throw createHardwareError(HardwareErrorCode.WEBHID_NOT_SUPPORTED);
    }
  }

  /**
   * Check if WebHID is supported in this browser
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /**
   * Request user to select a Ledger device
   */
  async connect(): Promise<void> {
    if (this.device?.opened) {
      return;
    }

    try {
      // Request device from user
      const devices = await navigator.hid!.requestDevice({
        filters: [{ vendorId: LEDGER_VENDOR_ID }],
      });

      if (devices.length === 0) {
        throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND);
      }

      this.device = devices[0]!;
      await this.device.open();

      // Set up input report handler
      this.device.addEventListener('inputreport', this.handleInputReport.bind(this));

    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw createHardwareError(
            HardwareErrorCode.USER_REJECTED,
            'User cancelled device selection'
          );
        }
        if (error.name === 'NotFoundError') {
          throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND);
        }
      }
      throw error;
    }
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.close();
      } catch {
        // Ignore close errors
      }
      this.device = null;
    }
    this.responseBuffer = new Uint8Array(0);
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  /**
   * Check if connected to a device
   */
  isConnected(): boolean {
    return this.device?.opened ?? false;
  }

  /**
   * Get device info
   */
  getDeviceInfo(): { vendorId: number; productId: number } | null {
    if (!this.device) return null;
    return {
      vendorId: this.device.vendorId,
      productId: this.device.productId,
    };
  }

  /**
   * Send an APDU command and receive response
   */
  async send(command: APDUCommand, timeout: number = 30000): Promise<APDUResponse> {
    if (!this.device?.opened) {
      throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND);
    }

    // Build APDU
    const apdu = this.buildAPDU(command);

    // Frame into HID packets
    const packets = this.frameAPDU(apdu);

    // Send all packets
    for (const packet of packets) {
      await this.device.sendReport(0, packet);
    }

    // Wait for response with timeout
    const responseData = await this.waitForResponse(timeout);

    // Parse response
    const statusCode = (responseData[responseData.length - 2]! << 8) | responseData[responseData.length - 1]!;
    const data = responseData.slice(0, -2);

    return { data, statusCode };
  }

  /**
   * Build APDU buffer from command
   */
  private buildAPDU(command: APDUCommand): Uint8Array {
    const dataLength = command.data?.length ?? 0;
    const apdu = new Uint8Array(5 + dataLength);

    apdu[0] = command.cla;
    apdu[1] = command.ins;
    apdu[2] = command.p1;
    apdu[3] = command.p2;
    apdu[4] = dataLength;

    if (command.data) {
      apdu.set(command.data, 5);
    }

    return apdu;
  }

  /**
   * Frame APDU into HID packets
   *
   * Ledger HID protocol:
   * - First packet: [channel (2)] [tag (1)] [seq (2)] [length (2)] [data...]
   * - Subsequent: [channel (2)] [tag (1)] [seq (2)] [data...]
   */
  private frameAPDU(apdu: Uint8Array): Uint8Array[] {
    const packets: Uint8Array[] = [];
    let offset = 0;
    let sequence = 0;

    // First packet includes length
    const firstPacket = new Uint8Array(HID_PACKET_SIZE);
    firstPacket[0] = CHANNEL_ID >> 8;
    firstPacket[1] = CHANNEL_ID & 0xff;
    firstPacket[2] = TAG_APDU;
    firstPacket[3] = sequence >> 8;
    firstPacket[4] = sequence & 0xff;
    firstPacket[5] = apdu.length >> 8;
    firstPacket[6] = apdu.length & 0xff;

    const firstDataLength = Math.min(apdu.length, HID_PACKET_SIZE - 7);
    firstPacket.set(apdu.slice(0, firstDataLength), 7);
    packets.push(firstPacket);
    offset = firstDataLength;
    sequence++;

    // Subsequent packets
    while (offset < apdu.length) {
      const packet = new Uint8Array(HID_PACKET_SIZE);
      packet[0] = CHANNEL_ID >> 8;
      packet[1] = CHANNEL_ID & 0xff;
      packet[2] = TAG_APDU;
      packet[3] = sequence >> 8;
      packet[4] = sequence & 0xff;

      const dataLength = Math.min(apdu.length - offset, HID_PACKET_SIZE - 5);
      packet.set(apdu.slice(offset, offset + dataLength), 5);
      packets.push(packet);
      offset += dataLength;
      sequence++;
    }

    return packets;
  }

  /**
   * Handle incoming HID report
   */
  private handleInputReport(event: HIDInputReportEvent): void {
    const data = new Uint8Array(event.data.buffer);

    // Check channel and tag
    const channel = (data[0]! << 8) | data[1]!;
    const tag = data[2];

    if (channel !== CHANNEL_ID || tag !== TAG_APDU) {
      return;
    }

    const sequence = (data[3]! << 8) | data[4]!;

    if (sequence === 0) {
      // First packet - get total length
      const totalLength = (data[5]! << 8) | data[6]!;
      this.responseBuffer = new Uint8Array(totalLength);
      const dataStart = 7;
      const dataLength = Math.min(totalLength, HID_PACKET_SIZE - dataStart);
      this.responseBuffer.set(data.slice(dataStart, dataStart + dataLength), 0);
    } else {
      // Subsequent packet
      const dataStart = 5;
      const offset = HID_PACKET_SIZE - 7 + (sequence - 1) * (HID_PACKET_SIZE - 5);
      const remaining = this.responseBuffer.length - offset;
      const dataLength = Math.min(remaining, HID_PACKET_SIZE - dataStart);
      this.responseBuffer.set(data.slice(dataStart, dataStart + dataLength), offset);
    }

    // Check if we have complete response
    const expectedPackets = Math.ceil(
      (this.responseBuffer.length + 7) / (HID_PACKET_SIZE - 5)
    );
    const isComplete = sequence >= expectedPackets - 1;

    if (isComplete && this.pendingResolve) {
      this.pendingResolve(this.responseBuffer);
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }

  /**
   * Wait for response with timeout
   */
  private waitForResponse(timeout: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.responseBuffer = new Uint8Array(0);

      const timeoutId = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(createHardwareError(HardwareErrorCode.TIMEOUT));
      }, timeout);

      // Store original resolve to clear timeout
      const originalResolve = this.pendingResolve;
      this.pendingResolve = (data: Uint8Array) => {
        clearTimeout(timeoutId);
        originalResolve(data);
      };
    });
  }
}

/**
 * Detect Ledger model from product ID
 */
export function detectLedgerModel(productId: number): LedgerModel {
  switch (productId) {
    case LEDGER_PRODUCT_IDS.NANO_S:
      return 'nano-s';
    case LEDGER_PRODUCT_IDS.NANO_S_PLUS:
      return 'nano-s-plus';
    case LEDGER_PRODUCT_IDS.NANO_X:
      return 'nano-x';
    case LEDGER_PRODUCT_IDS.STAX:
      return 'stax';
    default:
      return 'unknown';
  }
}
