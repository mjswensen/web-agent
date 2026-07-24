import { startPiLifecycle, type PiLifecycleOptions, type StartedPi } from './pi-lifecycle.js';
import type { PiProcess } from './pi-process.js';
import type { SessionListProvider } from './session-list.js';

/** Maintains the one active child and permits an explicit, operator-requested restart. */
export class PiSupervisor {
	private started: StartedPi | undefined;

	constructor(private readonly options: PiLifecycleOptions) {}

	async start(): Promise<PiProcess> {
		if (!this.started) this.started = await startPiLifecycle(this.options);
		return this.started.process;
	}

	async restart(): Promise<PiProcess> {
		if (this.started) {
			// A crashed process has already exited; stop() is idempotent in that case.
			await this.started.process.stop(250).catch(() => undefined);
		}
		this.started = await startPiLifecycle(this.options);
		return this.started.process;
	}

	async stop(gracePeriodMs = 5_000): Promise<void> {
		if (!this.started) return;
		await this.started.process.stop(gracePeriodMs).catch(() => undefined);
		this.started = undefined;
	}

	get sessionList(): SessionListProvider | undefined {
		return this.started?.sessionList;
	}
}
