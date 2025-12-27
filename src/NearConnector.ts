import { EventEmitter } from "./helpers/events";
import { NearWalletsPopup } from "./popups/NearWalletsPopup";
import { LocalStorage, DataStorage } from "./helpers/storage";
import { SessionManager, Session } from "./helpers/session";
import IndexedDB from "./helpers/indexdb";

import { EventNearWalletInjected, WalletManifest, Network, WalletFeatures, Logger, NearWalletBase, AbstractWalletConnect, Account } from "./types";
import { ParentFrameWallet } from "./ParentFrameWallet";
import { InjectedWallet } from "./InjectedWallet";
import { SandboxWallet } from "./SandboxedWallet";
import { EventMap } from "./types";
import { WalletError, WalletNotFoundError, UserRejectedError, ErrorCode, wrapError } from "./errors";

/**
 * Connected account with wallet metadata
 */
export interface ConnectedAccount extends Account {
  walletId: string;
  walletName: string;
  walletIcon?: string;
  network: Network;
  connectedAt: number;
}

/**
 * Multi-account storage format
 */
interface MultiAccountStorage {
  accounts: ConnectedAccount[];
  activeAccountId: string | null;
}

interface PersistenceOptions {
  enabled?: boolean;
  storage?: DataStorage;
  storageKey?: string;
  maxAge?: number;
  autoReconnect?: boolean;
}

interface NearConnectorOptions {
  providers?: { mainnet?: string[]; testnet?: string[] };
  features?: Partial<WalletFeatures>;
  excludedWallets?: string[];
  autoConnect?: boolean;
  network?: Network;

  manifest?: string | { wallets: WalletManifest[]; version: string };
  walletConnect?: Promise<AbstractWalletConnect> | AbstractWalletConnect;

  events?: EventEmitter<EventMap>;
  storage?: DataStorage;
  logger?: Logger;

  /**
   * Session persistence options for auto-reconnect on page reload
   */
  persistence?: PersistenceOptions;

  /**
   * @deprecated
   * Some wallets allow adding a limited-access key to a contract as soon as the user connects their wallet.
   * This enables the app to sign non-payable transactions without requiring wallet approval each time.
   * However, this approach requires the user to submit an on-chain transaction during the initial connection, which may negatively affect the user experience.
   * A better practice is to add the limited-access key after the user has already begun actively interacting with your application.
   */
  signIn?: { contractId?: string; methodNames?: Array<string> };
}

const defaultManifests = [
  "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json",
  "https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json",
];

const MULTI_ACCOUNT_STORAGE_KEY = "near-connect-accounts";

export class NearConnector {
  private storage: DataStorage;
  readonly events: EventEmitter<EventMap>;
  readonly db: IndexedDB;
  readonly session: SessionManager;
  logger?: Logger;

  wallets: NearWalletBase[] = [];
  manifest: { wallets: WalletManifest[]; version: string } = { wallets: [], version: "1.0.0" };
  features: Partial<WalletFeatures> = {};
  network: Network = "mainnet";

  providers: { mainnet?: string[]; testnet?: string[] } = { mainnet: [], testnet: [] };
  signInData?: { contractId?: string; methodNames?: Array<string> };
  walletConnect?: Promise<AbstractWalletConnect> | AbstractWalletConnect;

  excludedWallets: string[] = [];
  autoConnect?: boolean;
  private persistenceEnabled: boolean;

  // Multi-account state
  private connectedAccounts: ConnectedAccount[] = [];
  private activeAccountId: string | null = null;

  readonly whenManifestLoaded: Promise<void>;
  readonly whenSessionRestored: Promise<Session | null>;

