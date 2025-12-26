import { Modal, ModalOptions } from "./Modal";
import { icons } from "./icons";
import { Transaction } from "../types";

/**
 * Transaction action display info
 */
interface ActionDisplay {
  type: string;
  title: string;
  description: string;
  details?: Record<string, string>;
}

/**
 * Transaction modal view states
 */
type TransactionView = "review" | "signing" | "success" | "error";

/**
 * Transaction modal options
 */
export interface TransactionModalOptions extends ModalOptions {
  transaction: Transaction;
  walletName: string;
  walletIcon?: string;
  receiverId: string;
  onConfirm: () => void;
  onReject: () => void;
  estimatedGas?: string;
  estimatedDeposit?: string;
}

/**
 * Transaction modal state
 */
interface TransactionState {
  view: TransactionView;
  error: { title: string; message: string } | null;
  txHash?: string;
}

/**
 * Transaction confirmation modal
 */
export class TransactionModal extends Modal {
  protected readonly txOptions: Required<TransactionModalOptions>;
  protected state: TransactionState;
  protected actions: ActionDisplay[];

  constructor(options: TransactionModalOptions) {
    super({
      ...options,
      ariaLabel: "Transaction confirmation",
    });

    this.txOptions = {
      ...this.options,
      transaction: options.transaction,
      walletName: options.walletName,
      walletIcon: options.walletIcon ?? "",
      receiverId: options.receiverId,
      onConfirm: options.onConfirm,
      onReject: options.onReject,
      estimatedGas: options.estimatedGas ?? "~0.001 NEAR",
      estimatedDeposit: options.estimatedDeposit ?? "0 NEAR",
    };

    this.state = {
      view: "review",
      error: null,
    };

    this.actions = this.parseActions(options.transaction);
  }

  /**
   * Parse transaction actions for display
   */
  private parseActions(tx: Transaction): ActionDisplay[] {
    if (!tx.actions) return [];

    const results: ActionDisplay[] = [];

    for (const action of tx.actions) {
      // Handle both string and object action formats
      if (typeof action === "string") {
        results.push({
          type: action,
          title: action,
          description: "Transaction action",
        });
        continue;
      }

      const actionType = Object.keys(action)[0] as string;
      const actionData = (action as unknown as Record<string, unknown>)[actionType];

      switch (actionType) {
        case "FunctionCall":
        case "functionCall": {
          const fc = actionData as { methodName?: string; args?: unknown; deposit?: string; gas?: string };
          const details: Record<string, string> = {};
          if (fc.deposit && fc.deposit !== "0") details["Deposit"] = this.formatNear(fc.deposit);
          if (fc.gas) details["Gas"] = this.formatGas(fc.gas);
          results.push({
            type: "Function Call",
            title: fc.methodName ?? "Function Call",
            description: `Call method on ${this.txOptions.receiverId}`,
            details: Object.keys(details).length > 0 ? details : undefined,
          });
          break;
        }
        case "Transfer":
        case "transfer": {
          const t = actionData as { deposit?: string };
          results.push({
            type: "Transfer",
            title: "Transfer NEAR",
            description: `Send to ${this.txOptions.receiverId}`,
            details: {
              Amount: this.formatNear(t.deposit ?? "0"),
            },
          });
          break;
        }
        case "AddKey":
        case "addKey":
          results.push({
            type: "Add Key",
            title: "Add Access Key",
            description: "Add a new access key to your account",
          });
          break;
        case "DeleteKey":
        case "deleteKey":
          results.push({
            type: "Delete Key",
            title: "Delete Access Key",
            description: "Remove an access key from your account",
          });
          break;
        case "CreateAccount":
        case "createAccount":
          results.push({
            type: "Create Account",
            title: "Create Account",
            description: `Create new account: ${this.txOptions.receiverId}`,
          });
          break;
        case "DeleteAccount":
        case "deleteAccount":
          results.push({
            type: "Delete Account",
            title: "⚠️ Delete Account",
            description: "Permanently delete this account",
          });
          break;
        case "DeployContract":
        case "deployContract":
          results.push({
            type: "Deploy Contract",
            title: "Deploy Contract",
            description: `Deploy contract to ${this.txOptions.receiverId}`,
          });
          break;
        case "Stake":
        case "stake": {
          const s = actionData as { stake?: string; publicKey?: string };
          results.push({
            type: "Stake",
            title: "Stake NEAR",
            description: "Stake tokens with a validator",
            details: {
              Amount: this.formatNear(s.stake ?? "0"),
            },
          });
          break;
        }
        default:
          results.push({
            type: actionType,
            title: actionType,
            description: "Transaction action",
          });
      }
    }

    return results;
  }

  /**
   * Format yoctoNEAR to NEAR
   */
  private formatNear(yocto: string): string {
    try {
      const value = BigInt(yocto);
      const near = Number(value) / 1e24;
      if (near < 0.001 && near > 0) {
        return "< 0.001 NEAR";
      }
      return `${near.toFixed(4)} NEAR`;
    } catch {
      return yocto;
    }
  }

  /**
   * Format gas units to TGas
   */
  private formatGas(gas: string): string {
    try {
      const value = BigInt(gas);
      const tgas = Number(value) / 1e12;
      return `${tgas.toFixed(0)} TGas`;
    } catch {
      return gas;
    }
  }

  protected render(): string {
    return `
      <div class="nc-modal-overlay">
        <div class="nc-modal">
          ${this.renderHeader()}
          ${this.renderBody()}
          ${this.renderFooter()}
        </div>
      </div>
    `;
  }

