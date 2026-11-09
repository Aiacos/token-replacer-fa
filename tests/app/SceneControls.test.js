/**
 * The GM scene control button (v13 object-shaped controls).
 * @module tests/app/SceneControls
 */
import { describe, it, expect, vi } from 'vitest';
import { SceneControls } from '../../scripts/app/SceneControls.js';

function build({ isGM = true, localize = (key) => key } = {}) {
  const notifications = { error: vi.fn() };
  const onActivate = vi.fn();
  const controls = new SceneControls({
    onActivate,
    isGM: () => isGM,
    localizer: { localize, orEnglish: (_key, english) => english },
    getUi: () => ({ notifications }),
    logger: { log: vi.fn() },
  });
  return { controls, onActivate, notifications };
}

describe('SceneControls.addButton', () => {
  it('adds a button tool to the token controls that starts a run', () => {
    const { controls, onActivate } = build();
    const payload = { tokens: { tools: { select: {}, target: {} } } };

    expect(controls.addButton(payload)).toBe(true);

    const tool = payload.tokens.tools.tokenReplacerFA;
    expect(tool).toMatchObject({
      name: 'tokenReplacerFA',
      title: 'button.title',
      button: true,
      visible: true,
      order: 3,
    });
    tool.onChange();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to a player', () => {
    const { controls } = build({ isGM: false });
    const payload = { tokens: { tools: {} } };

    expect(controls.addButton(payload)).toBe(false);
    expect(payload.tokens.tools).toEqual({});
  });

  it('does nothing when the token controls are missing', () => {
    const { controls, notifications } = build();

    expect(controls.addButton({})).toBe(false);
    expect(controls.addButton(undefined)).toBe(false);
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('reports a failure instead of breaking the control bar', () => {
    const { controls, notifications } = build({
      localize: () => {
        throw new Error('i18n not ready');
      },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(controls.addButton({ tokens: { tools: {} } })).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith(
      expect.stringContaining('could not add its scene control button')
    );
    error.mockRestore();
  });
});