  constructor(options?: NearConnectorOptions) {
    this.db = new IndexedDB("hot-connector", "wallets");
    this.storage = options?.storage ?? new LocalStorage();
    this.events = options?.events ?? new EventEmitter<EventMap>();
    this.logger = options?.logger;

    this.network = options?.network ?? "mainnet";
    this.walletConnect = options?.walletConnect;

    this.autoConnect = options?.autoConnect ?? true;
    this.providers = options?.providers ?? { mainnet: [], testnet: [] };

    this.excludedWallets = options?.excludedWallets ?? [];
    this.features = options?.features ?? {};
    this.signInData = options?.signIn;

    // Session persistence
    this.persistenceEnabled = options?.persistence?.enabled ?? true;
    this.session = new SessionManager({
      storage: options?.persistence?.storage ?? this.storage,
      storageKey: options?.persistence?.storageKey,
      maxAge: options?.persistence?.maxAge,
      autoReconnect: options?.persistence?.autoReconnect ?? true,
      onSessionRestored: (session) => {
        this.logger?.log("Session restored", session);
        this.events.emit("session:restored", { session });
      },
      onSessionExpired: (session) => {
        this.logger?.log("Session expired", session);
        this.events.emit("session:expired", { session });
      },
      onSessionCleared: () => {
        this.logger?.log("Session cleared");
      },
    });

    this.whenManifestLoaded = new Promise(async (resolve) => {
      if (options?.manifest == null || typeof options.manifest === "string") {
        this.manifest = await this._loadManifest(options?.manifest).catch(() => ({ wallets: [], version: "1.0.0" }));
      } else {
        this.manifest = options?.manifest ?? { wallets: [], version: "1.0.0" };
      }

      const set = new Set(this.excludedWallets);
      set.delete("hot-wallet"); // always include hot-wallet

      this.manifest.wallets = this.manifest.wallets.filter((wallet) => {
        // Remove wallet with walletConnect permission but no projectId is provided
        if (wallet.permissions.walletConnect && !this.walletConnect) return false;
        if (set.has(wallet.id)) return false; // excluded wallets
        return true;
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      resolve();
    });

    if (typeof window !== "undefined") {
      window.addEventListener<any>("near-wallet-injected", this._handleNearWalletInjected);
      window.dispatchEvent(new Event("near-selector-ready"));
      window.addEventListener("message", async (event) => {
        if (event.data.type === "near-wallet-injected") {
          await this.whenManifestLoaded.catch(() => {});
          this.wallets = this.wallets.filter((wallet) => wallet.manifest.id !== event.data.manifest.id);
          this.wallets.unshift(new ParentFrameWallet(this, event.data.manifest));
          this.events.emit("selector:walletsChanged", {});
          if (this.autoConnect) this.connect(event.data.manifest.id);
        }
      });
    }

    this.whenManifestLoaded.then(() => {
      if (typeof window !== "undefined") {
        window.parent.postMessage({ type: "near-selector-ready" }, "*");
      }

      this.manifest.wallets.forEach((wallet) => this.registerWallet(wallet));
      this.storage.get("debug-wallets").then((json) => {
        const debugWallets = JSON.parse(json ?? "[]") as WalletManifest[];
        debugWallets.forEach((wallet) => this.registerDebugWallet(wallet));
      });
    });

    // Try to restore session after manifest loads
    this.whenSessionRestored = this.whenManifestLoaded.then(async () => {
      if (!this.persistenceEnabled) return null;

      // Load multi-account state
      await this.loadMultiAccountState();

      const session = await this.session.tryRestore();
      if (session) {
        // Validate wallet still exists and try to reconnect
        try {
          const wallet = this.wallets.find((w) => w.manifest.id === session.walletId);
          if (wallet) {
            const accounts = await wallet.getAccounts({ network: session.network });
            if (accounts?.length) {
              this.network = session.network;
              await this.storage.set("selected-wallet", session.walletId);
              this.events.emit("wallet:signIn", { wallet, accounts, success: true });
              return session;
            }
          }
          // Wallet not found or no accounts - clear stale session
          await this.session.clear();
        } catch (e) {
          this.logger?.log("Failed to restore session", e);
          await this.session.clear();
        }
      }
      return null;
    });
  }

  /**
   * Initialize the connector and wait for manifest + session restoration.
   * This is the recommended way to set up the connector.
   * Returns the restored session if one exists, null otherwise.
   */
  async init(): Promise<Session | null> {
    try {
      await this.whenManifestLoaded;
      const session = await this.whenSessionRestored;
      return session;
    } catch (e) {
      this.logger?.log("Initialization error (non-fatal)", e);
      return null;
    }
  }

  /**
   * Check if the connector is ready (manifest loaded).
   */
  get isReady(): boolean {
    return this.manifest.wallets.length > 0;
  }

  get availableWallets() {
    const wallets = this.wallets.filter((wallet) => {
      return Object.entries(this.features).every(([key, value]) => {
        if (value && !wallet.manifest.features?.[key as keyof WalletFeatures]) return false;
        return true;
      });
    });

    return wallets.filter((wallet) => {
      if (this.network === "testnet" && !wallet.manifest.features?.testnet) return false;
      return true;
    });
  }

  private _handleNearWalletInjected = (event: EventNearWalletInjected) => {
    this.wallets = this.wallets.filter((wallet) => wallet.manifest.id !== event.detail.manifest.id);
    this.wallets.unshift(new InjectedWallet(this, event.detail as any));
    this.events.emit("selector:walletsChanged", {});
  };

  private async _loadManifest(manifestUrl?: string) {
    const manifestEndpoints = manifestUrl ? [manifestUrl] : defaultManifests;
    for (const endpoint of manifestEndpoints) {
      const res = await fetch(endpoint).catch(() => null);
      if (!res || !res.ok) continue;
      return await res.json(); // TODO: Validate this
    }

    throw new WalletError({
      code: ErrorCode.MANIFEST_LOAD_FAILED,
      message: "Failed to load wallet manifest from any endpoint",
    });
  }

  async switchNetwork(network: "mainnet" | "testnet", signInData?: { contractId?: string; methodNames?: Array<string> }) {
    if (this.network === network) return;
    await this.disconnect().catch(() => {});
    if (signInData) this.signInData = signInData;
    this.network = network;
    await this.connect();
  }

  async registerWallet(manifest: WalletManifest) {
    if (manifest.type !== "sandbox") throw new Error("Only sandbox wallets are supported");
    if (this.wallets.find((wallet) => wallet.manifest.id === manifest.id)) return;
    this.wallets.push(new SandboxWallet(this, manifest));
    this.events.emit("selector:walletsChanged", {});
  }

  async registerDebugWallet(json: string | WalletManifest) {
    const manifest = typeof json === "string" ? (JSON.parse(json) as WalletManifest) : json;
    if (manifest.type !== "sandbox") throw new Error("Only sandbox wallets type are supported");
    if (!manifest.id) throw new Error("Manifest must have an id");
    if (!manifest.name) throw new Error("Manifest must have a name");
    if (!manifest.icon) throw new Error("Manifest must have an icon");
    if (!manifest.website) throw new Error("Manifest must have a website");
    if (!manifest.version) throw new Error("Manifest must have a version");
    if (!manifest.executor) throw new Error("Manifest must have an executor");
    if (!manifest.features) throw new Error("Manifest must have features");
    if (!manifest.permissions) throw new Error("Manifest must have permissions");
    if (this.wallets.find((wallet) => wallet.manifest.id === manifest.id)) throw new Error("Wallet already registered");

    manifest.debug = true;
    this.wallets.unshift(new SandboxWallet(this, manifest));
    this.events.emit("selector:walletsChanged", {});

    const debugWallets = this.wallets.filter((wallet) => wallet.manifest.debug).map((wallet) => wallet.manifest);
    this.storage.set("debug-wallets", JSON.stringify(debugWallets));
    return manifest;
  }

  async removeDebugWallet(id: string) {
    this.wallets = this.wallets.filter((wallet) => wallet.manifest.id !== id);
    const debugWallets = this.wallets.filter((wallet) => wallet.manifest.debug).map((wallet) => wallet.manifest);
    this.storage.set("debug-wallets", JSON.stringify(debugWallets));
    this.events.emit("selector:walletsChanged", {});
  }

  async selectWallet() {
    await this.whenManifestLoaded.catch(() => {});
    return new Promise<string>((resolve, reject) => {
      const popup = new NearWalletsPopup({
        wallets: this.availableWallets.map((wallet) => wallet.manifest),
        onRemoveDebugManifest: async (id: string) => this.removeDebugWallet(id),
        onAddDebugManifest: async (wallet: string) => this.registerDebugWallet(wallet),
        onReject: () => {
          const error = new UserRejectedError(undefined, "wallet selection");
          reject(error);
          popup.destroy();
        },
        onSelect: (id: string) => (resolve(id), popup.destroy()),
      });

      popup.create();
    });
  }

  async connect(id?: string) {
    await this.whenManifestLoaded.catch(() => {});
    if (!id) id = await this.selectWallet();

    try {
      const wallet = await this.wallet(id);
      this.logger?.log(`Wallet available to connect`, wallet);

      await this.storage.set("selected-wallet", id);
      this.logger?.log(`Set preferred wallet, try to signIn`, id);

      const accounts = await wallet.signIn({
        contractId: this.signInData?.contractId,
        methodNames: this.signInData?.methodNames,
        network: this.network,
      });

      if (!accounts?.length) {
        throw new WalletError({
          code: ErrorCode.NO_ACCOUNTS,
          message: "Wallet returned no accounts after sign in",
          walletId: id,
        });
      }

      this.logger?.log(`Signed in to wallet`, id, accounts);

      // Save session for persistence
      if (this.persistenceEnabled) {
        await this.session.save({
          walletId: id,
          accounts,
          network: this.network,
        });
      }

      this.events.emit("wallet:signIn", { wallet, accounts, success: true });
      return wallet;
    } catch (e) {
      const walletError = wrapError(e, id);
      this.logger?.log("Failed to connect to wallet", walletError);
      this.events.emit("wallet:error", { error: walletError, walletId: id, action: "connect" });
      throw walletError;
    }
  }

  async disconnect(wallet?: NearWalletBase) {
    try {
      if (!wallet) wallet = await this.wallet();
      await wallet.signOut({ network: this.network });

      await this.storage.remove("selected-wallet");

      // Clear persisted session
      if (this.persistenceEnabled) {
        await this.session.clear();
      }

      this.events.emit("wallet:signOut", { success: true });
    } catch (e) {
      const walletError = wrapError(e, wallet?.manifest.id);
      this.logger?.log("Failed to disconnect wallet", walletError);
      this.events.emit("wallet:error", { error: walletError, walletId: wallet?.manifest.id, action: "disconnect" });
      throw walletError;
    }
  }

  /**
   * Try to get the connected wallet without throwing.
   * Returns null if no wallet is connected or no accounts found.
   * Use this for checking connection state safely.
   */
  async tryGetConnectedWallet(): Promise<{ wallet: NearWalletBase; accounts: Account[] } | null> {
    try {
      await this.whenManifestLoaded.catch(() => {});
      const id = await this.storage.get("selected-wallet");
      if (!id) return null;

      const wallet = this.wallets.find((wallet) => wallet.manifest.id === id);
      if (!wallet) return null;

      const accounts = await wallet.getAccounts();
      if (!accounts?.length) return null;

      return { wallet, accounts };
    } catch {
      return null;
    }
  }

  /**
   * Get the connected wallet. Throws if no wallet is connected.
   * For a non-throwing version, use tryGetConnectedWallet().
   */
  async getConnectedWallet() {
    await this.whenManifestLoaded.catch(() => {});
    const id = await this.storage.get("selected-wallet");
    const wallet = this.wallets.find((wallet) => wallet.manifest.id === id);

    if (!wallet) {
      throw new WalletError({
        code: ErrorCode.NO_ACTIVE_SESSION,
        message: "No wallet currently selected",
      });
    }

    const accounts = await wallet.getAccounts();
    if (!accounts?.length) {
      throw new WalletError({
        code: ErrorCode.NO_ACCOUNTS,
        message: "No accounts found in connected wallet",
        walletId: id ?? undefined,
      });
    }

    return { wallet, accounts };
  }

  /**
   * Check if a wallet is currently connected (non-throwing).
   */
  async isConnected(): Promise<boolean> {
    const result = await this.tryGetConnectedWallet();
    return result !== null;
  }

  async wallet(id?: string | null): Promise<NearWalletBase> {
    await this.whenManifestLoaded.catch(() => {});

    if (!id) {
      return this.getConnectedWallet()
        .then(({ wallet }) => wallet)
        .catch(async (e) => {
          await this.storage.remove("selected-wallet");
          if (e instanceof WalletError) throw e;
          throw new WalletError({
            code: ErrorCode.NO_ACCOUNTS,
            message: "No accounts found",
            originalError: e instanceof Error ? e : undefined,
          });
        });
    }

    const wallet = this.wallets.find((wallet) => wallet.manifest.id === id);
    if (!wallet) {
      // Try to find install URL from manifest
      const manifestWallet = this.manifest.wallets.find((w) => w.id === id);
      throw new WalletNotFoundError(id, manifestWallet?.website);
    }
    return wallet;
  }

  on<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.on(event, callback);
  }

  once<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.once(event, callback);
  }

