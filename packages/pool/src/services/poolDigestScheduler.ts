import type { DigestUpdateReason, PoolDigestService } from "./poolDigestService.js"

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000

export interface PoolDigestSchedulerOptions {
	intervalMs?: number
	staleAfterMs?: number
	logger?: Pick<Console, "error" | "warn" | "info"> | null
}

interface ScheduledJob {
	reason: DigestUpdateReason
}

const REASON_PRIORITY: Record<DigestUpdateReason, number> = {
	manual: 3,
	ingest: 2,
	scheduled: 1,
}

export class PoolDigestScheduler {
	private readonly queue = new Map<string, ScheduledJob>()
	private processing = false
	private timer: NodeJS.Timeout | null = null
	private stopped = false

	constructor(
		private readonly service: PoolDigestService,
		private readonly options: PoolDigestSchedulerOptions = {},
	) {}

	start() {
		if (this.timer) {
			return
		}

		const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS
		this.timer = setInterval(() => {
			void this.refreshStaleDigests()
		}, interval)
		this.timer.unref?.()

		void this.refreshStaleDigests()
	}

	stop() {
		this.stopped = true
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
	}

	schedule(accountId: string, userId: string, reason: DigestUpdateReason = "ingest") {
		const key = this.makeKey(accountId, userId)
		const existing = this.queue.get(key)
		if (!existing || REASON_PRIORITY[reason] > REASON_PRIORITY[existing.reason]) {
			this.queue.set(key, { reason })
		}

		void this.flushQueue()
	}

	private async flushQueue() {
		if (this.processing || this.stopped) {
			return
		}

		this.processing = true
		try {
			while (this.queue.size && !this.stopped) {
				const [key, job] = this.queue.entries().next().value as [string, ScheduledJob]
				this.queue.delete(key)
				const { accountId, userId } = this.parseKey(key)
				try {
					await this.service.refreshDigest(accountId, userId, { reason: job.reason })
				} catch (error) {
					this.options.logger?.error?.(
						`[PoolDigestScheduler] Failed to build digest for ${accountId}/${userId}:`,
						error,
					)
				}
			}
		} finally {
			this.processing = false
		}
	}

	private async refreshStaleDigests() {
		if (this.stopped) {
			return
		}

		const threshold = new Date(Date.now() - (this.options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS))
		try {
			const stale = await this.service.listDigestsOlderThan(threshold)
			for (const digest of stale) {
				this.schedule(digest.accountId, digest.userId, "scheduled")
			}
		} catch (error) {
			this.options.logger?.warn?.("[PoolDigestScheduler] Failed to find stale digests", error)
		}
	}

	private makeKey(accountId: string, userId: string) {
		return `${accountId}::${userId}`
	}

	private parseKey(key: string) {
		const [accountId, userId] = key.split("::")
		return { accountId, userId }
	}
}
