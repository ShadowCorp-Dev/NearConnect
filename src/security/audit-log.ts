/**
 * Audit Logging Layer
 * Tracks all wallet actions for investigation and compliance
 */

export type AuditEventType =
  | 'wallet:connect'
  | 'wallet:disconnect'
  | 'wallet:switch'
  | 'tx:sign'
  | 'tx:broadcast'
  | 'tx:blocked'
  | 'tx:failed'
  | 'message:sign'
  | 'security:violation'
  | 'security:warning'
  | 'rate:limited'
  | 'session:create'
  | 'session:restore'
  | 'session:expire'
  | 'hardware:connect'
  | 'hardware:disconnect'
  | 'hardware:error';

export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** Event timestamp */
  timestamp: number;
  /** Event type */
  type: AuditEventType;
  /** Wallet ID involved */
  walletId?: string;
  /** Account ID involved */
  accountId?: string;
  /** Additional event data */
  data?: Record<string, unknown>;
  /** Risk level if applicable */
  risk?: 'low' | 'medium' | 'high' | 'critical';
  /** User agent string */
  userAgent?: string;
  /** Session ID */
  sessionId?: string;
}

export interface AuditLogConfig {
  /** Enable/disable audit logging */
  enabled: boolean;
  /** Maximum events to keep in memory */
  maxEvents?: number;
  /** Remote endpoint to send events */
  remoteEndpoint?: string;
  /** Headers for remote endpoint */
  remoteHeaders?: Record<string, string>;
  /** Callback for each event */
  onEvent?: (event: AuditEvent) => void;
  /** Whether to log to console */
  consoleLog?: boolean;
  /** Event types to log (all if not specified) */
  eventTypes?: AuditEventType[];
  /** Whether to persist to localStorage */
  persist?: boolean;
}

export class AuditLog {
  private events: AuditEvent[] = [];
  private config: AuditLogConfig;
  private sessionId: string;
  private remoteQueue: AuditEvent[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AuditLogConfig = { enabled: true }) {
    this.config = {
      maxEvents: 1000,
      consoleLog: false,
      persist: false,
      ...config,
    };

    this.sessionId = crypto.randomUUID();

    // Load persisted events
    if (this.config.persist) {
      this.loadPersistedEvents();
    }
  }

  /**
   * Log an audit event
   */
  log(type: AuditEventType, data?: Partial<Omit<AuditEvent, 'id' | 'timestamp' | 'type'>>): AuditEvent | null {
    if (!this.config.enabled) return null;

    // Filter by event types if configured
    if (this.config.eventTypes && !this.config.eventTypes.includes(type)) {
      return null;
    }

    const event: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      ...data,
    };

    // Add to memory
    this.events.push(event);

    // Trim old events
    if (this.events.length > (this.config.maxEvents || 1000)) {
      this.events = this.events.slice(-(this.config.maxEvents || 1000) / 2);
    }

    // Callback
    this.config.onEvent?.(event);

    // Console log security events
    if (this.config.consoleLog || this.isSecurityEvent(type)) {
      this.consoleLogEvent(event);
    }

    // Persist if enabled
    if (this.config.persist) {
      this.persistEvents();
    }

    // Queue for remote if configured
    if (this.config.remoteEndpoint) {
      this.queueRemote(event);
    }

