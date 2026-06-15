/* =========================================================
   听隙 Tingxi · MIDI 解析器
   移植自 open-midi-piano (GPL-3.0)，适配为全局脚本。
   输入 ArrayBuffer，输出 { notes, duration, instruments, ticksPerBeat }。
   ========================================================= */
(function () {
  "use strict";

  const INSTRUMENT_CATEGORIES = [
    { id: 'piano', name: '钢琴', programs: range(0, 8) },
    { id: 'organ', name: '风琴', programs: range(16, 8) },
    { id: 'guitar', name: '吉他', programs: range(24, 8) },
    { id: 'bass', name: '贝斯', programs: range(32, 8) },
    { id: 'strings', name: '弦乐', programs: range(40, 16) },
    { id: 'brass', name: '铜管', programs: range(56, 8) },
    { id: 'reed', name: '簧管', programs: range(64, 8) },
    { id: 'pipe', name: '管乐', programs: range(72, 8) },
    { id: 'synth_lead', name: '合成主音', programs: range(80, 8) },
    { id: 'synth_pad', name: '合成垫', programs: range(88, 8) },
    { id: 'drums', name: '打击乐', programs: [], channel9: true },
  ];

  function range(start, count) { return Array.from({ length: count }, (_, i) => start + i); }

  function programToCategory(program, channel) {
    if (channel === 9) return INSTRUMENT_CATEGORIES.find(c => c.id === 'drums');
    return INSTRUMENT_CATEGORIES.find(c => !c.channel9 && c.programs.includes(program))
      || { id: 'piano', name: '钢琴' };
  }

  function readStr(d, o, n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[o + i]); return s; }
  function readU16(d, o) { return (d[o] << 8) | d[o + 1]; }
  function readU32(d, o) { return (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]; }

  function readVarLen(d, o) {
    let v = 0, b;
    do { b = d[o++]; v = (v << 7) | (b & 0x7F); } while (b & 0x80);
    return [v, o];
  }

  function parseTrack(trackData) {
    const events = [];
    let pos = 0, absTick = 0, runningStatus = 0;
    while (pos < trackData.length) {
      const [delta, newPos] = readVarLen(trackData, pos);
      pos = newPos;
      absTick += delta;
      let byte = trackData[pos++];
      if (byte < 0x80) { byte = runningStatus; pos--; }
      if (byte >= 0x80) runningStatus = byte;
      const type = byte & 0xF0;
      const channel = byte & 0x0F;
      if (type === 0x90) {
        const note = trackData[pos++], vel = trackData[pos++];
        if (vel > 0) events.push({ tick: absTick, type: 'noteOn', channel, note, velocity: vel });
        else events.push({ tick: absTick, type: 'noteOff', channel, note });
      } else if (type === 0x80) {
        const note = trackData[pos++]; pos++;
        events.push({ tick: absTick, type: 'noteOff', channel, note });
      } else if (type === 0xC0) {
        events.push({ tick: absTick, type: 'programChange', channel, program: trackData[pos++] });
      } else if (type === 0xD0) { pos++; }
      else if (type === 0xA0 || type === 0xB0 || type === 0xE0) { pos += 2; }
      else if (byte === 0xFF) {
        const metaType = trackData[pos++];
        const [len, lp] = readVarLen(trackData, pos); pos = lp;
        if (metaType === 0x51) {
          const tempo = (trackData[pos] << 16) | (trackData[pos + 1] << 8) | trackData[pos + 2];
          events.push({ tick: absTick, type: 'setTempo', tempo });
        }
        pos += len;
      } else if (byte === 0xF0 || byte === 0xF7) {
        const [len, lp] = readVarLen(trackData, pos); pos = lp + len;
      } else { break; }
    }
    return events;
  }

  function ticksToSeconds(tick, tempoMap, ticksPerBeat) {
    let elapsedSec = 0, prevTick = 0, curTempo = 500000;
    for (const { tick: tTick, tempo } of tempoMap) {
      if (tTick >= tick) break;
      elapsedSec += (tTick - prevTick) / ticksPerBeat * (curTempo / 1000000);
      prevTick = tTick; curTempo = tempo;
    }
    elapsedSec += (tick - prevTick) / ticksPerBeat * (curTempo / 1000000);
    return elapsedSec;
  }

  function parseMidi(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    let pos = 0;
    const hTag = readStr(data, pos, 4); pos += 4;
    if (hTag !== 'MThd') throw new Error('Not a MIDI file');
    pos += 4;                                            // 跳过 MThd 长度
    pos += 2;                                            // 跳过 format
    const numTracks = readU16(data, pos); pos += 2;
    const division = readU16(data, pos); pos += 2;
    const ticksPerBeat = division & 0x7FFF;

    const rawTracks = [];
    for (let t = 0; t < numTracks; t++) {
      pos += 4;
      const tLen = readU32(data, pos); pos += 4;
      const tData = data.slice(pos, pos + tLen);
      pos += tLen;
      rawTracks.push(parseTrack(tData));
    }

    const allEvents = [];
    const tempoMap = [{ tick: 0, tempo: 500000 }];
    for (const track of rawTracks) {
      for (const ev of track) {
        allEvents.push(ev);
        if (ev.type === 'setTempo') tempoMap.push({ tick: ev.tick, tempo: ev.tempo });
      }
    }
    tempoMap.sort((a, b) => a.tick - b.tick);

    const channelPrograms = {};
    const openNotes = {};
    const notes = [];
    const sorted = [...allEvents].sort((a, b) => a.tick - b.tick);

    for (const ev of sorted) {
      if (ev.type === 'programChange') channelPrograms[ev.channel] = ev.program;
      if (ev.type === 'noteOn') {
        openNotes[`${ev.channel}_${ev.note}`] = { tick: ev.tick, channel: ev.channel, note: ev.note, velocity: ev.velocity };
      }
      if (ev.type === 'noteOff') {
        const open = openNotes[`${ev.channel}_${ev.note}`];
        if (open) {
          const startSec = ticksToSeconds(open.tick, tempoMap, ticksPerBeat);
          const endSec = ticksToSeconds(ev.tick, tempoMap, ticksPerBeat);
          const prog = channelPrograms[open.channel] !== undefined ? channelPrograms[open.channel] : 0;
          const cat = programToCategory(prog, open.channel);
          notes.push({
            midi: open.note, time: startSec, duration: Math.max(endSec - startSec, 0.05),
            velocity: open.velocity, channel: open.channel, program: prog,
            instrument: cat.id, instrumentName: cat.name,
          });
          delete openNotes[`${ev.channel}_${ev.note}`];
        }
      }
    }

    let maxTime = 0;
    for (const n of notes) { const end = n.time + n.duration; if (end > maxTime) maxTime = end; }
    const instruments = [...new Set(notes.map(n => n.instrument))];
    return { notes, duration: maxTime, instruments, ticksPerBeat };
  }

  window.TingxiMidi = window.TingxiMidi || {};
  window.TingxiMidi.parseMidi = parseMidi;
})();
