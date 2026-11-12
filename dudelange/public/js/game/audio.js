/** Tiny procedural audio engine (WebAudio, zero assets). */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.weather = 'clear';
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // wind noise bed
    const noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noise;

    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(filter).connect(this.windGain).connect(this.master);
    src.start();
    this.windFilter = filter;

    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = noise;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1600;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    this.tick();
  }

  resume() { this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  tick() {
    if (!this.ctx) return;
    if (this.windGain) {
      const target = this.weather === 'rain' ? 0.1 : this.weather === 'fog' ? 0.02 : 0.05;
      this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2);
      if (this.windFilter) this.windFilter.frequency.setTargetAtTime(this.weather === 'rain' ? 900 : 380, this.ctx.currentTime, 1.5);
    }
    this.rainGain && this.rainGain.gain.setTargetAtTime(this.weather === 'rain' ? 0.16 : 0, this.ctx.currentTime, 1.5);
    setTimeout(() => this.tick(), 4000);
  }

  setWeather(w) { this.weather = w; }

  blip(freq = 620, dur = 0.06, type = 'sine', gain = 0.04) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  step(surface = 'paving') {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = surface === 'grass' ? 320 : 900;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.12);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + 0.14);
  }

  ui(up = true) { this.blip(up ? 680 : 420, 0.05, 'triangle', 0.03); }
  buy() { this.blip(880, 0.07, 'sine', 0.05); setTimeout(() => this.blip(1180, 0.08, 'sine', 0.04), 70); }
  quest() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.14, 'sine', 0.05), i * 110)); }
  door() { this.blip(220, 0.16, 'sine', 0.05); }
  drink() { this.blip(1240, 0.05, 'triangle', 0.035); setTimeout(() => this.blip(820, 0.09, 'sine', 0.03), 60); }
  crash() { this.blip(90, 0.18, 'sawtooth', 0.06); setTimeout(() => this.blip(60, 0.22, 'square', 0.04), 40); }
  chime() { this.blip(988, 0.16, 'sine', 0.045); setTimeout(() => this.blip(740, 0.22, 'sine', 0.04), 170); }
  burp() { this.blip(140, 0.16, 'sawtooth', 0.03); }
  horn() {
    if (!this.ctx) return;
    [311, 392].forEach((f) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.9);
      o.connect(g).connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + 1);
    });
  }
  engine(on) {
    if (!this.ctx) return;
    if (on) {
      if (this.engineOsc) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 60;
      g.gain.value = 0.02;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 300;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      this.engineOsc = o; this.engineGain = g;
    } else if (this.engineOsc) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.engineOsc.stop(this.ctx.currentTime + 0.4);
      this.engineOsc = null;
    }
  }
  enginePitch(v) {
    if (!this.engineOsc) return;
    this.engineOsc.frequency.setTargetAtTime(48 + v * 9, this.ctx.currentTime, 0.12);
  }
}
