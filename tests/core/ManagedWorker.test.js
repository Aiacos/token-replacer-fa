/**
 * Tests for ManagedWorker: lazy creation, retry after a failed factory,
 * teardown that never throws, and a fresh worker after teardown (Article II.4).
 *
 * @module tests/core/ManagedWorker.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManagedWorker } from '../../scripts/core/ManagedWorker.js';

/** A Worker-shaped stub. */
const stubWorker = () => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

describe('ManagedWorker', () => {
  let warnSpy;
  let debugSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  describe('construction', () => {
    it('does not create a worker until one is needed', () => {
      const factory = vi.fn(stubWorker);
      const managed = new ManagedWorker(factory);

      expect(factory).not.toHaveBeenCalled();
      expect(managed.isAlive).toBe(false);
      expect(managed.worker).toBeNull();
    });
  });

  describe('ensure', () => {
    it('creates the worker once and reuses it', () => {
      const worker = stubWorker();
      const factory = vi.fn(() => worker);
      const managed = new ManagedWorker(factory);

      expect(managed.ensure()).toBe(worker);
      expect(managed.ensure()).toBe(worker);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(managed.isAlive).toBe(true);
      expect(managed.worker).toBe(worker);
    });

    it('returns null and logs when the factory throws', () => {
      const managed = new ManagedWorker(() => {
        throw new Error('Worker unsupported');
      });

      expect(managed.ensure()).toBeNull();
      expect(managed.isAlive).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize Web Worker'),
        expect.any(Error)
      );
    });

    it('retries after a failed factory instead of giving up for the session', () => {
      const worker = stubWorker();
      const factory = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('transient');
        })
        .mockImplementationOnce(() => worker);
      const managed = new ManagedWorker(factory);

      expect(managed.ensure()).toBeNull();
      expect(managed.ensure()).toBe(worker);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('treats a factory that returns nothing as no worker, and retries', () => {
      const factory = vi.fn(() => undefined);
      const managed = new ManagedWorker(factory);

      expect(managed.ensure()).toBeNull();
      expect(managed.ensure()).toBeNull();
      expect(managed.isAlive).toBe(false);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('post', () => {
    it('posts to the live worker', () => {
      const worker = stubWorker();
      const managed = new ManagedWorker(() => worker);
      managed.ensure();

      expect(managed.post({ command: 'cancel' })).toBe(true);
      expect(worker.postMessage).toHaveBeenCalledWith({ command: 'cancel' });
    });

    it('never creates a worker just to deliver a message', () => {
      const factory = vi.fn(stubWorker);
      const managed = new ManagedWorker(factory);

      expect(managed.post({ command: 'cancel' })).toBe(false);
      expect(factory).not.toHaveBeenCalled();
    });

    it('propagates a postMessage failure to the caller', () => {
      const worker = stubWorker();
      worker.postMessage.mockImplementation(() => {
        throw new Error('DataCloneError');
      });
      const managed = new ManagedWorker(() => worker);
      managed.ensure();

      expect(() => managed.post({ fn: () => {} })).toThrow('DataCloneError');
    });
  });

  describe('teardown', () => {
    it('terminates the worker and lets the next ensure() build a fresh one', () => {
      const first = stubWorker();
      const second = stubWorker();
      const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
      const managed = new ManagedWorker(factory);

      managed.ensure();
      managed.teardown();

      expect(first.terminate).toHaveBeenCalledTimes(1);
      expect(managed.isAlive).toBe(false);
      expect(managed.ensure()).toBe(second);
    });

    it('never throws when terminate() does, and still drops the worker', () => {
      const worker = stubWorker();
      worker.terminate.mockImplementation(() => {
        throw new Error('already dead');
      });
      const managed = new ManagedWorker(() => worker);
      managed.ensure();

      expect(() => managed.teardown()).not.toThrow();
      expect(managed.isAlive).toBe(false);
      expect(debugSpy).toHaveBeenCalled();
    });

    it('runs the teardown hook every time, with or without a worker', () => {
      const onTeardown = vi.fn();
      const managed = new ManagedWorker(stubWorker, { onTeardown });

      managed.teardown();
      managed.ensure();
      managed.teardown();

      expect(onTeardown).toHaveBeenCalledTimes(2);
    });

    it('never throws when the teardown hook does', () => {
      const managed = new ManagedWorker(stubWorker, {
        onTeardown: () => {
          throw new Error('hook failed');
        },
      });
      managed.ensure();

      expect(() => managed.teardown()).not.toThrow();
      expect(managed.isAlive).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('teardown hook failed'),
        expect.any(Error)
      );
    });

    it('is safe to call twice (double teardown terminates once)', () => {
      const worker = stubWorker();
      const managed = new ManagedWorker(() => worker);
      managed.ensure();

      managed.teardown();
      managed.teardown();

      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
  });
});
