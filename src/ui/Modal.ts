import { Theme, createDarkTheme, getSystemTheme, createLightTheme } from "./theme";
import { generateStyles } from "./styles";
import { icons } from "./icons";

/**
 * Unique ID generator for modal instances
 */
const generateId = () => `nc-${Math.random().toString(36).substring(2, 11)}`;

/**
 * Modal configuration options
 */
export interface ModalOptions {
  theme?: Theme;
  onClose?: () => void;
  trapFocus?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
}

/**
 * Base Modal class with theming and accessibility support
 */
export class Modal {
  readonly id: string;
  readonly root: HTMLDivElement;
  readonly theme: Theme;

  protected isOpen = false;
  protected isDestroyed = false;
  protected styleElement: HTMLStyleElement | null = null;
  protected focusTrap: FocusTrap | null = null;
  protected previousActiveElement: Element | null = null;

  protected readonly options: Required<ModalOptions>;
  protected disposables: (() => void)[] = [];

  constructor(options: ModalOptions = {}) {
    this.id = generateId();
    this.root = document.createElement("div");

    // Resolve theme
    const darkTheme = createDarkTheme(options.theme ? { branding: options.theme.branding } : undefined);
    const lightTheme = createLightTheme(options.theme ? { branding: options.theme.branding } : undefined);

    if (options.theme) {
      this.theme = options.theme;
    } else {
      this.theme = getSystemTheme(darkTheme, lightTheme);
    }

    this.options = {
      theme: this.theme,
      onClose: options.onClose ?? (() => {}),
      trapFocus: options.trapFocus ?? true,
      closeOnOverlay: options.closeOnOverlay ?? true,
      closeOnEscape: options.closeOnEscape ?? true,
      ariaLabel: options.ariaLabel ?? "Modal dialog",
    };
  }

  /**
   * Inject styles into the document
   */
  protected injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement("style");
    this.styleElement.id = `${this.id}-styles`;
    this.styleElement.textContent = generateStyles(`.${this.id}`, this.theme);
    document.head.appendChild(this.styleElement);
  }

  /**
   * Render modal content - override in subclasses
   */
  protected render(): string {
    return "";
  }

  /**
   * Setup event handlers - override in subclasses
   */
  protected setupHandlers(): void {
    // Overlay click
    if (this.options.closeOnOverlay) {
      const overlay = this.root.querySelector(".nc-modal-overlay");
      if (overlay) {
        this.addListener(overlay, "click", (e) => {
          if (e.target === overlay) {
            this.close();
          }
        });
      }
    }

    // Escape key
    if (this.options.closeOnEscape) {
      this.addListener(document, "keydown", (e: Event) => {
        if ((e as KeyboardEvent).key === "Escape" && this.isOpen) {
          this.close();
        }
      });
    }

    // Close button
    const closeBtn = this.root.querySelector(".nc-header-btn--close");
    if (closeBtn) {
      this.addListener(closeBtn, "click", () => this.close());
    }
  }

  /**
   * Add event listener with cleanup tracking
   */
  protected addListener(
    target: Element | Document | Window,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(event, handler, options);
    this.disposables.push(() => target.removeEventListener(event, handler, options));
  }

  /**
   * Open the modal
   */
  open(): void {
    if (this.isOpen || this.isDestroyed) return;

    this.isOpen = true;
    this.previousActiveElement = document.activeElement;

    // Inject styles
    this.injectStyles();

    // Create modal structure
    this.root.className = this.id;
    this.root.innerHTML = this.render();

    // Add accessibility attributes
    const modal = this.root.querySelector(".nc-modal");
    if (modal) {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", this.options.ariaLabel);
    }

    // Append to body
    document.body.appendChild(this.root);

    // Setup handlers
    this.setupHandlers();

    // Setup focus trap
    if (this.options.trapFocus) {
      this.focusTrap = new FocusTrap(this.root);
      this.focusTrap.activate();
    }

    // Prevent body scroll
    document.body.style.overflow = "hidden";

    // Animate in
    requestAnimationFrame(() => {
      this.root.style.display = "block";
      const overlay = this.root.querySelector(".nc-modal-overlay") as HTMLElement;
      const modal = this.root.querySelector(".nc-modal") as HTMLElement;

      if (overlay) overlay.style.opacity = "0";
      if (modal) modal.style.transform = "translateY(20px)";

      requestAnimationFrame(() => {
        if (overlay) overlay.style.opacity = "1";
        if (modal) modal.style.transform = "translateY(0)";
      });
    });

    // Announce to screen readers
    this.announce("Dialog opened");
  }

  /**
   * Close the modal
   */
  close(): void {
    if (!this.isOpen || this.isDestroyed) return;

    this.isOpen = false;

    // Animate out
    const overlay = this.root.querySelector(".nc-modal-overlay") as HTMLElement;
    const modal = this.root.querySelector(".nc-modal") as HTMLElement;

    if (overlay) overlay.style.opacity = "0";
    if (modal) modal.style.transform = "translateY(20px)";

    setTimeout(() => {
      this.destroy();
      this.options.onClose();
    }, 200);

    // Announce to screen readers
    this.announce("Dialog closed");
  }

  /**
   * Update modal content
   */
  protected update(): void {
    if (!this.isOpen) return;

    // Cleanup old handlers
    this.disposables.forEach((dispose) => dispose());
    this.disposables = [];

    // Re-render
    this.root.innerHTML = this.render();

    // Re-setup handlers
    this.setupHandlers();
  }

  /**
   * Destroy the modal
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    this.isOpen = false;

    // Cleanup disposables
    this.disposables.forEach((dispose) => dispose());
    this.disposables = [];

    // Deactivate focus trap
    this.focusTrap?.deactivate();

    // Restore focus
    if (this.previousActiveElement instanceof HTMLElement) {
      this.previousActiveElement.focus();
    }

    // Remove elements
    this.root.remove();
    this.styleElement?.remove();

    // Restore body scroll
    document.body.style.overflow = "";
  }

  /**
   * Announce message to screen readers
   */
  protected announce(message: string): void {
    const announcer = document.createElement("div");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    announcer.className = "nc-sr-only";
    announcer.textContent = message;
    document.body.appendChild(announcer);
    setTimeout(() => announcer.remove(), 1000);
  }

  /**
   * Get icon HTML
   */
  protected icon(name: keyof typeof icons): string {
    return icons[name];
  }
}

/**
 * Simple focus trap implementation
 */
class FocusTrap {
  private container: HTMLElement;
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;
  private handleKeyDown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.handleKeyDown = this.onKeyDown.bind(this);
  }

  activate(): void {
    this.updateFocusableElements();
    document.addEventListener("keydown", this.handleKeyDown);
    this.firstFocusable?.focus();
  }

  deactivate(): void {
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private updateFocusableElements(): void {
    const focusableSelectors = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");

    const focusables = Array.from(this.container.querySelectorAll<HTMLElement>(focusableSelectors));

    this.firstFocusable = focusables[0] ?? null;
    this.lastFocusable = focusables[focusables.length - 1] ?? null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;

    this.updateFocusableElements();

    if (e.shiftKey) {
      if (document.activeElement === this.firstFocusable) {
        e.preventDefault();
        this.lastFocusable?.focus();
      }
    } else {
      if (document.activeElement === this.lastFocusable) {
        e.preventDefault();
        this.firstFocusable?.focus();
      }
    }
  }
}
