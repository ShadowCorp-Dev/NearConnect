/**
 * Security Module
 * Comprehensive security layers for wallet operations
 */

// Transaction verification
export {
  TransactionGuard,
  createDefaultTransactionGuard,
  type Transaction as SecurityTransaction,
  type TransactionLimits,
  type TransactionRisk,
} from './transaction-guard';

// Origin verification
export {
  OriginGuard,
  createSecureMessageHandler,
  type TrustedOrigins,
  type OriginGuardConfig,
} from './origin-guard';

// Secure storage
export {
  SecureStorage,
  createSecureStorage,
  type SecureStorageOptions,
} from './secure-storage';

// Rate limiting
export {
  RateLimiter,
  connectLimiter,
  signLimiter,
  rpcLimiter,
  rateLimit,
  withRateLimit,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limiter';

// Audit logging
export {
  AuditLog,
  createAuditLog,
  type AuditEvent,
  type AuditEventType,
  type AuditLogConfig,
} from './audit-log';

// CSP and security checklist
export {
  generateCSP,
  getRecommendedCSP,
  mergeCSP,
  applyCSPMetaTag,
  runSecurityChecklist,
  getSecuritySummary,
  verifySecureContext,
  DEFAULT_CSP_DIRECTIVES,
  type CSPDirectives,
  type SecurityCheck,
} from './csp';
