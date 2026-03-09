import { useState, useRef, useEffect } from 'react'
import './HappyBirthday.css'

// ── 烟花颜色 ──
const FIREWORK_COLORS = [
  '#ff0', '#f0f', '#0ff', '#f55', '#5f5',
  '#ffd700', '#ff6b6b', '#ff8800', '#00cfff',
  '#ff00ff', '#00ff88', '#ff4500', '#fff',
]

// ── 散花表情 ──
const FLOWER_EMOJIS = ['🌸', '🌺', '🌼', '💐', '🌹', '🌷', '✨', '⭐', '🎊', '🎉', '🎀', '💖']

// speech：朗读内容；text：屏幕显示内容
const LYRICS = [
  { time: 0,    text: '🎂 祝 绝世好腰 生日快乐！',            speech: '祝绝世好腰，生日快乐！' },
  { time: 2700, text: '🎉 Happy Birthday 绝世好腰～',          speech: '绝世好腰，生日快乐呀！' },
  { time: 5400, text: '🌸 美少女大姐大，今天是你的日子！',    speech: '美少女大姐大，今天是你的日子！' },
  { time: 8200, text: '✨ 美少女大姐大 永远美丽，青春不老！', speech: '美少女大姐大，永远美丽，青春不老！' },
]

const SONG_NOTES = [
  [392, 0.3], [392, 0.15], [440, 0.45], [392, 0.45], [523, 0.45], [494, 0.9],
  [392, 0.3], [392, 0.15], [440, 0.45], [392, 0.45], [587, 0.45], [523, 0.9],
  [392, 0.3], [392, 0.15], [784, 0.45], [659, 0.45], [523, 0.45], [494, 0.45], [440, 0.9],
  [698, 0.3], [698, 0.15], [659, 0.45], [523, 0.45], [587, 0.45], [523, 1.2],
]

// ─────────────────────────────────────────────
// 音乐：把一首歌安排到 AudioContext 时间轴，返回结束时间
// ─────────────────────────────────────────────
function scheduleSong(ctx, startTime) {
  let t = startTime
  SONG_NOTES.forEach(([freq, dur]) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.35, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.start(t)
    osc.stop(t + dur)
    t += dur * 0.92
  })
  return t
}

// 无缝循环播放（提前 200ms 安排下一曲保证衔接）
function loopMusic(ctx, activeRef, addTimeout) {
  if (!activeRef.current) return
  const endTime = scheduleSong(ctx, ctx.currentTime + 0.05)
  const msLeft = (endTime - ctx.currentTime) * 1000
  addTimeout(() => loopMusic(ctx, activeRef, addTimeout), msLeft - 200)
}

// ─────────────────────────────────────────────
// 烟花爆炸音效
// ─────────────────────────────────────────────
function playBoom(ctx) {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.frequency.setValueAtTime(160, t)
  osc.frequency.exponentialRampToValueAtTime(25, t + 0.25)
  oscGain.gain.setValueAtTime(0.6, t)
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  osc.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.3)

  const bufSize = Math.floor(ctx.sampleRate * 0.22)
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.18))
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const noiseGain = ctx.createGain()
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 800
  noiseFilter.Q.value = 0.8
  noiseGain.gain.setValueAtTime(0.35, t)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(t)
}

// ─────────────────────────────────────────────
// TTS 朗读（排队，不打断）
// pitch 调高到 1.8 → 更高亮、更可爱；rate 适当加快
// 优先选女声（Ting-Ting / Yaoyao / XiaoXiao 等）
// ─────────────────────────────────────────────
function speakText(text) {
  if (!window.speechSynthesis) return

  function doSpeak() {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang   = 'zh-CN'
    utter.rate   = 1.08   // 稍快一点，更有活力
    utter.pitch  = 1.9    // 高音调 → 听起来可爱欢快（范围 0~2，1 是默认）
    utter.volume = 1

    // 优先选已知的中文女声，找不到再 fallback 到任意中文声音
    const PREFERRED = ['ting-ting', 'yaoyao', 'xiaoxiao', 'xiaochen', 'meijia', 'sin-ji']
    const all = window.speechSynthesis.getVoices()
    const zhVoice =
      all.find(v => PREFERRED.some(n => v.name.toLowerCase().includes(n)) && v.lang.startsWith('zh')) ||
      all.find(v => v.lang.startsWith('zh'))
    if (zhVoice) utter.voice = zhVoice

    window.speechSynthesis.speak(utter)
  }

  // 部分浏览器首次 getVoices() 返回空数组，等 voiceschanged 后再说
  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak()
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
  }
}

