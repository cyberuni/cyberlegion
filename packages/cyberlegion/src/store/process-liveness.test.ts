import { execFileSync, spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeProcess } from './process-liveness.ts'

afterEach(() => {
	vi.restoreAllMocks()
})

describe('probeProcess', () => {
	it("reads the caller's own pid as 'alive' without signaling it", () => {
		// Assert via a spy rather than trusting the outcome alone: probeProcess must short-circuit on
		// same-pid BEFORE calling process.kill, not merely happen to return 'alive' via the signal path.
		const kill = vi.spyOn(process, 'kill')
		expect(probeProcess(process.pid)).toBe('alive')
		expect(kill).not.toHaveBeenCalled()
	})

	it("reads a live OTHER pid as 'alive'", () => {
		// A child that stays running until we kill it — unambiguously alive from the parent's view for
		// the duration of this test.
		const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'])
		try {
			expect(probeProcess(child.pid as number)).toBe('alive')
		} finally {
			child.kill('SIGKILL')
		}
	})

	it("reads a pid that has already exited as 'dead' (ESRCH)", () => {
		// Spawn a short-lived child and let it fully exit before probing its (now-reusable) pid — this
		// is exactly the on-disk state a genuinely dead process's pid leaves behind.
		const deadPid = Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)']).toString().trim())
		expect(probeProcess(deadPid)).toBe('dead')
	})

	it("reads EPERM as 'unknown', never 'dead' — the collapse this type exists to make impossible", () => {
		// EPERM is common under sandboxes/containers/cross-uid processes where a LIVE process is
		// unsignalable. Injected via a mock rather than requiring an actual permission-denied target,
		// per the brief: simulate EPERM rather than depending on real OS permissions being set up.
		vi.spyOn(process, 'kill').mockImplementation(() => {
			const err = new Error('EPERM') as NodeJS.ErrnoException
			err.code = 'EPERM'
			throw err
		})
		expect(probeProcess(999999)).toBe('unknown')
	})

	it("reads any other unrecognized errno as 'unknown' too, not just EPERM", () => {
		vi.spyOn(process, 'kill').mockImplementation(() => {
			const err = new Error('EACCES') as NodeJS.ErrnoException
			err.code = 'EACCES'
			throw err
		})
		expect(probeProcess(999999)).toBe('unknown')
	})
})
