import { Modal, ModalOptions } from "./Modal";
import { icons } from "./icons";
import { Account } from "../types";

/**
 * Account with additional UI metadata
 */
export interface AccountUIInfo extends Account {
  balance?: string;
  isActive?: boolean;
  walletId?: string;
  walletIcon?: string;
  walletName?: string;
}

/**
 * Account switcher modal options
 */
export interface AccountSwitcherOptions extends ModalOptions {
  accounts: AccountUIInfo[];
  activeAccountId?: string;
  onSelect: (accountId: string) => void;
  onDisconnect?: (accountId: string) => void;
  onAddAccount?: () => void;
  showBalances?: boolean;
  showDisconnect?: boolean;
  showAddAccount?: boolean;
}

/**
 * Modal state
 */
interface ModalState {
  accounts: AccountUIInfo[];
  confirmDisconnect: string | null;
}

/**
 * Account switcher modal for multi-account support
 */
export class AccountSwitcherModal extends Modal {
  protected readonly switcherOptions: Required<AccountSwitcherOptions>;
  protected state: ModalState;

  constructor(options: AccountSwitcherOptions) {
    super({
      ...options,
      ariaLabel: "Switch account",
    });

    this.switcherOptions = {
      ...this.options,
      accounts: options.accounts,
      activeAccountId: options.activeAccountId ?? options.accounts[0]?.accountId ?? "",
      onSelect: options.onSelect,
      onDisconnect: options.onDisconnect ?? (() => {}),
      onAddAccount: options.onAddAccount ?? (() => {}),
      showBalances: options.showBalances ?? true,
      showDisconnect: options.showDisconnect ?? true,
      showAddAccount: options.showAddAccount ?? true,
    };

    this.state = {
      accounts: options.accounts.map((acc) => ({
        ...acc,
        isActive: acc.accountId === this.switcherOptions.activeAccountId,
      })),
      confirmDisconnect: null,
    };
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
    return `
      <div class="nc-header">
        <h2 class="nc-header-title">Your Accounts</h2>
        <button class="nc-header-btn nc-header-btn--close" aria-label="Close">${icons.close}</button>
      </div>
    `;
  }

