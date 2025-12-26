import { WalletManifest, Network } from "../types";
import { WalletError, ErrorCode } from "../errors";

/**
 * Manifest source with metadata
 */
export interface ManifestSource {
  /** Unique identifier for this source */
  id: string;
  /** Display name */
  name: string;
  /** URL to fetch manifest from */
  url: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this source is trusted */
  trusted: boolean;
  /** Last successful fetch timestamp */
  lastFetched?: number;
  /** Whether this source is enabled */
  enabled: boolean;
  /** Networks this source provides wallets for */
  networks?: Network[];
}

/**
 * Fetched manifest with source metadata
 */
export interface FetchedManifest {
  source: ManifestSource;
  wallets: WalletManifest[];
  version: string;
  fetchedAt: number;
}

/**
 * Manifest repository combining multiple sources
 */
export interface CombinedManifest {
  wallets: WalletManifest[];
  version: string;
  sources: ManifestSource[];
  lastUpdated: number;
}

/**
 * Manifest cache entry
 */
interface ManifestCacheEntry {
  manifest: FetchedManifest;
  expiresAt: number;
}

/**
 * Default manifest sources
 */
export const DEFAULT_MANIFEST_SOURCES: ManifestSource[] = [
  {
    id: "hot-dao-official",
    name: "HOT DAO Official",
    url: "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json",
    priority: 1,
    trusted: true,
    enabled: true,
    networks: ["mainnet", "testnet"],
  },
  {
    id: "hot-connector-cdn",
    name: "HOT Connector CDN",
    url: "https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json",
    priority: 2,
    trusted: true,
    enabled: true,
    networks: ["mainnet", "testnet"],
  },
];

/**
 * Options for the federated manifest manager
 */
export interface FederatedManifestOptions {
  /** Custom manifest sources */
  sources?: ManifestSource[];
  /** Whether to use default sources */
  useDefaults?: boolean;
  /** Cache duration in milliseconds (default: 5 minutes) */
  cacheDuration?: number;
  /** Request timeout in milliseconds (default: 10 seconds) */
  timeout?: number;
  /** Maximum retries per source */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Network to filter wallets for */
  network?: Network;
  /** Callback when manifest is updated */
  onUpdate?: (manifest: CombinedManifest) => void;
  /** Callback on fetch error */
  onError?: (source: ManifestSource, error: Error) => void;
}

/**
 * Federated Manifest Manager
 *
 * Aggregates wallet manifests from multiple sources with:
 * - Priority-based merging (higher priority sources override lower)
 * - Caching with TTL
 * - Automatic retries
 * - Health tracking per source
 */
export class FederatedManifestManager {
  private sources: ManifestSource[];
  private cache: Map<string, ManifestCacheEntry> = new Map();
  private cacheDuration: number;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  private network: Network;
  private onUpdate?: (manifest: CombinedManifest) => void;
  private onError?: (source: ManifestSource, error: Error) => void;

