/**
 * Ledger Wallet Implementation
 *
 * Privileged wallet that runs in main thread with WebHID access
 */

import { LedgerNearApp } from '../../hardware/near-app';
import {
  HardwareErrorCode,
  DEFAULT_DERIVATION_PATH,
  type LedgerConfig,
  type LedgerDeviceInfo,
  type HardwareWaitingEvent,
  type HardwareConfirmEvent,
  type HardwareRejectedEvent,
} from '../../hardware/types';
import { createHardwareError, isHardwareError } from '../../hardware/errors';
import type { Network, Transaction, Action } from '../../types';

// =============================================================================
// Types
// =============================================================================

export interface LedgerWalletAccount {
  accountId: string;
  publicKey?: string;
}

export interface LedgerTransactionResult {
  transaction: { hash: string; signerId: string; receiverId: string };
  transaction_outcome: { id: string; outcome: { status: unknown; logs: string[]; gas_burnt: number } };
  receipts_outcome: Array<{ id: string; outcome: { status: unknown; logs: string[] } }>;
  status: { SuccessValue?: string; Failure?: unknown };
}

export interface LedgerSignedTransaction {
  hash: string;
  signedTransaction: Uint8Array;
}

export interface LedgerSignMessageParams {
  message: string;
  recipient: string;
  nonce: Uint8Array;
  callbackUrl?: string;
}

export interface LedgerSignedMessage {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
}

type EventCallback<T> = (data: T) => void;
type EventUnsubscribe = () => void;

// =============================================================================
// Ledger Wallet
// =============================================================================

export class LedgerWallet {
  readonly id = 'ledger';
  readonly type = 'privileged' as const;

  private app: LedgerNearApp | null = null;
  private accounts: LedgerWalletAccount[] = [];
  private derivationPath: string;
  private networkId: Network;
  private rpcUrl: string;

  // Event listeners
  private listeners = {
    waiting: new Set<EventCallback<HardwareWaitingEvent>>(),
    confirm: new Set<EventCallback<HardwareConfirmEvent>>(),
    rejected: new Set<EventCallback<HardwareRejectedEvent>>(),
    connected: new Set<EventCallback<{ device: LedgerDeviceInfo }>>(),
    disconnected: new Set<EventCallback<void>>(),
  };

  constructor(config: {
    network: Network;
    ledger?: LedgerConfig | boolean;
    rpcUrl?: string;
  }) {
    this.networkId = config.network;
    this.rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.network);

    // Parse config
    const ledgerConfig = typeof config.ledger === 'boolean'
      ? { enabled: config.ledger }
      : config.ledger;