  off<K extends keyof EventMap>(event: K, callback: (payload: EventMap[K]) => void): void {
    this.events.off(event, callback);
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    this.events.removeAllListeners(event);
  }

  // ===== Multi-Account Management =====

  /**
   * Get all connected accounts across all wallets
   */
  getConnectedAccounts(): ConnectedAccount[] {
    return [...this.connectedAccounts];
  }

  /**
   * Get the currently active account
   */
  getActiveAccount(): ConnectedAccount | null {
    if (!this.activeAccountId) return null;
    return this.connectedAccounts.find((a) => a.accountId === this.activeAccountId) ?? null;
  }

  /**
   * Switch to a different connected account
   */
  async switchAccount(accountId: string): Promise<ConnectedAccount> {
    const account = this.connectedAccounts.find((a) => a.accountId === accountId);
    if (!account) {
      throw new WalletError({
        code: ErrorCode.NO_ACCOUNTS,
        message: `Account ${accountId} is not connected`,
      });
    }

    // Switch network if needed
    if (account.network !== this.network) {
      this.network = account.network;
    }

    // Update selected wallet
    await this.storage.set("selected-wallet", account.walletId);

    this.activeAccountId = accountId;
    await this.saveMultiAccountState();

    this.events.emit("account:switched", { account, previousAccountId: this.activeAccountId });
    return account;
  }

