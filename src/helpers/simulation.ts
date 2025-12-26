import { Transaction, Network, Account } from "../types";
import { WalletError, ErrorCode } from "../errors";

/**
 * Gas estimation result
 */
export interface GasEstimate {
  /** Estimated gas in gas units */
  gas: string;
  /** Estimated gas in TGas for display */
  tgas: number;
  /** Estimated gas cost in NEAR */
  gasCostNear: string;
  /** Whether the account has enough balance */
  canAfford: boolean;
  /** Breakdown by action */
  breakdown: ActionGasEstimate[];
}

/**
 * Per-action gas estimate
 */
export interface ActionGasEstimate {
  type: string;
  methodName?: string;
  gas: string;
  tgas: number;
}

/**
 * Simulation result for a transaction
 */
export interface SimulationResult {
  /** Whether the simulation succeeded */
  success: boolean;
  /** Gas estimation */
  gasEstimate: GasEstimate;
  /** Total deposit required in yoctoNEAR */
  totalDeposit: string;
  /** Total deposit in NEAR for display */
  totalDepositNear: string;
  /** Storage deposit required */
  storageDeposit?: string;
  /** Logs from the simulation */
  logs: string[];
  /** Return value if any */
  returnValue?: unknown;
  /** Error message if failed */
  error?: string;
  /** Warnings about the transaction */
  warnings: SimulationWarning[];
}

/**
 * Warning types for transaction simulation
 */
export type SimulationWarningType =
  | "high_gas"
  | "high_deposit"
  | "low_balance"
  | "contract_not_found"
  | "method_not_found"
  | "access_key_limited"
  | "storage_staking"
  | "dangerous_action";

/**
 * Simulation warning
 */
export interface SimulationWarning {
  type: SimulationWarningType;
  message: string;
  severity: "info" | "warning" | "error";
}

/**
 * RPC provider for simulation
 */
export interface SimulationRpcProvider {
  query<T>(params: {
    request_type: string;
    finality?: string;
    account_id?: string;
    method_name?: string;
    args_base64?: string;
  }): Promise<T>;

  sendTransaction(signedTx: string): Promise<unknown>;
}

/**
 * Default RPC endpoints
 */
const DEFAULT_RPC_ENDPOINTS: Record<Network, string> = {
  mainnet: "https://rpc.mainnet.near.org",
  testnet: "https://rpc.testnet.near.org",
};

/**
 * Gas constants
 */
const GAS_CONSTANTS = {
  /** Base gas for a function call */
  BASE_FUNCTION_CALL: 5_000_000_000_000n, // 5 TGas
  /** Gas per byte of arguments */
  GAS_PER_BYTE: 100_000_000n, // 0.0001 TGas
  /** Base gas for transfer */
  TRANSFER_GAS: 450_000_000_000n, // 0.45 TGas
  /** Base gas for creating account */
  CREATE_ACCOUNT_GAS: 1_000_000_000_000n, // 1 TGas
  /** Base gas for add key */
  ADD_KEY_GAS: 1_000_000_000_000n, // 1 TGas
  /** Base gas for delete key */
  DELETE_KEY_GAS: 450_000_000_000n, // 0.45 TGas
  /** Base gas for deploy contract */
  DEPLOY_CONTRACT_BASE: 10_000_000_000_000n, // 10 TGas
  /** Gas per byte of contract code */
  DEPLOY_GAS_PER_BYTE: 6_812_999n,
  /** Base gas for stake */
  STAKE_GAS: 450_000_000_000n, // 0.45 TGas
  /** Base gas for delete account */
  DELETE_ACCOUNT_GAS: 450_000_000_000n, // 0.45 TGas
  /** Maximum gas allowed */
  MAX_GAS: 300_000_000_000_000n, // 300 TGas
  /** Gas price in yoctoNEAR (approximate) */
  GAS_PRICE: 100_000_000n, // 0.0001 NEAR per TGas
};

/**
 * High deposit threshold in NEAR
 */
const HIGH_DEPOSIT_THRESHOLD = 10n * 10n ** 24n; // 10 NEAR

/**
 * Transaction simulator
 */
export class TransactionSimulator {
  private network: Network;
  private rpcEndpoint: string;

