/* ==========================================================================
   script.js — Focus Timer
   Sem dependências externas. Separado em módulos lógicos com comentários.
   ========================================================================== */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

const MODES = {
  work:  { label: 'FOCO',        color: '#009dff', glow: 'rgba(0,157,255,0.28)'   },
  short: { label: 'PAUSA CURTA', color: '#66aaee', glow: 'rgba(102,170,238,0.22)' },
  long:  { label: 'PAUSA LONGA', color: '#99bbcc', glow: 'rgba(153,187,204,0.18)' },
};

const QUOTES = {
  work: [
    '✨ Foco total. O sucesso é construído bloco a bloco.',
    '🧠 Concentração profunda é o superpoder do século 21.',
    '💡 Uma tarefa de cada vez. Você consegue.',
    '🎯 Elimine distrações. Este tempo é seu.',
    '⚡ Progresso, não perfeição. Continue.',
    '🔥 Grandes resultados vêm de esforços consistentes.',
    '📚 Aprender é uma aventura. Mergulhe fundo.',
    '🌱 Cada sessão planta uma semente de conhecimento.',
    '🚀 Feito é melhor que perfeito. Comece agora.',
  ],
  short: [
    '☕ Pausa merecida! Hidrate-se e respire fundo.',
    '🚶 Levante e estique as pernas por um momento.',
    '😌 Relaxe os olhos — olhe para longe por 20 segundos.',
    '🌊 Inspire 4s · segure 4s · expire 4s. Repita.',
    '💧 Beba água agora. Seu cérebro agradece.',
  ],
  long: [
    '🎉 Ciclo completo! Você merece essa pausa.',
    '🌿 Descanse bem. A mente recarregada performa melhor.',
    '🏆 Excelente trabalho! Aproveite o intervalo.',
    '🎵 Alongue o corpo, respire, recarregue.',
    '⭐ Consistência é o segredo. Você tem isso.',
  ],
};

// Circunferência do anel: r = 86  →  C = 2π × 86 ≈ 540.35
const CIRC = 2 * Math.PI * 86;

// ═══════════════════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

const state = {
  mode:           'work',
  running:        false,
  timeLeft:       0,
  totalTime:      0,
  pomodoroCount:  0,   // no ciclo atual (reseta após pausa longa)
  completedToday: 0,   // total de pomodoros concluídos hoje
  totalFocusMin:  0,   // minutos de foco acumulados hoje
  interval:       null,
  settings:       loadSettings(),
  history:        loadHistory(),
};

// ═══════════════════════════════════════════════════════════════════════════
// REFERÊNCIAS DOM
// ═══════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

const dom = {
  // Timer
  timerDisplay:  $('timerDisplay'),
  modeLabel:     $('modeLabel'),
  startBtn:      $('startBtn'),
  resetBtn:      $('resetBtn'),
  skipBtn:       $('skipBtn'),
  ringBar:       $('ringBar'),
  ringWrap:      $('ringWrap'),
  // Stats
  sessionLabel:  $('sessionLabel'),
  cyclesCount:   $('cyclesCount'),
  focusTime:     $('focusTime'),
  // Quote
  quoteCard:     $('quoteCard'),
  // Music
  musicHeader:   $('musicHeader'),
  musicBody:     $('musicBody'),
  musicDot:      $('musicDot'),
  musicChevron:  $('musicChevron'),
  // History
  historyList:   $('historyList'),
  historyEmpty:  $('historyEmpty'),
  clearHistBtn:  $('clearHistoryBtn'),
  // Header
  themeBtn:      $('themeBtn'),
  themeIcon:     $('themeIcon'),
  settingsBtn:   $('settingsBtn'),
  // Overlay
  overlay:       $('overlay'),
  settingsClose: $('settingsClose'),
  settingsCancel:$('settingsCancel'),
  settingsSave:  $('settingsSave'),
  // Settings inputs
  inWork:         $('inWork'),
  inShort:        $('inShort'),
  inLong:         $('inLong'),
  inAutoAdvance:  $('inAutoAdvance'),
  inSound:        $('inSound'),
  inBrowserNotif: $('inBrowserNotif'),
  inPomodorosLong:$('inPomodorosLong'),
  // Toast
  toast:         $('toast'),
};

// Inicializa atributos do anel SVG
dom.ringBar.style.strokeDasharray  = CIRC;
dom.ringBar.style.strokeDashoffset = 0;

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTÊNCIA — localStorage
// ═══════════════════════════════════════════════════════════════════════════

