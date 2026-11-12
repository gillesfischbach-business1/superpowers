import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './_dom-stub.mjs';

/**
 * The game has to survive being *played*, not just booted.
 *
 * Every test we had stopped at "Dudelange is ready." — the loading screen. The
 * first rendered frame is a different program: traffic, NPCs, rain, the clock,
 * the HUD. A renamed parameter (`riding` → `ride`) threw "ride is not defined"
 * inside makePerson().animate, which updateNPCs calls sixty times a second, so
 * the whole game died one frame after the menu appeared while every gate stayed
 * green. This presses Enter Dudelange and runs four hundred real frames, with
 * the clock advancing, so anything that throws in the loop fails the build.
 */
test('the game survives four hundred frames of play', async () => {
  const { byId, pumpFrames, clearTimers, fire } = installDomStub();

  const problems = [];
  const realError = console.error;
  console.error = (...args) => { problems.push(args.map(String).join(' ')); };
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;

  try {
    await import('../public/js/game/main.js');
    const deadline = realNow() + 15_000;
    while (realNow() < deadline && String(byId('loadtext').textContent) !== 'Dudelange is ready.') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(String(byId('loadtext').textContent), 'Dudelange is ready.', 'never reached the menu');

    // Exactly what the player clicks.
    const start = byId('startBtn');
    assert.equal(typeof start.onclick, 'function', 'the start button has no handler');
    await start.onclick({ target: start });

    // Play a little: walk into the town, interact, open and close the panels.
    // Every one of those paths touches code that no boot test can reach.
    const tap = (code) => { fire('keydown', { code, key: code }); fire('keyup', { code, key: code }); };
    let fired = 0;
    const spin = (frames) => { fired += pumpFrames(frames, 16); };
    const hold = (code, frames) => {
      fire('keydown', { code, key: code });
      spin(frames);
      fire('keyup', { code, key: code });
    };

    spin(120);
    hold('KeyW', 120);            // walk: collision, terrain, autosave timer
    hold('ShiftLeft', 60);
    tap('KeyE');                  // interact with whatever is closest
    spin(30);
    tap('KeyM'); tap('Escape');   // map panel open/close
    tap('KeyJ'); tap('Escape');   // journal
    tap('KeyP'); tap('Escape');   // agent build feed
    tap('KeyT');                  // hold-to-wait is a keydown, not a tap
    spin(120);
    assert.ok(fired >= 400, `the animation loop stopped after ${fired} frames`);
  } finally {
    console.error = realError;
    Date.now = realNow;
    clearTimers();
  }

  const report = problems.join('\n');
  assert.equal(report, '', `the game threw while running:\n${report}`);
  assert.equal(String(byId('errors').textContent), '', `error box: ${byId('errors').textContent}`);
  // The loop must still be alive at the end, not silently dead after a throw.
  const stillRunning = pumpFrames(60, 16);
  assert.ok(stillRunning >= 50, `the loop died after ${stillRunning} frames`);
});
