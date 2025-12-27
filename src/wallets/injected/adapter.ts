/**
 * Injected Wallet Adapter
 *
 * Normalizes the different APIs each injected wallet uses into
 * a consistent interface matching NearWalletBase.
 */

import type {
  Account,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignMessageParams,
  SignedMessage,
  SignInParams,
  SignOutParams,
  GetAccountsParams,
  WalletManifest,
  NearWalletBase,
} from '../../types';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { DetectedWallet } from './detector';

export class InjectedWalletAdapter implements NearWalletBase {
  readonly manifest: WalletManifest;
  private provider: any;
  private cachedAccounts: Account[] = [];
  /**
   * If true, this wallet uses a postMessage channel (like Meteor's meteorCom)
   * and actual wallet operations should go through the sandboxed executor.
   * The adapter can detect the extension is installed but can't perform ops directly.
   */
  readonly usesPostMessageChannel: boolean;

  constructor(wallet: DetectedWallet) {
    this.provider = wallet.provider;
    this.usesPostMessageChannel = wallet.info.usesPostMessageChannel ?? false;

    // Build manifest from detected wallet info
    this.manifest = {
      id: wallet.info.id,
      name: wallet.info.name,
      icon: wallet.info.icon,
      website: wallet.info.website,
      description: `${wallet.info.name} browser extension`,
      type: 'injected',
      version: '1.0.0',
      executor: '',
      permissions: {
        storage: true,
        external: [wallet.info.id],
      },
      features: {
        // For postMessage channel wallets, we can't determine features from provider
        signMessage: this.usesPostMessageChannel ? true : typeof this.provider.signMessage === 'function',
        signTransaction: true,
        signAndSendTransaction: this.usesPostMessageChannel ? true :
          typeof this.provider.signAndSendTransaction === 'function',
        signAndSendTransactions: this.usesPostMessageChannel ? true :
          typeof this.provider.signAndSendTransactions === 'function' ||
          typeof this.provider.requestSignTransactions === 'function',
        signInWithoutAddKey: true,
        mainnet: true,
        testnet: true,
      },
    };
  }

  /**
   * Sign in to the wallet
   */
  async signIn(data?: SignInParams): Promise<Account[]> {
    // PostMessage channel wallets (like Meteor) can't be operated directly
    // They need to go through the sandboxed executor from the manifest
    if (this.usesPostMessageChannel) {
      throw new Error(
        `${this.manifest.name} extension detected, but operations must go through sandboxed wallet. ` +
        `Use the wallet from the manifest, not the injected adapter.`
      );
    }

    let result: any;

    // Different wallets use different method names
    if (typeof this.provider.connect === 'function') {
      result = await this.provider.connect({
        contractId: data?.contractId,
        methodNames: data?.methodNames,
      });
    } else if (typeof this.provider.signIn === 'function') {
      result = await this.provider.signIn({
        contractId: data?.contractId,
        methodNames: data?.methodNames,
      });
    } else if (typeof this.provider.requestSignIn === 'function') {
      result = await this.provider.requestSignIn({
        contractId: data?.contractId,
        methodNames: data?.methodNames,
      });
    } else if (typeof this.provider.enable === 'function') {
      result = await this.provider.enable();
    } else {
      throw new Error(`Unknown connect method for ${this.manifest.name}`);
    }

    // Normalize and cache accounts
    this.cachedAccounts = this.normalizeAccounts(result);

    // If connect didn't return accounts, try to fetch them
    if (this.cachedAccounts.length === 0) {
      this.cachedAccounts = await this.getAccounts(data);
    }

    return this.cachedAccounts;
  }

  /**
   * Sign out from the wallet
   */
  async signOut(_data?: SignOutParams): Promise<void> {
    if (typeof this.provider.disconnect === 'function') {
      await this.provider.disconnect();
    } else if (typeof this.provider.signOut === 'function') {
      await this.provider.signOut();
    }
    this.cachedAccounts = [];
  }

  /**
   * Get connected accounts
   */
  async getAccounts(_data?: GetAccountsParams): Promise<Account[]> {
    // Try various account retrieval methods
    if (typeof this.provider.getAccounts === 'function') {
      const accounts = await this.provider.getAccounts();
      this.cachedAccounts = this.normalizeAccounts(accounts);
    } else if (typeof this.provider.getAccountId === 'function') {
      const accountId = await this.provider.getAccountId();
      if (accountId) {
        this.cachedAccounts = [{ accountId }];
      }
    } else if (typeof this.provider.account === 'function') {
      const account = await this.provider.account();
      if (account?.accountId) {
        this.cachedAccounts = [
          { accountId: account.accountId, publicKey: account.publicKey },
        ];
      }
    } else if (this.provider.accountId) {
      this.cachedAccounts = [{ accountId: this.provider.accountId }];
    }

    return this.cachedAccounts;
  }

