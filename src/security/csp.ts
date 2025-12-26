/**
 * Content Security Policy Helper & Security Checklist
 * Hardens browser security against XSS and injection attacks
 */

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'connect-src'?: string[];
  'frame-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'object-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'worker-src'?: string[];
  'child-src'?: string[];
}

/**
 * Default CSP directives for apps using NearConnect
 */
export const DEFAULT_CSP_DIRECTIVES: CSPDirectives = {
  // Default fallback
  'default-src': ["'self'"],

  // Scripts - no inline, no eval for security
  'script-src': ["'self'"],

  // Styles - allow inline for wallet UIs (required for dynamic styling)
  'style-src': ["'self'", "'unsafe-inline'"],

  // Connect - RPC endpoints, WalletConnect, verification
  'connect-src': [
    "'self'",
    'https://rpc.mainnet.near.org',
    'https://rpc.testnet.near.org',
    'https://archival-rpc.mainnet.near.org',
    'https://archival-rpc.testnet.near.org',
    'wss://relay.walletconnect.com',
    'https://verify.walletconnect.com',
    'https://explorer-api.mainnet.near.org',
    'https://explorer-api.testnet.near.org',
  ],

  // Frames - wallet iframes
  'frame-src': [
    "'self'",
    'https://wallet.nicklatkovich.dev',
    'https://hot-labs.org',
    'https://app.mynearwallet.com',
    'https://wallet.meteorwallet.app',
    'https://my.herewallet.app',
    'https://sender.org',
    'https://wallet.nightly.app',
    'https://wallet.mintbase.xyz',
  ],

  // Images
  'img-src': ["'self'", 'data:', 'https:'],

  // Fonts
  'font-src': ["'self'"],

  // No object/embed (Flash, etc.)
  'object-src': ["'none'"],

  // Base URI restriction
  'base-uri': ["'self'"],

  // Form submissions
  'form-action': ["'self'"],

  // Prevent clickjacking
  'frame-ancestors': ["'self'"],

  // Web workers
  'worker-src': ["'self'", 'blob:'],
};

/**
 * Generate CSP header string from directives
 */
export function generateCSP(directives: CSPDirectives = DEFAULT_CSP_DIRECTIVES): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Get recommended CSP for apps using NearConnect
 */
export function getRecommendedCSP(): string {
  return generateCSP(DEFAULT_CSP_DIRECTIVES);
}

/**
 * Merge custom CSP directives with defaults
 */
export function mergeCSP(custom: Partial<CSPDirectives>): CSPDirectives {
  const merged: CSPDirectives = { ...DEFAULT_CSP_DIRECTIVES };

  for (const [key, values] of Object.entries(custom)) {
    const directive = key as keyof CSPDirectives;
    merged[directive] = [
      ...(merged[directive] || []),
      ...values,
    ];
  }

  return merged;
}

/**
 * Apply CSP via meta tag (for SPAs that can't set headers)
 */
export function applyCSPMetaTag(directives?: CSPDirectives): void {
  if (typeof document === 'undefined') return;

  const csp = generateCSP(directives);

  // Remove existing CSP meta tag
  const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (existing) {
    existing.remove();
  }

  // Add new CSP meta tag
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = csp;
  document.head.appendChild(meta);
}

// =============================================================================
// Security Checklist
// =============================================================================

export interface SecurityCheck {
  name: string;
  passed: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  recommendation?: string;
}

/**
 * Run comprehensive security checklist
 */
