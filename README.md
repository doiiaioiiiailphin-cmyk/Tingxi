# 听隙 Tingxi

> 在声音的缝隙里，听见时间。

一款东方留白、夜色与月光交织的网页音乐播放器。纯前端实现（HTML / CSS / JS），无需后端，打开即用。

## 特性

- 播放 / 暂停 · 上一首 / 下一首
- 可拖动进度条 · 当前时间 / 总时长
- 音量调节与静音
- 播放列表，当前曲目高亮 + 律动指示
- 封面与背景随曲目氛围动态流变
- 玻璃拟态 · 缓动雾气 · 星点 · 月光晕（Canvas）
- 响应式：桌面 / 手机皆自适应
- 键盘快捷键 · 媒体键 · 媒体会话集成
- **开箱即响**：无音频文件时，由 Web Audio 实时合成 —— 五声音阶级进旋律 + 和声垫 + 低音三声部编曲，含真实卷积混响与 lookahead 节拍调度
- **MIDI 支持**：可在播放列表中添加 `.mid/.midi` 文件，移植自 [open-midi-piano](https://github.com/doiiaioiiiailphin-cmyk/open-midi-piano) 的解析器 + SoundFont 音色引擎播放（联网自动加载 SoundFont 钢琴等音色，离线回落合成钢琴）

## 添加 MIDI 音乐

两种方式：

1. **界面添加**：打开播放列表 → 点「MIDI」按钮（或把 `.mid` 文件直接拖到播放器）→ 自动解析入库，封面/背景按曲名生成。
2. **代码添加**：解析后构造曲目推入 `PLAYLIST`：
   ```js
   const buf = await (await fetch("assets/midi/song.mid")).arrayBuffer();
   const midi = TingxiMidi.parseMidi(buf);
   PLAYLIST.push({ type: "midi", title: "我的曲子", artist: "MIDI",
                   motif: "moon", rgb: [[150,140,120],[210,196,168],[104,92,76]],
                   midi, dur: Math.round(midi.duration), src: "" });
   ```

> MIDI 播放沿用听隙的统一时间轴：进度条、拖动 seek、播放/暂停/上下首、音量、背景联动全部与合成曲目一致。
> 首次播放 MIDI 时会从 CDN 加载 SoundFont 音色（约数 MB），离线时自动用合成钢琴兜底。

## 合成音的编曲原理

没有真实音频文件时，播放器会用 Web Audio API 按正经编曲流程实时生成环境乐：

- **五声音阶**（宫/羽调式）：天然回避半音与三全音，温润不刺耳
- **手工谱写的旋律**：AABA 乐句结构，动机重复与发展，级进为主、跳进后回填，乐句末解决到主音（而非随机生成）
- **三声部**：钟铃旋律（正弦 + 2/3 次谐波，指数余韵）/ 和声垫（根-五-八开放排列，三角波微失谐）/ 低音（正弦铺底）
- **和声进行**：根音在主-下属-属间缓慢游走（每 2 小节一次）
- **空间感**：合成指数衰减脉冲响应的卷积混响
- **精准节拍**：25ms 轮询 + 150ms 预演的 lookahead 调度器

每首曲目各自谱写独立旋律，并设定 `tonic`（主音）、`scale`（音阶）、`prog`（和声进行）、`bpm`、`melody`（音符序列 `[音级, 拍数]`），互不相同。

## 运行

直接用浏览器打开 `index.html` 即可；或启动任意静态服务器：

```bash
# Python
python -m http.server 8080
# 或 Node
npx serve .
```

然后访问 `http://localhost:8080`。

## 替换为真实音乐

编辑 `js/player.js` 顶部的 `PLAYLIST`，给任意曲目加上 `src` 字段指向音频文件即可（支持本地文件或 URL）：

```js
{
  title: "月落乌啼", artist: "...",
  rgb: [[...],[...],[...]],
  root: 130.81, chord: [0,7,12,15], dur: 248,
  src: "assets/audio/yue.mp3"   // ← 加上这一行
}
```

- `rgb`：三组主题色（驱动背景 / 光晕 / 封面渐变）
- `motif`：封面意境图样（`moon` / `rain` / `fog` / `sun` / `ripple` / `mountain`）
- `tonic` / `scale` / `prog` / `bpm` / `melody`：合成音的作曲参数（主音 MIDI / 音阶 / 和声进行 / 节拍 / 旋律音符序列）
- `dur`：曲目时长（秒），仅合成音用到

> 浏览器自动播放策略要求：首次需点击播放按钮以激活音频。

## 文件结构

```
Tingxi/
├── index.html          页面结构
├── css/
│   └── style.css       夜色 / 玻璃 / 留白 / 响应式
├── js/
│   ├── atmosphere.js   Canvas 雾气 / 星点 / 月光
│   ├── player.js       播放引擎 / 封面 / 主题 / 交互
│   └── midi/
│       ├── midi-parser.js   MIDI 解析（移植自 open-midi-piano）
│       └── audio-engine.js  SoundFont 音色引擎（移植自 open-midi-piano）
└── README.md
```

## 许可

MIT；其中 `js/midi/` 下的 MIDI 解析器与 SoundFont 引擎移植自 [open-midi-piano](https://github.com/doiiaioiiiailphin-cmyk/open-midi-piano)（GPL-3.0），相关文件遵循 GPL-3.0。

## 快捷键

| 键 | 动作 |
|---|---|
| `Space` | 播放 / 暂停 |
| `←` / `→` | 上一首 / 下一首 |
| `↑` / `↓` | 音量 ± |

---

听隙 Tingxi · 听见时间的缝隙
