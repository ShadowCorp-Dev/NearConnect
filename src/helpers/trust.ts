import { WalletManifest, Network } from "../types";

/**
 * Trust score components
 */
export interface TrustScoreComponents {
  /** Source trust (from manifest source) */
  sourceScore: number;
  /** Verification status (audits, certifications) */
  verificationScore: number;
  /** Age/maturity of the wallet */
  maturityScore: number;
  /** Usage/popularity metrics */
  popularityScore: number;
  /** Security features enabled */
  securityScore: number;
  /** Transparency (open source, etc.) */
  transparencyScore: number;
}

/**
 * Trust score result
 */
export interface TrustScore {
  /** Overall score 0-100 */
  score: number;
  /** Risk level */
  level: TrustLevel;
  /** Individual component scores */
  components: TrustScoreComponents;
  /** Warnings and recommendations */
  warnings: TrustWarning[];
  /** Positive trust signals */
  signals: TrustSignal[];
}

/**
 * Trust level categories
 */
export type TrustLevel = "high" | "medium" | "low" | "unknown";

/**
 * Trust warning
 */
export interface TrustWarning {
  type: TrustWarningType;
  message: string;
  severity: "info" | "warning" | "critical";
}

/**
 * Warning types
 */
export type TrustWarningType =
  | "untrusted_source"
  | "new_wallet"
  | "unverified"
  | "excessive_permissions"
  | "no_audit"
  | "closed_source"
  | "sandbox_risks"
  | "debug_wallet"
  | "unknown_developer";

/**
 * Positive trust signal
 */
export interface TrustSignal {
  type: TrustSignalType;
  message: string;
}

/**
 * Signal types
 */
export type TrustSignalType =
  | "verified"
  | "audited"
  | "open_source"
  | "trusted_source"
  | "established"
  | "popular"
  | "hardware_backed"
  | "multi_sig";

/**
 * Known trusted wallet IDs and their metadata
 */
const KNOWN_WALLETS: Record<string, {
  trusted: boolean;
  audited?: boolean;
  openSource?: boolean;
  established?: boolean;
  developer?: string;
}> = {
  "hot-wallet": { trusted: true, audited: true, openSource: true, established: true, developer: "HOT DAO" },
  "meteor-wallet": { trusted: true, audited: true, openSource: true, established: true, developer: "Meteor" },
  "mynearwallet": { trusted: true, audited: true, openSource: true, established: true, developer: "MyNearWallet" },
  "here-wallet": { trusted: true, audited: true, openSource: false, established: true, developer: "HERE" },
  "sender-wallet": { trusted: true, audited: true, openSource: true, established: true, developer: "Sender" },
  "near-mobile": { trusted: true, audited: true, openSource: false, established: true, developer: "NEAR Foundation" },
  "neth": { trusted: true, audited: true, openSource: true, established: true, developer: "NETH" },
  "bitte-wallet": { trusted: true, audited: true, openSource: false, established: false, developer: "Bitte" },
  "ledger": { trusted: true, audited: true, openSource: false, established: true, developer: "Ledger" },
  "wallet-connect": { trusted: true, audited: true, openSource: true, established: true, developer: "WalletConnect" },
};

/**
 * Risky permission combinations
 */
const RISKY_PERMISSIONS = [
  { permissions: ["storage", "cookies", "indexeddb"], risk: "high", message: "Can access all local storage data" },
  { permissions: ["fetch", "storage"], risk: "medium", message: "Can exfiltrate stored data" },
];

/**
 * Trust score configuration
 */
export interface TrustScorerOptions {
  /** Weight for source trust (default: 0.25) */
  sourceWeight?: number;
  /** Weight for verification (default: 0.20) */
  verificationWeight?: number;
  /** Weight for maturity (default: 0.15) */
  maturityWeight?: number;
  /** Weight for popularity (default: 0.15) */
  popularityWeight?: number;
  /** Weight for security (default: 0.15) */
  securityWeight?: number;
  /** Weight for transparency (default: 0.10) */
  transparencyWeight?: number;
  /** Minimum score to be considered "trusted" */
  trustedThreshold?: number;
  /** Custom known wallets to add/override */
  knownWallets?: Record<string, typeof KNOWN_WALLETS[string]>;
}

/**
 * Trust scorer for wallet manifests
 */
export class TrustScorer {
  private weights: Required<Omit<TrustScorerOptions, "trustedThreshold" | "knownWallets">>;
  private trustedThreshold: number;
  private knownWallets: typeof KNOWN_WALLETS;