// ─────────────────────────────────────────────
// Canvas 烟花：把一组粒子推入粒子数组（纯数据，不碰 React state）
// ─────────────────────────────────────────────
function addBurst(particlesRef, x, y) {
  const count = 130
  for (let i = 0; i < count; i++) {
    const angle  = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
    const speed  = Math.random() * 900 + 250
    const life   = Math.random() * 1.0 + 1.5   // 1.5~2.5 秒寿命
    particlesRef.current.push({
      x, y,
      vx:          Math.cos(angle) * speed,
      vy:          Math.sin(angle) * speed,
      color:       FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
      size:        Math.random() * 7 + 3,       // 3~10px（发光后视觉效果已很大）
      alpha:       1.0,
      lifeSeconds: life,
    })
  }
}

// ─────────────────────────────────────────────
// 生成散落花朵
// ─────────────────────────────────────────────
function createFlowers() {
  return Array.from({ length: 50 }, (_, i) => ({
    id:       `flower-${Date.now()}-${i}`,
    emoji:    FLOWER_EMOJIS[Math.floor(Math.random() * FLOWER_EMOJIS.length)],
    left:     Math.random() * 100,
    delay:    Math.random() * 5,
    duration: Math.random() * 3 + 4,
    size:     Math.random() * 22 + 16,
    spin:     Math.random() > 0.5 ? 1 : -1,
  }))
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export default function HappyBirthday() {
  const [celebrating,   setCelebrating]   = useState(false)
  const [flowers,       setFlowers]       = useState([])
  const [currentLyric,  setCurrentLyric]  = useState('')
  const [lyricKey,      setLyricKey]      = useState(0)
  const [isFullscreen,  setIsFullscreen]  = useState(false)

  const celebratingRef  = useRef(false)  // 防重复点击
  const musicActiveRef  = useRef(false)  // 音乐循环开关
  const audioCtxRef     = useRef(null)   // 持久 AudioContext
  const timeoutsRef     = useRef([])     // setTimeout ID 集合
  const runCycleRef     = useRef(null)   // 最新的 runVisualCycle 引用

  // Canvas 相关
  const canvasRef       = useRef(null)   // <canvas> 元素
  const particlesRef    = useRef([])     // 粒子数组（不是 React state，不触发渲染）
  const animFrameRef    = useRef(null)   // rAF handle

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay)
    timeoutsRef.current.push(id)
    return id
  }

  // ── 页面卸载清理 ──
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      musicActiveRef.current = false
      audioCtxRef.current?.close()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // ── Canvas 动画循环（celebrating 变 true 后启动，之后一直跑） ──
  useEffect(() => {
    if (!celebrating) return

    const canvas = canvasRef.current
    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTs = performance.now()

    function loop(ts) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)  // 秒，最大 50ms 防跳帧
      lastTs = ts

      const c = canvas.getContext('2d')

      // 每帧清空画布（保持透明，让页面背景正常显示）
      // 注意：不能用半透明 fillRect，否则每帧叠加后变成实心黑块盖住整个页面
      c.clearRect(0, 0, canvas.width, canvas.height)

      // 更新并绘制存活粒子
      particlesRef.current = particlesRef.current.filter(p => p.alpha > 0)

      for (const p of particlesRef.current) {
        // 物理更新
        p.x  += p.vx * dt
        p.y  += p.vy * dt
        p.vy += 350 * dt                      // 重力（适中，粒子弧线好看）
        const drag = Math.pow(0.985, dt * 60)  // 极小阻力：0.985/帧 → 1秒后剩40%速度
        p.vx *= drag                           // （原来 0.88/帧 → 1秒后剩0.08%，粒子飞不动）
        p.vy *= drag
        p.alpha -= dt / p.lifeSeconds          // 生命衰减

        if (p.alpha <= 0) continue

        // 绘制（发光效果靠 shadowBlur）
        c.globalAlpha = Math.max(0, p.alpha)
        c.shadowColor = p.color
        c.shadowBlur  = p.size * 5             // 发光半径 = 粒子 5x，视觉很大
        c.fillStyle   = p.color
        c.beginPath()
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        c.fill()
      }

      c.globalAlpha = 1
      c.shadowBlur  = 0

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [celebrating])

  // ── 监听全屏变化 ──
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  // ─── 视觉特效循环 ───
  function runVisualCycle() {
    const ctx = audioCtxRef.current

    // 歌词 + 语音
    LYRICS.forEach(({ time, text, speech }) => {
      schedule(() => {
        setCurrentLyric(text)
        setLyricKey(k => k + 1)
        speakText(speech)
      }, time)
    })
    schedule(() => setCurrentLyric(''), 11500)

    // 散花
    setFlowers(createFlowers())
    schedule(() => setFlowers([]), 11000)

    // 烟花：18 波，每个爆炸点同步触发音效
    // 粒子直接推入 particlesRef，不走 React state，无重渲染，无闪屏
    const totalWaves = 18
    for (let i = 0; i < totalWaves; i++) {
      schedule(() => {
        const burstNum = Math.random() > 0.45 ? 2 : 1
        for (let j = 0; j < burstNum; j++) {
          const x = Math.random() * window.innerWidth  * 0.9 + window.innerWidth  * 0.05
          const y = Math.random() * window.innerHeight * 0.75 + 30
          addBurst(particlesRef, x, y)   // 推粒子（纯数据，零渲染开销）
          if (ctx) playBoom(ctx)          // 同步爆炸音
        }
      }, i * 480)
    }

    // 本轮结束：清理 → 停顿 800ms → 下一轮
    const cleanupTime = totalWaves * 480 + 2500
    schedule(() => {
      particlesRef.current = []          // 清空粒子
      const canvas = canvasRef.current
      if (canvas) {                      // 立刻擦掉画布，不留残影
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      }
      setFlowers([])
      setCurrentLyric('')
      schedule(() => runCycleRef.current?.(), 800)
    }, cleanupTime)
  }

  runCycleRef.current = runVisualCycle

  // ─── 首次点击：启动音乐循环 + 视觉循环 ───
  function handleCelebrate() {
    if (celebratingRef.current) return
    celebratingRef.current = true
    setCelebrating(true)

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      musicActiveRef.current = true
      loopMusic(ctx, musicActiveRef, schedule)
    }

    runVisualCycle()
  }

  return (
    <div className="birthday-container">

      <button className="fullscreen-btn" onClick={toggleFullscreen}>
        {isFullscreen ? '⛶ 退出全屏' : '⛶ 全屏'}
      </button>

      {/* Canvas 烟花层（全屏，绕开 React 渲染） */}
      <canvas ref={canvasRef} className="fireworks-canvas" />

      {/* 散花层（数量少，CSS 动画，不影响性能） */}
      <div className="flowers-layer">
        {flowers.map(f => (
          <div
            key={f.id}
            className="flower"
            style={{
              left:              `${f.left}vw`,
              fontSize:          `${f.size}px`,
              animationDelay:    `${f.delay}s`,
              animationDuration: `${f.duration}s`,
              '--spin':          f.spin,
            }}
          >
            {f.emoji}
          </div>
        ))}
      </div>

      {/* 主内容 */}
      <div className="content">
        <h1 className={`title ${celebrating ? 'bounce' : ''}`}>
          🎂 生日快乐！
        </h1>

        <div className="name-tags">
          <span className="name-tag gold">绝世好腰</span>
          <span className="heart">💖</span>
          <span className="name-tag pink">美少女大姐大</span>
        </div>

        <div className="lyrics-box">
          {currentLyric
            ? <p key={lyricKey} className="lyric-text">{currentLyric}</p>
            : <p className="lyric-hint">
                {celebrating ? '🎵 ...' : '点击下方按钮，开始庆祝（循环播放）↓'}
              </p>
          }
        </div>

        <button
          className={`celebrate-btn ${celebrating ? 'celebrating' : ''}`}
          onClick={handleCelebrate}
          disabled={celebrating}
        >
          {celebrating ? '🎊 庆祝中... 🎊' : '🎉 点击庆祝生日 🎉'}
        </button>

        {celebrating && (
          <p className="loop-hint">🔁 音乐持续播放中，关闭页面即可停止</p>
        )}
      </div>
    </div>
  )
}
