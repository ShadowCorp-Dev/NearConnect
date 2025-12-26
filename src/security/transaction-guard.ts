/**
 * Transaction Verification Layer
 * Analyzes transactions for risks before signing
 */

import type { Action } from '../types';

export interface Transaction {
  receiverId: string;
  actions: Action[];
}

export interface TransactionLimits {
  /** Max NEAR per transaction (in yoctoNEAR) */
  maxTransferAmount?: bigint;
  /** Max gas per action */
  maxGasPerAction?: bigint;
  /** Whitelist of allowed receivers */
  allowedReceivers?: string[];
  /** Blacklist of blocked receivers */
  blockedReceivers?: string[];
  /** Whitelist of allowed contract methods */
  allowedMethods?: string[];
  /** Blacklist of known dangerous methods */
  blockedMethods?: string[];
  /** Always prompt user for confirmation */
  requireConfirmation?: boolean;
}

export interface TransactionRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  requiresExplicitApproval: boolean;
}

/** Methods that grant significant account control */
const DANGEROUS_METHODS = [
  'add_full_access_key',
  'delete_account',
  'deploy',
  'add_key',
  'delete_key',
];

/** Known scam contracts - maintained from community reports */
const KNOWN_SCAM_CONTRACTS = new Set<string>([
  // Add known scam contracts here
]);