  private renderHeader(): string {
    const { view } = this.state;

    let title = "Review Transaction";
    if (view === "signing") title = "Signing...";
    if (view === "success") title = "Transaction Sent";
    if (view === "error") title = "Transaction Failed";

    return `
      <div class="nc-header">
        <h2 class="nc-header-title">${title}</h2>
        <button class="nc-header-btn nc-header-btn--close" aria-label="Close">${icons.close}</button>
      </div>
    `;
  }

  private renderBody(): string {
    switch (this.state.view) {
      case "review":
        return this.renderReview();
      case "signing":
        return this.renderSigning();
      case "success":
        return this.renderSuccess();
      case "error":
        return this.renderError();
      default:
        return this.renderReview();
    }
  }

  private renderReview(): string {
    const { walletName, walletIcon, receiverId, estimatedGas, estimatedDeposit } = this.txOptions;

    return `
      <div class="nc-body">
        <div class="nc-tx-wallet">
          ${walletIcon ? `<img class="nc-tx-wallet-icon" src="${walletIcon}" alt="" />` : ""}
          <span class="nc-tx-wallet-name">${walletName}</span>
        </div>

        <div class="nc-tx-target">
          <span class="nc-tx-target-label">To</span>
          <span class="nc-tx-target-value">${receiverId}</span>
        </div>

        <div class="nc-tx-actions">
          ${this.actions.map((action) => this.renderAction(action)).join("")}
        </div>

        <div class="nc-tx-summary">
          <div class="nc-tx-summary-row">
            <span class="nc-tx-summary-label">Estimated Gas</span>
            <span class="nc-tx-summary-value">${estimatedGas}</span>
          </div>
          ${
            estimatedDeposit !== "0 NEAR"
              ? `
          <div class="nc-tx-summary-row">
            <span class="nc-tx-summary-label">Total Deposit</span>
            <span class="nc-tx-summary-value nc-tx-summary-value--highlight">${estimatedDeposit}</span>
          </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  private renderAction(action: ActionDisplay): string {
    const detailsHtml = action.details
      ? Object.entries(action.details)
          .map(
            ([key, value]) => `
          <div class="nc-tx-action-detail">
            <span class="nc-tx-action-detail-key">${key}</span>
            <span class="nc-tx-action-detail-value">${value}</span>
          </div>
        `
          )
          .join("")
      : "";

    return `
      <div class="nc-tx-action">
        <div class="nc-tx-action-header">
          <span class="nc-tx-action-type">${action.type}</span>
          <span class="nc-tx-action-title">${action.title}</span>
        </div>
        <p class="nc-tx-action-desc">${action.description}</p>
        ${detailsHtml ? `<div class="nc-tx-action-details">${detailsHtml}</div>` : ""}
      </div>
    `;
  }

  private renderSigning(): string {
    const { walletName, walletIcon } = this.txOptions;

    return `
      <div class="nc-body">
        <div class="nc-connecting">
          ${walletIcon ? `<img class="nc-connecting-icon" src="${walletIcon}" alt="${walletName}" />` : '<div class="nc-spinner"></div>'}
          <p class="nc-connecting-title">Confirm in ${walletName}</p>
          <p class="nc-connecting-message">
            Please review and approve the transaction in your wallet
          </p>
        </div>
      </div>
    `;
  }

  private renderSuccess(): string {
    const { txHash } = this.state;
    const explorerUrl = `https://nearblocks.io/txns/${txHash}`;

    return `
      <div class="nc-body">
        <div class="nc-tx-result nc-tx-result--success">
          <div class="nc-tx-result-icon">${icons.success}</div>
          <p class="nc-tx-result-title">Transaction Sent</p>
          <p class="nc-tx-result-message">Your transaction has been submitted to the network</p>
          ${
            txHash
              ? `
          <a
            class="nc-btn nc-btn--secondary"
            href="${explorerUrl}"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Explorer ${icons.external}
          </a>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  private renderError(): string {
    const { error } = this.state;
    if (!error) return "";

    return `
      <div class="nc-body">
        <div class="nc-error">
          <div class="nc-error-icon">${icons.error}</div>
          <p class="nc-error-title">${error.title}</p>
          <p class="nc-error-message">${error.message}</p>
          <div class="nc-error-actions">
            <button class="nc-btn nc-btn--secondary" data-action="retry">
              Try Again
            </button>
            <button class="nc-btn nc-btn--primary" data-action="close">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderFooter(): string {
    const { view } = this.state;

    if (view !== "review") return "";

    return `
      <div class="nc-footer" style="justify-content: stretch; gap: var(--nc-spacing-sm);">
        <button class="nc-btn nc-btn--secondary" data-action="reject" style="flex: 1;">
          Reject
        </button>
        <button class="nc-btn nc-btn--primary" data-action="confirm" style="flex: 1;">
          Confirm
        </button>
      </div>
    `;
  }

  protected setupHandlers(): void {
    super.setupHandlers();

    // Action buttons
    this.root.querySelectorAll("[data-action]").forEach((btn) => {
      this.addListener(btn, "click", () => {
        const action = btn.getAttribute("data-action");
        this.handleAction(action!);
      });
    });
  }

  private handleAction(action: string): void {
    switch (action) {
      case "confirm":
        this.state.view = "signing";
        this.update();
        this.txOptions.onConfirm();
        break;
      case "reject":
        this.txOptions.onReject();
        this.close();
        break;
      case "retry":
        this.state.view = "review";
        this.state.error = null;
        this.update();
        break;
      case "close":
        this.close();
        break;
    }
  }

  /**
   * Show signing state
   */
  showSigning(): void {
    this.state.view = "signing";
    this.update();
  }

  /**
   * Show success state
   */
  showSuccess(txHash?: string): void {
    this.state.view = "success";
    this.state.txHash = txHash;
    this.update();
  }

  /**
   * Show error state
   */
  showError(title: string, message: string): void {
    this.state.view = "error";
    this.state.error = { title, message };
    this.update();
  }
}