  constructor(options: TrustScorerOptions = {}) {
    this.weights = {
      sourceWeight: options.sourceWeight ?? 0.25,
      verificationWeight: options.verificationWeight ?? 0.20,
      maturityWeight: options.maturityWeight ?? 0.15,
      popularityWeight: options.popularityWeight ?? 0.15,
      securityWeight: options.securityWeight ?? 0.15,
      transparencyWeight: options.transparencyWeight ?? 0.10,
    };
    this.trustedThreshold = options.trustedThreshold ?? 70;
    this.knownWallets = { ...KNOWN_WALLETS, ...options.knownWallets };
  }

  /**
   * Calculate trust score for a wallet
   */
  score(
    wallet: WalletManifest,
    context: {
      fromTrustedSource?: boolean;
      usageCount?: number;
      firstSeenAt?: number;
    } = {}
  ): TrustScore {
    const warnings: TrustWarning[] = [];
    const signals: TrustSignal[] = [];

    // Get known wallet data
    const known = this.knownWallets[wallet.id];

    // Calculate component scores
    const components: TrustScoreComponents = {
      sourceScore: this.scoreSource(wallet, context.fromTrustedSource, known, warnings, signals),
      verificationScore: this.scoreVerification(wallet, known, warnings, signals),
      maturityScore: this.scoreMaturity(wallet, context.firstSeenAt, known, warnings, signals),
      popularityScore: this.scorePopularity(wallet, context.usageCount, known, signals),
      securityScore: this.scoreSecurity(wallet, warnings, signals),
      transparencyScore: this.scoreTransparency(wallet, known, warnings, signals),
    };

    // Check for debug wallet
    if (wallet.debug) {
      warnings.push({
        type: "debug_wallet",
        message: "This is a debug/development wallet - use with caution",
        severity: "warning",
      });
      // Reduce all scores for debug wallets
      Object.keys(components).forEach((key) => {
        components[key as keyof TrustScoreComponents] *= 0.5;
      });
    }

    // Check for risky permission combinations
    this.checkRiskyPermissions(wallet, warnings);

    // Calculate weighted score
    const score = Math.round(
      components.sourceScore * this.weights.sourceWeight +
      components.verificationScore * this.weights.verificationWeight +
      components.maturityScore * this.weights.maturityWeight +
      components.popularityScore * this.weights.popularityWeight +
      components.securityScore * this.weights.securityWeight +
      components.transparencyScore * this.weights.transparencyWeight
    );

    // Determine trust level
    const level = this.getLevel(score);

    return { score, level, components, warnings, signals };
  }