    this.derivationPath = ledgerConfig?.derivationPath || DEFAULT_DERIVATION_PATH;
  }

  // ===========================================================================
  // Static Methods
  // ===========================================================================

  static isSupported(): boolean {
    return LedgerNearApp.isSupported();
  }

  static getManifest() {
    return {
      id: 'ledger',
      version: '1.0.0',
      name: 'Ledger',
      description: 'Connect your Ledger hardware wallet',
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0zOC40IDc5LjJWODkuNkg3OS4yVjc5LjJIMzguNFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0zOC40IDM4LjRWNjguOEg0OC44VjQ4LjhINjguOFYzOC40SDM4LjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNzkuMiAzOC40Vjc5LjJIODkuNlYzOC40SDc5LjJaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K',
      website: 'https://ledger.com',
      type: 'privileged' as const,
      hardwareType: 'ledger' as const,
      features: {
        signMessage: true,
        signTransaction: true,
        signAndSendTransaction: true,
        signAndSendTransactions: true,
      },
    };
  }

  // ===========================================================================
  // Event Methods
  // ===========================================================================

  onWaiting(callback: EventCallback<HardwareWaitingEvent>): EventUnsubscribe {
    this.listeners.waiting.add(callback);
    return () => this.listeners.waiting.delete(callback);
  }

  onConfirm(callback: EventCallback<HardwareConfirmEvent>): EventUnsubscribe {
    this.listeners.confirm.add(callback);
    return () => this.listeners.confirm.delete(callback);
  }

  onRejected(callback: EventCallback<HardwareRejectedEvent>): EventUnsubscribe {
    this.listeners.rejected.add(callback);
    return () => this.listeners.rejected.delete(callback);
  }

  onConnected(callback: EventCallback<{ device: LedgerDeviceInfo }>): EventUnsubscribe {
    this.listeners.connected.add(callback);
    return () => this.listeners.connected.delete(callback);
  }

  onDisconnected(callback: EventCallback<void>): EventUnsubscribe {
    this.listeners.disconnected.add(callback);
    return () => this.listeners.disconnected.delete(callback);
  }

  private emitWaiting(data: HardwareWaitingEvent): void {
    this.listeners.waiting.forEach((cb) => { try { cb(data); } catch (e) { console.error('Error in waiting listener:', e); } });
  }

  private emitConfirm(data: HardwareConfirmEvent): void {
    this.listeners.confirm.forEach((cb) => { try { cb(data); } catch (e) { console.error('Error in confirm listener:', e); } });
  }

  private emitRejected(data: HardwareRejectedEvent): void {
    this.listeners.rejected.forEach((cb) => { try { cb(data); } catch (e) { console.error('Error in rejected listener:', e); } });
  }

  private emitConnected(data: { device: LedgerDeviceInfo }): void {
    this.listeners.connected.forEach((cb) => { try { cb(data); } catch (e) { console.error('Error in connected listener:', e); } });
  }

  private emitDisconnected(): void {
    this.listeners.disconnected.forEach((cb) => { try { cb(); } catch (e) { console.error('Error in disconnected listener:', e); } });
  }

  // ===========================================================================
  // Connection Methods
  // ===========================================================================

  isConnected(): boolean {
    return this.app !== null && this.app.isConnected() && this.accounts.length > 0;
  }

  async getAccounts(): Promise<LedgerWalletAccount[]> {
    return this.accounts;
  }

  async signIn(): Promise<LedgerWalletAccount[]> {
    this.emitWaiting({
      walletId: this.id,
      action: 'connect',
      message: 'Please connect and unlock your Ledger device, then open the NEAR app',
    });

    try {
      this.app = await LedgerNearApp.connect();
      const deviceInfo = await this.app.getDeviceInfo();

      this.emitConfirm({ walletId: this.id, action: 'connect' });
      this.emitConnected({ device: deviceInfo });

      this.emitWaiting({
        walletId: this.id,
        action: 'get_public_key',
        message: 'Please verify your address on the Ledger device',
      });

      const { address } = await this.app.getPublicKey(this.derivationPath, true);

      this.emitConfirm({ walletId: this.id, action: 'get_public_key' });

      // Derive account ID from public key (implicit account)
      const accountId = this.publicKeyToImplicitAccountId(address);

      this.accounts = [{
        accountId,
        publicKey: address,
      }];

      return this.accounts;

    } catch (error) {
      this.emitRejected({
        walletId: this.id,
        action: 'connect',
        reason: error instanceof Error ? error.message : 'Connection failed',
      });

      await this.disconnect();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    if (this.app) {
      await this.app.disconnect();
      this.app = null;
    }
    this.accounts = [];
    this.emitDisconnected();
  }

  // ===========================================================================
  // Transaction Methods
  // ===========================================================================

  async signTransaction(tx: Transaction): Promise<LedgerSignedTransaction> {
    if (!this.app || !this.isConnected()) {
      throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND, 'Ledger not connected');
    }

    const account = this.accounts[0];
    if (!account) {
      throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND, 'No account connected');
    }

    this.emitWaiting({
      walletId: this.id,
      action: 'sign',
      message: 'Please review and approve the transaction on your Ledger',
    });

    try {
      const signerId = (tx as unknown as { signerId?: string }).signerId || account.accountId;
      const txBytes = await this.serializeTransaction({
        ...tx,
        signerId,
      });

      const { signature } = await this.app.signTransaction(this.derivationPath, txBytes);

      this.emitConfirm({ walletId: this.id, action: 'sign' });

      const signedTx = this.createSignedTransaction(txBytes, signature);

      return {
        hash: await this.computeTransactionHash(txBytes),
        signedTransaction: signedTx,
      };

    } catch (error) {
      const isRejection = isHardwareError(error) && error.code === HardwareErrorCode.USER_REJECTED;

      this.emitRejected({
        walletId: this.id,
        action: 'sign',
        reason: isRejection ? 'User rejected on device' :
          (error instanceof Error ? error.message : 'Signing failed'),
      });

      throw error;
    }
  }

  async signAndSendTransaction(tx: Transaction): Promise<LedgerTransactionResult> {
    const signed = await this.signTransaction(tx);
    return this.broadcastTransaction(signed.signedTransaction);
  }

  async signAndSendTransactions(txs: Transaction[]): Promise<LedgerTransactionResult[]> {
    const results: LedgerTransactionResult[] = [];
    for (const tx of txs) {
      const result = await this.signAndSendTransaction(tx);
      results.push(result);
    }
    return results;
  }

  // ===========================================================================
  // Message Signing (NEP-413)
  // ===========================================================================

  async signMessage(params: LedgerSignMessageParams): Promise<LedgerSignedMessage> {
    if (!this.app || !this.isConnected()) {
      throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND, 'Ledger not connected');
    }

    const account = this.accounts[0];
    if (!account) {
      throw createHardwareError(HardwareErrorCode.DEVICE_NOT_FOUND, 'No account connected');
    }

    this.emitWaiting({
      walletId: this.id,
      action: 'sign_message',
      message: 'Please review and approve the message on your Ledger',
    });

    try {
      const { signature } = await this.app.signMessage(
        this.derivationPath,
        params.message,
        params.nonce,
        params.recipient,
        params.callbackUrl
      );

      this.emitConfirm({ walletId: this.id, action: 'sign_message' });

      return {
        accountId: account.accountId,
        publicKey: account.publicKey!,
        signature: this.bytesToBase64(signature),
        message: params.message,
      };

    } catch (error) {
      const isRejection = isHardwareError(error) && error.code === HardwareErrorCode.USER_REJECTED;

      this.emitRejected({
        walletId: this.id,
        action: 'sign_message',
        reason: isRejection ? 'User rejected on device' :
          (error instanceof Error ? error.message : 'Signing failed'),
      });

      throw error;
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getDefaultRpcUrl(network: Network): string {
    return network === 'mainnet'
      ? 'https://rpc.mainnet.near.org'
      : 'https://rpc.testnet.near.org';
  }

  private publicKeyToImplicitAccountId(publicKey: string): string {
    const key = publicKey.replace('ed25519:', '');
    const bytes = this.base58ToBytes(key);
    return this.bytesToHex(bytes);
  }

  private async serializeTransaction(tx: Transaction & { signerId: string }): Promise<Uint8Array> {
    const accessKey = await this.getAccessKey(tx.signerId, this.accounts[0]!.publicKey!);
    const nonce = accessKey.nonce + 1;
    const blockHash = await this.getRecentBlockHash();

    const txData = {
      signerId: tx.signerId,
      publicKey: this.accounts[0]!.publicKey!,
      nonce,
      receiverId: tx.receiverId,
      blockHash,
      actions: tx.actions as Action[],
    };

    return this.borshSerializeTransaction(txData);
  }

  private borshSerializeTransaction(tx: {
    signerId: string;
    publicKey: string;
    nonce: number;
    receiverId: string;
    blockHash: Uint8Array;
    actions: Action[];
  }): Uint8Array {
    const chunks: Uint8Array[] = [];

    // Signer ID
    chunks.push(this.borshString(tx.signerId));

    // Public key (enum + 32 bytes)
    const pubKeyBytes = this.base58ToBytes(tx.publicKey.replace('ed25519:', ''));
    const pubKey = new Uint8Array(33);
    pubKey[0] = 0; // ED25519 = 0
    pubKey.set(pubKeyBytes, 1);
    chunks.push(pubKey);

    // Nonce (u64 LE)
    chunks.push(this.uint64LE(tx.nonce));

    // Receiver ID
    chunks.push(this.borshString(tx.receiverId));

    // Block hash (32 bytes)
    chunks.push(tx.blockHash);

    // Actions
    chunks.push(this.borshActions(tx.actions));

    // Concatenate
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private borshString(str: string): Uint8Array {
    const bytes = new TextEncoder().encode(str);
    const result = new Uint8Array(4 + bytes.length);
    this.writeUint32LE(result, 0, bytes.length);
    result.set(bytes, 4);
    return result;
  }

  private uint64LE(value: number): Uint8Array {
    const result = new Uint8Array(8);
    let v = BigInt(value);
    for (let i = 0; i < 8; i++) {
      result[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    return result;
  }

  private borshActions(actions: Action[]): Uint8Array {
    const chunks: Uint8Array[] = [];

    const length = new Uint8Array(4);
    this.writeUint32LE(length, 0, actions.length);
    chunks.push(length);

    for (const action of actions) {
      chunks.push(this.borshAction(action));
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private borshAction(action: Action): Uint8Array {
    const actionObj = action as unknown as Record<string, unknown>;
    const actionType = Object.keys(actionObj)[0] as string;
    const actionData = actionObj[actionType];

    const actionTypes: Record<string, number> = {
      CreateAccount: 0,
      DeployContract: 1,
      FunctionCall: 2,
      Transfer: 3,
      Stake: 4,
      AddKey: 5,
      DeleteKey: 6,
      DeleteAccount: 7,
    };

    const typeIndex = actionTypes[actionType];
    if (typeIndex === undefined) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    const chunks: Uint8Array[] = [];
    chunks.push(new Uint8Array([typeIndex]));

    switch (actionType) {
      case 'Transfer': {
        const data = actionData as { deposit: string };
        const deposit = BigInt(data.deposit || '0');
        const depositBytes = new Uint8Array(16);
        let d = deposit;
        for (let i = 0; i < 16; i++) {
          depositBytes[i] = Number(d & BigInt(0xff));
          d >>= BigInt(8);
        }
        chunks.push(depositBytes);
        break;
      }
      case 'FunctionCall': {
        const data = actionData as {
          methodName: string;
          args: Record<string, unknown>;
          gas: string;
          deposit: string;
        };

        chunks.push(this.borshString(data.methodName));

        const argsJson = JSON.stringify(data.args);
        const argsBytes = new TextEncoder().encode(argsJson);
        const argsLength = new Uint8Array(4);
        this.writeUint32LE(argsLength, 0, argsBytes.length);
        chunks.push(argsLength);
        chunks.push(argsBytes);

        chunks.push(this.uint64LE(Number(data.gas)));

        const deposit = BigInt(data.deposit || '0');
        const depositBytes = new Uint8Array(16);
        let d = deposit;
        for (let i = 0; i < 16; i++) {
          depositBytes[i] = Number(d & BigInt(0xff));
          d >>= BigInt(8);
        }
        chunks.push(depositBytes);
        break;
      }
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private createSignedTransaction(txBytes: Uint8Array, signature: Uint8Array): Uint8Array {
    const sigStruct = new Uint8Array(65);
    sigStruct[0] = 0; // ED25519 = 0
    sigStruct.set(signature, 1);

    const result = new Uint8Array(txBytes.length + sigStruct.length);
    result.set(txBytes, 0);
    result.set(sigStruct, txBytes.length);

    return result;
  }

  private async computeTransactionHash(txBytes: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', txBytes);
    return this.bytesToBase58(new Uint8Array(hashBuffer));
  }

  private async broadcastTransaction(signedTx: Uint8Array): Promise<LedgerTransactionResult> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'broadcast_tx_commit',
        params: [this.bytesToBase64(signedTx)],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message || 'Transaction broadcast failed');
    }

    return result.result;
  }

  private async getAccessKey(
    accountId: string,
    publicKey: string
  ): Promise<{ nonce: number; permission: unknown }> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: accountId,
          public_key: publicKey,
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message || 'Failed to get access key');
    }

    return result.result;
  }

  private async getRecentBlockHash(): Promise<Uint8Array> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'block',
        params: { finality: 'final' },
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message || 'Failed to get block');
    }

    const hashBase58 = result.result.header.hash;
    return this.base58ToBytes(hashBase58);
  }

  // ===========================================================================
  // Encoding Utilities
  // ===========================================================================

  private writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
    buffer[offset + 3] = (value >> 24) & 0xff;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

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

    for (const byte of bytes) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }

    return result;
  }

  private base58ToBytes(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    let num = BigInt(0);
    for (const char of str) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) throw new Error(`Invalid base58 character: ${char}`);
      num = num * BigInt(58) + BigInt(index);
    }

    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    for (const char of str) {
      if (char === '1') {
        bytes.unshift(0);
      } else {
        break;
      }
    }

    return new Uint8Array(bytes);
  }
}

export function createLedgerWallet(config: {
  network: Network;
  ledger?: LedgerConfig | boolean;
  rpcUrl?: string;
}): LedgerWallet {
  return new LedgerWallet(config);
}
