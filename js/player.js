/* =========================================================
   听隙 Tingxi · player.js
   播放控制 / 进度拖动 / 音量 / 列表 / 程序化封面 / Web Audio 兜底
   ========================================================= */
(function () {
  "use strict";

  /* -------------------------------------------------------
   * 1. 曲目数据
   *    每首自带「主题色」与「氛围和弦」，无音频文件时由
   *    Web Audio 实时合成柔和的环境 pad，让播放器开箱即响。
   *    如需替换为真实音乐，把对应曲目的 src 指向音频文件即可。
   * ------------------------------------------------------- */
  const PLAYLIST = [
    { title:"月落乌啼", artist:"Tingxi · 夜", motif:"moon",
      rgb:[[96,150,186],[168,197,216],[70,96,140]],
      voice:"piano", tonic:62, scale:"minorP", prog:[0,7,5,3], bpm:62,
      // 下行叹息动机 → 重复 → 发展 → 解决
      melody:[ [3,1],[2,1],[1,2],[2,1],[3,1],[0,2],
               [3,1],[2,1],[1,2],[4,1],[3,1],[2,2],
               [5,1],[4,1],[3,2],[2,1],[3,1],[1,2],
               [3,1],[2,1],[1,2],[2,1],[1,1],[0,2] ], dur:248, src:"" },
    { title:"空山新雨", artist:"Tingxi · 雨", motif:"rain",
      rgb:[[104,150,134],[180,206,196],[70,104,110]],
      voice:"guzheng", tonic:60, scale:"majorP", prog:[0,7,0,7], bpm:72,
      // 上行弧线动机 → 重复上扬 → 高点 → 解决
      melody:[ [0,1],[1,1],[2,2],[2,1],[3,1],[2,2],
               [0,1],[1,1],[2,2],[3,1],[4,1],[3,2],
               [3,1],[4,1],[5,2],[4,1],[3,1],[2,2],
               [0,1],[1,1],[2,2],[2,1],[1,1],[0,2] ], dur:212, src:"" },
    { title:"雾隐千帆", artist:"Tingxi · 雾", motif:"fog",
      rgb:[[126,138,168],[186,196,214],[96,108,138]],
      voice:"flute", tonic:57, scale:"minorP", prog:[0,5,7,5], bpm:52,
      // 长音舒展，留白
      melody:[ [0,2],[3,2],[2,2],[0,2],
               [0,2],[3,2],[4,2],[2,2],
               [5,4],[3,4],
               [0,2],[2,2],[0,4] ], dur:300, src:"" },
    { title:"暮色四合", artist:"Tingxi · 昏", motif:"sun",
      rgb:[[176,120,140],[214,168,150],[110,80,116]],
      voice:"harp", tonic:62, scale:"majorP", prog:[0,7,5,7], bpm:70,
      // 温暖下行
      melody:[ [4,1],[3,1],[2,2],[3,1],[2,1],[0,2],
               [4,1],[3,1],[2,2],[2,1],[1,1],[0,2],
               [5,1],[4,1],[3,2],[2,1],[1,1],[0,2],
               [3,1],[2,1],[0,2],[2,1],[1,1],[0,2] ], dur:224, src:"" },
    { title:"寒江独钓", artist:"Tingxi · 江", motif:"ripple",
      rgb:[[88,150,176],[170,206,218],[60,92,124]],
      voice:"kalimba", tonic:52, scale:"minorP", prog:[0,7,0,5], bpm:60,
      // 疏朗，问答式休止
      melody:[ [0,1],[null,1],[3,2],[2,2],[0,2],
               [0,1],[null,1],[3,2],[4,2],[2,2],
               [3,2],[2,2],[0,2],[null,2],
               [0,2],[null,2],[2,1],[null,1],[0,2] ], dur:276, src:"" },
    { title:"听隙", artist:"Tingxi · 缝", motif:"mountain",
      rgb:[[112,108,178],[172,168,214],[70,70,128]],
      voice:"musicbox", tonic:55, scale:"majorP", prog:[0,5,7,5], bpm:58,
      // 温润，略带跳进
      melody:[ [0,1],[2,1],[3,2],[2,1],[3,1],[0,2],
               [0,1],[2,1],[3,2],[4,1],[3,1],[2,2],
               [5,1],[3,1],[2,2],[3,1],[2,1],[0,2],
               [0,1],[2,1],[3,2],[2,1],[1,1],[0,2] ], dur:260, src:"" },
  ];

  /* -------------------------------------------------------
   * 2. 工具
   * ------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${r < 10 ? "0" : ""}${r}`;
  };

  /* -------------------------------------------------------
   * 2b. 乐理与作曲：五声音阶 + 级进旋律生成
   * ------------------------------------------------------- */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 五声音阶（半音偏移）：天然无半音/三全音，最温和
  const SCALES = {
    majorP: [0, 2, 4, 7, 9],   // 宫调式（大调五声）
    minorP: [0, 3, 5, 7, 10],  // 羽调式（小调五声）
  };
  // 各曲目主奏乐器音色：波形叠加 / 起音 / 衰减 / 低通 / 混响比例，决定听感差异
  const VOICES = {
    piano:    { waves:[["sine",1,.72],["triangle",2,.24],["sine",3,.06]], attack:0.012, decay:2.6, cutoff:2800, vel:.5,  reverb:.34, detune:3 },
    guzheng:  { waves:[["triangle",1,.85],["sawtooth",2,.12]],            attack:0.004, decay:1.5, cutoff:3600, vel:.44, reverb:.30, detune:4 },
    flute:    { waves:[["sine",1,.85],["triangle",2,.10]],               attack:0.10,  decay:3.0, cutoff:2200, vel:.42, reverb:.44, detune:0 },
    harp:     { waves:[["triangle",1,.75],["sine",2,.30],["sine",3,.08]],attack:0.005, decay:2.2, cutoff:3600, vel:.44, reverb:.40, detune:5 },
    kalimba:  { waves:[["sine",1,.95],["sine",2,.30]],                   attack:0.005, decay:1.0, cutoff:2400, vel:.52, reverb:.24, detune:2 },
    musicbox: { waves:[["sine",1,.90],["sine",2,.40],["sine",3,.14],["sine",4,.05]], attack:0.003, decay:2.0, cutoff:3200, vel:.4, reverb:.30, detune:0 },
  };
  // 音级（含跨八度）→ MIDI 音高：deg=0 为调式主音，自动跨八度换算
  // 五声音阶只有 5 个音级（0..4 为本八度，5..9 高八度，-5..-1 低八度）
  function deg2midi(tonic, scaleName, deg) {
    const scale = SCALES[scaleName];
    const n = scale.length;
    const oct = Math.floor(deg / n);
    const i = ((deg % n) + n) % n;
    return tonic + 12 * oct + scale[i];
  }

  /* -------------------------------------------------------
   * 3. 程序化封面（SVG）
   *    渐变 + 月轮 + 极简意境线，每首不同。
   * ------------------------------------------------------- */
  function coverSVG(track) {
    const [[r1, g1, b1], [r2, g2, b2], [r3, g3, b3]] = track.rgb;
    const id = track.motif;
    const g = (a, b, c, d) => `rgb(${a},${b},${c})`;
    let art = "";

    if (track.motif === "moon") {
      // 月光呼吸 + 水面波纹流动
      art = `
        <circle class="cv-moonpulse" cx="62" cy="54" r="44" fill="url(#glow-${id})"/>
        <circle cx="62" cy="54" r="26" fill="rgba(255,255,255,0.92)"/>
        <path class="cv-wave" d="M0 96 Q 50 84 100 96 T 200 96" stroke="rgba(255,255,255,0.30)" stroke-width="1" fill="none"/>
        <path class="cv-wave cv-wave-2" d="M0 112 Q 50 102 100 112 T 200 112" stroke="rgba(255,255,255,0.16)" stroke-width="1" fill="none"/>`;
    } else if (track.motif === "rain") {
      // 雨线下落
      let lines = "";
      for (let i = 0; i < 20; i++) {
        const x = (i * 47) % 200, y1 = (i * 23) % 96;
        lines += `<line class="cv-rain" style="animation-delay:${(i % 7) * -0.16}s" x1="${x}" y1="${y1}" x2="${x - 6}" y2="${y1 + 20}" stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-linecap="round"/>`;
      }
      art = `<circle cx="150" cy="40" r="16" fill="rgba(255,255,255,0.7)"/>${lines}`;
    } else if (track.motif === "fog") {
      // 雾气漂移
      art = `
        <ellipse class="cv-fog" style="animation-delay:0s"    cx="60"  cy="70"  rx="90"  ry="14" fill="rgba(255,255,255,0.12)"/>
        <ellipse class="cv-fog" style="animation-delay:-2s"  cx="120" cy="95"  rx="110" ry="16" fill="rgba(255,255,255,0.09)"/>
        <ellipse class="cv-fog" style="animation-delay:-4s"  cx="80"  cy="115" rx="100" ry="12" fill="rgba(255,255,255,0.07)"/>
        <circle cx="140" cy="44" r="13" fill="rgba(255,255,255,0.6)"/>`;
    } else if (track.motif === "sun") {
      // 日轮脉动
      art = `
        <circle class="cv-sunpulse" cx="100" cy="96" r="72" fill="url(#sun-${id})"/>
        <circle cx="100" cy="96" r="40" fill="rgba(255,238,214,0.92)"/>
        <path class="cv-wave" d="M0 130 Q 60 118 120 126 T 200 128" stroke="rgba(255,255,255,0.40)" stroke-width="1" fill="none"/>`;
    } else if (track.motif === "ripple") {
      // 涟漪外扩
      let r = "";
      for (let i = 1; i <= 5; i++) {
        r += `<ellipse class="cv-ring" style="animation-delay:${-i * 0.55}s" cx="100" cy="110" rx="${20 + i * 16}" ry="${6 + i * 3}" stroke="rgba(255,255,255,0.34)" stroke-width="1" fill="none"/>`;
      }
      art = `<circle cx="100" cy="48" r="14" fill="rgba(255,255,255,0.85)"/>${r}`;
    } else { // mountain
      // 山间流雾
      art = `
        <path d="M0 120 L 55 60 L 90 96 L 120 52 L 160 104 L 200 78 L 200 150 L 0 150 Z" fill="url(#mt-${id})"/>
        <ellipse class="cv-mist" cx="100" cy="98" rx="130" ry="14" fill="rgba(255,255,255,0.13)"/>
        <circle cx="148" cy="40" r="12" fill="rgba(255,255,255,0.85)"/>`;
    }

    return `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-${id}" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stop-color="${g(r1, g1, b1)}"/>
          <stop offset="60%" stop-color="${g(r3, g3, b3)}"/>
          <stop offset="100%" stop-color="${g(r2, g2, b2)}" stop-opacity="0.85"/>
        </linearGradient>
        <radialGradient id="glow-${id}" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="rgba(255,255,255,0.5)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
        <radialGradient id="sun-${id}" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="rgba(255,236,210,0.95)"/>
          <stop offset="100%" stop-color="rgba(214,168,150,0.1)"/>
        </radialGradient>
        <linearGradient id="mt-${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(20,24,40,0.2)"/>
          <stop offset="100%" stop-color="rgba(8,10,20,0.7)"/>
        </linearGradient>
      </defs>
      <rect width="200" height="150" fill="url(#bg-${id})"/>
      ${art}
      <rect width="200" height="150" fill="rgba(10,14,26,0.10)"/>
    </svg>`;
  }

  /* -------------------------------------------------------
   * 4. 音频引擎：真实文件优先，无则 Web Audio 合成环境音
   * ------------------------------------------------------- */
  const Engine = {
    ctx: null,
    master: null,
    synthNodes: null,
    audioEl: null,
    useSynth: true,
    useMidi: false,
    midiAudio: null,
    midiTimers: null,
    midiPlaying: false,
    _musicTime: 0,
    _midiStartCtxTime: 0,
    _gen: 0,

    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();

        // 总线：bus → 高切 → 压缩 → 主音量 → 输出
        this.bus = this.ctx.createGain();
        this.masterLP = this.ctx.createBiquadFilter();
        this.masterLP.type = "lowpass"; this.masterLP.frequency.value = 11000; this.masterLP.Q.value = 0.4;
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -16; this.comp.knee.value = 24; this.comp.ratio.value = 3;
        this.comp.attack.value = 0.01; this.comp.release.value = 0.3;
        this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
        this.bus.connect(this.masterLP); this.masterLP.connect(this.comp);
        this.comp.connect(this.master); this.master.connect(this.ctx.destination);

        // 卷积混响：合成指数衰减噪声脉冲响应，营造空间
        this.reverbIn = this.ctx.createGain(); this.reverbIn.gain.value = 1;
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this._makeIR(3.2, 2.6);
        this.reverbReturn = this.ctx.createGain(); this.reverbReturn.gain.value = 0.5;
        this.reverbIn.connect(this.reverb); this.reverb.connect(this.reverbReturn);
        this.reverbReturn.connect(this.bus);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },

    // 合成混响脉冲响应（立体声指数衰减白噪）
    _makeIR(seconds, decay) {
      const ctx = this.ctx, rate = ctx.sampleRate, len = (rate * seconds) | 0;
      const buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    },

    // 启动某首曲目的音源
    load(track) {
      this.stopSource();
      if (track.type === "midi") {            // MIDI 曲目：用 SoundFont 引擎
        this.useMidi = true; this.useSynth = false; this.midiTrack = track;
        return;
      }
      this.useMidi = false;
      if (track.src) {                        // 真实音频文件
        this.useSynth = false;
        if (!this.audioEl) {
          this.audioEl = new Audio();
          this.audioEl.crossOrigin = "anonymous";
          this.audioEl.preload = "auto";
        }
        this.audioEl.src = track.src;
      } else {                                // 合成编曲
        this.useSynth = true;
      }
    },

    async play(track) {
      this.ensureCtx();
      this.stopSource();
      if (this.useMidi) {
        const gen = this._gen;
        await this._ensureMidi(track);
        if (gen !== this._gen) return;            // 等待期间已被停止/切歌，放弃
        this.startMidi(track);
        return;
      }
      if (!this.useSynth && this.audioEl) {
        if (!this._mediaSrc) {
          this._mediaSrc = this.ctx.createMediaElementSource(this.audioEl);
          this._mediaSrc.connect(this.bus);
        }
        this.audioEl.play().catch(() => {});   // 位置由元素自身维持（加载后为 0，暂停后续播）
      } else {
        this.startSynth(track);
      }
    },

    /* ---- MIDI：加载音色 + 调度 ---- */
    async _ensureMidi(track) {
      this.ensureCtx();
      if (!this.midiAudio) {
        this.midiAudio = new TingxiMidi.MidiAudioEngine();
        this.midiAudio.init(this.ctx, this.bus);
      }
      const progs = new Set(track.midi.notes.map((n) => n.program || 0));
      for (const p of progs) {
        if (p === 0) { if (this.midiAudio.pianoSamples.size === 0) await this.midiAudio.loadPiano(); }
        else await this.midiAudio.loadInstrument(p);
      }
    },
    async prepareMidi(track) { try { await this._ensureMidi(track); } catch (e) {} },

    startMidi(track) {
      const ctx = this.ctx;
      if (this.midiTimers) this.midiTimers.forEach(clearTimeout);
      this.midiTimers = [];
      const offset = this._musicTime || 0;
      this._midiStartCtxTime = ctx.currentTime - offset;
      this.midiPlaying = true;
      const inst = this.midiAudio;
      for (const note of track.midi.notes) {
        const start = note.time, end = note.time + note.duration;
        if (end <= offset) continue;
        const delay = Math.max(0, start - offset);
        const remDur = end - Math.max(offset, start);
        const p = note.program || 0;
        const onT = setTimeout(() => inst.noteOn(note.midi, note.velocity || 90, p), delay * 1000);
        const offT = setTimeout(() => inst.noteOff(note.midi, p), (delay + remDur) * 1000);
        this.midiTimers.push(onT, offT);
      }
    },

    startSynth(track) {
      const ctx = this.ctx;
      // 本曲独立总线，整段淡入 / 淡出
      this.synthBus = ctx.createGain();
      this.synthBus.gain.value = 0.0001;
      this.synthBus.connect(this.bus);
      const now = ctx.currentTime;
      this.synthBus.gain.setValueAtTime(0.0001, now);
      this.synthBus.gain.exponentialRampToValueAtTime(0.38, now + 1.8); // 合成轨整体降 ~8dB，避免过响

      const me = this;
      const v = VOICES[track.voice] || VOICES.piano;
      // 主奏：按音色预设叠加波形，经低通塑形，按比例送混响；vel 控制单音力度
      const note = (time, midi, vel) => {
        const peak = (vel == null ? v.vel : vel);
        const f = mtof(midi);
        const g = ctx.createGain(); g.gain.value = 0.0001;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.value = v.cutoff; lp.Q.value = 0.5;
        g.connect(lp); lp.connect(me.synthBus);
        const send = ctx.createGain(); send.gain.value = v.reverb;
        lp.connect(send); send.connect(me.reverbIn);
        const dur = v.attack + v.decay;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(peak, time + v.attack);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        v.waves.forEach(([type, mult, gn], i) => {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
          o.detune.value = v.detune ? (i % 2 ? v.detune : -v.detune) : 0;
          const og = ctx.createGain(); og.gain.value = gn;
          o.connect(og); og.connect(g); o.start(time); o.stop(time + dur + 0.2);
        });
      };
      // 和声垫：按调式取大/小三和弦 + 八度，温暖铺底（替代空洞的根-五-八）
      const pad = (time, rootMidi, dur) => {
        const third = track.scale === "majorP" ? 4 : 3;
        const chord = [rootMidi, rootMidi + third, rootMidi + 7, rootMidi + 12];
        const g = ctx.createGain(); g.gain.value = 0.0001;
        const filt = ctx.createBiquadFilter(); filt.type = "lowpass";
        filt.frequency.value = 900; filt.Q.value = 0.4;
        g.connect(filt); filt.connect(me.synthBus);
        const send = ctx.createGain(); send.gain.value = 0.4; filt.connect(send); send.connect(me.reverbIn);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.2, time + 2.0);
        g.gain.setTargetAtTime(0.0001, time + dur - 0.6, 1.4);
        chord.forEach((m, i) => {
          const f = mtof(m);
          [-5, 5].forEach((det) => {
            const o = ctx.createOscillator(); o.type = "triangle";
            o.frequency.value = f; o.detune.value = det;
            const og = ctx.createGain(); og.gain.value = i === 0 ? 0.5 : 0.26;
            o.connect(og); og.connect(g); o.start(time); o.stop(time + dur + 1.8);
          });
        });
      };
      // 低音：纯正弦长音铺底
      const bass = (time, rootMidi, dur) => {
        const f = mtof(rootMidi), g = ctx.createGain(); g.gain.value = 0.0001;
        g.connect(me.synthBus);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.22, time + 1.4);
        g.gain.setTargetAtTime(0.0001, time + dur - 0.6, 1.2);
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        o.connect(g); o.start(time); o.stop(time + dur + 1.2);
      };

      // —— 以 _musicTime 为唯一时间真相：决定该奏哪个音 / 哪个和声 ——
      const beat = 60 / track.bpm;
      const melody = track.melody;
      const evBeat = melody.map((m) => m[1]);
      const evOffset = []; { let acc = 0; evBeat.forEach((b) => { evOffset.push(acc); acc += b; }); }
      const loopSec = evOffset[evOffset.length - 1] * beat + evBeat[evBeat.length - 1] * beat;
      const padEvery = 8;                 // 每 8 拍（2 小节）换和声
      const padSec = padEvery * beat;
      const bassRoot = track.tonic - 24;

      // 由音乐时间定位下一个旋律事件（跨循环换算）
      const onsetAfter = (mt) => {
        const loops = Math.floor(mt / loopSec);
        const within = mt - loops * loopSec;
        let i = evOffset.findIndex((off) => off * beat >= within - 1e-6);
        if (i === -1) return { i: 0, mt: (loops + 1) * loopSec };
        return { i, mt: loops * loopSec + evOffset[i] * beat };
      };

      this._musicTime = this._musicTime || 0;
      let o = onsetAfter(this._musicTime); let evI = o.i, nextEvMt = o.mt;
      let nextPadMt = Math.ceil(this._musicTime / padSec - 1e-6) * padSec;
      let lastTick = ctx.currentTime;

      // seek 时重定位调度指针
      this._reposition = () => {
        o = onsetAfter(this._musicTime); evI = o.i; nextEvMt = o.mt;
        nextPadMt = Math.ceil(this._musicTime / padSec - 1e-6) * padSec;
        lastTick = ctx.currentTime;
      };

      const tick = () => {
        const t2 = ctx.currentTime;
        const dt = t2 - lastTick; lastTick = t2;
        me._musicTime += dt;
        const ahead = 0.15;
        // 和声：垫音固定在主和弦（根三五皆在五声音阶内，绝不撞旋律）；低音游走制造色彩
        while (nextPadMt < me._musicTime + ahead) {
          const at = t2 + (nextPadMt - me._musicTime);
          const off = track.prog[Math.round(nextPadMt / padSec) % track.prog.length];
          pad(at, track.tonic - 12, padSec * 1.05);
          bass(at, bassRoot + off, padSec * 1.05);
          nextPadMt += padSec;
        }
        // 旋律：单线条干净地"唱"；力度随乐句弧线起伏，强拍略重，轻微人性化
        while (nextEvMt < me._musicTime + ahead) {
          const at = t2 + (nextEvMt - me._musicTime) + (Math.random() - 0.5) * 0.010;
          const [deg] = melody[evI];
          if (deg !== null) {
            const loopPos = ((nextEvMt % loopSec) + loopSec) % loopSec / loopSec;     // 0..1 一轮内
            const swell = 0.88 + 0.20 * Math.sin(loopPos * Math.PI);                  // 中段略强
            const beatPos = ((nextEvMt / beat) % 4 + 4) % 4;                          // 小节内位置
            const downbeat = beatPos < 0.12 || beatPos > 3.88;
            const human = 0.96 + 0.08 * Math.random();
            const vel = Math.min(0.8, v.vel * swell * (downbeat ? 1.12 : 0.92) * human);
            note(at, deg2midi(track.tonic, track.scale, deg), vel);
          }
          nextEvMt += evBeat[evI] * beat;
          evI = (evI + 1) % melody.length;
        }
      };
      this._sched = setInterval(tick, 25);
      tick();
    },

    stopSource() {
      this._gen++;
      if (this._sched) { clearInterval(this._sched); this._sched = null; }
      this._reposition = null;
      if (this.midiTimers) { this.midiTimers.forEach(clearTimeout); this.midiTimers = []; }
      this.midiPlaying = false; this._midiStartCtxTime = 0;
      if (this.midiAudio) this.midiAudio.allNotesOff();
      if (this.synthBus) {
        const now = this.ctx.currentTime;
        try {
          this.synthBus.gain.cancelScheduledValues(now);
          this.synthBus.gain.setValueAtTime(this.synthBus.gain.value, now);
          this.synthBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        } catch (e) {}
        const bus = this.synthBus; this.synthBus = null;
        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1200);
      }
      if (this.audioEl) { this.audioEl.pause(); }
    },

    setVolume(v) {
      this.ensureCtx();
      this.master.gain.setTargetAtTime(clamp(v, 0, 1), this.ctx.currentTime, 0.05);
      if (this.audioEl) this.audioEl.volume = clamp(v, 0, 1);
    },

    // 播放位置（合成音/MIDI 以 _musicTime 为唯一真相；真实音频读元素）
    getTime(track) {
      if (!this.useSynth && !this.useMidi && this.audioEl && this.audioEl.duration) {
        return { cur: this.audioEl.currentTime, total: this.audioEl.duration };
      }
      return { cur: Math.min(this._musicTime || 0, track.dur), total: track.dur };
    },

    seekTo(track, sec) {
      const s = Math.max(0, Math.min(sec, track.dur));
      if (this.useMidi) {
        this._musicTime = s;
        if (this.midiPlaying) this.startMidi(track);   // 从新位置重新调度
        return;
      }
      if (!this.useSynth && this.audioEl) {
        try { this.audioEl.currentTime = s; } catch (e) {}
      } else {
        this._musicTime = s;                 // 拖动 = 真的跳到那段旋律
        if (this._reposition) this._reposition();
      }
    },

    resetPosition() { this._musicTime = 0; },
  };

  /* -------------------------------------------------------
   * 5. 播放器状态与 UI
   * ------------------------------------------------------- */
  const STORE_KEY = "tingxi_volume";
  const loadVolume = () => {
    const v = parseFloat(localStorage.getItem(STORE_KEY));
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  };
  // 滑块位置(0..1) → 实际增益：指数曲线，感知近似线性（每 0.1 ≈ 6dB）；上限封顶 0.6 防止过响
  const MAX_GAIN = 0.6;
  const volToGain = (p) => {
    const x = clamp(p, 0, 1);
    if (x <= 0.001) return 0;            // 拉到底 = 真静音
    return MAX_GAIN * Math.pow(10, (x - 1) * 3);
  };
  const state = {
    index: 0,
    playing: false,
    volume: loadVolume(),
    muted: false,
    lastVolume: loadVolume() || 0.7,
  };

  const els = {
    player: $("player"),
    cover: $("cover"),
    title: $("trackTitle"),
    artist: $("trackArtist"),
    playBtn: $("playBtn"),
    iconPlay: $("iconPlay"),
    iconPause: $("iconPause"),
    prevBtn: $("prevBtn"),
    nextBtn: $("nextBtn"),
    progress: $("progress"),
    fill: $("progressFill"),
    thumb: $("progressThumb"),
    cur: $("currentTime"),
    total: $("totalTime"),
    muteBtn: $("muteBtn"),
    volBar: $("volumeBar"),
    volFill: $("volumeFill"),
    volThumb: $("volumeThumb"),
    volume: document.querySelector(".volume"),
    iconVolume: $("iconVolume"),
    plToggle: $("plToggle"),
    plClose: $("plClose"),
    playlist: $("playlist"),
    items: $("playlistItems"),
    scrim: $("scrim"),
    aurora: $("aurora"),
    midiAdd: $("midiAdd"),
    midiInput: $("midiInput"),
    toast: $("toast"),
  };

  function currentTrack() { return PLAYLIST[state.index]; }

  // 应用主题色（背景 + 光晕）
  function applyTheme(track) {
    const [c1, c2, c3] = track.rgb;
    const root = document.documentElement.style;
    root.setProperty("--theme-1", `${c1[0]}, ${c1[1]}, ${c1[2]}`);
    root.setProperty("--theme-2", `${c2[0]}, ${c2[1]}, ${c2[2]}`);
    root.setProperty("--theme-3", `${c3[0]}, ${c3[1]}, ${c3[2]}`);
    if (window.TingxiAtmosphere) window.TingxiAtmosphere.setTheme(c1);
  }

  // 渲染当前曲目信息
  function renderTrack() {
    const t = currentTrack();
    els.title.textContent = t.title;
    els.artist.textContent = t.artist;
    els.cover.innerHTML = coverSVG(t);
    applyTheme(t);
    const { total } = Engine.getTime(t);
    els.total.textContent = fmt(total || t.dur);
    renderPlaylist();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: "听隙 Tingxi",
      });
    }
  }

  // 渲染播放列表
  function renderPlaylist() {
    els.items.innerHTML = PLAYLIST.map((t, i) => `
      <li class="track-item ${i === state.index ? "is-active" : ""} ${i === state.index && state.playing ? "is-playing" : ""}" data-i="${i}">
        <div class="track-item__cover">${coverSVG(t)}</div>
        <div class="track-item__body">
          <div class="track-item__title">${t.title}</div>
          <div class="track-item__meta">${t.artist}</div>
        </div>
        <div class="track-item__equalizer" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="track-item__dur">${fmt(t.dur)}</div>
      </li>`).join("");
    els.items.querySelectorAll(".track-item").forEach((li) => {
      li.addEventListener("click", () => {
        const i = +li.dataset.i;
        if (i === state.index) { togglePlay(); }
        else { selectTrack(i, true); }
      });
    });
  }

  // 选择某首曲目；keepPlaying 表示是否维持原播放状态继续播放
  function selectTrack(i, keepPlaying) {
    const wasPlaying = state.playing;
    stopLoop();
    Engine.stopSource();
    Engine.resetPosition();
    state.index = (i + PLAYLIST.length) % PLAYLIST.length;
    Engine.load(currentTrack());
    renderTrack();
    if (keepPlaying || wasPlaying) startPlayback();
    else updateProgress();
  }

  function startPlayback() {
    Engine.ensureCtx();
    const t = currentTrack();
    state.playing = true;
    Engine.play(t);
    els.iconPlay.style.display = "none";
    els.iconPause.style.display = "";
    els.player.classList.add("is-playing");
    renderPlaylist();
    startLoop();
  }
  function pausePlayback() {
    if (!state.playing) return;
    stopLoop();
    state.playing = false;
    Engine.stopSource();            // _musicTime 在 Engine 上保留，恢复时续播
    els.iconPlay.style.display = "";
    els.iconPause.style.display = "none";
    els.player.classList.remove("is-playing");
    renderPlaylist();
  }
  function togglePlay() { state.playing ? pausePlayback() : startPlayback(); }

  function next() { selectTrack(state.index + 1, state.playing); }
  function prev() {
    const t = currentTrack();
    const { cur } = Engine.getTime(t);
    if (cur > 3) { seekTo(0); }
    else { selectTrack(state.index - 1, state.playing); }
  }

  /* ---- 进度循环（单实例，可取消） ---- */
  function updateProgress() {
    const t = currentTrack();
    const { cur, total } = Engine.getTime(t);
    const p = clamp(cur / (total || t.dur), 0, 1);
    els.fill.style.width = (p * 100) + "%";
    els.thumb.style.left = (p * 100) + "%";
    els.cur.textContent = fmt(cur);
    els.total.textContent = fmt(total || t.dur);
  }
  let rafId = null;
  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function loop() {
    if (!state.playing) { rafId = null; return; }
    const t = currentTrack();
    // MIDI：按音频时钟推进位置（与 setTimeout 调度同步）
    if (Engine.useMidi && Engine._midiStartCtxTime) {
      Engine._musicTime = Engine.ctx.currentTime - Engine._midiStartCtxTime;
    }
    const { cur, total } = Engine.getTime(t);
    if (total > 0 && cur >= total) { rafId = null; next(); return; }   // 合成音 / MIDI / 真实音频通用
    updateProgress();
    rafId = requestAnimationFrame(loop);
  }

  /* ---- 拖动进度 ---- */
  function bindDrag(barEl, onValue) {
    let dragging = false;
    const calc = (e) => {
      const rect = barEl.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return clamp(x / rect.width, 0, 1);
    };
    const down = (e) => {
      dragging = true;
      barEl.parentElement.classList.add("dragging");
      onValue(calc(e), true);
      e.preventDefault();
    };
    const move = (e) => { if (!dragging) return; onValue(calc(e), true); };
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      barEl.parentElement.classList.remove("dragging");
      onValue(calc(e), false);
    };
    barEl.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function seekTo(p) {
    const t = currentTrack();
    const { total } = Engine.getTime(t);
    const sec = p * (total || t.dur);
    Engine.seekTo(t, sec);
    updateProgress();
  }

  bindDrag(els.progress.querySelector(".progress__track"), (p) => seekTo(p));
  bindDrag(els.volBar, (p) => setVolume(p));

  // 音量图标四级：0 静音 / 1 低 / 2 中 / 3 高
  const SPK = '<path d="M4 9v6h4l5 4V5L8 9H4z"/>';
  const VOL_ICONS = [
    SPK + '<path d="M17 9l4 6M21 9l-4 6"/>',                                   // 0 静音（×）
    SPK,                                                                        // 1 低（无波）
    SPK + '<path d="M15 9.5a3.5 3.5 0 010 5"/>',                                // 2 中（一道波）
    SPK + '<path d="M15 9.5a3.5 3.5 0 010 5"/><path d="M18 7a8 8 0 010 10"/>',  // 3 高（两道波）
  ];
  function volLevel(v) { return v <= 0.001 ? 0 : v < 0.34 ? 1 : v < 0.67 ? 2 : 3; }

  function setVolume(v) {
    v = clamp(v, 0, 1);
    state.volume = v;
    state.muted = v === 0;
    if (v > 0) state.lastVolume = v;
    Engine.setVolume(state.muted ? 0 : volToGain(v));   // 指数曲线，感知均匀
    els.volFill.style.width = (v * 100) + "%";
    els.volThumb.style.left = (v * 100) + "%";
    els.volume.classList.toggle("is-muted", state.muted);
    els.muteBtn.title = state.muted ? "取消静音" : "静音";
    els.iconVolume.innerHTML = VOL_ICONS[volLevel(v)];   // 四级图标切换
    try { localStorage.setItem(STORE_KEY, String(v)); } catch (e) {}   // 永久记忆音量
  }

  /* ---- 控件绑定 ---- */
  els.playBtn.addEventListener("click", togglePlay);
  els.nextBtn.addEventListener("click", next);
  els.prevBtn.addEventListener("click", prev);
  els.muteBtn.addEventListener("click", () => {
    if (state.muted) setVolume(state.lastVolume || 0.7);
    else { state.lastVolume = state.volume; setVolume(0); }
  });

  /* ---- 播放列表开关 ---- */
  function openPlaylist(open) {
    els.playlist.classList.toggle("open", open);
    els.playlist.setAttribute("aria-hidden", String(!open));
    els.scrim.classList.toggle("show", open);
  }
  els.plToggle.addEventListener("click", () => openPlaylist(true));
  els.plClose.addEventListener("click", () => openPlaylist(false));
  els.scrim.addEventListener("click", () => openPlaylist(false));

  /* ---- 真实音频结束时自动下一首 ---- */
  // 合成音的结束已在 loop 中处理；真实音频在此轮询
  setInterval(() => {
    if (!state.playing) return;
    if (!Engine.useSynth && Engine.audioEl && Engine.audioEl.ended) {
      next();
    }
  }, 800);

  /* ---- 键盘快捷键 ---- */
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") next();
    else if (e.code === "ArrowLeft") prev();
    else if (e.code === "ArrowUp") { e.preventDefault(); setVolume(state.volume + 0.05); }
    else if (e.code === "ArrowDown") { e.preventDefault(); setVolume(state.volume - 0.05); }
  });

  /* ---- 媒体键（部分浏览器） ---- */
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", startPlayback);
    navigator.mediaSession.setActionHandler("pause", pausePlayback);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("nexttrack", next);
  }

  /* ---- 添加 MIDI 文件 ---- */
  const MIDI_MOTIFS = ["moon", "rain", "fog", "sun", "ripple", "mountain"];
  const MIDI_PALETTES = [
    [[150, 140, 120], [210, 196, 168], [104, 92, 76]],
    [[120, 150, 170], [180, 200, 214], [80, 104, 128]],
    [[160, 130, 160], [206, 178, 206], [104, 84, 116]],
    [[130, 160, 140], [188, 208, 196], [84, 110, 96]],
    [[170, 140, 120], [214, 188, 168], [112, 88, 76]],
    [[110, 130, 170], [170, 186, 214], [70, 84, 120]],
  ];
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  function makeMidiTrack(title, midi) {
    const inst = [...new Set(midi.notes.map((n) => n.instrumentName))].slice(0, 3).join(" · ");
    const h = hashStr(title);
    return {
      type: "midi",
      title,
      artist: "MIDI · " + (inst || "多声部"),
      motif: MIDI_MOTIFS[h % MIDI_MOTIFS.length],
      rgb: MIDI_PALETTES[h % MIDI_PALETTES.length],
      midi,
      dur: Math.max(1, Math.round(midi.duration)),
      src: "",
    };
  }

  let toastTimer = null;
  function showToast(msg, ms = 2600) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), ms);
  }

  async function addMidiFile(file) {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = TingxiMidi.parseMidi(buf);
      if (!parsed.notes || !parsed.notes.length) throw new Error("empty");
      const name = file.name.replace(/\.(mid|midi)$/i, "");
      const track = makeMidiTrack(name, parsed);
      PLAYLIST.push(track);
      renderPlaylist();
      Engine.prepareMidi(track);                 // 后台预载音色
      showToast(`已添加：${name}（${parsed.notes.length} 音符）`);
    } catch (e) {
      showToast("无法解析该 MIDI 文件");
    }
  }

  if (els.midiAdd && els.midiInput) {
    els.midiAdd.addEventListener("click", () => els.midiInput.click());
    els.midiInput.addEventListener("change", (e) => {
      for (const f of e.target.files) addMidiFile(f);
      e.target.value = "";
    });
    // 拖拽到播放器也可添加
    els.player.addEventListener("dragover", (e) => { e.preventDefault(); });
    els.player.addEventListener("drop", (e) => {
      e.preventDefault();
      for (const f of e.dataTransfer.files) {
        if (/\.(mid|midi)$/i.test(f.name)) addMidiFile(f);
      }
    });
  }

  /* ---- 初始化 ---- */
  Engine.load(currentTrack());
  setVolume(state.volume);
  renderTrack();
  updateProgress();
})();