  /**
   * Sign and send a single transaction
   */
  async signAndSendTransaction(
    params: SignAndSendTransactionParams
  ): Promise<FinalExecutionOutcome> {
    // Method 1: Direct signAndSendTransaction
    if (typeof this.provider.signAndSendTransaction === 'function') {
      return await this.provider.signAndSendTransaction(params);
    }

    // Method 2: Meteor SDK pattern - get account() then call signAndSendTransaction
    // Meteor's account() returns ConnectedMeteorWalletAccount with signing methods
    if (typeof this.provider.account === 'function') {
      const account = await this.provider.account();
      if (account && typeof account.signAndSendTransaction === 'function') {
        return await account.signAndSendTransaction({
          receiverId: params.receiverId,
          actions: params.actions,
        });
      }
      // Meteor also has signAndSendTransaction_direct for wallet-based signing
      if (account && typeof account.signAndSendTransaction_direct === 'function') {
        return await account.signAndSendTransaction_direct({
          receiverId: params.receiverId,
          actions: params.actions,
        });
      }
    }

    throw new Error(
      `${this.manifest.name} does not support signAndSendTransaction`
    );
  }

  /**
   * Sign and send multiple transactions
   */
  async signAndSendTransactions(
    params: SignAndSendTransactionsParams
  ): Promise<FinalExecutionOutcome[]> {
    if (typeof this.provider.signAndSendTransactions === 'function') {
      return await this.provider.signAndSendTransactions(params);
    }

    if (typeof this.provider.requestSignTransactions === 'function') {
      return await this.provider.requestSignTransactions(params);
    }

    // Fall back to sequential signing
    const results: FinalExecutionOutcome[] = [];
    for (const tx of params.transactions) {
      const result = await this.signAndSendTransaction({
        ...tx,
        network: params.network,
        signerId: params.signerId,
        callbackUrl: params.callbackUrl,
      });
      results.push(result);
    }
    return results;
  }

  /**
   * Sign a message (NEP-413)
   */
  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    if (typeof this.provider.signMessage === 'function') {
      return await this.provider.signMessage(params);
    }

    // Some wallets use verifyOwner for message signing
    if (typeof this.provider.verifyOwner === 'function') {
      const result = await this.provider.verifyOwner({
        message: params.message,
      });
      return {
        accountId: result.accountId,
        publicKey: result.publicKey,
        signature: result.signature,
        message: params.message,
      };
    }

    throw new Error(`${this.manifest.name} does not support message signing`);
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    // Meteor SDK uses isSignedIn()
    if (typeof this.provider.isSignedIn === 'function') {
      return await this.provider.isSignedIn();
    }
    if (typeof this.provider.isConnected === 'function') {
      return await this.provider.isConnected();
    }
    return this.cachedAccounts.length > 0;
  }

  /**
   * Verify account ownership (NEP-413 alternative)
   * Meteor SDK supports this as a separate method
   */
  async verifyOwner(params: { message: string }): Promise<{
    accountId: string;
    publicKey: string;
    signature: string;
  }> {
    if (typeof this.provider.verifyOwner === 'function') {
      return await this.provider.verifyOwner(params);
    }
    throw new Error(`${this.manifest.name} does not support verifyOwner`);
  }

  /**
   * Normalize different account response formats to Account[]
   */
  private normalizeAccounts(response: any): Account[] {
    if (!response) return [];

    // Array of accounts
    if (Array.isArray(response)) {
      return response.map((acc) => {
        if (typeof acc === 'string') {
          return { accountId: acc };
        }
        return {
          accountId: acc.accountId || acc.account_id || acc.id,
          publicKey: acc.publicKey || acc.public_key,
        };
      });
    }

    // Single account object
    if (typeof response === 'object') {
      if (response.accountId || response.account_id) {
        return [
          {
            accountId: response.accountId || response.account_id,
            publicKey: response.publicKey || response.public_key,
          },
        ];
      }
      // Accounts nested in response
      if (response.accounts) {
        return this.normalizeAccounts(response.accounts);
      }
    }

    // Single account string
    if (typeof response === 'string') {
      return [{ accountId: response }];
    }

    return [];
  }
}