/** Suspicious patterns in function call arguments */
const SUSPICIOUS_PATTERNS = [
  /add_full_access_key/i,
  /delete_account/i,
  /\.near['"]?\s*:/,  // Hidden account references
  /base64/i,          // Encoded payloads that might hide malicious intent
];

export class TransactionGuard {
  private limits: TransactionLimits;
  private customScamContracts: Set<string>;

  constructor(limits: TransactionLimits = {}) {
    this.limits = limits;
    this.customScamContracts = new Set();
  }

  /**
   * Add custom scam contracts to the blocklist
   */
  addScamContract(contractId: string): void {
    this.customScamContracts.add(contractId);
  }

  /**
   * Remove a contract from the custom blocklist
   */
  removeScamContract(contractId: string): void {
    this.customScamContracts.delete(contractId);
  }

  /**
   * Update transaction limits
   */
  updateLimits(limits: Partial<TransactionLimits>): void {
    this.limits = { ...this.limits, ...limits };
  }

  /**
   * Analyze transaction for risks before signing
   */
  analyzeRisk(tx: Transaction): TransactionRisk {
    const reasons: string[] = [];
    let level: TransactionRisk['level'] = 'low';

    // Check receiver against known scams
    if (KNOWN_SCAM_CONTRACTS.has(tx.receiverId) || this.customScamContracts.has(tx.receiverId)) {
      reasons.push(`Receiver ${tx.receiverId} is a known scam contract`);
      level = 'critical';
    }

    // Check receiver against blocklist
    if (this.limits.blockedReceivers?.includes(tx.receiverId)) {
      reasons.push(`Receiver ${tx.receiverId} is blocked`);
      level = 'critical';
    }

    // Check receiver against allowlist
    if (this.limits.allowedReceivers?.length &&
        !this.limits.allowedReceivers.includes(tx.receiverId)) {
      reasons.push(`Receiver ${tx.receiverId} is not in allowlist`);
      level = this.escalate(level, 'medium');
    }

    // Check each action
    for (const action of tx.actions) {
      const actionRisk = this.analyzeAction(action, tx.receiverId);
      reasons.push(...actionRisk.reasons);
      level = this.escalate(level, actionRisk.level);
    }

    return {
      level,
      reasons,
      requiresExplicitApproval: level === 'high' || level === 'critical' || this.limits.requireConfirmation === true,
    };
  }

  private analyzeAction(action: Action, _receiverId: string): TransactionRisk {
    const reasons: string[] = [];
    let level: TransactionRisk['level'] = 'low';

    // Handle both action formats (near-wallet-selector and near-api-js)
    const actionType = 'type' in action ? action.type : (action as { enum?: string }).enum;
    const params = 'params' in action ? action.params : action;

    switch (actionType) {
      case 'Transfer': {
        const deposit = (params as { deposit?: string })?.deposit;
        const amount = BigInt(deposit || '0');

        if (this.limits.maxTransferAmount && amount > this.limits.maxTransferAmount) {
          reasons.push(`Transfer amount exceeds configured limit`);
          level = 'high';
        }

        // Large transfers (>100 NEAR)
        const hundredNear = BigInt('100000000000000000000000000');
        if (amount > hundredNear) {
          reasons.push(`Large transfer: ${this.formatNear(amount)} NEAR`);
          level = this.escalate(level, 'medium');
        }

        // Very large transfers (>1000 NEAR)
        const thousandNear = BigInt('1000000000000000000000000000');
        if (amount > thousandNear) {
          reasons.push(`Very large transfer: ${this.formatNear(amount)} NEAR`);
          level = this.escalate(level, 'high');
        }
        break;
      }

      case 'FunctionCall': {
        const methodName = (params as { methodName?: string })?.methodName || '';
        const gas = (params as { gas?: string | bigint })?.gas;
        const args = (params as { args?: unknown })?.args;

        // Check dangerous methods
        if (DANGEROUS_METHODS.includes(methodName)) {
          reasons.push(`Dangerous method: ${methodName}`);
          level = 'critical';
        }

        // Check blocked methods
        if (this.limits.blockedMethods?.includes(methodName)) {
          reasons.push(`Method ${methodName} is blocked`);
          level = 'critical';
        }

        // Check method allowlist
        if (this.limits.allowedMethods?.length &&
            !this.limits.allowedMethods.includes(methodName)) {
          reasons.push(`Method ${methodName} is not in allowlist`);
          level = this.escalate(level, 'medium');
        }

        // Check gas limits
        if (gas && this.limits.maxGasPerAction) {
          const gasAmount = BigInt(gas);
          if (gasAmount > this.limits.maxGasPerAction) {
            reasons.push(`Gas exceeds configured limit`);
            level = this.escalate(level, 'medium');
          }
        }

        // Check for suspicious patterns in args
        if (args && this.containsSuspiciousPatterns(JSON.stringify(args))) {
          reasons.push('Arguments contain suspicious patterns');
          level = this.escalate(level, 'high');
        }
        break;
      }

      case 'AddKey': {
        const accessKey = (params as { accessKey?: { permission?: string | object } })?.accessKey;
        const permission = accessKey?.permission;

        if (permission === 'FullAccess' || (typeof permission === 'object' && 'fullAccess' in permission)) {
          reasons.push('Adding full access key - grants complete account control');
          level = 'critical';
        } else {
          reasons.push('Adding function call access key');
          level = this.escalate(level, 'medium');
        }
        break;
      }

      case 'DeleteKey': {
        reasons.push('Deleting access key');
        level = this.escalate(level, 'high');
        break;
      }

      case 'DeleteAccount': {
        reasons.push('Deleting account - this action is irreversible');
        level = 'critical';
        break;
      }

      case 'DeployContract': {
        reasons.push('Deploying contract code to account');
        level = 'critical';
        break;
      }

      case 'Stake': {
        reasons.push('Staking NEAR tokens');
        level = this.escalate(level, 'medium');
        break;
      }

      case 'CreateAccount': {
        reasons.push('Creating new account');
        level = this.escalate(level, 'low');
        break;
      }
    }

    return { level, reasons, requiresExplicitApproval: level !== 'low' };
  }

  private containsSuspiciousPatterns(str: string): boolean {
    return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(str));
  }

  private escalate(
    current: TransactionRisk['level'],
    proposed: TransactionRisk['level']
  ): TransactionRisk['level'] {
    const levels: TransactionRisk['level'][] = ['low', 'medium', 'high', 'critical'];
    return levels.indexOf(proposed) > levels.indexOf(current) ? proposed : current;
  }

  private formatNear(yocto: bigint): string {
    return (Number(yocto) / 1e24).toFixed(2);
  }

  /**
   * Validate transaction can proceed (returns false for critical risks)
   */
  validate(tx: Transaction): { valid: boolean; error?: string; risk: TransactionRisk } {
    const risk = this.analyzeRisk(tx);

    if (risk.level === 'critical') {
      return {
        valid: false,
        error: `Transaction blocked: ${risk.reasons.join(', ')}`,
        risk,
      };
    }

    return { valid: true, risk };
  }

  /**
   * Get human-readable risk description
   */
  getRiskDescription(risk: TransactionRisk): string {
    const levelDescriptions: Record<TransactionRisk['level'], string> = {
      low: 'This transaction appears safe.',
      medium: 'This transaction has some risk factors. Review carefully.',
      high: 'This transaction has significant risks. Proceed with caution.',
      critical: 'This transaction is potentially dangerous and has been blocked.',
    };

    return levelDescriptions[risk.level];
  }
}

/**
 * Create a TransactionGuard with default safe limits
 */
export function createDefaultTransactionGuard(): TransactionGuard {
  return new TransactionGuard({
    maxTransferAmount: BigInt('1000000000000000000000000000'), // 1000 NEAR
    blockedMethods: DANGEROUS_METHODS,
    requireConfirmation: true,
  });
}
