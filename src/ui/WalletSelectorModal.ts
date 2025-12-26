import { Modal, ModalOptions } from "./Modal";
import { WalletManifest } from "../types";
import { icons } from "./icons";

/**
 * Wallet categories for grouping
 */
export type WalletCategory = "recent" | "browser" | "mobile" | "hardware" | "other";

/**
 * Extended wallet info with UI metadata
 */
export interface WalletUIInfo extends WalletManifest {
  category?: WalletCategory;
  isInstalled?: boolean;
  isRecent?: boolean;
}

/**
 * View states for the modal
 */
type ModalView = "list" | "connecting" | "error" | "help" | "settings";

/**
 * Wallet selector modal options
 */
export interface WalletSelectorOptions extends ModalOptions {
  wallets: WalletManifest[];
  recentWalletIds?: string[];
  showSearch?: boolean;
  showHelp?: boolean;
  groupByCategory?: boolean;
  onSelect: (walletId: string) => void;
  onAddDebugWallet?: (manifest: string) => Promise<WalletManifest>;
  onRemoveDebugWallet?: (walletId: string) => Promise<void>;
}

/**
 * Modal state
 */
interface ModalState {
  view: ModalView;
  wallets: WalletUIInfo[];
  filteredWallets: WalletUIInfo[];
  searchQuery: string;
  selectedWallet: WalletUIInfo | null;
  error: { title: string; message: string } | null;
}

/**
 * Wallet selector modal component
 */
export class WalletSelectorModal extends Modal {
  protected readonly selectorOptions: Required<WalletSelectorOptions>;
  protected state: ModalState;

  constructor(options: WalletSelectorOptions) {
    super(options);

    this.selectorOptions = {
      ...this.options,
      wallets: options.wallets,
      recentWalletIds: options.recentWalletIds ?? [],
      showSearch: options.showSearch ?? true,
      showHelp: options.showHelp ?? true,
      groupByCategory: options.groupByCategory ?? false,
      onSelect: options.onSelect,
      onAddDebugWallet: options.onAddDebugWallet ?? (async () => ({}) as WalletManifest),
      onRemoveDebugWallet: options.onRemoveDebugWallet ?? (async () => {}),
    };

    // Process wallets
    const processedWallets = this.processWallets(options.wallets);

    this.state = {
      view: "list",
      wallets: processedWallets,
      filteredWallets: processedWallets,
      searchQuery: "",
      selectedWallet: null,
      error: null,
    };
  }

  /**
   * Process wallets with categories and metadata
   */
  private processWallets(wallets: WalletManifest[]): WalletUIInfo[] {
    return wallets.map((wallet) => ({
      ...wallet,
      category: this.categorizeWallet(wallet),
      isRecent: this.selectorOptions.recentWalletIds.includes(wallet.id),
    }));
  }

  /**
   * Categorize wallet by type
   */
  private categorizeWallet(wallet: WalletManifest): WalletCategory {
    if (wallet.type === "privileged") return "hardware";
    if (wallet.platform?.chrome || wallet.platform?.firefox || wallet.platform?.edge) return "browser";
    if (wallet.platform?.ios || wallet.platform?.android) return "mobile";
    return "other";
  }

