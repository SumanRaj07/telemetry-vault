// Activity providers, kept behind interfaces so Windows-specific code can be
// replaced or mocked in tests. On Windows the real implementations are:
//   - foreground window: the maintained `active-win` package (native binaries)
//   - idle time + sleep/wake/lock/unlock: Electron's built-in powerMonitor
// Neither keystrokes nor window contents are ever observed.
import type { ActiveWindowInfo } from '../../shared/types';

export interface IActivityProvider {
  readonly name: string;
  isAvailable(): boolean;
  getActiveWindow(): Promise<ActiveWindowInfo | null>;
}

export interface IIdleProvider {
  readonly name: string;
  isAvailable(): boolean;
  getIdleSeconds(): number;
  onSystemEvent?(cb: (event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen') => void): void;
}

function basenameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

type ActiveWinFn = () => Promise<
  | { title: string; owner: { name: string; processId: number; path: string } }
  | undefined
>;

/** Real Windows foreground-window provider via active-win. */
export class ActiveWinProvider implements IActivityProvider {
  readonly name = 'active-win';
  private available: boolean | null = null;
  private activeWinModule: ActiveWinFn | null = null;

  isAvailable(): boolean {
    if (this.available !== null) return this.available;
    try {
      require.resolve('active-win');
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    if (!this.isAvailable()) return null;
    try {
      let fn: ActiveWinFn | undefined = this.activeWinModule ?? undefined;
      if (!fn) {
        const mod = await import('active-win');
        fn = mod.default;
        this.activeWinModule = fn;
      }
      const result = await fn();
      if (!result) return null;
      return {
        processId: result.owner.processId,
        processName: basenameOf(result.owner.path || result.owner.name),
        appName: result.owner.name,
        title: result.title,
        executablePath: result.owner.path || undefined,
      };
    } catch {
      this.available = false;
      return null;
    }
  }
}

/** Idle time + power events via Electron's built-in powerMonitor. */
export class PowerMonitorIdleProvider implements IIdleProvider {
  readonly name = 'powerMonitor';
  private powerMonitor: {
    getSystemIdleTime: () => number;
    on: (event: string, cb: () => void) => void;
  } | null = null;

  isAvailable(): boolean {
    if (this.powerMonitor) return true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron');
      if (electron?.powerMonitor) {
        this.powerMonitor = electron.powerMonitor;
        return true;
      }
    } catch {
      // Not inside Electron.
    }
    return false;
  }

  getIdleSeconds(): number {
    if (!this.isAvailable() || !this.powerMonitor) return 0;
    try {
      return this.powerMonitor.getSystemIdleTime();
    } catch {
      return 0;
    }
  }

  onSystemEvent(cb: (event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen') => void): void {
    if (!this.isAvailable() || !this.powerMonitor) return;
    for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen'] as const) {
      this.powerMonitor.on(event, () => cb(event));
    }
  }
}

/** Provider that is never available (used when no native integration exists). */
export class NullActivityProvider implements IActivityProvider {
  readonly name = 'none';
  isAvailable(): boolean {
    return false;
  }
  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    return null;
  }
}

/** Scripted provider for tests and non-Windows development. */
export class MockActivityProvider implements IActivityProvider, IIdleProvider {
  readonly name = 'mock';
  private step = 0;
  constructor(
    private script: { window: ActiveWindowInfo | null; idleSeconds: number }[],
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    return this.script[this.step]?.window ?? null;
  }

  getIdleSeconds(): number {
    return this.script[this.step]?.idleSeconds ?? 0;
  }

  /** Advance the script by one tick (tests control time deterministically). */
  advance(): void {
    if (this.step < this.script.length - 1) this.step += 1;
  }

  setStep(step: number): void {
    this.step = Math.min(step, this.script.length - 1);
  }
}