  /**
   * Score source trustworthiness
   */
  private scoreSource(
    wallet: WalletManifest,
    fromTrustedSource: boolean | undefined,
    known: typeof KNOWN_WALLETS[string] | undefined,
    warnings: TrustWarning[],
    signals: TrustSignal[]
  ): number {
    let score = 50; // Base score

    if (fromTrustedSource) {
      score += 30;
      signals.push({ type: "trusted_source", message: "From verified manifest source" });
    } else {
      warnings.push({
        type: "untrusted_source",
        message: "Wallet is from an unverified source",
        severity: "warning",
      });
    }

    if (known?.trusted) {
      score += 20;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Score verification status
   */
  private scoreVerification(
    wallet: WalletManifest,
    known: typeof KNOWN_WALLETS[string] | undefined,
    warnings: TrustWarning[],
    signals: TrustSignal[]
  ): number {
    let score = 30; // Base score

    if (known?.audited) {
      score += 40;
      signals.push({ type: "audited", message: "Security audited" });
    } else {
      warnings.push({
        type: "no_audit",
        message: "No known security audit",
        severity: "info",
      });
    }

    if (known?.trusted) {
      score += 30;
      signals.push({ type: "verified", message: "Verified wallet provider" });
    } else {
      warnings.push({
        type: "unverified",
        message: "Wallet provider not verified",
        severity: "info",
      });
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Score wallet maturity
   */
  private scoreMaturity(
    wallet: WalletManifest,
    firstSeenAt: number | undefined,
    known: typeof KNOWN_WALLETS[string] | undefined,
    warnings: TrustWarning[],
    signals: TrustSignal[]
  ): number {
    let score = 40; // Base score

    if (known?.established) {
      score += 40;
      signals.push({ type: "established", message: "Established wallet with track record" });
    } else if (firstSeenAt) {
      const ageMonths = (Date.now() - firstSeenAt) / (30 * 24 * 60 * 60 * 1000);
      if (ageMonths > 12) {
        score += 30;
      } else if (ageMonths > 6) {
        score += 20;
      } else if (ageMonths > 1) {
        score += 10;
      } else {
        warnings.push({
          type: "new_wallet",
          message: "This is a recently added wallet",
          severity: "info",
        });
      }
    }

    // Version can indicate maturity
    const version = wallet.version?.split(".") ?? [];
    if (version.length >= 2) {
      const major = parseInt(version[0], 10);
      if (major >= 2) score += 10;
      else if (major >= 1) score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Score popularity/usage
   */
  private scorePopularity(
    wallet: WalletManifest,
    usageCount: number | undefined,
    known: typeof KNOWN_WALLETS[string] | undefined,
    signals: TrustSignal[]
  ): number {
    let score = 40; // Base score

    if (known?.established) {
      score += 30;
    }

    if (usageCount !== undefined) {
      if (usageCount > 10000) {
        score += 30;
        signals.push({ type: "popular", message: "Widely used wallet" });
      } else if (usageCount > 1000) {
        score += 20;
      } else if (usageCount > 100) {
        score += 10;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Score security features
   */
  private scoreSecurity(
    wallet: WalletManifest,
    warnings: TrustWarning[],
    signals: TrustSignal[]
  ): number {
    let score = 50; // Base score

    // Sandbox type is generally safer
    if (wallet.type === "sandbox") {
      score += 20;
    } else if (wallet.type === "privileged") {
      score += 30; // Hardware wallets
      signals.push({ type: "hardware_backed", message: "Hardware wallet security" });
    } else if (wallet.type === "injected") {
      // Injected can be risky
      warnings.push({
        type: "sandbox_risks",
        message: "Browser extension has broader access",
        severity: "info",
      });
    }

    // Check permissions
    const permissions = wallet.permissions ?? {};
    const permCount = Object.keys(permissions).filter((k) => permissions[k as keyof typeof permissions]).length;

    if (permCount <= 2) {
      score += 20; // Minimal permissions is good
    } else if (permCount <= 4) {
      score += 10;
    } else {
      score -= 10;
      warnings.push({
        type: "excessive_permissions",
        message: `Wallet requests ${permCount} permissions`,
        severity: "warning",
      });
    }

    // Multi-sig support (check for extended features)
    const extendedFeatures = wallet.features as unknown as Record<string, unknown> | undefined;
    if (extendedFeatures?.multiSig) {
      score += 10;
      signals.push({ type: "multi_sig", message: "Supports multi-signature" });
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Score transparency
   */
  private scoreTransparency(
    wallet: WalletManifest,
    known: typeof KNOWN_WALLETS[string] | undefined,
    warnings: TrustWarning[],
    signals: TrustSignal[]
  ): number {
    let score = 50; // Base score

    if (known?.openSource) {
      score += 30;
      signals.push({ type: "open_source", message: "Open source wallet" });
    } else {
      warnings.push({
        type: "closed_source",
        message: "Wallet source code is not publicly available",
        severity: "info",
      });
    }

    if (known?.developer) {
      score += 20;
    } else {
      warnings.push({
        type: "unknown_developer",
        message: "Unknown wallet developer",
        severity: "info",
      });
    }

    // Website and description indicate transparency
    if (wallet.website) score += 5;
    if (wallet.description) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Check for risky permission combinations
   */
  private checkRiskyPermissions(wallet: WalletManifest, warnings: TrustWarning[]): void {
    if (!wallet.permissions) return;

    const enabledPerms = Object.entries(wallet.permissions)
      .filter(([, enabled]) => enabled)
      .map(([perm]) => perm);

    for (const risky of RISKY_PERMISSIONS) {
      if (risky.permissions.every((p) => enabledPerms.includes(p))) {
        warnings.push({
          type: "excessive_permissions",
          message: risky.message,
          severity: risky.risk === "high" ? "critical" : "warning",
        });
      }
    }
  }

  /**
   * Get trust level from score
   */
  private getLevel(score: number): TrustLevel {
    if (score >= this.trustedThreshold) return "high";
    if (score >= 50) return "medium";
    if (score >= 25) return "low";
    return "unknown";
  }

  /**
   * Check if a wallet meets the trusted threshold
   */
  isTrusted(wallet: WalletManifest, context?: Parameters<TrustScorer["score"]>[1]): boolean {
    const result = this.score(wallet, context);
    return result.level === "high";
  }

  /**
   * Get trust badge info for display
   */
  getBadge(score: TrustScore): { label: string; color: string; icon: string } {
    switch (score.level) {
      case "high":
        return { label: "Verified", color: "#22c55e", icon: "shield-check" };
      case "medium":
        return { label: "Known", color: "#f59e0b", icon: "shield" };
      case "low":
        return { label: "Unverified", color: "#ef4444", icon: "shield-alert" };
      default:
        return { label: "Unknown", color: "#6b7280", icon: "shield-question" };
    }
  }
}

/**
 * Create a quick trust check
 */
export function quickTrustCheck(wallet: WalletManifest): TrustLevel {
  const scorer = new TrustScorer();
  return scorer.score(wallet).level;
}