  constructor(options: FederatedManifestOptions = {}) {
    const defaultSources = options.useDefaults !== false ? DEFAULT_MANIFEST_SOURCES : [];
    this.sources = [...defaultSources, ...(options.sources ?? [])];
    this.cacheDuration = options.cacheDuration ?? 5 * 60 * 1000; // 5 minutes
    this.timeout = options.timeout ?? 10000; // 10 seconds
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelay = options.retryDelay ?? 1000;
    this.network = options.network ?? "mainnet";
    this.onUpdate = options.onUpdate;
    this.onError = options.onError;

    // Sort by priority
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add a new manifest source
   */
  addSource(source: ManifestSource): void {
    // Remove existing source with same ID
    this.sources = this.sources.filter((s) => s.id !== source.id);
    this.sources.push(source);
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a manifest source
   */
  removeSource(sourceId: string): void {
    this.sources = this.sources.filter((s) => s.id !== sourceId);
    this.cache.delete(sourceId);
  }

  /**
   * Enable/disable a source
   */
  setSourceEnabled(sourceId: string, enabled: boolean): void {
    const source = this.sources.find((s) => s.id === sourceId);
    if (source) {
      source.enabled = enabled;
    }
  }

  /**
   * Get all sources
   */
  getSources(): ManifestSource[] {
    return [...this.sources];
  }

  /**
   * Fetch manifest from a single source
   */
  async fetchFromSource(source: ManifestSource): Promise<FetchedManifest | null> {
    // Check cache first
    const cached = this.cache.get(source.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.manifest;
    }

    // Fetch with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate manifest structure
        if (!data.wallets || !Array.isArray(data.wallets)) {
          throw new Error("Invalid manifest: missing wallets array");
        }

        const manifest: FetchedManifest = {
          source,
          wallets: data.wallets,
          version: data.version ?? "1.0.0",
          fetchedAt: Date.now(),
        };

        // Update source metadata
        source.lastFetched = Date.now();

        // Cache the result
        this.cache.set(source.id, {
          manifest,
          expiresAt: Date.now() + this.cacheDuration,
        });

        return manifest;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    // All retries failed
    if (lastError) {
      this.onError?.(source, lastError);
    }
    return null;
  }

  /**
   * Fetch and combine manifests from all enabled sources
   */
  async fetchAll(): Promise<CombinedManifest> {
    const enabledSources = this.sources.filter((s) => s.enabled);

    // Fetch from all sources in parallel
    const results = await Promise.all(
      enabledSources.map((source) => this.fetchFromSource(source))
    );

    // Combine wallets (higher priority sources win on conflicts)
    const walletMap = new Map<string, WalletManifest>();
    const successfulSources: ManifestSource[] = [];
    let latestVersion = "1.0.0";

    // Process in reverse priority order so higher priority overwrites
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      if (!result) continue;

      successfulSources.push(result.source);

      if (result.version > latestVersion) {
        latestVersion = result.version;
      }

      for (const wallet of result.wallets) {
        // Filter by network if applicable
        if (this.network === "testnet" && !wallet.features?.testnet) {
          continue;
        }

        // Add source metadata to wallet
        const enrichedWallet: WalletManifest = {
          ...wallet,
          _source: result.source.id,
          _trusted: result.source.trusted,
        } as WalletManifest & { _source: string; _trusted: boolean };

        walletMap.set(wallet.id, enrichedWallet);
      }
    }

    const combined: CombinedManifest = {
      wallets: Array.from(walletMap.values()),
      version: latestVersion,
      sources: successfulSources,
      lastUpdated: Date.now(),
    };

    this.onUpdate?.(combined);
    return combined;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific source
   */
  clearSourceCache(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Set the network filter
   */
  setNetwork(network: Network): void {
    this.network = network;
  }

  /**
   * Get cache status for all sources
   */
  getCacheStatus(): Record<string, { cached: boolean; expiresAt?: number }> {
    const status: Record<string, { cached: boolean; expiresAt?: number }> = {};

    for (const source of this.sources) {
      const cached = this.cache.get(source.id);
      status[source.id] = {
        cached: !!cached && cached.expiresAt > Date.now(),
        expiresAt: cached?.expiresAt,
      };
    }

    return status;
  }

  /**
   * Register a custom wallet manifest (for debug/development)
   */
  registerCustomWallet(wallet: WalletManifest): void {
    // Create a virtual "custom" source if not exists
    let customSource = this.sources.find((s) => s.id === "custom");
    if (!customSource) {
      customSource = {
        id: "custom",
        name: "Custom Wallets",
        url: "",
        priority: 0, // Highest priority
        trusted: false,
        enabled: true,
      };
      this.sources.unshift(customSource);
    }

    // Add to cache
    const cached = this.cache.get("custom");
    const existingWallets = cached?.manifest.wallets ?? [];

    // Remove existing wallet with same ID
    const wallets = existingWallets.filter((w) => w.id !== wallet.id);
    wallets.push({ ...wallet, debug: true });

    this.cache.set("custom", {
      manifest: {
        source: customSource,
        wallets,
        version: "custom",
        fetchedAt: Date.now(),
      },
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  }

  /**
   * Remove a custom wallet
   */
  removeCustomWallet(walletId: string): void {
    const cached = this.cache.get("custom");
    if (!cached) return;

    cached.manifest.wallets = cached.manifest.wallets.filter((w) => w.id !== walletId);
  }
}

/**
 * Validate a wallet manifest
 */
export function validateManifest(manifest: unknown): manifest is WalletManifest {
  if (!manifest || typeof manifest !== "object") return false;

  const m = manifest as Record<string, unknown>;

  // Required fields
  if (typeof m.id !== "string" || !m.id) return false;
  if (typeof m.name !== "string" || !m.name) return false;
  if (typeof m.icon !== "string" || !m.icon) return false;
  if (typeof m.website !== "string" || !m.website) return false;
  if (typeof m.version !== "string" || !m.version) return false;
  if (typeof m.type !== "string") return false;

  // Type must be valid
  if (!["sandbox", "injected", "privileged"].includes(m.type)) return false;

  // Sandbox wallets need executor
  if (m.type === "sandbox" && typeof m.executor !== "string") return false;

  return true;
}

/**
 * Merge wallet manifests with conflict resolution
 */
export function mergeManifests(
  base: WalletManifest[],
  override: WalletManifest[],
  strategy: "override" | "merge" = "override"
): WalletManifest[] {
  const walletMap = new Map<string, WalletManifest>();

  // Add base wallets
  for (const wallet of base) {
    walletMap.set(wallet.id, wallet);
  }

  // Apply override wallets
  for (const wallet of override) {
    if (strategy === "override") {
      walletMap.set(wallet.id, wallet);
    } else {
      const existing = walletMap.get(wallet.id);
      if (existing) {
        // Merge features and permissions
        walletMap.set(wallet.id, {
          ...existing,
          ...wallet,
          features: { ...existing.features, ...wallet.features },
          permissions: { ...existing.permissions, ...wallet.permissions },
        });
      } else {
        walletMap.set(wallet.id, wallet);
      }
    }
  }

  return Array.from(walletMap.values());
}