export function runSecurityChecklist(): SecurityCheck[] {
  const checks: SecurityCheck[] = [];

  // Browser environment check
  if (typeof window === 'undefined') {
    return [{
      name: 'Environment',
      passed: true,
      severity: 'info',
      message: 'Running in non-browser environment',
    }];
  }

  // 1. Secure context (HTTPS)
  checks.push({
    name: 'Secure Context',
    passed: window.isSecureContext,
    severity: 'critical',
    message: window.isSecureContext
      ? 'Running in secure context (HTTPS)'
      : 'Not running in secure context',
    recommendation: window.isSecureContext
      ? undefined
      : 'Deploy application over HTTPS for production use',
  });

  // 2. Frame protection (clickjacking)
  const isFramed = window.self !== window.top;
  checks.push({
    name: 'Frame Protection',
    passed: !isFramed,
    severity: 'high',
    message: isFramed
      ? 'Page is embedded in an iframe - potential clickjacking risk'
      : 'Page is not embedded in iframe',
    recommendation: isFramed
      ? 'Ensure the parent frame is trusted or add frame-ancestors CSP directive'
      : undefined,
  });

  // 3. Web Crypto API
  const hasCrypto = !!(crypto?.subtle);
  checks.push({
    name: 'Web Crypto API',
    passed: hasCrypto,
    severity: 'critical',
    message: hasCrypto
      ? 'Web Crypto API available for secure operations'
      : 'Web Crypto API not available',
    recommendation: hasCrypto
      ? undefined
      : 'Ensure browser supports Web Crypto API (requires HTTPS)',
  });

  // 4. Storage availability
  const hasStorage = !!localStorage && !!sessionStorage;
  checks.push({
    name: 'Storage',
    passed: hasStorage,
    severity: 'medium',
    message: hasStorage
      ? 'Local and session storage available'
      : 'Storage APIs not available',
    recommendation: hasStorage
      ? undefined
      : 'Enable storage in browser settings for session persistence',
  });

  // 5. WebHID for hardware wallets
  const hasWebHID = 'hid' in navigator;
  checks.push({
    name: 'WebHID Support',
    passed: hasWebHID,
    severity: 'low',
    message: hasWebHID
      ? 'Hardware wallet support available (WebHID)'
      : 'Hardware wallet support not available',
    recommendation: hasWebHID
      ? undefined
      : 'Use Chrome/Edge for hardware wallet (Ledger) support',
  });

  // 6. Cross-origin isolation
  checks.push({
    name: 'Cross-Origin Isolation',
    passed: crossOriginIsolated,
    severity: 'low',
    message: crossOriginIsolated
      ? 'Cross-origin isolated for enhanced security'
      : 'Not cross-origin isolated',
    recommendation: crossOriginIsolated
      ? undefined
      : 'Add COOP/COEP headers for enhanced isolation (optional)',
  });

  // 7. Check for common vulnerabilities
  const hasEval = testEvalAvailable();
  checks.push({
    name: 'Eval Disabled',
    passed: !hasEval,
    severity: 'medium',
    message: hasEval
      ? 'eval() is available - potential code injection risk'
      : 'eval() is properly restricted',
    recommendation: hasEval
      ? 'Add script-src CSP without unsafe-eval'
      : undefined,
  });

  // 8. Service Worker scope
  const hasSW = 'serviceWorker' in navigator;
  checks.push({
    name: 'Service Worker',
    passed: true,
    severity: 'info',
    message: hasSW
      ? 'Service Worker API available'
      : 'Service Worker not available',
  });

  // 9. Permissions API
  const hasPermissions = 'permissions' in navigator;
  checks.push({
    name: 'Permissions API',
    passed: hasPermissions,
    severity: 'info',
    message: hasPermissions
      ? 'Permissions API available for feature detection'
      : 'Permissions API not available',
  });

  // 10. Referrer policy
  const referrerMeta = document.querySelector('meta[name="referrer"]');
  const hasStrictReferrer = referrerMeta?.getAttribute('content')?.includes('strict') ||
                           referrerMeta?.getAttribute('content') === 'no-referrer';
  checks.push({
    name: 'Referrer Policy',
    passed: hasStrictReferrer,
    severity: 'low',
    message: hasStrictReferrer
      ? 'Strict referrer policy configured'
      : 'Consider adding strict referrer policy',
    recommendation: hasStrictReferrer
      ? undefined
      : 'Add <meta name="referrer" content="strict-origin-when-cross-origin">',
  });

  return checks;
}

/**
 * Get summary of security checklist
 */
export function getSecuritySummary(checks?: SecurityCheck[]): {
  passed: number;
  failed: number;
  total: number;
  critical: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
} {
  const results = checks || runSecurityChecklist();

  const passed = results.filter(c => c.passed).length;
  const failed = results.filter(c => !c.passed).length;
  const critical = results.filter(c => !c.passed && c.severity === 'critical').length;
  const total = results.length;

  // Calculate weighted score
  const weights = { critical: 30, high: 20, medium: 10, low: 5, info: 0 };
  let maxScore = 0;
  let actualScore = 0;

  for (const check of results) {
    const weight = weights[check.severity];
    maxScore += weight;
    if (check.passed) {
      actualScore += weight;
    }
  }

  const score = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 100;

  // Grade based on score and critical failures
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (critical > 0) {
    grade = 'F';
  } else if (score >= 90) {
    grade = 'A';
  } else if (score >= 80) {
    grade = 'B';
  } else if (score >= 70) {
    grade = 'C';
  } else if (score >= 60) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return { passed, failed, total, critical, score, grade };
}

/**
 * Test if eval is available (should be blocked by CSP)
 */
function testEvalAvailable(): boolean {
  try {
    // eslint-disable-next-line no-eval
    eval('1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify current page has secure context for wallet operations
 */
export function verifySecureContext(): { secure: boolean; issues: string[] } {
  const issues: string[] = [];

  if (typeof window === 'undefined') {
    return { secure: true, issues: [] };
  }

  if (!window.isSecureContext) {
    issues.push('Page is not in a secure context (HTTPS required)');
  }

  if (window.self !== window.top) {
    issues.push('Page is embedded in an iframe');
  }

  if (!crypto?.subtle) {
    issues.push('Web Crypto API not available');
  }

  return {
    secure: issues.length === 0,
    issues,
  };
}
