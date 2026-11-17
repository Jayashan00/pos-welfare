// Short beeps confirm each scan without looking at the screen.
let ctx = null;
export function beep(ok = true) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = ok ? 1500 : 220;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.07 : 0.35));
  } catch { /* sound not available */ }
}
