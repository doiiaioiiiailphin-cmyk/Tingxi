/* =========================================================
   听隙 Tingxi · MIDI 音频引擎
   移植自 open-midi-piano (GPL-3.0)。SoundFont 优先（联网），
   无样本时回落到合成钢琴。复用听隙的 AudioContext 与总线，
   音量由听隙主控统一管理。
   ========================================================= */
(function () {
  "use strict";

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const GM_PROGRAMS = [
    'acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano',
    'electric_piano_1','electric_piano_2','harpsichord','clavinet',
    'celesta','glockenspiel','music_box','vibraphone',
    'marimba','xylophone','tubular_bells','dulcimer',
    'drawbar_organ','percussive_organ','rock_organ','church_organ',
    'reed_organ','accordion','harmonica','tango_accordion',
    'acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz','electric_guitar_clean',
    'electric_guitar_muted','overdriven_guitar','distortion_guitar','guitar_harmonics',
    'acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass',
    'slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2',
    'violin','viola','cello','contrabass',
    'tremolo_strings','pizzicato_strings','orchestral_harp','timpani',
    'string_ensemble_1','string_ensemble_2','synth_strings_1','synth_strings_2',
    'choir_aahs','voice_oohs','synth_choir','orchestra_hit',
    'trumpet','trombone','tuba','muted_trumpet',
    'french_horn','brass_section','synth_brass_1','synth_brass_2',
    'soprano_sax','alto_sax','tenor_sax','baritone_sax',
    'oboe','english_horn','bassoon','clarinet',
    'piccolo','flute','recorder','pan_flute',
    'blown_bottle','shakuhachi','whistle','ocarina',
    'lead_1_square','lead_2_sawtooth','lead_3_calliope','lead_4_chiff',
    'lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass_lead',
    'pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir',
    'pad_5_bowed','pad_6_metallic','pad_7_halo','pad_8_sweep',
    'fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere',
    'fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_scifi',
    'sitar','banjo','shamisen','koto',
    'kalimba','bagpipe','fiddle','shanai',
    'tinkle_bell','agogo','steel_drums','woodblock',
    'taiko_drum','melodic_tom','synth_drum','reverse_cymbal',
    'guitar_fret_noise','breath_noise','seashore','bird_tweet',
    'telephone_ring','helicopter','applause','gunshot'
  ];

  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function midiToNoteName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return `${NOTE_NAMES[midi % 12]}${octave}`;
  }

  class MidiAudioEngine {
    constructor() {
      this.ctx = null;
      this.compressor = null;
      this.reverb = null;
      this.master = null;
      this.pianoSamples = new Map();
      this.instrumentBanks = new Map();
      this.activeNotes = new Map();
    }

    // 复用听隙的 ctx，输出接到听隙总线（音量由听隙主控）
    init(ctx, output) {
      this.ctx = ctx;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.master = ctx.createGain(); this.master.gain.value = 1.0;
      this.reverb = this._createReverb();
      const reverbGain = ctx.createGain(); reverbGain.gain.value = 0.18;
      this.compressor.connect(this.master);
      this.reverb.connect(reverbGain); reverbGain.connect(this.master);
      this.master.connect(output);
    }

    _createReverb() {
      const length = this.ctx.sampleRate * 1.6;
      const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
      const conv = this.ctx.createConvolver(); conv.buffer = impulse; return conv;
    }

    async loadPiano(onProgress) { return this._load('acoustic_grand_piano', this.pianoSamples, onProgress); }
    async loadInstrument(program, onProgress) {
      const name = GM_PROGRAMS[program];
      if (!name || this.instrumentBanks.has(name)) return true;
      const m = new Map();
      const ok = await this._load(name, m, onProgress);
      if (ok) this.instrumentBanks.set(name, m);
      return ok;
    }

    async _load(instrumentName, targetMap, onProgress) {
      try {
        window.MIDI = window.MIDI || { Soundfont: {} };
        window.MIDI.Soundfont = window.MIDI.Soundfont || {};
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/${instrumentName}-mp3.js`;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        const sfData = window.MIDI.Soundfont[instrumentName];
        if (!sfData) throw new Error('no data');
        const names = Object.keys(sfData);
        let decoded = 0;
        for (const nn of names) {
          try {
            const midi = this._noteNameToMidi(nn);
            if (midi === null) continue;
            const base64 = sfData[nn].split(',')[1];
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const buf = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
            targetMap.set(midi, buf);
            decoded++;
            if (onProgress) onProgress(decoded / names.length);
          } catch (_) {}
        }
        return true;
      } catch (e) { return false; }
    }

    _noteNameToMidi(name) {
      const M = { 'C':0,'C#':1,'Cs':1,'Db':1,'D':2,'D#':3,'Ds':3,'Eb':3,'E':4,'F':5,'F#':6,'Fs':6,'Gb':6,'G':7,'G#':8,'Gs':8,'Ab':8,'A':9,'A#':10,'As':10,'Bb':10,'B':11 };
      const m = name.match(/^([A-G][#sb]?)(\d+)$/);
      if (!m) return null;
      const n = M[m[1]]; if (n === undefined) return null;
      return (parseInt(m[2]) + 1) * 12 + n;
    }

    _getSamples(program) {
      if (program === undefined || program === 0) return this.pianoSamples;
      const name = GM_PROGRAMS[program];
      if (name && this.instrumentBanks.has(name)) return this.instrumentBanks.get(name);
      return this.pianoSamples;
    }

    noteOn(midiNote, velocity = 100, program = 0) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const key = `${program}_${midiNote}`;
      if (this.activeNotes.has(key)) this.noteOff(midiNote, program);
      const samples = this._getSamples(program);
      if (samples.size > 0 && samples.has(midiNote)) return this._playSF(midiNote, velocity, program);
      return this._playSynth(midiNote, velocity, program);
    }

    _playSF(midiNote, velocity, program) {
      const sample = this._getSamples(program).get(midiNote);
      if (!sample) return this._playSynth(midiNote, velocity, program);
      const src = this.ctx.createBufferSource(); src.buffer = sample;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime((velocity / 127) * 0.9, this.ctx.currentTime);
      src.connect(g); g.connect(this.compressor); g.connect(this.reverb);
      src.start(0);
      const key = `${program}_${midiNote}`;
      const handle = { source: src, gainNode: g, type: 'sf', key };
      this.activeNotes.set(key, handle);
      return handle;
    }

    _playSynth(midiNote, velocity, program) {
      const freq = midiToFreq(midiNote), now = this.ctx.currentTime, vel = velocity / 127;
      const g = this.ctx.createGain();
      const harmonics = [
        { r: 1, a: 1.0, t: 'triangle' }, { r: 2, a: 0.35, t: 'sine' }, { r: 3, a: 0.2, t: 'sine' },
        { r: 4, a: 0.1, t: 'sine' }, { r: 5, a: 0.05, t: 'sine' }, { r: 6, a: 0.025, t: 'sine' },
      ];
      const oscs = [];
      for (const h of harmonics) {
        const o = this.ctx.createOscillator(); o.type = h.t; o.frequency.value = freq * h.r;
        o.detune.value = (Math.random() - 0.5) * 2;
        const hg = this.ctx.createGain(); hg.gain.value = h.a * vel * 0.35;
        o.connect(hg); hg.connect(g); oscs.push(o);
      }
      const attack = 0.005, decay = 0.15;
      const peak = vel * 0.9, sustain = Math.max(0.6 * vel, 0.001);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + attack);
      g.gain.exponentialRampToValueAtTime(sustain, now + attack + decay);
      g.connect(this.compressor); g.connect(this.reverb);
      oscs.forEach(o => o.start(now));
      const key = `synth_${program}_${midiNote}`;
      const handle = { oscillators: oscs, noteGain: g, type: 'synth', key };
      this.activeNotes.set(key, handle);
      return handle;
    }

    noteOff(midiNote, program = 0) {
      const key = `${program}_${midiNote}`;
      const h = this.activeNotes.get(key) || this.activeNotes.get(`synth_${program}_${midiNote}`);
      if (h) this._release(h);
    }

    _release(h) {
      const now = this.ctx.currentTime;
      if (h.type === 'sf') {
        h.gainNode.gain.cancelScheduledValues(now);
        h.gainNode.gain.setValueAtTime(h.gainNode.gain.value, now);
        h.gainNode.gain.linearRampToValueAtTime(0, now + 0.25);
        h.source.stop(now + 0.3);
      } else {
        h.noteGain.gain.cancelScheduledValues(now);
        h.noteGain.gain.setValueAtTime(h.noteGain.gain.value, now);
        h.noteGain.gain.linearRampToValueAt(0, now + 0.25);
        h.oscillators.forEach(o => o.stop(now + 0.3));
      }
      this.activeNotes.delete(h.key);
    }

    allNotesOff() {
      [...this.activeNotes.values()].forEach(h => this._release(h));
      this.activeNotes.clear();
    }
  }

  window.TingxiMidi = window.TingxiMidi || {};
  Object.assign(window.TingxiMidi, { MidiAudioEngine, GM_PROGRAMS, midiToFreq, midiToNoteName });
})();
