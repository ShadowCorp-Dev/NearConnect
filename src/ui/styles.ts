import { Theme, themeToCssVars } from "./theme";

/**
 * Generate CSS for the UI components
 */
export function generateStyles(id: string, theme: Theme): string {
  const cssVars = themeToCssVars(theme);

  return /*css*/ `
/* CSS Custom Properties */
${id} {
  ${cssVars}
}

/* Reset & Base */
${id} * {
  box-sizing: border-box;
  font-family: var(--nc-font-family);
  -ms-overflow-style: none;
  scrollbar-width: none;
  color: var(--nc-color-text);
}

${id} *::-webkit-scrollbar {
  display: none;
}

${id} p, ${id} h1, ${id} h2, ${id} h3, ${id} h4, ${id} h5, ${id} h6 {
  margin: 0;
}

/* Focus visible for accessibility */
${id} *:focus-visible {
  outline: 2px solid var(--nc-color-accent);
  outline-offset: 2px;
}

${id} *:focus:not(:focus-visible) {
  outline: none;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  ${id} * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}

/* Modal Container */
${id} .nc-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100000000;
  background-color: var(--nc-color-background-overlay);
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  transition: opacity var(--nc-duration) var(--nc-easing);
}

@media (max-width: 600px) {
  ${id} .nc-modal-overlay {
    justify-content: flex-end;
  }
}

/* Modal Content */
${id} .nc-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  max-height: 615px;
  width: 100%;
  border-radius: var(--nc-radius-xl);
  background: var(--nc-color-background);
  border: 1.5px solid var(--nc-color-border);
  transition: transform var(--nc-duration) var(--nc-easing);
  overflow: hidden;
}

@media (max-width: 600px) {
  ${id} .nc-modal {
    max-width: 100%;
    width: 100%;
    max-height: 85vh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border: none;
    border-top: 1.5px solid var(--nc-color-border);
  }
}

/* Modal Header */
${id} .nc-header {
  display: flex;
  padding: var(--nc-spacing-md);
  gap: var(--nc-spacing-md);
  align-self: stretch;
  align-items: center;
  justify-content: center;
  position: relative;
  border-bottom: 1px solid var(--nc-color-border);
}

${id} .nc-header-title {
  color: var(--nc-color-text);
  text-align: center;
  font-size: var(--nc-font-size-xl);
  font-weight: var(--nc-font-weight-bold);
  line-height: 1.2;
  margin: 0;
}

${id} .nc-header-btn {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: var(--nc-radius-md);
  cursor: pointer;
  transition: background var(--nc-duration) var(--nc-easing);
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

${id} .nc-header-btn:hover {
  background: var(--nc-color-background-secondary);
}

${id} .nc-header-btn--close {
  right: var(--nc-spacing-md);
}

${id} .nc-header-btn--back {
  left: var(--nc-spacing-md);
}

${id} .nc-header-btn svg {
  width: 20px;
  height: 20px;
}

${id} .nc-header-btn path,
${id} .nc-header-btn circle {
  stroke: var(--nc-color-text-muted);
  transition: stroke var(--nc-duration) var(--nc-easing);
}

${id} .nc-header-btn:hover path,
${id} .nc-header-btn:hover circle {
  stroke: var(--nc-color-text);
}

/* Modal Body */
${id} .nc-body {
  display: flex;
  padding: var(--nc-spacing-md);
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nc-spacing-sm);
  overflow: auto;
  width: 100%;
  flex: 1;
}

/* Search Input */
${id} .nc-search {
  width: 100%;
  padding: var(--nc-spacing-sm) var(--nc-spacing-md);
  border-radius: var(--nc-radius-md);
  background: var(--nc-color-background-secondary);
  color: var(--nc-color-text);
  border: 1px solid transparent;
  font-size: var(--nc-font-size-md);
  transition: all var(--nc-duration) var(--nc-easing);
  margin-bottom: var(--nc-spacing-sm);
}

${id} .nc-search::placeholder {
  color: var(--nc-color-text-muted);
}

${id} .nc-search:focus {
  border-color: var(--nc-color-accent);
  background: var(--nc-color-background);
}

/* Wallet List */
${id} .nc-wallet-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: var(--nc-spacing-xs);
}

/* Wallet Group */
${id} .nc-wallet-group {
  margin-bottom: var(--nc-spacing-md);
}

${id} .nc-wallet-group-title {
  font-size: var(--nc-font-size-xs);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--nc-spacing-sm) var(--nc-spacing-sm);
  margin-bottom: var(--nc-spacing-xs);
}

/* Wallet Item */
${id} .nc-wallet-item {
  display: flex;
  padding: var(--nc-spacing-sm);
  align-items: center;
  gap: var(--nc-spacing-md);
  cursor: pointer;
  transition: background var(--nc-duration) var(--nc-easing);
  border-radius: var(--nc-radius-lg);
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

${id} .nc-wallet-item:hover {
  background: var(--nc-color-background-secondary);
}

${id} .nc-wallet-item:active {
  transform: scale(0.98);
}

${id} .nc-wallet-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

${id} .nc-wallet-item--disabled:hover {
  background: none;
}

${id} .nc-wallet-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--nc-radius-md);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--nc-color-background-secondary);
}

${id} .nc-wallet-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

${id} .nc-wallet-name {
  color: var(--nc-color-text-secondary);
  font-size: var(--nc-font-size-lg);
  font-weight: var(--nc-font-weight-bold);
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

${id} .nc-wallet-desc {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-sm);
  font-weight: var(--nc-font-weight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Wallet Badges */
${id} .nc-wallet-badges {
  display: flex;
  gap: var(--nc-spacing-xs);
  flex-shrink: 0;
}

${id} .nc-badge {
  padding: 2px 6px;
  border-radius: var(--nc-radius-sm);
  font-size: var(--nc-font-size-xs);
  font-weight: var(--nc-font-weight-medium);
  background: var(--nc-color-background-secondary);
  color: var(--nc-color-text-muted);
}

${id} .nc-badge--recent {
  background: var(--nc-color-accent);
  color: var(--nc-color-accent-text);
}

${id} .nc-badge--installed {
  background: var(--nc-color-success);
  color: white;
}

/* Footer */
${id} .nc-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--nc-spacing-md);
  border-top: 1px solid var(--nc-color-border);
  gap: var(--nc-spacing-md);
}

${id} .nc-footer-branding {
  display: flex;
  align-items: center;
  gap: var(--nc-spacing-sm);
}

${id} .nc-footer-logo {
  width: 24px;
  height: 24px;
  border-radius: var(--nc-radius-full);
  object-fit: cover;
}

${id} .nc-footer-name {
  font-size: var(--nc-font-size-sm);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-text-secondary);
}

${id} .nc-footer-link {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-sm);
  font-weight: var(--nc-font-weight-medium);
  text-decoration: none;
  transition: color var(--nc-duration) var(--nc-easing);
  cursor: pointer;
}

${id} .nc-footer-link:hover {
  color: var(--nc-color-text);
}

/* Loading State */
${id} .nc-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nc-spacing-xxl);
  gap: var(--nc-spacing-md);
  width: 100%;
}

${id} .nc-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--nc-color-background-secondary);
  border-top-color: var(--nc-color-accent);
  border-radius: var(--nc-radius-full);
  animation: nc-spin 0.8s linear infinite;
}

@keyframes nc-spin {
  to { transform: rotate(360deg); }
}

${id} .nc-loading-text {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-md);
}

/* Error State */
${id} .nc-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nc-spacing-xl);
  gap: var(--nc-spacing-md);
  width: 100%;
  text-align: center;
}

${id} .nc-error-icon {
  width: 48px;
  height: 48px;
  color: var(--nc-color-error);
}

${id} .nc-error-title {
  color: var(--nc-color-text);
  font-size: var(--nc-font-size-lg);
  font-weight: var(--nc-font-weight-bold);
}

${id} .nc-error-message {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-md);
  max-width: 280px;
}

${id} .nc-error-actions {
  display: flex;
  gap: var(--nc-spacing-sm);
  margin-top: var(--nc-spacing-sm);
}

/* Button */
${id} .nc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--nc-spacing-sm);
  padding: var(--nc-spacing-sm) var(--nc-spacing-md);
  border-radius: var(--nc-radius-md);
  font-size: var(--nc-font-size-md);
  font-weight: var(--nc-font-weight-medium);
  cursor: pointer;
  transition: all var(--nc-duration) var(--nc-easing);
  border: none;
  text-decoration: none;
}

${id} .nc-btn--primary {
  background: var(--nc-color-button-background);
  color: var(--nc-color-button-text);
}

${id} .nc-btn--primary:hover {
  background: var(--nc-color-button-hover);
}

${id} .nc-btn--secondary {
  background: var(--nc-color-background-secondary);
  color: var(--nc-color-text);
}

${id} .nc-btn--secondary:hover {
  background: var(--nc-color-border-hover);
}

${id} .nc-btn--ghost {
  background: transparent;
  color: var(--nc-color-text-muted);
}

${id} .nc-btn--ghost:hover {
  background: var(--nc-color-background-secondary);
  color: var(--nc-color-text);
}

/* Empty State */
${id} .nc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nc-spacing-xl);
  gap: var(--nc-spacing-md);
  width: 100%;
  text-align: center;
}

${id} .nc-empty-title {
  color: var(--nc-color-text);
  font-size: var(--nc-font-size-lg);
  font-weight: var(--nc-font-weight-bold);
}

${id} .nc-empty-message {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-md);
}

/* Connecting State */
${id} .nc-connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nc-spacing-xxl);
  gap: var(--nc-spacing-lg);
  width: 100%;
  text-align: center;
}

${id} .nc-connecting-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--nc-radius-lg);
  object-fit: cover;
  animation: nc-pulse 2s ease-in-out infinite;
}

@keyframes nc-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

${id} .nc-connecting-title {
  color: var(--nc-color-text);
  font-size: var(--nc-font-size-lg);
  font-weight: var(--nc-font-weight-bold);
}

${id} .nc-connecting-message {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-md);
  max-width: 280px;
}

/* Help Section */
${id} .nc-help {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-md);
  padding: var(--nc-spacing-md);
  width: 100%;
}

${id} .nc-help-item {
  display: flex;
  align-items: flex-start;
  gap: var(--nc-spacing-md);
  padding: var(--nc-spacing-md);
  background: var(--nc-color-background-secondary);
  border-radius: var(--nc-radius-md);
}

${id} .nc-help-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--nc-color-accent);
}

${id} .nc-help-content {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-xs);
}

${id} .nc-help-title {
  color: var(--nc-color-text);
  font-size: var(--nc-font-size-md);
  font-weight: var(--nc-font-weight-medium);
}

${id} .nc-help-desc {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-sm);
}

/* Skeleton loader */
${id} .nc-skeleton {
  background: linear-gradient(
    90deg,
    var(--nc-color-background-secondary) 25%,
    var(--nc-color-border) 50%,
    var(--nc-color-background-secondary) 75%
  );
  background-size: 200% 100%;
  animation: nc-skeleton 1.5s ease-in-out infinite;
  border-radius: var(--nc-radius-sm);
}

@keyframes nc-skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

${id} .nc-skeleton--icon {
  width: 48px;
  height: 48px;
  border-radius: var(--nc-radius-md);
}

${id} .nc-skeleton--text {
  height: 16px;
  width: 120px;
}

${id} .nc-skeleton--text-sm {
  height: 12px;
  width: 80px;
}

/* Visually hidden for screen readers */
${id} .nc-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Transaction Modal Styles */
${id} .nc-tx-wallet {
  display: flex;
  align-items: center;
  gap: var(--nc-spacing-sm);
  padding: var(--nc-spacing-sm);
  background: var(--nc-color-background-secondary);
  border-radius: var(--nc-radius-md);
  width: 100%;
  margin-bottom: var(--nc-spacing-sm);
}

${id} .nc-tx-wallet-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--nc-radius-sm);
  object-fit: cover;
}

${id} .nc-tx-wallet-name {
  font-size: var(--nc-font-size-md);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-text);
}

${id} .nc-tx-target {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-xs);
  padding: var(--nc-spacing-md);
  background: var(--nc-color-background-secondary);
  border-radius: var(--nc-radius-md);
  width: 100%;
  margin-bottom: var(--nc-spacing-md);
}

${id} .nc-tx-target-label {
  font-size: var(--nc-font-size-xs);
  color: var(--nc-color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

${id} .nc-tx-target-value {
  font-size: var(--nc-font-size-md);
  font-family: var(--nc-font-family-mono);
  color: var(--nc-color-text);
  word-break: break-all;
}

${id} .nc-tx-actions {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-sm);
  width: 100%;
  margin-bottom: var(--nc-spacing-md);
}

${id} .nc-tx-action {
  padding: var(--nc-spacing-md);
  background: var(--nc-color-background-secondary);
  border-radius: var(--nc-radius-md);
  border-left: 3px solid var(--nc-color-accent);
}

${id} .nc-tx-action-header {
  display: flex;
  align-items: center;
  gap: var(--nc-spacing-sm);
  margin-bottom: var(--nc-spacing-xs);
}

${id} .nc-tx-action-type {
  font-size: var(--nc-font-size-xs);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

${id} .nc-tx-action-title {
  font-size: var(--nc-font-size-md);
  font-weight: var(--nc-font-weight-bold);
  color: var(--nc-color-text);
}

${id} .nc-tx-action-desc {
  font-size: var(--nc-font-size-sm);
  color: var(--nc-color-text-muted);
  margin: 0;
}

${id} .nc-tx-action-details {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-xs);
  margin-top: var(--nc-spacing-sm);
  padding-top: var(--nc-spacing-sm);
  border-top: 1px solid var(--nc-color-border);
}

${id} .nc-tx-action-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

${id} .nc-tx-action-detail-key {
  font-size: var(--nc-font-size-sm);
  color: var(--nc-color-text-muted);
}

${id} .nc-tx-action-detail-value {
  font-size: var(--nc-font-size-sm);
  font-family: var(--nc-font-family-mono);
  color: var(--nc-color-text);
}

${id} .nc-tx-summary {
  display: flex;
  flex-direction: column;
  gap: var(--nc-spacing-sm);
  padding: var(--nc-spacing-md);
  background: var(--nc-color-background-secondary);
  border-radius: var(--nc-radius-md);
  width: 100%;
}

${id} .nc-tx-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

${id} .nc-tx-summary-label {
  font-size: var(--nc-font-size-sm);
  color: var(--nc-color-text-muted);
}

${id} .nc-tx-summary-value {
  font-size: var(--nc-font-size-sm);
  font-family: var(--nc-font-family-mono);
  color: var(--nc-color-text);
}

${id} .nc-tx-summary-value--highlight {
  color: var(--nc-color-warning);
  font-weight: var(--nc-font-weight-bold);
}

${id} .nc-tx-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nc-spacing-xl);
  gap: var(--nc-spacing-md);
  width: 100%;
  text-align: center;
}

${id} .nc-tx-result-icon {
  width: 64px;
  height: 64px;
}

${id} .nc-tx-result--success .nc-tx-result-icon {
  color: var(--nc-color-success);
}

${id} .nc-tx-result-title {
  color: var(--nc-color-text);
  font-size: var(--nc-font-size-lg);
  font-weight: var(--nc-font-weight-bold);
  margin: 0;
}

${id} .nc-tx-result-message {
  color: var(--nc-color-text-muted);
  font-size: var(--nc-font-size-md);
  margin: 0;
  max-width: 280px;
}

/* Account Switcher Styles */
${id} .nc-account-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: var(--nc-spacing-xs);
}

${id} .nc-account-item {
  display: flex;
  align-items: center;
  gap: var(--nc-spacing-sm);
  border-radius: var(--nc-radius-lg);
  transition: background var(--nc-duration) var(--nc-easing);
}

${id} .nc-account-item:hover {
  background: var(--nc-color-background-secondary);
}

${id} .nc-account-item--active {
  background: var(--nc-color-background-secondary);
}

${id} .nc-account-item--confirm {
  padding: var(--nc-spacing-md);
  background: var(--nc-color-background-secondary);
}

${id} .nc-account-select {
  display: flex;
  align-items: center;
  gap: var(--nc-spacing-md);
  flex: 1;
  padding: var(--nc-spacing-sm);
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  border-radius: var(--nc-radius-lg);
}

${id} .nc-account-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--nc-radius-full);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--nc-color-background-secondary);
}

${id} .nc-account-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

${id} .nc-account-avatar-gen {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--nc-font-size-sm);
  font-weight: var(--nc-font-weight-bold);
  color: white;
}

${id} .nc-account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

${id} .nc-account-id {
  font-size: var(--nc-font-size-md);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

${id} .nc-account-balance {
  font-size: var(--nc-font-size-sm);
  font-family: var(--nc-font-family-mono);
  color: var(--nc-color-text-muted);
}

${id} .nc-account-wallet {
  font-size: var(--nc-font-size-xs);
  color: var(--nc-color-text-muted);
}

${id} .nc-account-active {
  font-size: var(--nc-font-size-xs);
  font-weight: var(--nc-font-weight-medium);
  color: var(--nc-color-success);
  padding: 2px 6px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: var(--nc-radius-sm);
  flex-shrink: 0;
}

${id} .nc-account-disconnect {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--nc-radius-md);
  transition: background var(--nc-duration) var(--nc-easing);
  flex-shrink: 0;
  margin-right: var(--nc-spacing-sm);
}

${id} .nc-account-disconnect:hover {
  background: var(--nc-color-error);
}

${id} .nc-account-disconnect svg {
  width: 16px;
  height: 16px;
  color: var(--nc-color-text-muted);
}

${id} .nc-account-disconnect:hover svg {
  color: white;
}

${id} .nc-account-confirm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nc-spacing-sm);
  width: 100%;
}

${id} .nc-account-confirm-text {
  font-size: var(--nc-font-size-sm);
  color: var(--nc-color-text);
  margin: 0;
}

${id} .nc-account-confirm-actions {
  display: flex;
  gap: var(--nc-spacing-sm);
}

${id} .nc-btn--sm {
  padding: var(--nc-spacing-xs) var(--nc-spacing-sm);
  font-size: var(--nc-font-size-sm);
}

${id} .nc-btn--danger {
  background: var(--nc-color-error);
  color: white;
}

${id} .nc-btn--danger:hover {
  background: var(--nc-color-error);
  opacity: 0.9;
}
`;
}