function loadSettings() {
  const defaults = {
    work: 25, short: 5, long: 15,
    autoAdvance: true, sound: true, browserNotif: false,
    pomodorosBeforeLong: 4,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('ft_settings') || '{}') };
  } catch { return defaults; }
}

function saveSettings() {
  localStorage.setItem('ft_settings', JSON.stringify(state.settings));
}

function loadHistory() {
  try {
    const all   = JSON.parse(localStorage.getItem('ft_history') || '[]');
    const today = new Date().toDateString();
    return all.filter(e => new Date(e.ts).toDateString() === today);
  } catch { return []; }
}

function persistHistory() {
  try {
    const all    = JSON.parse(localStorage.getItem('ft_history') || '[]');
    const cutoff = Date.now() - 30 * 86_400_000; // 30 dias
    const today  = new Date().toDateString();
    const others = all.filter(e => e.ts > cutoff && new Date(e.ts).toDateString() !== today);
    localStorage.setItem('ft_history', JSON.stringify([...others, ...state.history]));
  } catch {}
}

function addToHistory(mode, durationMin) {
  state.history.unshift({
    mode,
    duration: durationMin,
    ts:       Date.now(),
    label:    MODES[mode].label,
  });
  persistHistory();
  renderHistory();
}

// ═══════════════════════════════════════════════════════════════════════════
// ÁUDIO — Web Audio API (sem arquivos externos)
// ═══════════════════════════════════════════════════════════════════════════