  constructor(options: { network?: Network; rpcEndpoint?: string } = {}) {
    this.network = options.network ?? "mainnet";
    this.rpcEndpoint = options.rpcEndpoint ?? DEFAULT_RPC_ENDPOINTS[this.network];
  }

  /**
   * Simulate a transaction and get gas estimates
   */
  async simulate(
    transaction: Transaction,
    signerAccount: Account
  ): Promise<SimulationResult> {
    const warnings: SimulationWarning[] = [];
    const logs: string[] = [];
    let success = true;
    let error: string | undefined;
    let returnValue: unknown;

    // Calculate gas estimate
    const gasEstimate = await this.estimateGas(transaction, signerAccount);

    // Calculate total deposit
    const totalDeposit = this.calculateTotalDeposit(transaction);
    const totalDepositNear = this.formatNear(totalDeposit);

    // Check for high deposit
    if (BigInt(totalDeposit) > HIGH_DEPOSIT_THRESHOLD) {
      warnings.push({
        type: "high_deposit",
        message: `This transaction requires a large deposit of ${totalDepositNear}`,
        severity: "warning",
      });
    }

    // Check for dangerous actions
    this.checkDangerousActions(transaction, warnings);

    // Check account balance
    try {
      const balance = await this.getAccountBalance(signerAccount.accountId);
      const requiredBalance = BigInt(totalDeposit) + BigInt(gasEstimate.gasCostNear.replace(" NEAR", "")) * 10n ** 24n;

      if (BigInt(balance) < requiredBalance) {
        warnings.push({
          type: "low_balance",
          message: "Account balance may be insufficient for this transaction",
          severity: "warning",
        });
        gasEstimate.canAfford = false;
      }
    } catch {
      // Can't check balance, skip
    }

    // Try to simulate function calls via RPC
    if (transaction.actions) {
      for (const action of transaction.actions) {
        if (typeof action === "object" && ("FunctionCall" in action || "functionCall" in action)) {
          const fc = (action as Record<string, unknown>).FunctionCall ?? (action as Record<string, unknown>).functionCall;
          const fcData = fc as { methodName: string; args?: string | Uint8Array; gas?: string; deposit?: string };

          try {
            const result = await this.simulateFunctionCall(
              transaction.receiverId,
              fcData.methodName,
              fcData.args
            );
            if (result.logs) logs.push(...result.logs);
            if (result.result) returnValue = result.result;
          } catch (e) {
            success = false;
            error = e instanceof Error ? e.message : "Simulation failed";
            logs.push(`Simulation error: ${error}`);
          }
        }
      }
    }

    return {
      success,
      gasEstimate,
      totalDeposit,
      totalDepositNear,
      logs,
      returnValue,
      error,
      warnings,
    };
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(transaction: Transaction, signerAccount: Account): Promise<GasEstimate> {
    const breakdown: ActionGasEstimate[] = [];
    let totalGas = 0n;

    if (!transaction.actions) {
      return {
        gas: "0",
        tgas: 0,
        gasCostNear: "0 NEAR",
        canAfford: true,
        breakdown: [],
      };
    }

    for (const action of transaction.actions) {
      const estimate = this.estimateActionGas(action);
      breakdown.push(estimate);
      totalGas += BigInt(estimate.gas);
    }

    // Cap at max gas
    if (totalGas > GAS_CONSTANTS.MAX_GAS) {
      totalGas = GAS_CONSTANTS.MAX_GAS;
    }

    const tgas = Number(totalGas) / 1e12;
    const gasCostYocto = totalGas * GAS_CONSTANTS.GAS_PRICE;
    const gasCostNear = this.formatNear(gasCostYocto.toString());

    // Check if account can afford
    let canAfford = true;
    try {
      const balance = await this.getAccountBalance(signerAccount.accountId);
      canAfford = BigInt(balance) >= gasCostYocto;
    } catch {
      // Assume can afford if we can't check
    }

    return {
      gas: totalGas.toString(),
      tgas,
      gasCostNear,
      canAfford,
      breakdown,
    };
  }

  /**
   * Estimate gas for a single action
   */
  private estimateActionGas(action: Transaction["actions"][0]): ActionGasEstimate {
    if (typeof action === "string") {
      return { type: action, gas: GAS_CONSTANTS.BASE_FUNCTION_CALL.toString(), tgas: 5 };
    }

    const actionType = Object.keys(action)[0];
    const actionData = (action as unknown as Record<string, unknown>)[actionType];

    switch (actionType) {
      case "FunctionCall":
      case "functionCall": {
        const fc = actionData as { methodName?: string; args?: string | Uint8Array; gas?: string };
        // Use provided gas or estimate
        if (fc.gas) {
          const gas = BigInt(fc.gas);
          return {
            type: "FunctionCall",
            methodName: fc.methodName,
            gas: gas.toString(),
            tgas: Number(gas) / 1e12,
          };
        }
        // Estimate based on args size
        const argsSize = fc.args ? (typeof fc.args === "string" ? fc.args.length : fc.args.length) : 0;
        const gas = GAS_CONSTANTS.BASE_FUNCTION_CALL + BigInt(argsSize) * GAS_CONSTANTS.GAS_PER_BYTE;
        return {
          type: "FunctionCall",
          methodName: fc.methodName,
          gas: gas.toString(),
          tgas: Number(gas) / 1e12,
        };
      }
      case "Transfer":
      case "transfer":
        return { type: "Transfer", gas: GAS_CONSTANTS.TRANSFER_GAS.toString(), tgas: 0.45 };
      case "CreateAccount":
      case "createAccount":
        return { type: "CreateAccount", gas: GAS_CONSTANTS.CREATE_ACCOUNT_GAS.toString(), tgas: 1 };
      case "AddKey":
      case "addKey":
        return { type: "AddKey", gas: GAS_CONSTANTS.ADD_KEY_GAS.toString(), tgas: 1 };
      case "DeleteKey":
      case "deleteKey":
        return { type: "DeleteKey", gas: GAS_CONSTANTS.DELETE_KEY_GAS.toString(), tgas: 0.45 };
      case "DeployContract":
      case "deployContract": {
        const dc = actionData as { code?: Uint8Array };
        const codeSize = dc.code?.length ?? 0;
        const gas = GAS_CONSTANTS.DEPLOY_CONTRACT_BASE + BigInt(codeSize) * GAS_CONSTANTS.DEPLOY_GAS_PER_BYTE;
        return { type: "DeployContract", gas: gas.toString(), tgas: Number(gas) / 1e12 };
      }
      case "Stake":
      case "stake":
        return { type: "Stake", gas: GAS_CONSTANTS.STAKE_GAS.toString(), tgas: 0.45 };
      case "DeleteAccount":
      case "deleteAccount":
        return { type: "DeleteAccount", gas: GAS_CONSTANTS.DELETE_ACCOUNT_GAS.toString(), tgas: 0.45 };
      default:
        return { type: actionType, gas: GAS_CONSTANTS.BASE_FUNCTION_CALL.toString(), tgas: 5 };
    }
  }

  /**
   * Calculate total deposit required
   */
  private calculateTotalDeposit(transaction: Transaction): string {
    if (!transaction.actions) return "0";

    let total = 0n;

    for (const action of transaction.actions) {
      if (typeof action === "object") {
        const actionType = Object.keys(action)[0];
        const actionData = (action as unknown as Record<string, unknown>)[actionType];

        if (actionType === "FunctionCall" || actionType === "functionCall") {
          const fc = actionData as { deposit?: string };
          if (fc.deposit) total += BigInt(fc.deposit);
        } else if (actionType === "Transfer" || actionType === "transfer") {
          const t = actionData as { deposit?: string };
          if (t.deposit) total += BigInt(t.deposit);
        } else if (actionType === "Stake" || actionType === "stake") {
          const s = actionData as { stake?: string };
          if (s.stake) total += BigInt(s.stake);
        }
      }
    }

    return total.toString();
  }

  /**
   * Check for dangerous actions
   */
  private checkDangerousActions(transaction: Transaction, warnings: SimulationWarning[]): void {
    if (!transaction.actions) return;

    for (const action of transaction.actions) {
      if (typeof action === "object") {
        const actionType = Object.keys(action)[0];

        if (actionType === "DeleteAccount" || actionType === "deleteAccount") {
          warnings.push({
            type: "dangerous_action",
            message: "This transaction will DELETE your account permanently!",
            severity: "error",
          });
        }

        if (actionType === "DeleteKey" || actionType === "deleteKey") {
          warnings.push({
            type: "dangerous_action",
            message: "This transaction will remove an access key from your account",
            severity: "warning",
          });
        }

        if (actionType === "AddKey" || actionType === "addKey") {
          const ak = (action as unknown as Record<string, unknown>)[actionType] as { accessKey?: { permission?: unknown } };
          if (ak.accessKey?.permission === "FullAccess") {
            warnings.push({
              type: "dangerous_action",
              message: "This transaction grants FULL ACCESS to your account",
              severity: "error",
            });
          }
        }
      }
    }
  }

  /**
   * Simulate a function call via RPC view call
   */
  private async simulateFunctionCall(
    contractId: string,
    methodName: string,
    args?: string | Uint8Array
  ): Promise<{ result?: unknown; logs: string[] }> {
    const argsBase64 = args
      ? typeof args === "string"
        ? btoa(args)
        : btoa(String.fromCharCode(...args))
      : "";

    try {
      const response = await fetch(this.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "simulation",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "optimistic",
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new WalletError({
          code: ErrorCode.RPC_ERROR,
          message: data.error.message ?? "RPC call failed",
        });
      }

      const result = data.result;
      const logs = result?.logs ?? [];
      let parsedResult: unknown;

      if (result?.result) {
        try {
          const decoded = String.fromCharCode(...result.result);
          parsedResult = JSON.parse(decoded);
        } catch {
          parsedResult = result.result;
        }
      }

      return { result: parsedResult, logs };
    } catch (e) {
      if (e instanceof WalletError) throw e;
      throw new WalletError({
        code: ErrorCode.RPC_ERROR,
        message: e instanceof Error ? e.message : "Simulation failed",
        originalError: e instanceof Error ? e : undefined,
      });
    }
  }

  /**
   * Get account balance
   */
  private async getAccountBalance(accountId: string): Promise<string> {
    try {
      const response = await fetch(this.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "balance",
          method: "query",
          params: {
            request_type: "view_account",
            finality: "optimistic",
            account_id: accountId,
          },
        }),
      });

