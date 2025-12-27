/**
 * Injected Wallet Detector
 *
 * Hybrid detection that:
 * 1. Listens for near-wallet-injected events (compliant wallets)
 * 2. Probes known window globals (non-compliant wallets)
 * 3. Retries detection for slow-loading extensions
 */

export interface InjectedWalletInfo {
  id: string;
  name: string;
  icon: string;
  /** Primary global property to check */
  globalKey: string;
  /** Alternative keys (some wallets use multiple) */
  altKeys?: string[];
  /** Website URL */
  website: string;
  /** Uses HOT Protocol (hotWalletsProviders array) */
  usesHotProtocol?: boolean;
  /**
   * Uses postMessage channel (like Meteor's meteorCom).
   * These wallets inject a communication channel, not a provider interface.
   * They're detected to know extension is installed, but actual wallet
   * communication is handled by the sandboxed executor from manifest.
   */
  usesPostMessageChannel?: boolean;
}

/** Known NEAR wallet extensions and their injection patterns */
const KNOWN_INJECTED_WALLETS: InjectedWalletInfo[] = [
  // Meteor extension injects window.meteorCom - a postMessage communication channel.
  // The actual wallet operations are handled by the sandboxed executor (meteor.js from manifest)
  // which internally uses the Meteor SDK and meteorCom for communication.
  // We detect meteorCom to know the extension is installed for UI prioritization.
  {
    id: 'meteor-wallet',
    name: 'Meteor Wallet',
    icon: 'https://wallet.meteorwallet.app/assets/logo.svg',
    globalKey: 'meteorCom',
    website: 'https://wallet.meteorwallet.app',
    usesPostMessageChannel: true,
  },
  {
    id: 'sender',
    name: 'Sender Wallet',
    icon: 'https://sender.org/logo.svg',
    globalKey: 'near',
    altKeys: ['sender'],
    website: 'https://sender.org',
  },
  {
    id: 'here-wallet',
    name: 'HERE Wallet',
    icon: 'https://herewallet.app/logo.svg',
    globalKey: 'here',
    altKeys: ['hereWallet'],
    website: 'https://herewallet.app',
  },
  {
    id: 'nightly',
    name: 'Nightly Wallet',
    icon: 'https://nightly.app/logo.svg',
    globalKey: 'nightly',
    altKeys: ['nightlyNear'],
    website: 'https://nightly.app',
  },
  {
    id: 'mynearwallet',
    name: 'MyNearWallet',
    icon: 'https://mynearwallet.com/logo.svg',
    globalKey: 'nearWallet',
    website: 'https://mynearwallet.com',
  },
  {
    id: 'welldone',
    name: 'WELLDONE Wallet',
    icon: 'https://welldone.xyz/logo.svg',
    globalKey: 'dapp',
    website: 'https://welldone.xyz',
  },
];

export interface DetectedWallet {
  info: InjectedWalletInfo;
  provider: unknown;
}

export type DetectionCallback = (wallets: DetectedWallet[]) => void;

export class InjectedWalletDetector {
  private detected: Map<string, DetectedWallet> = new Map();
  private listeners: Set<DetectionCallback> = new Set();
  private isScanning = false;
  private eventCleanup: (() => void) | null = null;

  /**
   * Start detection - combines event listening and global probing
   */
  async detect(timeout: number = 2000): Promise<DetectedWallet[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    if (this.isScanning) {
      return Array.from(this.detected.values());
    }

    this.isScanning = true;

    // Method 1: Listen for compliant wallets via events
    this.listenForWalletEvents();

    // Method 2: Announce we're ready (triggers compliant wallets)
    this.announceReady();

    // Method 3: Probe globals immediately
    this.probeGlobals();

    // Method 4: Probe again with retries (for slow extensions)
    await this.probeWithRetry(timeout);

    this.isScanning = false;

    return Array.from(this.detected.values());
  }

  /**
   * Listen for wallets that use the event protocol
   */
  private listenForWalletEvents(): void {
    const handler = ((event: CustomEvent) => {
      const detail = event.detail;

      if (detail?.id && detail?.provider) {
        // Find matching known wallet or create generic entry
        const knownWallet = KNOWN_INJECTED_WALLETS.find((w) => w.id === detail.id);

        const walletInfo: InjectedWalletInfo = knownWallet || {
          id: detail.id,
          name: detail.name || detail.id,
          icon: detail.icon || '',
          globalKey: detail.id,
          website: detail.website || '',
        };

        this.addDetected(walletInfo, detail.provider);
      }
    }) as EventListener;

    window.addEventListener('near-wallet-injected', handler);

    this.eventCleanup = () => {
      window.removeEventListener('near-wallet-injected', handler);
    };
  }

  /**
   * Announce that we're ready to receive wallet injections
   */
  private announceReady(): void {
    // Different wallets listen for different event names
    window.dispatchEvent(new CustomEvent('near-selector-ready'));
    window.dispatchEvent(new CustomEvent('near-wallet-selector-ready'));
    window.dispatchEvent(new CustomEvent('near:ready'));
  }

  /**
   * Directly probe window globals for known wallets
   */
  private probeGlobals(): void {
    // First, check HOT Protocol providers (hotWalletsProviders array)
    this.probeHotProtocol();

    // Then check regular globals
    for (const wallet of KNOWN_INJECTED_WALLETS) {
      // Skip if already detected or uses HOT Protocol (handled separately)
      if (this.detected.has(wallet.id) || wallet.usesHotProtocol) continue;

      // For postMessage channel wallets (like Meteor), just check if global exists
      // These don't have wallet provider methods - they're communication channels
      if (wallet.usesPostMessageChannel) {
        const channel = this.findPostMessageChannel(wallet);
        if (channel) {
          console.log(`[NearConnect] Detected ${wallet.name} extension (postMessage channel)`);
          // Mark as detected but note: actual wallet ops go through sandbox
          this.addDetected(wallet, channel);
        }
        continue;
      }

      const provider = this.findProvider(wallet);

      if (provider) {
        this.addDetected(wallet, provider);
      }
    }
  }