  private renderBody(): string {
    const { accounts, confirmDisconnect } = this.state;

    if (accounts.length === 0) {
      return `
        <div class="nc-body">
          <div class="nc-empty">
            <p class="nc-empty-title">No Accounts</p>
            <p class="nc-empty-message">Connect a wallet to get started</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="nc-body">
        <div class="nc-account-list">
          ${accounts.map((acc) => this.renderAccount(acc, confirmDisconnect === acc.accountId)).join("")}
        </div>
      </div>
    `;
  }

  private renderAccount(account: AccountUIInfo, showConfirm: boolean): string {
    const { showBalances, showDisconnect } = this.switcherOptions;

    if (showConfirm) {
      return `
        <div class="nc-account-item nc-account-item--confirm">
          <div class="nc-account-confirm">
            <p class="nc-account-confirm-text">Disconnect this account?</p>
            <div class="nc-account-confirm-actions">
              <button class="nc-btn nc-btn--secondary nc-btn--sm" data-action="cancel-disconnect">
                Cancel
              </button>
              <button class="nc-btn nc-btn--primary nc-btn--sm nc-btn--danger" data-action="confirm-disconnect" data-account-id="${account.accountId}">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const shortId = this.truncateAccountId(account.accountId);
    const activeIndicator = account.isActive ? '<span class="nc-account-active">Active</span>' : "";

    return `
      <div class="nc-account-item ${account.isActive ? "nc-account-item--active" : ""}">
        <button
          class="nc-account-select"
          data-account-id="${account.accountId}"
          aria-label="Switch to ${account.accountId}"
        >
          <div class="nc-account-avatar">
            ${account.walletIcon ? `<img src="${account.walletIcon}" alt="" class="nc-account-avatar-img" />` : this.generateAvatar(account.accountId)}
          </div>
          <div class="nc-account-info">
            <span class="nc-account-id" title="${account.accountId}">${shortId}</span>
            ${showBalances && account.balance ? `<span class="nc-account-balance">${account.balance}</span>` : ""}
            ${account.walletName ? `<span class="nc-account-wallet">${account.walletName}</span>` : ""}
          </div>
          ${activeIndicator}
        </button>
        ${
          showDisconnect && !account.isActive
            ? `
        <button
          class="nc-account-disconnect"
          data-action="disconnect"
          data-account-id="${account.accountId}"
          aria-label="Disconnect ${account.accountId}"
        >
          ${icons.close}
        </button>
        `
            : ""
        }
      </div>
    `;
  }

  private truncateAccountId(accountId: string): string {
    if (accountId.length <= 24) return accountId;

    // For .near/.testnet accounts, show more
    if (accountId.includes(".")) {
      const parts = accountId.split(".");
      const name = parts[0];
      const suffix = parts.slice(1).join(".");
      if (name.length <= 16) return accountId;
      return `${name.slice(0, 8)}...${name.slice(-4)}.${suffix}`;
    }

    // For implicit accounts (64 char hex)
    return `${accountId.slice(0, 8)}...${accountId.slice(-6)}`;
  }

  private generateAvatar(accountId: string): string {
    // Simple hash-based color generation
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
      hash = accountId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash >> 8) % 20);
    const lightness = 50 + (Math.abs(hash >> 16) % 10);

    const initials = accountId
      .replace(/\.(near|testnet)$/, "")
      .slice(0, 2)
      .toUpperCase();

    return `
      <div class="nc-account-avatar-gen" style="background: hsl(${hue}, ${saturation}%, ${lightness}%);">
        ${initials}
      </div>
    `;
  }

  private renderFooter(): string {
    const { showAddAccount } = this.switcherOptions;

    if (!showAddAccount) return "";

    return `
      <div class="nc-footer">
        <button class="nc-footer-link" data-action="add-account">
          + Add Account
        </button>
      </div>
    `;
  }

  protected setupHandlers(): void {
    super.setupHandlers();

    // Account selection
    this.root.querySelectorAll(".nc-account-select").forEach((btn) => {
      this.addListener(btn, "click", () => {
        const accountId = btn.getAttribute("data-account-id");
        if (accountId) {
          this.switcherOptions.onSelect(accountId);
          this.close();
        }
      });
    });

    // Disconnect button
    this.root.querySelectorAll("[data-action='disconnect']").forEach((btn) => {
      this.addListener(btn, "click", (e) => {
        e.stopPropagation();
        const accountId = btn.getAttribute("data-account-id");
        if (accountId) {
          this.state.confirmDisconnect = accountId;
          this.update();
        }
      });
    });

    // Cancel disconnect
    const cancelBtn = this.root.querySelector("[data-action='cancel-disconnect']");
    if (cancelBtn) {
      this.addListener(cancelBtn, "click", () => {
        this.state.confirmDisconnect = null;
        this.update();
      });
    }

    // Confirm disconnect
    const confirmBtn = this.root.querySelector("[data-action='confirm-disconnect']");
    if (confirmBtn) {
      this.addListener(confirmBtn, "click", () => {
        const accountId = confirmBtn.getAttribute("data-account-id");
        if (accountId) {
          this.switcherOptions.onDisconnect(accountId);
          this.state.accounts = this.state.accounts.filter((a) => a.accountId !== accountId);
          this.state.confirmDisconnect = null;
          this.update();
        }
      });
    }

    // Add account
    const addBtn = this.root.querySelector("[data-action='add-account']");
    if (addBtn) {
      this.addListener(addBtn, "click", () => {
        this.switcherOptions.onAddAccount();
        this.close();
      });
    }
  }

  /**
   * Update accounts list
   */
  updateAccounts(accounts: AccountUIInfo[]): void {
    this.state.accounts = accounts.map((acc) => ({
      ...acc,
      isActive: acc.accountId === this.switcherOptions.activeAccountId,
    }));
    this.update();
  }
}