let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(freq, dur, type = 'sine', vol = 0.28) {
  if (!state.settings.sound) return;
  try {
    const ctx  = ensureAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch {}
}

// Três notas ascendentes → fim de foco
const soundWorkEnd = () => {
  beep(523, 0.15);
  setTimeout(() => beep(659, 0.15), 190);
  setTimeout(() => beep(784, 0.32), 380);
};

// Três notas descendentes → fim de pausa
const soundBreakEnd = () => {
  beep(784, 0.15);
  setTimeout(() => beep(659, 0.15), 190);
  setTimeout(() => beep(523, 0.32), 380);
};

// Tique suave nos últimos 5 segundos
const soundTick = () => beep(900, 0.04, 'square', 0.04);

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICAÇÕES DO NAVEGADOR
// ═══════════════════════════════════════════════════════════════════════════

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function sendNotif(title, body) {
  if (!state.settings.browserNotif || Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CORES DE MODO — CSS Custom Properties
// ═══════════════════════════════════════════════════════════════════════════

function applyModeColors(mode) {
  const { color, glow } = MODES[mode];
  const root = document.documentElement;
  root.style.setProperty('--mode-color', color);
  root.style.setProperty('--mode-glow',  glow);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMER CORE
// ═══════════════════════════════════════════════════════════════════════════

function getDuration(mode) {
  return { work: state.settings.work, short: state.settings.short, long: state.settings.long }[mode] * 60;
}

function setMode(mode, reset = true) {
  state.mode = mode;

  // Atualiza abas
  document.querySelectorAll('.tab').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  applyModeColors(mode);
  dom.modeLabel.textContent = MODES[mode].label;

  if (reset) {
    stopTimer();
    state.timeLeft  = getDuration(mode);
    state.totalTime = state.timeLeft;
    updateDisplay();
    updateRing();
  }

  updateSessionLabel();
  updateQuote(mode);
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  dom.startBtn.textContent = 'Pausar';
  dom.ringWrap.classList.add('running');
  ensureAudio();

  state.interval = setInterval(() => {
    if (state.timeLeft > 0) {
      state.timeLeft--;
      if (state.timeLeft <= 5 && state.timeLeft > 0) soundTick();
      updateDisplay();
      updateRing();
    } else {
      onTimerEnd();
    }
  }, 1000);
}

function pauseTimer() {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.interval);
  dom.startBtn.textContent = 'Continuar';
  dom.ringWrap.classList.remove('running');
}

function stopTimer() {
  state.running = false;
  clearInterval(state.interval);
  dom.startBtn.textContent = 'Iniciar';
  dom.ringWrap.classList.remove('running');
}

function resetTimer() {
  stopTimer();
  state.timeLeft  = getDuration(state.mode);
  state.totalTime = state.timeLeft;
  updateDisplay();
  updateRing();
}

function onTimerEnd() {
  stopTimer();
  const done = state.mode;

  done === 'work' ? soundWorkEnd() : soundBreakEnd();

  addToHistory(done, state.settings[done]);

  if (done === 'work') {
    state.pomodoroCount++;
    state.completedToday++;
    state.totalFocusMin += state.settings.work;
    updateStats();
  }

  const msgs = {
    work:  ['Sessão de foco concluída! 🎉', 'Hora de uma pausa merecida.'],
    short: ['Pausa curta encerrada!',        'Pronto para mais uma sessão?'],
    long:  ['Pausa longa encerrada! ⭐',     'Você está arrasando!'],
  };

  showToast(msgs[done][0]);
  sendNotif(...msgs[done]);

  const next = resolveNextMode(done);

  if (state.settings.autoAdvance) {
    setTimeout(() => { setMode(next); startTimer(); }, 1500);
  } else {
    setMode(next);
  }
}

function resolveNextMode(completedMode) {
  if (completedMode !== 'work') return 'work';
  if (state.pomodoroCount >= state.settings.pomodorosBeforeLong) {
    state.pomodoroCount = 0;
    return 'long';
  }
  return 'short';
}

// ═══════════════════════════════════════════════════════════════════════════
// ATUALIZAÇÃO DE UI
// ═══════════════════════════════════════════════════════════════════════════

function updateDisplay() {
  const m = String(Math.floor(state.timeLeft / 60)).padStart(2, '0');
  const s = String(state.timeLeft % 60).padStart(2, '0');
  dom.timerDisplay.textContent = `${m}:${s}`;
  document.title = `${m}:${s} · Focus Timer`;
}

function updateRing() {
  const pct    = state.totalTime > 0 ? state.timeLeft / state.totalTime : 1;
  const offset = CIRC * (1 - pct);
  dom.ringBar.style.strokeDashoffset = offset;
}

function updateSessionLabel() {
  dom.sessionLabel.textContent = state.mode === 'work'
    ? `Pomodoro #${state.completedToday + 1}`
    : MODES[state.mode].label.replace(' ', '\u00A0'); // non-breaking space
}

function updateStats() {
  dom.cyclesCount.textContent = state.completedToday;
  const h = Math.floor(state.totalFocusMin / 60);
  const m = state.totalFocusMin % 60;
  dom.focusTime.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
  updateSessionLabel();
}

function updateQuote(mode) {
  const pool  = QUOTES[mode] || QUOTES.work;
  const quote = pool[Math.floor(Math.random() * pool.length)];
  dom.quoteCard.classList.remove('fade-in');
  void dom.quoteCard.offsetWidth; // força reflow para reiniciar animação CSS
  dom.quoteCard.textContent = quote;
  dom.quoteCard.classList.add('fade-in');
}

function renderHistory() {
  // Remove entradas antigas preservando o placeholder
  Array.from(dom.historyList.children).forEach(c => {
    if (c.id !== 'historyEmpty') c.remove();
  });

  if (state.history.length === 0) {
    dom.historyEmpty.style.display = '';
    return;
  }

  dom.historyEmpty.style.display = 'none';

  state.history.slice(0, 25).forEach(entry => {
    const li   = document.createElement('li');
    li.className = 'history-item';

    const dot  = document.createElement('span');
    dot.className  = 'h-dot';
    dot.style.background = MODES[entry.mode]?.color || '#888';

    const info = document.createElement('span');
    info.className = 'h-info';
    info.textContent = `${entry.label} — ${entry.duration}min`;

    const time = document.createElement('span');
    time.className = 'h-time';
    time.textContent = new Date(entry.ts).toLocaleTimeString('pt-BR', {
      hour:   '2-digit',
      minute: '2-digit',
    });

    li.append(dot, info, time);
    dom.historyList.appendChild(li);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════

let toastTimer;

function showToast(msg) {
  clearTimeout(toastTimer);
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 3200);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMA CLARO / ESCURO
// ═══════════════════════════════════════════════════════════════════════════

// Ícone SVG — Lua (dark) e Sol (light)
const ICON_MOON = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const ICON_SUN  = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.themeIcon.innerHTML = theme === 'dark' ? ICON_MOON : ICON_SUN;
  localStorage.setItem('ft_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('ft_theme') || 'dark';
  setTheme(saved);
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL DE CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

function openSettings() {
  dom.inWork.value           = state.settings.work;
  dom.inShort.value          = state.settings.short;
  dom.inLong.value           = state.settings.long;
  dom.inAutoAdvance.checked  = state.settings.autoAdvance;
  dom.inSound.checked        = state.settings.sound;
  dom.inBrowserNotif.checked = state.settings.browserNotif;
  dom.inPomodorosLong.value  = state.settings.pomodorosBeforeLong;
  dom.overlay.classList.add('open');
}

function closeSettings() {
  dom.overlay.classList.remove('open');
}

function applySettings() {
  state.settings.work              = Math.max(1, parseInt(dom.inWork.value)           || 25);
  state.settings.short             = Math.max(1, parseInt(dom.inShort.value)          || 5);
  state.settings.long              = Math.max(1, parseInt(dom.inLong.value)           || 15);
  state.settings.autoAdvance       = dom.inAutoAdvance.checked;
  state.settings.sound             = dom.inSound.checked;
  state.settings.browserNotif      = dom.inBrowserNotif.checked;
  state.settings.pomodorosBeforeLong = Math.max(2, parseInt(dom.inPomodorosLong.value) || 4);

  if (state.settings.browserNotif) {
    requestNotifPermission().then(ok => {
      if (!ok) {
        state.settings.browserNotif = false;
        dom.inBrowserNotif.checked  = false;
        showToast('Permissão de notificação negada.');
      }
    });
  }

  saveSettings();
  closeSettings();
  resetTimer();
  showToast('Configurações salvas ✓');
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER DE MÚSICA
// ═══════════════════════════════════════════════════════════════════════════

(function initMusicPlayer() {
  let expanded = true;

  dom.musicHeader.addEventListener('click', () => {
    expanded = !expanded;
    dom.musicBody.classList.toggle('collapsed', !expanded);
    dom.musicChevron.classList.toggle('up', expanded);
    dom.musicHeader.setAttribute('aria-expanded', String(expanded));
  });

  // Detecta play/pause via postMessage da YouTube IFrame API
  window.addEventListener('message', e => {
    try {
      const data = JSON.parse(e.data);
      if (data.event === 'infoDelivery' && data.info?.playerState !== undefined) {
        dom.musicDot.classList.toggle('playing', data.info.playerState === 1);
      }
    } catch {}
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════

(function initMatrix() {
  const canvas   = document.getElementById('matrix');
  const ctx      = canvas.getContext('2d');
  const fontSize = 14;
  const chars    = '01';
  let columns, drops;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.floor(canvas.width / fontSize);
    drops   = Array(columns).fill(1);
  }

  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgb(0, 157, 255)';
    ctx.font      = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  setInterval(draw, 33);
})();

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

dom.startBtn.addEventListener('click', () => {
  state.running ? pauseTimer() : startTimer();
});

dom.resetBtn.addEventListener('click', resetTimer);

dom.skipBtn.addEventListener('click', () => {
  stopTimer();
  if (state.mode === 'work') {
    state.pomodoroCount++;
    setMode(resolveNextMode('work'));
  } else {
    setMode('work');
  }
});

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.running && !confirm('Timer em andamento. Deseja trocar de modo?')) return;
    setMode(btn.dataset.mode);
  });
});

dom.themeBtn.addEventListener('click', toggleTheme);

dom.settingsBtn.addEventListener('click', openSettings);
dom.settingsClose.addEventListener('click', closeSettings);
dom.settingsCancel.addEventListener('click', closeSettings);
dom.settingsSave.addEventListener('click', applySettings);

// Fecha overlay ao clicar no fundo
dom.overlay.addEventListener('click', e => {
  if (e.target === dom.overlay) closeSettings();
});

// Fecha overlay com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dom.overlay.classList.contains('open')) closeSettings();
});

dom.clearHistBtn.addEventListener('click', () => {
  if (!confirm('Limpar todo o histórico de hoje?')) return;
  state.history          = [];
  state.completedToday   = 0;
  state.totalFocusMin    = 0;
  state.pomodoroCount    = 0;
  persistHistory();
  renderHistory();
  updateStats();
  showToast('Histórico limpo.');
});

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

function init() {
  loadTheme();

  // Reconstrói estatísticas a partir do histórico salvo
  state.history.forEach(entry => {
    if (entry.mode === 'work') {
      state.completedToday++;
      state.totalFocusMin += entry.duration;
    }
  });

  setMode('work');
  updateStats();
  renderHistory();
}

init();
