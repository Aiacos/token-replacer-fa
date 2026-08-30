/**
 * Stop-indexing control tests.
 *
 * The first-time index build can run for minutes with no way to stop it. The
 * control lives on the background notification, which means it has to work
 * across two different Foundry notification APIs: v13 returns a Notification
 * object carrying its own element and remove(), v12 returns only an id. Getting
 * this wrong at startup is worse than having no control at all, so the failure
 * modes are what these tests pin.
 *
 * @module tests/core/stop-indexing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showStoppableIndexingNotification } from '../../scripts/main.js';

let container;

beforeEach(() => {
  container = document.createElement('ol');
  container.id = 'notifications';
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

/** Append a notification element the way Foundry's UI does. */
function appendNotificationElement() {
  const element = document.createElement('li');
  element.classList.add('notification', 'info');
  container.appendChild(element);
  return element;
}

describe('showStoppableIndexingNotification', () => {
  it('wires the stop control to the v13 Notification element', () => {
    const element = document.createElement('li');
    const remove = vi.fn();
    ui.notifications.info.mockReturnValue({ element, remove });
    const onStop = vi.fn();

    const handle = showStoppableIndexingNotification('Indexing…', onStop);

    expect(element.getAttribute('role')).toBe('button');
    expect(element.classList.contains('token-replacer-fa-stoppable')).toBe(true);

    element.click();
    expect(onStop).toHaveBeenCalledTimes(1);

    handle.dismiss();
    expect(remove).toHaveBeenCalled();
  });

  it('falls back to the notification list when only an id comes back (v12)', () => {
    const element = appendNotificationElement();
    ui.notifications.info.mockReturnValue(42);
    const onStop = vi.fn();

    showStoppableIndexingNotification('Indexing…', onStop);
    element.click();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('stops only once, however many times it is clicked', () => {
    const element = document.createElement('li');
    ui.notifications.info.mockReturnValue({ element, remove: vi.fn() });
    const onStop = vi.fn();

    showStoppableIndexingNotification('Indexing…', onStop);
    element.click();
    element.click();
    element.click();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('still shows the message when no element can be found', () => {
    ui.notifications.info.mockReturnValue(undefined);

    // Losing the control is acceptable; throwing during startup is not.
    expect(() => showStoppableIndexingNotification('Indexing…', vi.fn())).not.toThrow();
    expect(ui.notifications.info).toHaveBeenCalled();
  });

  it('survives a notification API that throws', () => {
    ui.notifications.info.mockImplementation(() => {
      throw new Error('notifications not ready');
    });

    const handle = showStoppableIndexingNotification('Indexing…', vi.fn());

    expect(() => handle.dismiss()).not.toThrow();
  });

  it('does not let a failing stop handler escape into the click event', () => {
    const element = document.createElement('li');
    ui.notifications.info.mockReturnValue({ element, remove: vi.fn() });

    showStoppableIndexingNotification('Indexing…', () => {
      throw new Error('cancel exploded');
    });

    expect(() => element.click()).not.toThrow();
  });
});
