import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireLock, LockTimeoutError, withLock } from './lock.ts'

let root: string
const freshRoot = () => (root = mkdtempSync(join(tmpdir(), 'cl-lock-')))

describe('acquireLock: ordinary contention (a live holder)', () => {
	it('a second acquire attempt times out while the first holder is still live', () => {
		freshRoot()
		const first = acquireLock(root, 'x')
		expect(() => acquireLock(root, 'x', { timeoutMs: 80, retryDelayMs: 10 })).toThrow(LockTimeoutError)
		first.release()
	})

	it('a second acquire attempt succeeds once the first holder releases', () => {
		freshRoot()
		const first = acquireLock(root, 'x')
		first.release()
		const second = acquireLock(root, 'x', { timeoutMs: 200 })
		expect(existsSync(join(root, 'locks', 'x.lock', 'holder.json'))).toBe(true)
		second.release()
	})

	it('withLock always releases, even when fn throws', () => {
		freshRoot()
		expect(() =>
			withLock(root, 'x', () => {
				throw new Error('boom')
			}),
		).toThrow('boom')
		// released — a fresh acquire does not time out
		const handle = acquireLock(root, 'x', { timeoutMs: 200 })
		handle.release()
	})
})

describe('acquireLock: recovering from a lock a DEAD holder abandoned', () => {
	it('reclaims a lock whose recorded pid no longer exists, without the caller waiting out the timeout', () => {
		freshRoot()
		// A pid that is certainly not alive on this machine: spawn a short-lived child, wait for it
		// to exit, then reuse its (now-dead) pid as the lock's recorded holder — this is exactly what
		// an abandoned lock left by a crashed cyberlegion process looks like on disk.
		const deadPid = Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)']).toString().trim())
		// Build the abandoned lock dir directly rather than through acquireLock (which would use OUR
		// own live pid) — this simulates the on-disk state a genuinely dead holder left behind.
		const lockDir = join(root, 'locks', 'y.lock')
		mkdirSync(lockDir, { recursive: true })
		writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: deadPid, acquiredAt: Date.now() - 999999 }))

		const start = Date.now()
		const handle = acquireLock(root, 'y', { timeoutMs: 5000, retryDelayMs: 10 })
		expect(Date.now() - start).toBeLessThan(2000) // reclaimed promptly, not by waiting out a long timeout
		const holder = JSON.parse(readFileSync(join(lockDir, 'holder.json'), 'utf8'))
		expect(holder.pid).toBe(process.pid) // WE now hold it
		handle.release()
	})
})

describe('acquireLock: a LIVE holder is never stolen', () => {
	it('never reclaims a lock recorded under a pid that is still alive, even when the timeout is short', () => {
		freshRoot()
		// Our own pid is unambiguously alive — record it directly as the lock's holder (bypassing
		// acquireLock so nothing else in this process thinks it owns the handle), then confirm a
		// competing acquire refuses to steal it and times out instead of "recovering" it.
		const lockDir = join(root, 'locks', 'z.lock')
		mkdirSync(lockDir, { recursive: true })
		writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: process.pid, acquiredAt: Date.now() - 999999 }))
		// Old `acquiredAt` alone must NOT be grounds to steal — only a confirmed-dead pid is. A holder
		// this stale but still alive stays untouched.
		expect(() => acquireLock(root, 'z', { timeoutMs: 100, retryDelayMs: 10 })).toThrow(LockTimeoutError)
		expect(existsSync(lockDir)).toBe(true)
		const holder = JSON.parse(readFileSync(join(lockDir, 'holder.json'), 'utf8'))
		expect(holder.pid).toBe(process.pid) // still the original (live) holder — nothing stole it
	})
})
