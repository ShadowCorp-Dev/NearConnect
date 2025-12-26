/**
 * Origin & Message Verification Layer
 * Protects against MITM attacks and phishing callbacks
 */

export interface TrustedOrigins {
  /** Mapping of walletId to allowed origins */
  walletOrigins: Map<string, string[]>;
  /** Your app's allowed origins */
  appOrigins: string[];
}

export interface OriginGuardConfig {
  /** Additional app origins to trust */
  appOrigins?: string[];
  /** Additional wallet origins */
  walletOrigins?: Record<string, string[]>;
  /** Allow HTTP in development */
  allowInsecureInDev?: boolean;
}

/** Known wallet origins */
const DEFAULT_WALLET_ORIGINS: Record<string, string[]> = {
  'hot-wallet': ['https://wallet.nicklatkovich.dev', 'https://hot-labs.org'],
  'mynearwallet': ['https://app.mynearwallet.com'],
  'meteor': ['https://wallet.meteorwallet.app'],
  'here-wallet': ['https://my.herewallet.app'],
  'sender': ['https://sender.org'],
  'nightly': ['https://wallet.nightly.app'],
  'mintbase': ['https://wallet.mintbase.xyz'],
};

export class OriginGuard {
  private trusted: TrustedOrigins;
  private allowInsecureInDev: boolean;
  private sessionSecret: string | null = null;

  constructor(config: OriginGuardConfig = {}) {
    // Initialize wallet origins from defaults + custom
    const walletOrigins = new Map<string, string[]>();

    // Add default wallet origins
    for (const [walletId, origins] of Object.entries(DEFAULT_WALLET_ORIGINS)) {
      walletOrigins.set(walletId, origins);
    }

    // Add custom wallet origins
    if (config.walletOrigins) {
      for (const [walletId, origins] of Object.entries(config.walletOrigins)) {
        const existing = walletOrigins.get(walletId) || [];
        walletOrigins.set(walletId, [...existing, ...origins]);
      }
    }

    // Determine app origins
    const appOrigins = config.appOrigins || [];
    if (typeof window !== 'undefined') {
      appOrigins.push(window.location.origin);
    }

    this.trusted = { walletOrigins, appOrigins };
    this.allowInsecureInDev = config.allowInsecureInDev ?? true;
  }

  /**
   * Add a trusted wallet origin
   */
  addWalletOrigin(walletId: string, origin: string): void {
    const existing = this.trusted.walletOrigins.get(walletId) || [];
    if (!existing.includes(origin)) {
      this.trusted.walletOrigins.set(walletId, [...existing, origin]);
    }
  }

  /**
   * Add a trusted app origin
   */
  addAppOrigin(origin: string): void {
    if (!this.trusted.appOrigins.includes(origin)) {
      this.trusted.appOrigins.push(origin);
    }
  }

  /**
   * Verify postMessage origin is from expected wallet
   */
  verifyMessageOrigin(event: MessageEvent, expectedWalletId?: string): boolean {
    const origin = event.origin;

    // Check if from known wallet
    if (expectedWalletId) {
      const allowed = this.trusted.walletOrigins.get(expectedWalletId);
      if (allowed && allowed.includes(origin)) {
        return true;
      }
    }

    // Check all wallet origins if no specific wallet expected
    if (!expectedWalletId) {
      for (const origins of this.trusted.walletOrigins.values()) {
        if (origins.includes(origin)) {
          return true;
        }
      }
    }

    // Check if from trusted app origin
    if (this.trusted.appOrigins.includes(origin)) {
      return true;
    }

    console.warn(`[Security] Rejected message from untrusted origin: ${origin}`);
    return false;
  }

  /**
   * Verify deep link callback URL is safe
   */
  verifyCallbackUrl(url: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new URL(url);

      // Must be HTTPS in production
      if (parsed.protocol !== 'https:') {
        if (this.isDevelopment() && this.allowInsecureInDev) {
          // Allow HTTP in development
        } else {
          return { valid: false, reason: 'Callback URL must use HTTPS' };
        }
      }

      // Must match app origin
      if (!this.trusted.appOrigins.includes(parsed.origin)) {
        return { valid: false, reason: `Callback origin ${parsed.origin} is not trusted` };
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: 'Invalid callback URL' };
    }
  }

  /**
   * Generate secure callback URL with CSRF state token
   */
  async generateSecureCallback(baseUrl: string, requestId: string): Promise<string> {
    const url = new URL(baseUrl);
    const state = await this.generateState(requestId);
    url.searchParams.set('state', state);
    url.searchParams.set('requestId', requestId);
    return url.toString();
  }

  /**
   * Verify callback state token matches expected
   */
  async verifyState(state: string, requestId: string): Promise<boolean> {
    const expected = await this.generateState(requestId);
    return this.timingSafeEqual(state, expected);
  }

  /**
   * Generate HMAC-based state token
   */
  private async generateState(requestId: string): Promise<string> {
    const secret = this.getSessionSecret();
    return this.hmacSha256(requestId, secret);
  }

  /**
   * Get or create session-specific secret
   */
  private getSessionSecret(): string {
    if (this.sessionSecret) {
      return this.sessionSecret;
    }

    if (typeof sessionStorage !== 'undefined') {
      let secret = sessionStorage.getItem('near-connect:origin-secret');
      if (!secret) {
        secret = crypto.randomUUID();
        sessionStorage.setItem('near-connect:origin-secret', secret);
      }
      this.sessionSecret = secret;
      return secret;
    }

    // Fallback for non-browser environments
    this.sessionSecret = crypto.randomUUID();
    return this.sessionSecret;
  }

  /**
   * Compute HMAC-SHA256
   */
  private async hmacSha256(message: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Check if running in development environment
   */
  private isDevelopment(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local')
    );
  }

  /**
   * Validate that current context is secure
   */
  verifySecureContext(): { secure: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (typeof window === 'undefined') {
      return { secure: true, warnings: [] };
    }

    // Check secure context
    if (!window.isSecureContext) {
      warnings.push('Page is not in a secure context (HTTPS required for production)');
    }

    // Check if embedded in iframe (potential clickjacking)
    if (window.self !== window.top) {
      warnings.push('Page is embedded in an iframe - potential clickjacking risk');
    }

    // Check for cross-origin isolation
    if (!crossOriginIsolated) {
      // This is informational, not critical
    }

    return {
      secure: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Get list of trusted origins for a wallet
   */
  getTrustedOrigins(walletId: string): string[] {
    return this.trusted.walletOrigins.get(walletId) || [];
  }

  /**
   * Check if an origin is trusted for any wallet
   */
  isOriginTrusted(origin: string): boolean {
    for (const origins of this.trusted.walletOrigins.values()) {
      if (origins.includes(origin)) return true;
    }
    return this.trusted.appOrigins.includes(origin);
  }
}

/**
 * Create a message handler that validates origins
 */
export function createSecureMessageHandler<T>(
  guard: OriginGuard,
  expectedWalletId: string | undefined,
  handler: (data: T) => void
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!guard.verifyMessageOrigin(event, expectedWalletId)) {
      console.warn('[Security] Ignoring message from untrusted origin');
      return;
    }
    handler(event.data as T);
  };
}