    return event;
  }

  /**
   * Log a security violation
   */
  logSecurityViolation(
    message: string,
    data?: Record<string, unknown>,
    risk: AuditEvent['risk'] = 'high'
  ): AuditEvent | null {
    return this.log('security:violation', {
      data: { message, ...data },
      risk,
    });
  }

  /**
   * Log a security warning
   */
  logSecurityWarning(
    message: string,
    data?: Record<string, unknown>
  ): AuditEvent | null {
    return this.log('security:warning', {
      data: { message, ...data },
      risk: 'medium',
    });
  }

  /**
   * Log a transaction
   */
  logTransaction(
    type: 'tx:sign' | 'tx:broadcast' | 'tx:blocked' | 'tx:failed',
    txData: {
      walletId?: string;
      accountId?: string;
      receiverId?: string;
      hash?: string;
      error?: string;
      risk?: AuditEvent['risk'];
    }
  ): AuditEvent | null {
    return this.log(type, {
      walletId: txData.walletId,
      accountId: txData.accountId,
      data: {
        receiverId: txData.receiverId,
        hash: txData.hash,
        error: txData.error,
      },
      risk: txData.risk,
    });
  }

  /**
   * Get events with optional filtering
   */
  getEvents(filter?: {
    type?: AuditEventType | AuditEventType[];
    since?: number;
    until?: number;
    walletId?: string;
    accountId?: string;
    risk?: AuditEvent['risk'] | AuditEvent['risk'][];
    limit?: number;
  }): AuditEvent[] {
    let events = [...this.events];

    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      events = events.filter(e => types.includes(e.type));
    }

    if (filter?.since) {
      events = events.filter(e => e.timestamp >= filter.since!);
    }

    if (filter?.until) {
      events = events.filter(e => e.timestamp <= filter.until!);
    }

    if (filter?.walletId) {
      events = events.filter(e => e.walletId === filter.walletId);
    }

    if (filter?.accountId) {
      events = events.filter(e => e.accountId === filter.accountId);
    }

    if (filter?.risk) {
      const risks = Array.isArray(filter.risk) ? filter.risk : [filter.risk];
      events = events.filter(e => e.risk && risks.includes(e.risk));
    }

    if (filter?.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  /**
   * Get security-related events
   */
  getSecurityEvents(): AuditEvent[] {
    return this.getEvents({
      type: ['security:violation', 'security:warning', 'tx:blocked', 'rate:limited'],
    });
  }

  /**
   * Get events for a specific session
   */
  getSessionEvents(sessionId?: string): AuditEvent[] {
    const sid = sessionId || this.sessionId;
    return this.events.filter(e => e.sessionId === sid);
  }

  /**
   * Export events as JSON
   */
  export(filter?: Parameters<typeof this.getEvents>[0]): string {
    const events = filter ? this.getEvents(filter) : this.events;
    return JSON.stringify(events, null, 2);
  }

  /**
   * Export events as CSV
   */
  exportCsv(filter?: Parameters<typeof this.getEvents>[0]): string {
    const events = filter ? this.getEvents(filter) : this.events;
    const headers = ['id', 'timestamp', 'type', 'walletId', 'accountId', 'risk', 'data'];
    const rows = events.map(e => [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.type,
      e.walletId || '',
      e.accountId || '',
      e.risk || '',
      JSON.stringify(e.data || {}),
    ]);

    return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    if (this.config.persist) {
      localStorage.removeItem('near-connect:audit-log');
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Flush remote queue immediately
   */
  async flushRemote(): Promise<void> {
    if (!this.config.remoteEndpoint || this.remoteQueue.length === 0) return;

    const events = [...this.remoteQueue];
    this.remoteQueue = [];

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.remoteHeaders,
        },
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      // Re-queue on failure
      this.remoteQueue = [...events, ...this.remoteQueue];
      console.warn('[AuditLog] Failed to send events to remote', error);
    }
  }

  private isSecurityEvent(type: AuditEventType): boolean {
    return type.startsWith('security:') ||
           type === 'tx:blocked' ||
           type === 'rate:limited';
  }

  private consoleLogEvent(event: AuditEvent): void {
    const prefix = this.isSecurityEvent(event.type) ? '🚨' : '📋';
    const level = this.isSecurityEvent(event.type) ? 'warn' : 'info';

    console[level](
      `${prefix} [Audit] ${event.type}`,
      {
        walletId: event.walletId,
        accountId: event.accountId,
        risk: event.risk,
        data: event.data,
      }
    );
  }

  private queueRemote(event: AuditEvent): void {
    this.remoteQueue.push(event);

    // Debounce flush
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flushRemote().catch(console.error);
    }, 5000);
  }

  private persistEvents(): void {
    try {
      // Only persist last 100 events
      const toStore = this.events.slice(-100);
      localStorage.setItem('near-connect:audit-log', JSON.stringify(toStore));
    } catch {
      // Ignore storage errors
    }
  }

  private loadPersistedEvents(): void {
    try {
      const stored = localStorage.getItem('near-connect:audit-log');
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
  }
}

/**
 * Create an audit log with default configuration
 */
export function createAuditLog(config?: Partial<AuditLogConfig>): AuditLog {
  return new AuditLog({
    enabled: true,
    maxEvents: 1000,
    consoleLog: false, // Set to true for development debugging
    ...config,
  });
}
