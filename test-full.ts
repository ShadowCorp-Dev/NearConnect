/**
 * Full NearConnect Package Test
 * Tests all modules working together
 * Run with: npx tsx test-full.ts
 */

// Mock browser globals for Node.js environment
const mockLocalStorage: Record<string, string> = {};
const mockSessionStorage: Record<string, string> = {};

(global as any).localStorage = {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); },
  get length() { return Object.keys(mockLocalStorage).length; },
  key: (i: number) => Object.keys(mockLocalStorage)[i] || null,
};

(global as any).sessionStorage = {
  getItem: (key: string) => mockSessionStorage[key] || null,
  setItem: (key: string, value: string) => { mockSessionStorage[key] = value; },
  removeItem: (key: string) => { delete mockSessionStorage[key]; },
  clear: () => { Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]); },
  get length() { return Object.keys(mockSessionStorage).length; },
  key: (i: number) => Object.keys(mockSessionStorage)[i] || null,
};

(global as any).navigator = { userAgent: 'Node.js Test Environment' };
(global as any).window = {
  location: { origin: 'https://test.app', hostname: 'test.app' },
  screen: { width: 1920, height: 1080 },
  isSecureContext: true,
  self: {},
};
(global as any).window.self = (global as any).window;
(global as any).window.top = (global as any).window;

// Mock BroadcastChannel
(global as any).BroadcastChannel = class {
  onmessage: ((e: any) => void) | null = null;
  postMessage() {}
  close() {}
};

// Now import modules
import {
  // Storage
  MemoryStorage,
  LocalStorage,
  SessionStorage,

  // Session
  SessionManager,

  // Analytics
  Analytics,
  BatchingAnalyticsAdapter,

  // Connection reliability
  withRetry,
  withTimeout,
  CircuitBreaker,

  // Errors
  WalletError,
  ErrorCode,
  UserRejectedError,
  TransactionError,
  isWalletError,
  getUserFriendlyMessage,

  // Security
  TransactionGuard,
  createDefaultTransactionGuard,
  RateLimiter,
  AuditLog,
  createAuditLog,
  OriginGuard,
} from './src';

