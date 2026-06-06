// ALPEXA — Sound effects using Web Audio API (no external assets)
// Generates short tones for trading events: order filled, pending placed,
// closed, error. Originally synthesized — nothing copied.

(function() {
  let ctx = null;
  function audio() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 800, dur = 0.15, type = 'sine', vol = 0.18, attack = 0.005, decay = 0.1, slideTo = null, when = 0 }) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function chord(notes, opts = {}) {
    notes.forEach((n, i) => tone({ ...opts, freq: n, when: (opts.when || 0) + i * 0.02 }));
  }

  const sfx = {
    // Order filled — confident, rising two-note chime
    orderFill(side) {
      if (!getMuted()) {
        if (side === 'BUY') {
          tone({ freq: 660, dur: 0.12, type: 'sine', vol: 0.18, slideTo: 1320, decay: 0.12 });
          tone({ freq: 880, dur: 0.18, type: 'sine', vol: 0.12, when: 0.06 });
        } else {
          tone({ freq: 880, dur: 0.12, type: 'sine', vol: 0.18, slideTo: 440, decay: 0.12 });
          tone({ freq: 660, dur: 0.18, type: 'sine', vol: 0.12, when: 0.06 });
        }
      }
    },
    // Pending order — softer single ding
    pendingPlaced() {
      if (!getMuted()) tone({ freq: 740, dur: 0.22, type: 'triangle', vol: 0.14 });
    },
    // Pending triggered → became open
    triggered() {
      if (!getMuted()) chord([880, 1320], { dur: 0.16, type: 'sine', vol: 0.14 });
    },
    // Position closed
    closed() {
      if (!getMuted()) tone({ freq: 520, dur: 0.18, type: 'sine', vol: 0.14, slideTo: 380 });
    },
    // Error
    error() {
      if (!getMuted()) {
        tone({ freq: 200, dur: 0.12, type: 'square', vol: 0.12 });
        tone({ freq: 160, dur: 0.18, type: 'square', vol: 0.12, when: 0.08 });
      }
    },
    // Generic UI tick (button)
    tick() {
      if (!getMuted()) tone({ freq: 1200, dur: 0.04, type: 'sine', vol: 0.06 });
    },
  };

  function getMuted() {
    try {
      const raw = localStorage.getItem('alpexa.prefs');
      if (raw) return JSON.parse(raw).soundMuted === true;
    } catch (e) {}
    return false;
  }

  window.ALPEXA_SFX = sfx;
})();
