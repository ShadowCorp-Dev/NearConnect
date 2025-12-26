/**
 * Security Module Test Script
 * Run with: npx ts-node test-security.ts
 * Or: npx tsx test-security.ts
 */

import {
  TransactionGuard,
  createDefaultTransactionGuard,
  RateLimiter,
  AuditLog,
  createAuditLog,
} from './src/security';

console.log('='.repeat(60));
console.log('NearConnect Security Module Tests');
console.log('='.repeat(60));

// =============================================================================
// 1. Transaction Guard Tests
// =============================================================================
console.log('\n📋 Transaction Guard Tests\n');

const txGuard = createDefaultTransactionGuard();

// Test 1: Safe transfer
const safeTx = {
  receiverId: 'bob.near',
  actions: [{ type: 'Transfer' as const, params: { deposit: '1000000000000000000000000' } }], // 1 NEAR
};

const safeResult = txGuard.analyzeRisk(safeTx);
console.log('✓ Safe 1 NEAR transfer:');
console.log(`  Risk Level: ${safeResult.level}`);
console.log(`  Requires Approval: ${safeResult.requiresExplicitApproval}`);

// Test 2: Large transfer
const largeTx = {
  receiverId: 'bob.near',
  actions: [{ type: 'Transfer' as const, params: { deposit: '500000000000000000000000000' } }], // 500 NEAR
};

const largeResult = txGuard.analyzeRisk(largeTx);
console.log('\n⚠️  Large 500 NEAR transfer:');
console.log(`  Risk Level: ${largeResult.level}`);
console.log(`  Reasons: ${largeResult.reasons.join(', ')}`);

// Test 3: Dangerous method
const dangerousTx = {
  receiverId: 'some-contract.near',
  actions: [{
    type: 'FunctionCall' as const,
    params: { methodName: 'add_full_access_key', args: {}, gas: '30000000000000' }
  }],
};

const dangerousResult = txGuard.analyzeRisk(dangerousTx);
console.log('\n🚨 Dangerous add_full_access_key call:');
console.log(`  Risk Level: ${dangerousResult.level}`);
console.log(`  Reasons: ${dangerousResult.reasons.join(', ')}`);
console.log(`  Blocked: ${!txGuard.validate(dangerousTx).valid}`);

// Test 4: Delete account
const deleteTx = {
  receiverId: 'victim.near',
  actions: [{ type: 'DeleteAccount' as const, params: { beneficiaryId: 'attacker.near' } }],
};

const deleteResult = txGuard.analyzeRisk(deleteTx);
console.log('\n🚨 Delete account action:');
console.log(`  Risk Level: ${deleteResult.level}`);
console.log(`  Reasons: ${deleteResult.reasons.join(', ')}`);

// Test 5: Custom blocklist
const customGuard = new TransactionGuard({
  blockedReceivers: ['scam.near', 'phishing.near'],
  allowedMethods: ['transfer', 'ft_transfer', 'nft_transfer'],
});

const blockedTx = {
  receiverId: 'scam.near',
  actions: [{ type: 'Transfer' as const, params: { deposit: '1000000000000000000000000' } }],
};

const blockedResult = customGuard.analyzeRisk(blockedTx);
console.log('\n🚫 Blocked receiver (scam.near):');
console.log(`  Risk Level: ${blockedResult.level}`);
console.log(`  Blocked: ${!customGuard.validate(blockedTx).valid}`);

// =============================================================================
// 2. Rate Limiter Tests
// =============================================================================
console.log('\n' + '='.repeat(60));
console.log('📋 Rate Limiter Tests\n');

const limiter = new RateLimiter({
  maxRequests: 3,
  windowMs: 5000,
  blockDurationMs: 10000,
});

console.log('Testing rate limit (3 requests per 5 seconds):\n');

for (let i = 1; i <= 5; i++) {
  const result = limiter.check('test-action');
  console.log(`  Request ${i}: ${result.allowed ? '✓ Allowed' : '✗ Blocked'} (remaining: ${result.remaining})`);
  if (!result.allowed) {
    console.log(`    Retry after: ${result.retryAfter} seconds`);
  }
}

// Reset and test again
limiter.reset('test-action');
console.log('\n  [Reset limiter]');
const afterReset = limiter.check('test-action');
console.log(`  After reset: ${afterReset.allowed ? '✓ Allowed' : '✗ Blocked'} (remaining: ${afterReset.remaining})`);

// =============================================================================
// 3. Audit Log Tests
// =============================================================================
console.log('\n' + '='.repeat(60));
console.log('📋 Audit Log Tests\n');

const auditLog = createAuditLog({ consoleLog: false });

// Log some events
auditLog.log('wallet:connect', { walletId: 'ledger', accountId: 'alice.near' });
auditLog.log('tx:sign', { walletId: 'ledger', accountId: 'alice.near', data: { receiverId: 'bob.near' } });
auditLog.log('tx:broadcast', { walletId: 'ledger', data: { hash: 'ABC123...' } });
auditLog.logSecurityWarning('Large transfer detected', { amount: '500 NEAR' });
auditLog.log('tx:blocked', { data: { reason: 'Dangerous method' }, risk: 'critical' });

const allEvents = auditLog.getEvents();
console.log(`Total events logged: ${allEvents.length}`);

const securityEvents = auditLog.getSecurityEvents();
console.log(`Security events: ${securityEvents.length}`);

console.log('\nEvent types logged:');
const eventTypes = new Set(allEvents.map(e => e.type));
eventTypes.forEach(type => {
  const count = allEvents.filter(e => e.type === type).length;
  console.log(`  - ${type}: ${count}`);
});

// Export test
const exported = auditLog.export();
console.log(`\nExported JSON length: ${exported.length} chars`);

// =============================================================================
// 4. Summary
// =============================================================================
console.log('\n' + '='.repeat(60));
console.log('✅ All security module tests completed!\n');

console.log('Security layers available:');
console.log('  • TransactionGuard - Analyzes transaction risk');
console.log('  • OriginGuard - Verifies message origins (browser only)');
console.log('  • SecureStorage - Encrypted localStorage (browser only)');
console.log('  • RateLimiter - Prevents abuse');
console.log('  • AuditLog - Tracks all actions');
console.log('  • CSP Helper - Content Security Policy (browser only)');
console.log('');
