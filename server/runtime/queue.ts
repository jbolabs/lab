/**
 * The Queue producer API with an in-process consumer. Delivery order and the
 * retry policy match wrangler.jsonc (three retries, ten seconds apart on
 * failure). Jobs live in memory: inbound mail is already on disk before it is
 * enqueued, so a restart at worst leaves a message unprocessed in the blob
 * store, never lost.
 */
export type QueueConsumer = (body: unknown) => Promise<void>;

interface Pending {
	body: unknown;
	attempts: number;
}

export class InProcessQueue {
	private consumer: QueueConsumer | null = null;
	private readonly maxRetries: number;
	private readonly timers = new Set<ReturnType<typeof setTimeout>>();

	readonly name: string;
	constructor(name: string, options?: { maxRetries?: number }) {
		this.name = name;
		this.maxRetries = options?.maxRetries ?? 3;
	}

	setConsumer(consumer: QueueConsumer) {
		this.consumer = consumer;
	}

	send(body: unknown, options?: { delaySeconds?: number }) {
		try {
			this.schedule({ attempts: 0, body }, (options?.delaySeconds ?? 0) * 1000);

			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async sendBatch(
		messages: Iterable<{ body: unknown; delaySeconds?: number }>
	) {
		for (const message of messages) {
			await this.send(message.body, { delaySeconds: message.delaySeconds });
		}
	}

	metrics() {
		try {
			return Promise.resolve({ backlogCount: this.timers.size });
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private schedule(pending: Pending, delayMs: number) {
		const timer = setTimeout(() => {
			this.timers.delete(timer);
			void this.deliver(pending);
		}, delayMs);
		this.timers.add(timer);
	}

	private async deliver(pending: Pending) {
		if (!this.consumer) {
			this.schedule(pending, 1000);
			return;
		}
		try {
			await this.consumer(pending.body);
		} catch (error) {
			console.error(`Queue ${this.name}: job failed`, error);
			if (pending.attempts < this.maxRetries) {
				this.schedule(
					{ attempts: pending.attempts + 1, body: pending.body },
					10_000
				);
			} else {
				console.error(
					`Queue ${this.name}: giving up after ${this.maxRetries} retries`,
					pending.body
				);
			}
		}
	}

	stop() {
		for (const timer of this.timers) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}
}

export function openQueue<T>(name: string): Queue<T> & InProcessQueue {
	return new InProcessQueue(name) as unknown as Queue<T> & InProcessQueue;
}