  /**
   * Add a new account by connecting another wallet
   * Returns the newly added accounts
   */
  async addAccount(walletId?: string): Promise<ConnectedAccount[]> {
    await this.whenManifestLoaded.catch(() => {});

    if (!walletId) {
      walletId = await this.selectWallet();
    }

    const wallet = await this.wallet(walletId);

    const accounts = await wallet.signIn({
      contractId: this.signInData?.contractId,
      methodNames: this.signInData?.methodNames,
      network: this.network,
    });

    if (!accounts?.length) {
      throw new WalletError({
        code: ErrorCode.NO_ACCOUNTS,
        message: "Wallet returned no accounts after sign in",
        walletId,
      });
    }

    const newAccounts: ConnectedAccount[] = [];

    for (const account of accounts) {
      // Check if account already connected
      const existing = this.connectedAccounts.find((a) => a.accountId === account.accountId);
      if (existing) {
        this.logger?.log(`Account ${account.accountId} already connected`);
        continue;
      }

      const connectedAccount: ConnectedAccount = {
        ...account,
        walletId,
        walletName: wallet.manifest.name,
        walletIcon: wallet.manifest.icon,
        network: this.network,
        connectedAt: Date.now(),
      };

      this.connectedAccounts.push(connectedAccount);
      newAccounts.push(connectedAccount);
    }

    // Set first new account as active if no active account
    if (!this.activeAccountId && newAccounts.length > 0) {
      this.activeAccountId = newAccounts[0].accountId;
      await this.storage.set("selected-wallet", walletId);
    }

    await this.saveMultiAccountState();

    this.events.emit("account:added", { accounts: newAccounts });
    return newAccounts;
  }