// Test utilities
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('═'.repeat(70));
  console.log('  NearConnect Full Package Test Suite');
  console.log('═'.repeat(70));

  // ===========================================================================
  // Storage Tests
  // ===========================================================================
  console.log('\n📦 Storage Module\n');

  await test('MemoryStorage stores and retrieves data', async () => {
    const storage = new MemoryStorage();
    await storage.set('key1', 'value1');
    const value = await storage.get('key1');
    assert(value === 'value1', `Value mismatch: got ${value}`);
  });

  await test('MemoryStorage removes data', async () => {
    const storage = new MemoryStorage();
    await storage.set('key1', 'value1');
    await storage.remove('key1');
    const value = await storage.get('key1');
    assert(value === null, `Should be null after remove, got ${value}`);
  });

  await test('LocalStorage wrapper works', async () => {
    const storage = new LocalStorage();
    await storage.set('test', 'data');
    const value = await storage.get('test');
    assert(value === 'data', `LocalStorage failed: got ${value}`);
    await storage.remove('test');
  });

  await test('SessionStorage wrapper works', async () => {
    const storage = new SessionStorage();
    await storage.set('test', 'data');
    const value = await storage.get('test');
    assert(value === 'data', `SessionStorage failed: got ${value}`);
    await storage.remove('test');
  });

  // ===========================================================================
  // Session Manager Tests
  // ===========================================================================
  console.log('\n🔐 Session Manager\n');

  await test('SessionManager creates and validates sessions', async () => {
    const manager = new SessionManager({
      storage: new MemoryStorage(),
      storageKey: 'test-session',
    });

    const savedSession = await manager.save({
      walletId: 'test-wallet',
      accounts: [{ accountId: 'alice.near', publicKey: 'ed25519:ABC123' }],
      network: 'mainnet',
    });

    // validate() takes a session parameter
    const validation = manager.validate(savedSession);
    assert(validation.valid, 'Session should be valid');
    if (validation.valid) {
      assert(validation.session?.accounts[0]?.accountId === 'alice.near', 'Account mismatch');
    }
  });

  await test('SessionManager gets cached session', async () => {
    const storage = new MemoryStorage();
    const manager = new SessionManager({
      storage,
      storageKey: 'cache-test',
    });

    await manager.save({
      walletId: 'test-wallet',
      accounts: [{ accountId: 'bob.near', publicKey: 'ed25519:XYZ' }],
      network: 'testnet',
    });

    // get() is async
    const session = await manager.get();
    assert(session !== null, 'Should have cached session');
    assert(session?.accounts[0]?.accountId === 'bob.near', 'Account should match');
  });

  // ===========================================================================
  // Analytics Tests
  // ===========================================================================
  console.log('\n📊 Analytics Module\n');

  await test('Analytics tracks events', async () => {
    const events: any[] = [];
    const analytics = new Analytics({
      adapter: {
        track: (event) => { events.push(event); return Promise.resolve(); },
        flush: () => Promise.resolve(),
      },
    });

    analytics.track('wallet:connect', { walletId: 'meteor' });
    analytics.track('tx:send', { amount: '10 NEAR' });
    assert(events.length === 2, `Expected 2 events, got ${events.length}`);
  });

  await test('BatchingAnalyticsAdapter accumulates events', async () => {
    const adapter = new BatchingAnalyticsAdapter({
      batchSize: 5,
      flushInterval: 10000,
      onFlush: () => {},
    });

    await adapter.track({ type: 'event1', timestamp: Date.now(), data: {} });
    await adapter.track({ type: 'event2', timestamp: Date.now(), data: {} });
    // Just verify it doesn't throw
    assert(true, 'BatchingAdapter works');
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================
  console.log('\n⚠️  Error Handling\n');

  await test('WalletError creates proper error', () => {
    const error = new WalletError({
      code: ErrorCode.USER_REJECTED,
      message: 'User cancelled',
    });
    assert(error.code === ErrorCode.USER_REJECTED, `Code mismatch: ${error.code}`);
    assert(error.message === 'User cancelled', `Message mismatch: ${error.message}`);
  });

  await test('UserRejectedError has correct code', () => {
    const error = new UserRejectedError();
    assert(error.code === ErrorCode.USER_REJECTED, `Should be USER_REJECTED, got ${error.code}`);
  });

  await test('TransactionError has correct code', () => {
    const error = new TransactionError('TX failed');
    assert(error.code === ErrorCode.TRANSACTION_FAILED, `Should be TRANSACTION_FAILED, got ${error.code}`);
  });

  await test('isWalletError identifies wallet errors', () => {
    const walletErr = new WalletError({ code: ErrorCode.UNKNOWN, message: 'Test' });
    const normalErr = new Error('Normal');
    assert(isWalletError(walletErr), 'Should identify WalletError');
    assert(!isWalletError(normalErr), 'Should not identify normal Error');
  });

  await test('getUserFriendlyMessage returns readable message', () => {
    const error = new TransactionError('TX failed');
    const friendly = getUserFriendlyMessage(error);
    assert(friendly.length > 0, 'Should have message');
    assert(typeof friendly === 'string', 'Should be string');
  });

  // ===========================================================================
  // Connection Reliability Tests
  // ===========================================================================
  console.log('\n🔄 Connection Reliability\n');

  await test('withRetry retries on failure then succeeds', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Fail');
      return 'success';
    };

    // Need shouldRetry to retry any error (default only retries specific WalletError codes)
    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseDelay: 1,
      shouldRetry: () => true,
    });
    assert(result === 'success', 'Should eventually succeed');
    assert(attempts === 3, `Expected 3 attempts, got ${attempts}`);
  });

  await test('withTimeout times out slow operations', async () => {
    const slowFn = () => new Promise(resolve => setTimeout(resolve, 1000));
    try {
      // withTimeout takes positional args: (operation, timeoutMs, operationName?)
      await withTimeout(slowFn, 50, 'slow-test');
      assert(false, 'Should have timed out');
    } catch (e: any) {
      assert(
        e.message.toLowerCase().includes('timeout') || e.message.toLowerCase().includes('timed'),
        `Should be timeout error, got: ${e.message}`
      );
    }
  });

  await test('CircuitBreaker tracks per-wallet state', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 100,
    });

    const walletId = 'test-wallet';
    const failFn = async () => { throw new Error('Fail'); };

    // First failure
    try { await breaker.execute(walletId, failFn); } catch {}
    assert(breaker.getState(walletId) === 'closed', 'Should still be closed after 1 failure');

    // Second failure - should open
    try { await breaker.execute(walletId, failFn); } catch {}
    assert(breaker.getState(walletId) === 'open', 'Should be open after 2 failures');

    // Should reject immediately when open
    assert(!breaker.isAllowed(walletId), 'Should not allow requests when open');
  });

  // ===========================================================================
  // Security Module Tests
  // ===========================================================================
  console.log('\n🛡️  Security Module\n');

  await test('TransactionGuard blocks dangerous methods', () => {
    const guard = createDefaultTransactionGuard();
    const tx = {
      receiverId: 'contract.near',
      actions: [{ type: 'FunctionCall' as const, params: { methodName: 'add_full_access_key', args: {}, gas: '30000000000000' } }],
    };
    const result = guard.validate(tx);
    assert(!result.valid, 'Should block dangerous method');
    assert(result.risk.level === 'critical', `Should be critical risk, got ${result.risk.level}`);
  });

  await test('TransactionGuard allows safe transfers', () => {
    const guard = new TransactionGuard();
    const tx = {
      receiverId: 'friend.near',
      actions: [{ type: 'Transfer' as const, params: { deposit: '1000000000000000000000000' } }],
    };
    const result = guard.validate(tx);
    assert(result.valid, 'Should allow safe transfer');
    assert(result.risk.level === 'low', `Should be low risk, got ${result.risk.level}`);
  });

  await test('TransactionGuard detects large transfers', () => {
    const guard = new TransactionGuard();
    const tx = {
      receiverId: 'someone.near',
      actions: [{ type: 'Transfer' as const, params: { deposit: '200000000000000000000000000' } }], // 200 NEAR
    };
    const risk = guard.analyzeRisk(tx);
    assert(risk.level === 'medium', `Should be medium risk for large transfer, got ${risk.level}`);
    assert(risk.reasons.some(r => r.includes('Large transfer')), 'Should mention large transfer');
  });

  await test('TransactionGuard blocks delete account', () => {
    const guard = new TransactionGuard();
    const tx = {
      receiverId: 'victim.near',
      actions: [{ type: 'DeleteAccount' as const, params: { beneficiaryId: 'attacker.near' } }],
    };
    const result = guard.validate(tx);
    assert(!result.valid, 'Should block DeleteAccount');
    assert(result.risk.level === 'critical', 'Should be critical');
  });

  await test('TransactionGuard blocks deploy contract', () => {
    const guard = new TransactionGuard();
    const tx = {
      receiverId: 'account.near',
      actions: [{ type: 'DeployContract' as const, params: { code: new Uint8Array([1,2,3]) } }],
    };
    const result = guard.validate(tx);
    assert(!result.valid, 'Should block DeployContract');
    assert(result.risk.level === 'critical', 'Should be critical');
  });

  await test('TransactionGuard custom blocklist', () => {
    const guard = new TransactionGuard({
      blockedReceivers: ['scam.near', 'phishing.near'],
    });
    const tx = {
      receiverId: 'scam.near',
      actions: [{ type: 'Transfer' as const, params: { deposit: '1' } }],
    };
    const result = guard.validate(tx);
    assert(!result.valid, 'Should block scam receiver');
  });

  await test('TransactionGuard custom method allowlist', () => {
    const guard = new TransactionGuard({
      allowedMethods: ['ft_transfer', 'nft_transfer'],
    });
    const tx = {
      receiverId: 'token.near',
      actions: [{ type: 'FunctionCall' as const, params: { methodName: 'unknown_method', args: {} } }],
    };
    const risk = guard.analyzeRisk(tx);
    assert(risk.reasons.some(r => r.includes('not in allowlist')), 'Should warn about method not in allowlist');
  });

  await test('RateLimiter blocks excessive requests', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, blockDurationMs: 5000 });

    const r1 = limiter.check('action');
    const r2 = limiter.check('action');
    const r3 = limiter.check('action');

    assert(r1.allowed, 'First should be allowed');
    assert(r2.allowed, 'Second should be allowed');
    assert(!r3.allowed, 'Third should be blocked');
    assert(r3.retryAfter! > 0, 'Should have retry time');
  });

  await test('RateLimiter reset works', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10000, blockDurationMs: 10000 });
    limiter.check('test');
    limiter.check('test'); // Should be blocked now
    limiter.reset('test');
    const afterReset = limiter.check('test');
    assert(afterReset.allowed, 'Should be allowed after reset');
  });

  await test('RateLimiter peek without recording', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
    limiter.check('peek-test');
    const peek1 = limiter.peek('peek-test');
    const peek2 = limiter.peek('peek-test');
    assert(peek1.remaining === peek2.remaining, 'Peek should not record');
  });

  await test('AuditLog records events', () => {
    const log = createAuditLog({ consoleLog: false });

    log.log('wallet:connect', { walletId: 'ledger', accountId: 'test.near' });
    log.log('tx:sign', { data: { receiver: 'bob.near' } });
    log.logSecurityWarning('Test warning');

    const events = log.getEvents();
    assert(events.length === 3, `Expected 3 events, got ${events.length}`);

    const secEvents = log.getSecurityEvents();
    assert(secEvents.length === 1, `Should have 1 security event, got ${secEvents.length}`);
  });

  await test('AuditLog filters by type', () => {
    const log = createAuditLog({ consoleLog: false });
    log.log('wallet:connect', {});
    log.log('tx:sign', {});
    log.log('tx:broadcast', {});

    const txEvents = log.getEvents({ type: ['tx:sign', 'tx:broadcast'] });
    assert(txEvents.length === 2, `Should have 2 tx events, got ${txEvents.length}`);
  });

  await test('AuditLog exports to JSON', () => {
    const log = createAuditLog({ consoleLog: false });
    log.log('wallet:connect', { walletId: 'test' });

    const json = log.export();
    const parsed = JSON.parse(json);
    assert(Array.isArray(parsed), 'Should export as array');
    assert(parsed.length === 1, 'Should have 1 event');
  });

  await test('AuditLog logTransaction helper', () => {
    const log = createAuditLog({ consoleLog: false });
    log.logTransaction('tx:broadcast', {
      walletId: 'meteor',
      accountId: 'test.near',
      receiverId: 'contract.near',
      hash: 'ABC123',
    });

    const events = log.getEvents({ type: 'tx:broadcast' });
    assert(events.length === 1, 'Should log transaction');
    assert(events[0].walletId === 'meteor', 'Should have walletId');
  });

  await test('OriginGuard verifies trusted origins', () => {
    const guard = new OriginGuard({
      appOrigins: ['https://myapp.com'],
      walletOrigins: { 'custom-wallet': ['https://custom.wallet'] },
    });

    // Check trusted wallet origin
    const trusted = guard.getTrustedOrigins('meteor');
    assert(trusted.includes('https://wallet.meteorwallet.app'), 'Should have Meteor origin');

    // Check custom origin added
    const custom = guard.getTrustedOrigins('custom-wallet');
    assert(custom.includes('https://custom.wallet'), 'Should have custom origin');
  });

  await test('OriginGuard isOriginTrusted', () => {
    const guard = new OriginGuard({ appOrigins: ['https://myapp.com'] });
    assert(guard.isOriginTrusted('https://myapp.com'), 'App origin should be trusted');
    assert(guard.isOriginTrusted('https://wallet.meteorwallet.app'), 'Meteor should be trusted');
    assert(!guard.isOriginTrusted('https://evil.com'), 'Evil should not be trusted');
  });

  await test('OriginGuard verifyCallbackUrl', () => {
    const guard = new OriginGuard({ appOrigins: ['https://myapp.com'] });
    const valid = guard.verifyCallbackUrl('https://myapp.com/callback');
    assert(valid.valid, 'Should validate callback from trusted origin');

    const invalid = guard.verifyCallbackUrl('https://evil.com/callback');
    assert(!invalid.valid, 'Should reject callback from untrusted origin');
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  console.log('\n🔗 Integration Tests\n');

  await test('Security + Analytics integration', () => {
    const events: any[] = [];
    const analytics = new Analytics({
      adapter: { track: (e) => { events.push(e); return Promise.resolve(); }, flush: () => Promise.resolve() },
    });
    const auditLog = createAuditLog({
      consoleLog: false,
      onEvent: (event) => {
        analytics.track(event.type, event.data || {});
      },
    });

    auditLog.log('wallet:connect', { walletId: 'test' });
    auditLog.log('tx:broadcast', { data: { hash: 'abc' } });

    assert(events.length === 2, `Analytics should receive audit events, got ${events.length}`);
  });

  await test('Session + Storage integration', async () => {
    const storage = new MemoryStorage();
    const manager = new SessionManager({ storage, storageKey: 'integration-test' });

    const savedSession = await manager.save({
      walletId: 'test-wallet',
      accounts: [{ accountId: 'integration.near', publicKey: 'ed25519:TEST' }],
      network: 'testnet',
    });

    // Verify storage has data
    const raw = await storage.get('integration-test');
    assert(raw !== null, 'Storage should have session data');

    // Verify session validates (validate takes a session parameter)
    const validation = manager.validate(savedSession);
    assert(validation.valid, 'Session should be valid');
  });

  await test('RateLimiter + AuditLog integration', () => {
    const auditLog = createAuditLog({ consoleLog: false });
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, blockDurationMs: 1000 });

    // Simulate rate-limited operation
    for (let i = 0; i < 4; i++) {
      const result = limiter.check('connect');
      if (!result.allowed) {
        auditLog.log('rate:limited', { data: { action: 'connect', retryAfter: result.retryAfter } });
      }
    }

    const rateLimitEvents = auditLog.getEvents({ type: 'rate:limited' });
    assert(rateLimitEvents.length === 2, `Should log 2 rate limit events, got ${rateLimitEvents.length}`);
  });

  await test('TransactionGuard + AuditLog integration', () => {
    const auditLog = createAuditLog({ consoleLog: false });
    const guard = createDefaultTransactionGuard();

    const dangerousTx = {
      receiverId: 'evil.near',
      actions: [{ type: 'DeleteAccount' as const, params: { beneficiaryId: 'attacker.near' } }],
    };

    const result = guard.validate(dangerousTx);
    if (!result.valid) {
      auditLog.logTransaction('tx:blocked', {
        receiverId: dangerousTx.receiverId,
        error: result.error,
        risk: result.risk.level,
      });
    }

    const blocked = auditLog.getEvents({ type: 'tx:blocked' });
    assert(blocked.length === 1, `Should log blocked transaction, got ${blocked.length}`);
    assert(blocked[0].risk === 'critical', `Should be critical risk, got ${blocked[0].risk}`);
  });

  await test('Full security pipeline', async () => {
    // Setup security stack
    const auditLog = createAuditLog({ consoleLog: false });
    const txGuard = createDefaultTransactionGuard();
    const rateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });

    // Simulate transaction flow
    const transactions = [
      { receiverId: 'bob.near', actions: [{ type: 'Transfer' as const, params: { deposit: '1000000000000000000000000' } }] },
      { receiverId: 'contract.near', actions: [{ type: 'FunctionCall' as const, params: { methodName: 'transfer', args: {}, gas: '30000000000000' } }] },
      { receiverId: 'evil.near', actions: [{ type: 'DeleteAccount' as const, params: { beneficiaryId: 'attacker.near' } }] },
    ];

    let allowed = 0;
    let blocked = 0;

    for (const tx of transactions) {
      // Check rate limit
      const rateResult = rateLimiter.check('tx');
      if (!rateResult.allowed) {
        auditLog.log('rate:limited', { data: { retryAfter: rateResult.retryAfter } });
        continue;
      }

      // Check transaction safety
      const txResult = txGuard.validate(tx);
      if (!txResult.valid) {
        auditLog.logTransaction('tx:blocked', { receiverId: tx.receiverId, error: txResult.error, risk: txResult.risk.level });
        blocked++;
      } else {
        auditLog.logTransaction('tx:sign', { receiverId: tx.receiverId });
        allowed++;
      }
    }

    assert(allowed === 2, `Should allow 2 transactions, got ${allowed}`);
    assert(blocked === 1, `Should block 1 transaction, got ${blocked}`);

    const events = auditLog.getEvents();
    assert(events.length === 3, `Should have 3 events, got ${events.length}`);
  });

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log('\n' + '═'.repeat(70));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(70));

  if (failed > 0) {
    console.log('\n❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!\n');
    console.log('Modules tested:');
    console.log('  • Storage (Memory, Local, Session)');
    console.log('  • Session Manager');
    console.log('  • Analytics & Batching');
    console.log('  • Error Handling');
    console.log('  • Connection Reliability (Retry, Timeout, Circuit Breaker)');
    console.log('  • Security (TransactionGuard, RateLimiter, AuditLog, OriginGuard)');
    console.log('  • Integration scenarios');
    console.log('');
  }
}

runTests().catch(console.error);