  /**
   * Filter wallets by search query
   */
  private filterWallets(query: string): WalletUIInfo[] {
    if (!query.trim()) return this.state.wallets;

    const lowerQuery = query.toLowerCase();
    return this.state.wallets.filter(
      (wallet) =>
        wallet.name.toLowerCase().includes(lowerQuery) ||
        wallet.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Group wallets by category
   */
  private groupWallets(wallets: WalletUIInfo[]): Map<WalletCategory, WalletUIInfo[]> {
    const groups = new Map<WalletCategory, WalletUIInfo[]>();

    // Recent wallets first
    const recentWallets = wallets.filter((w) => w.isRecent);
    if (recentWallets.length > 0) {
      groups.set("recent", recentWallets);
    }

    // Then by category
    const categories: WalletCategory[] = ["browser", "mobile", "hardware", "other"];
    for (const category of categories) {
      const categoryWallets = wallets.filter((w) => w.category === category && !w.isRecent);
      if (categoryWallets.length > 0) {
        groups.set(category, categoryWallets);
      }
    }

    return groups;
  }

  /**
   * Get category display name
   */
  private getCategoryName(category: WalletCategory): string {
    const names: Record<WalletCategory, string> = {
      recent: "Recent",
      browser: "Browser Extension",
      mobile: "Mobile",
      hardware: "Hardware",
      other: "Other",
    };
    return names[category];
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

    let title = "Connect Wallet";
    let showBack = false;
    let showClose = true;

    if (view === "connecting") {
      title = "Connecting...";
    } else if (view === "error") {
      title = "Connection Failed";
    } else if (view === "help") {
      title = "What is a Wallet?";
      showBack = true;
    } else if (view === "settings") {
      title = "Developer Settings";
      showBack = true;
    }

    return `
      <div class="nc-header">
        ${showBack ? `<button class="nc-header-btn nc-header-btn--back" aria-label="Go back">${icons.back}</button>` : ""}
        <h2 class="nc-header-title">${title}</h2>
        ${showClose ? `<button class="nc-header-btn nc-header-btn--close" aria-label="Close">${icons.close}</button>` : ""}
      </div>
    `;
  }

  private renderBody(): string {
    switch (this.state.view) {
      case "list":
        return this.renderWalletList();
      case "connecting":
        return this.renderConnecting();
      case "error":
        return this.renderError();
      case "help":
        return this.renderHelp();
      case "settings":
        return this.renderSettings();
      default:
        return this.renderWalletList();
    }
  }

  private renderWalletList(): string {
    const { filteredWallets, searchQuery } = this.state;
    const { showSearch, groupByCategory } = this.selectorOptions;

    let content = "";

    // Search input
    if (showSearch) {
      content += `
        <input
          type="text"
          class="nc-search"
          placeholder="Search wallets..."
          value="${searchQuery}"
          aria-label="Search wallets"
        />
      `;
    }

    if (filteredWallets.length === 0) {
      content += `
        <div class="nc-empty">
          <p class="nc-empty-title">No wallets found</p>
          <p class="nc-empty-message">Try a different search term</p>
        </div>
      `;
    } else if (groupByCategory) {
      const groups = this.groupWallets(filteredWallets);
      groups.forEach((wallets, category) => {
        content += `
          <div class="nc-wallet-group">
            <div class="nc-wallet-group-title">${this.getCategoryName(category)}</div>
            <div class="nc-wallet-list">
              ${wallets.map((w) => this.renderWalletItem(w)).join("")}
            </div>
          </div>
        `;
      });
    } else {
      content += `
        <div class="nc-wallet-list">
          ${filteredWallets.map((w) => this.renderWalletItem(w)).join("")}
        </div>
      `;
    }

    return `<div class="nc-body">${content}</div>`;
  }

  private renderWalletItem(wallet: WalletUIInfo): string {
    const badges: string[] = [];
    if (wallet.isRecent) badges.push('<span class="nc-badge nc-badge--recent">Recent</span>');
    if (wallet.isInstalled) badges.push('<span class="nc-badge nc-badge--installed">Installed</span>');
    if (wallet.debug) badges.push('<span class="nc-badge">Debug</span>');

    return `
      <button
        class="nc-wallet-item"
        data-wallet-id="${wallet.id}"
        aria-label="Connect to ${wallet.name}"
      >
        <img class="nc-wallet-icon" src="${wallet.icon}" alt="" loading="lazy" />
        <div class="nc-wallet-info">
          <span class="nc-wallet-name">${wallet.name}</span>
          <span class="nc-wallet-desc">${wallet.description || this.getWalletHost(wallet.website)}</span>
        </div>
        ${badges.length > 0 ? `<div class="nc-wallet-badges">${badges.join("")}</div>` : ""}
      </button>
    `;
  }

  private getWalletHost(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  private renderConnecting(): string {
    const wallet = this.state.selectedWallet;
    if (!wallet) return "";

    return `
      <div class="nc-body">
        <div class="nc-connecting">
          <img class="nc-connecting-icon" src="${wallet.icon}" alt="${wallet.name}" />
          <p class="nc-connecting-title">Connecting to ${wallet.name}</p>
          <p class="nc-connecting-message">
            Approve the connection request in your wallet
          </p>
          <button class="nc-btn nc-btn--secondary" data-action="cancel">
            Cancel
          </button>
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
            <button class="nc-btn nc-btn--secondary" data-action="back">
              Try Again
            </button>
            <button class="nc-btn nc-btn--primary" data-action="different-wallet">
              Use Different Wallet
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderHelp(): string {
    return `
      <div class="nc-body">
        <div class="nc-help">
          <div class="nc-help-item">
            <div class="nc-help-icon">${icons.wallet}</div>
            <div class="nc-help-content">
              <p class="nc-help-title">A Home for Your Digital Assets</p>
              <p class="nc-help-desc">
                Wallets are used to send, receive, store, and display digital assets like NEAR tokens and NFTs.
              </p>
            </div>
          </div>
          <div class="nc-help-item">
            <div class="nc-help-icon">${icons.shield}</div>
            <div class="nc-help-content">
              <p class="nc-help-title">A New Way to Sign In</p>
              <p class="nc-help-desc">
                Instead of creating new accounts and passwords, just connect your wallet to sign in.
              </p>
            </div>
          </div>
        </div>
        <a
          class="nc-btn nc-btn--primary"
          href="${this.theme.branding.getWalletUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get a Wallet ${icons.external}
        </a>
      </div>
    `;
  }

  private renderSettings(): string {
    const debugManifest = JSON.stringify(
      {
        id: "custom-wallet",
        name: "Custom Wallet",
        icon: "https://example.com/icon.png",
        description: "Custom wallet description",
        website: "https://example.com",
        version: "1.0.0",
        executor: "https://example.com/executor.js",
        type: "sandbox",
        features: {
          signMessage: true,
          signAndSendTransaction: true,
        },
        permissions: {
          storage: true,
        },
      },
      null,
      2
    );

    return `
      <div class="nc-body">
        <p style="color: var(--nc-color-text-muted); font-size: var(--nc-font-size-sm); margin-bottom: var(--nc-spacing-md);">
          Add a custom wallet manifest for development testing.
        </p>
        <textarea
          id="debug-manifest"
          class="nc-search"
          style="height: 200px; font-family: var(--nc-font-family-mono); font-size: var(--nc-font-size-xs);"
          placeholder="Paste wallet manifest JSON..."
        >${debugManifest}</textarea>
        <button class="nc-btn nc-btn--primary" data-action="add-debug-wallet" style="margin-top: var(--nc-spacing-md); width: 100%;">
          Add Wallet
        </button>
      </div>
    `;
  }

  private renderFooter(): string {
    const { branding } = this.theme;
    const { showHelp } = this.selectorOptions;
    const { view } = this.state;

    // Hide footer on help/settings views
    if (view === "help" || view === "settings") return "";

    return `
      <div class="nc-footer">
        <div class="nc-footer-branding">
          ${branding.logo ? `<img class="nc-footer-logo" src="${branding.logo}" alt="" />` : ""}
          <span class="nc-footer-name">${branding.name}</span>
        </div>
        <div style="display: flex; gap: var(--nc-spacing-md);">
          ${showHelp ? `<button class="nc-footer-link" data-action="help">What is a wallet?</button>` : ""}
          <button class="nc-footer-link" data-action="settings">${icons.settings}</button>
        </div>
      </div>
    `;
  }

  protected setupHandlers(): void {
    super.setupHandlers();

    // Search input
    const searchInput = this.root.querySelector(".nc-search") as HTMLInputElement;
    if (searchInput && this.state.view === "list") {
      this.addListener(searchInput, "input", () => {
        this.state.searchQuery = searchInput.value;
        this.state.filteredWallets = this.filterWallets(searchInput.value);
        this.update();
        // Restore focus to search input
        const newInput = this.root.querySelector(".nc-search") as HTMLInputElement;
        newInput?.focus();
        newInput?.setSelectionRange(searchInput.value.length, searchInput.value.length);
      });
    }

    // Wallet items
    this.root.querySelectorAll(".nc-wallet-item").forEach((item) => {
      this.addListener(item, "click", () => {
        const walletId = item.getAttribute("data-wallet-id");
        if (walletId) {
          this.selectWallet(walletId);
        }
      });
    });

    // Back button
    const backBtn = this.root.querySelector(".nc-header-btn--back");
    if (backBtn) {
      this.addListener(backBtn, "click", () => {
        this.state.view = "list";
        this.state.error = null;
        this.update();
      });
    }

    // Action buttons
    this.root.querySelectorAll("[data-action]").forEach((btn) => {
      this.addListener(btn, "click", () => {
        const action = btn.getAttribute("data-action");
        this.handleAction(action!);
      });
    });
  }

  private async selectWallet(walletId: string): Promise<void> {
    const wallet = this.state.wallets.find((w) => w.id === walletId);
    if (!wallet) return;

    this.state.selectedWallet = wallet;
    this.state.view = "connecting";
    this.update();

    try {
      this.selectorOptions.onSelect(walletId);
      // The parent component handles the actual connection
      // and will close the modal on success or call showError on failure
    } catch (error) {
      this.showError(
        "Connection Failed",
        error instanceof Error ? error.message : "Failed to connect to wallet"
      );
    }
  }

  private handleAction(action: string): void {
    switch (action) {
      case "help":
        this.state.view = "help";
        this.update();
        break;
      case "settings":
        this.state.view = "settings";
        this.update();
        break;
      case "back":
      case "different-wallet":
        this.state.view = "list";
        this.state.error = null;
        this.update();
        break;
      case "cancel":
        this.state.view = "list";
        this.state.selectedWallet = null;
        this.update();
        break;
      case "add-debug-wallet":
        this.addDebugWallet();
        break;
    }
  }

  private async addDebugWallet(): Promise<void> {
    const textarea = this.root.querySelector("#debug-manifest") as HTMLTextAreaElement;
    if (!textarea) return;

    try {
      const manifest = await this.selectorOptions.onAddDebugWallet(textarea.value);
      this.state.wallets = [{ ...manifest, category: "other" } as WalletUIInfo, ...this.state.wallets];
      this.state.filteredWallets = this.state.wallets;
      this.state.view = "list";
      this.update();
    } catch (error) {
      alert(`Failed to add wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Show error state
   */
  showError(title: string, message: string): void {
    this.state.view = "error";
    this.state.error = { title, message };
    this.update();
  }

  /**
   * Show connecting state for a wallet
   */
  showConnecting(walletId: string): void {
    const wallet = this.state.wallets.find((w) => w.id === walletId);
    if (wallet) {
      this.state.selectedWallet = wallet;
      this.state.view = "connecting";
      this.update();
    }
  }
}