  /**
   * Find postMessage channel (like window.meteorCom)
   * These are communication channels, not wallet providers
   */
  private findPostMessageChannel(wallet: InjectedWalletInfo): unknown | null {
    const win = window as unknown as Record<string, unknown>;

    // Check primary key - just needs to exist and be an object
    if (win[wallet.globalKey] && typeof win[wallet.globalKey] === 'object') {
      return win[wallet.globalKey];
    }

    // Check alternative keys
    if (wallet.altKeys) {
      for (const key of wallet.altKeys) {
        if (win[key] && typeof win[key] === 'object') {
          return win[key];
        }
      }
    }

    return null;
  }

  /**
   * Probe HOT Protocol providers (used by Meteor and potentially others)
   * HOT Protocol injects wallet providers into window.hotWalletsProviders array
   */
  private probeHotProtocol(): void {
    const win = window as unknown as Record<string, unknown>;
    const hotProviders = win['hotWalletsProviders'];

    if (!Array.isArray(hotProviders)) return;

    for (const provider of hotProviders) {
      if (!provider || typeof provider !== 'object') continue;

      const p = provider as Record<string, unknown>;
      const providerId = p.id as string | undefined;
      const providerName = p.name as string | undefined;

      if (!providerId) continue;

      // Skip if already detected
      if (this.detected.has(providerId)) continue;

      // Find matching known wallet config
      const knownWallet = KNOWN_INJECTED_WALLETS.find(
        (w) => w.usesHotProtocol && (w.id === providerId || w.name === providerName)
      );

      // Create wallet info (use known config or create from provider)
      const walletInfo: InjectedWalletInfo = knownWallet || {
        id: providerId,
        name: providerName || providerId,
        icon: (p.icon as string) || '',
        globalKey: 'hotWalletsProviders',
        website: (p.website as string) || '',
        usesHotProtocol: true,
      };

      // Validate it has wallet methods
      if (this.isValidProvider(provider)) {
        console.log(`[NearConnect] Detected HOT Protocol wallet: ${walletInfo.name}`);
        this.addDetected(walletInfo, provider);
      }
    }
  }

  /**
   * Find provider by checking global key and alternatives
   */
  private findProvider(wallet: InjectedWalletInfo): unknown | null {
    const win = window as unknown as Record<string, unknown>;

    // Check primary key
    if (win[wallet.globalKey] && this.isValidProvider(win[wallet.globalKey])) {
      return win[wallet.globalKey];
    }

    // Check alternative keys
    if (wallet.altKeys) {
      for (const key of wallet.altKeys) {
        if (win[key] && this.isValidProvider(win[key])) {
          return win[key];
        }
      }
    }

    return null;
  }

  /**
   * Validate that this looks like a wallet provider
   */
  private isValidProvider(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const provider = obj as Record<string, unknown>;

    // Most wallet providers have at least one of these methods
    // Meteor SDK uses: requestSignIn, isSignedIn, getAccountId, account, signMessage
    return (
      typeof provider.connect === 'function' ||
      typeof provider.signIn === 'function' ||
      typeof provider.requestSignIn === 'function' ||
      typeof provider.signAndSendTransaction === 'function' ||
      typeof provider.isConnected === 'function' ||
      typeof provider.isSignedIn === 'function' || // Meteor
      typeof provider.getAccountId === 'function' || // Meteor
      typeof provider.account === 'function' || // Meteor
      typeof provider.enable === 'function'
    );
  }

  /**
   * Probe with retries for slow-loading extensions
   */
  private async probeWithRetry(timeout: number): Promise<void> {
    const intervals = [100, 250, 500, 1000];
    let elapsed = 0;

    for (const interval of intervals) {
      if (elapsed >= timeout) break;

      await new Promise((resolve) => setTimeout(resolve, interval));
      elapsed += interval;

      this.probeGlobals();
    }
  }

  /**
   * Add a detected wallet
   */
  private addDetected(info: InjectedWalletInfo, provider: unknown): void {
    if (this.detected.has(info.id)) return;

    const detected: DetectedWallet = { info, provider };
    this.detected.set(info.id, detected);

    console.log(`[NearConnect] Detected injected wallet: ${info.name}`);

    // Notify listeners
    this.listeners.forEach((cb) => cb(Array.from(this.detected.values())));
  }

  /**
   * Subscribe to detection updates
   */
  onDetected(callback: DetectionCallback): () => void {
    this.listeners.add(callback);

    // Immediately call with current detections
    if (this.detected.size > 0) {
      callback(Array.from(this.detected.values()));
    }

    return () => this.listeners.delete(callback);
  }

  /**
   * Get specific wallet if detected
   */
  getWallet(id: string): DetectedWallet | undefined {
    return this.detected.get(id);
  }

  /**
   * Check if specific wallet is available
   */
  isAvailable(id: string): boolean {
    return this.detected.has(id);
  }

  /**
   * Get all detected wallets
   */
  getAll(): DetectedWallet[] {
    return Array.from(this.detected.values());
  }

  /**
   * Cleanup event listeners
   */
  destroy(): void {
    if (this.eventCleanup) {
      this.eventCleanup();
      this.eventCleanup = null;
    }
    this.listeners.clear();
    this.detected.clear();
  }
}