      const data = await response.json();
      return data.result?.amount ?? "0";
    } catch {
      return "0";
    }
  }

  /**
   * Format yoctoNEAR to NEAR
   */
  private formatNear(yocto: string): string {
    try {
      const value = BigInt(yocto);
      const near = Number(value) / 1e24;
      if (near < 0.0001 && near > 0) {
        return "< 0.0001 NEAR";
      }
      return `${near.toFixed(4)} NEAR`;
    } catch {
      return "0 NEAR";
    }
  }

  /**
   * Set network
   */
  setNetwork(network: Network): void {
    this.network = network;
    this.rpcEndpoint = DEFAULT_RPC_ENDPOINTS[network];
  }

  /**
   * Set custom RPC endpoint
   */
  setRpcEndpoint(endpoint: string): void {
    this.rpcEndpoint = endpoint;
  }
}

/**
 * Quick gas estimate without full simulation
 */
export function quickGasEstimate(transaction: Transaction): GasEstimate {
  const simulator = new TransactionSimulator();
  const breakdown: ActionGasEstimate[] = [];
  let totalGas = 0n;

  if (transaction.actions) {
    for (const action of transaction.actions) {
      const estimate = (simulator as any).estimateActionGas(action);
      breakdown.push(estimate);
      totalGas += BigInt(estimate.gas);
    }
  }

  if (totalGas > GAS_CONSTANTS.MAX_GAS) {
    totalGas = GAS_CONSTANTS.MAX_GAS;
  }

  const tgas = Number(totalGas) / 1e12;
  const gasCostYocto = totalGas * GAS_CONSTANTS.GAS_PRICE;

  return {
    gas: totalGas.toString(),
    tgas,
    gasCostNear: `${(Number(gasCostYocto) / 1e24).toFixed(6)} NEAR`,
    canAfford: true, // Can't check without account
    breakdown,
  };
}