  /**
   * Remove a connected account
   */
  async removeAccount(accountId: string): Promise<void> {
    const accountIndex = this.connectedAccounts.findIndex((a) => a.accountId === accountId);
    if (accountIndex === -1) {
      throw new WalletError({
        code: ErrorCode.NO_ACCOUNTS,
        message: `Account ${accountId} is not connected`,
      });
    }

    const account = this.connectedAccounts[accountIndex];
    this.connectedAccounts.splice(accountIndex, 1);

    // If removing active account, switch to another
    if (this.activeAccountId === accountId) {
      if (this.connectedAccounts.length > 0) {
        this.activeAccountId = this.connectedAccounts[0].accountId;
        await this.storage.set("selected-wallet", this.connectedAccounts[0].walletId);
      } else {
        this.activeAccountId = null;
        await this.storage.remove("selected-wallet");
      }
    }

    await this.saveMultiAccountState();

    this.events.emit("account:removed", { account });
  }

  /**
   * Check if multi-account mode has any accounts
   */
  hasConnectedAccounts(): boolean {
    return this.connectedAccounts.length > 0;
  }

  /**
   * Get accounts for a specific wallet
   */
  getAccountsForWallet(walletId: string): ConnectedAccount[] {
    return this.connectedAccounts.filter((a) => a.walletId === walletId);
  }

  /**
   * Load multi-account state from storage
   */
  private async loadMultiAccountState(): Promise<void> {
    try {
      const raw = await this.storage.get(MULTI_ACCOUNT_STORAGE_KEY);
      if (!raw) return;

      const state = JSON.parse(raw) as MultiAccountStorage;
      this.connectedAccounts = state.accounts ?? [];
      this.activeAccountId = state.activeAccountId;
    } catch (e) {
      this.logger?.log("Failed to load multi-account state", e);
    }
  }

  /**
   * Save multi-account state to storage
   */
  private async saveMultiAccountState(): Promise<void> {
    try {
      const state: MultiAccountStorage = {
        accounts: this.connectedAccounts,
        activeAccountId: this.activeAccountId,
      };
      await this.storage.set(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      this.logger?.log("Failed to save multi-account state", e);
    }
  }

  /**
   * Clear all connected accounts
   */
  async clearAllAccounts(): Promise<void> {
    this.connectedAccounts = [];
    this.activeAccountId = null;
    await this.storage.remove(MULTI_ACCOUNT_STORAGE_KEY);
    await this.storage.remove("selected-wallet");

    if (this.persistenceEnabled) {
      await this.session.clear();
    }

    this.events.emit("account:cleared", {});
  }
}
