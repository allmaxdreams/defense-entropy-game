import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, Users, TrendingDown, Activity, AlertTriangle, 
  Clock, Map as MapIcon, Skull, BarChart3, 
  Terminal, ChevronRight, Share2, Volume2, VolumeX, Power
} from 'lucide-react';

// --- AUDIO ENGINE (NO FILES NEEDED) ---
// Цей синтезатор створює звуки програмно, щоб не треба було вантажити файли
const playSound = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } 
    else if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
    else if (type === 'alarm') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    else if (type === 'boot') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(50, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  } catch (e) {
    console.error("Audio error", e);
  }
};

// --- STYLES ---
const globalStyles = `
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  .crt-scanline {
    width: 100%;
    height: 100%;
    z-index: 50;
    background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(32, 255, 77, 0.04) 50%, rgba(0,0,0,0) 100%);
    opacity: 0.1;
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
    animation: scanline 8s linear infinite;
  }
  .terminal-text { text-shadow: 0 0 5px rgba(34, 197, 94, 0.5); }
  .btn-hover:hover { box-shadow: 4px 4px 0px rgba(16, 185, 129, 0.5); transform: translate(-2px, -2px); }
`;

// --- CONFIG ---
const INITIAL_STATE = {
  turn: 1, territory: 100000, frontLength: 1200, manpower: 200000, units: 15,
  morale: 85, support: 90, reputation: 80, budget: 100,
  efficiency: 1.0, density: 1.0, gameOver: false, gameOverReason: null
};

const DENSITY_CRIT = 0.5;

// --- SCENARIOS ---
const ALL_SCENARIOS = [
  {
    id: 'leaky_bucket',
    title: 'Криза "Дірявого відра"',
    description: 'Мобілізація триває, але до фронту доходить лише 60% людей. Бригади виснажені. Генеральний штаб вимагає негайного рішення.',
    choices: [
      { text: 'Створити нові бригади', desc: 'Красива картинка для ТБ (+Репутація), але це створює хаос в управлінні.', effect: (s) => ({ units: s.units + 2, reputation: Math.min(100, s.reputation + 10), log: 'Створено нові бригади. Ефективність впала.' }) },
      { text: 'Поповнити існуючі', desc: 'Тихо відправити людей в 72-гу та 110-ту. Жодного піару, але зберігає керованість.', effect: (s) => ({ reputation: Math.max(0, s.reputation - 5), addEvent: { type: 'REINFORCEMENT', amount: 5000, turnDelay: 2 }, log: 'Поповнення старих бригад.' }) },
      { text: 'Тотальна "бусифікація"', desc: 'Рейди по спортзалах. Швидко дає людей, але вбиває підтримку.', effect: (s) => ({ support: Math.max(0, s.support - 20), morale: Math.max(0, s.morale - 15), addEvent: { type: 'REINFORCEMENT', amount: 15000, turnDelay: 2 }, log: 'Масові рейди. Мораль впала.' }) }
    ]
  },
  {
    id: 'density_collapse',
    title: 'Загроза прориву (Схід)',
    description: 'Щільність оборони впала до критичної межі. Ворог концентрує сили для прориву. Потрібно обирати між територією та людьми.',
    choices: [
      { text: 'Ні кроку назад!', desc: 'Політичний наказ тримати руїни. Величезні втрати особового складу.', effect: (s) => ({ manpower: Math.floor(s.manpower * 0.85), morale: Math.max(0, s.morale - 10), log: 'Війська стоять на смерть. Втрати -15%.' }) },
      { text: 'Оперативний відступ', desc: 'Здати місто, скоротити лінію фронту, врятувати кістяк армії.', effect: (s) => ({ territory: s.territory - 1000, frontLength: Math.max(800, s.frontLength - 100), reputation: Math.max(0, s.reputation - 25), morale: Math.max(0, s.morale - 10), log: 'Відступ. Територію втрачено, фронт ущільнено.' }) },
      { text: 'Кинути спецрезерв', desc: 'Відправити операторів БПЛА та ППО в окопи як піхоту.', effect: (s) => ({ budget: Math.max(0, s.budget - 30), manpower: s.manpower + 3000, efficiency: s.efficiency * 0.90, log: 'Еліта загинула в окопах. Ситуацію стабілізовано тимчасово.' }) }
    ]
  },
  {
    id: 'shells',
    title: 'Снарядний голод',
    description: 'Партнери затримують поставки. Артилерія мовчить. Піхота просить вогневої підтримки.',
    choices: [
      { text: 'FPV замість арти', desc: 'Масова закупівля дронів. Дешевше, але менша дальність та потужність.', effect: (s) => ({ budget: Math.max(0, s.budget - 20), density: s.density * 1.10, log: 'Ставка на FPV.' }) },
      { text: 'Економія БК', desc: 'Ліміт на постріли. Втрата позицій, але збереження запасу.', effect: (s) => ({ territory: s.territory - 200, morale: Math.max(0, s.morale - 10), log: 'Жорстка економія. Ворог просувається.' }) }
    ]
  },
  {
    id: 'energy',
    title: 'Удари по енергетиці',
    description: 'Ворог знищив ключові ТЕС. Потрібно обрати пріоритет розподілу енергії.',
    choices: [
      { text: 'Все для ВПК', desc: 'Світло лише заводам. Населення без тепла.', effect: (s) => ({ support: Math.max(0, s.support - 25), budget: Math.min(100, s.budget + 10), log: 'Тил у темряві. Заводи працюють.' }) },
      { text: 'Баланс', desc: 'Віялові відключення для всіх. Падіння виробництва.', effect: (s) => ({ budget: Math.max(0, s.budget - 10), manpower: s.manpower - 500, log: 'Дефіцит енергії гальмує логістику.' }) }
    ]
  }
];

// --- COMPONENTS ---
const MetricCard = ({ icon: Icon, label, value, color, warning }) => (
  <div className={`
    relative bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col justify-between last:border-r-0
    ${warning ? 'bg-red-950/20 animate-pulse' : ''}
  `}>
    <div className={`flex items-center gap-2 mb-2 ${color}`}>
      <Icon size={18} />
      <span className="font-mono text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-80">{label}</span>
    </div>
    <span className={`text-2xl md:text-3xl font-mono font-bold ${color}`}>
      {typeof value === 'number' ? value.toFixed(0) : value}
    </span>
    {warning && <AlertTriangle className="absolute top-2 right-2 text-red-500 w-4 h-4" />}
  </div>
);

// --- MAIN APP ---
export default function DefenseEntropyGame() {
  const [gameState, setGameState] = useState('intro'); // intro, playing, gameover
  const [gameData, setGameData] = useState(INITIAL_STATE);
  const [logs, setLogs] = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const logsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // Звук при старті
  useEffect(() => {
    if (gameState === 'playing' && soundEnabled) playSound('boot');
  }, [gameState]);

  const startGame = () => {
    if (soundEnabled) playSound('click');
    setGameData(INITIAL_STATE);
    setLogs(["[SYSTEM INIT]... З'ЄДНАННЯ ВСТАНОВЛЕНО"]);
    setCurrentScenario(ALL_SCENARIOS.sort(() => Math.random() - 0.5)[0]);
    setGameState('playing');
  };

  const processTurn = (choiceEffect) => {
    if (soundEnabled) playSound('click');
    
    setGameData(prev => {
      let s = { ...prev };
      const res = choiceEffect(s);
      s = { ...s, ...res };
      
      // Calculations
      s.efficiency = 1 / (1 + 0.1 * Math.exp(0.25 * (s.units - 10)));
      const relDensity = (s.manpower / s.frontLength) / 150;
      let loss = 50; // Base creep
      if (relDensity < DENSITY_CRIT) {
        loss += 100 * Math.exp(2 * (DENSITY_CRIT - relDensity));
        if (soundEnabled) playSound('alarm');
      }
      s.territory -= loss;
      
      // AWOL spiral
      const awolRate = 0.01 + (s.morale < 50 ? 0.02 : 0) + (s.morale < 20 ? 0.05 : 0);
      s.manpower -= Math.floor(s.manpower * awolRate);
      
      s.budget = Math.max(0, s.budget - 2);
      s.morale = Math.max(0, s.morale - 1);
      s.density = relDensity;
      s.turn += 1;

      // Check Loose Conditions
      if (s.territory <= 0) { s.gameOver = true; s.gameOverReason = "ВТРАТА ТЕРИТОРІАЛЬНОЇ ЦІЛІСНОСТІ"; }
      else if (s.manpower <= 10000) { s.gameOver = true; s.gameOverReason = "КРИТИЧНА ВТРАТА БОЄЗДАТНОСТІ"; }
      else if (s.support <= 0) { s.gameOver = true; s.gameOverReason = "ВТРАТА ЛЕГІТИМНОСТІ ВЛАДИ"; }
      
      setLogs(l => [...l, `[T+${s.turn}] ${res.log}`]);
      return s;
    });

    if (!gameData.gameOver) {
      setCurrentScenario(ALL_SCENARIOS[Math.floor(Math.random() * ALL_SCENARIOS.length)]);
    }
  };

  const shareResult = () => {
    const text = `ENTROPY GAME REPORT\nТиждень: ${gameData.turn}\nТериторія: ${(gameData.territory/1000).toFixed(1)}k\nПричина: ${gameData.gameOverReason}`;
    navigator.clipboard.writeText(text);
    alert("Результат скопійовано!");
  };

  // --- RENDERS ---

  if (gameState === 'intro') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono">
        <style>{globalStyles}</style>
        <div className="max-w-3xl w-full bg-black border-2 border-emerald-900 p-8 md:p-12 relative overflow-hidden shadow-2xl">
          <div className="crt-scanline"></div>
          
          <div className="text-center relative z-10">
            <Terminal size={64} className="text-emerald-500 mx-auto mb-6" />
            <h1 className="text-5xl md:text-7xl font-black text-white mb-2 tracking-tighter terminal-text">ENTROPY</h1>
            <p className="text-emerald-500 uppercase tracking-[0.5em] mb-12 text-sm">Симулятор Неминучості</p>
            
            <div className="text-left bg-zinc-900/50 border border-zinc-800 p-6 mb-10 text-slate-300 space-y-4">
              <h3 className="text-white font-bold uppercase border-b border-zinc-700 pb-2 mb-4">Брифінг:</h3>
              <p>1. <span className="text-emerald-400 font-bold">Ваша мета:</span> Втримати державу якомога довше в умовах тотального дефіциту ресурсів.</p>
              <p>2. <span className="text-emerald-400 font-bold">Реальність:</span> Хороших рішень немає. Ви обираєте між "погано" та "катастрофічно".</p>
              <p>3. <span className="text-emerald-400 font-bold">Загроза:</span> Якщо щільність фронту впаде нижче 50%, втрата територій стане лавиноподібною.</p>
            </div>

            <button 
              onClick={startGame}
              className="group relative bg-emerald-900/20 text-emerald-500 border-2 border-emerald-500 px-12 py-4 text-xl font-bold uppercase hover:bg-emerald-500 hover:text-black transition-all w-full md:w-auto btn-hover"
            >
              <span className="flex items-center justify-center gap-3">
                <Power size={24} /> Ініціалізувати Систему
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameData.gameOver) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono text-slate-200">
        <style>{globalStyles}</style>
        <div className="max-w-xl w-full border-2 border-red-600 bg-black p-8 text-center relative shadow-[0_0_50px_rgba(220,38,38,0.3)]">
          <div className="crt-scanline"></div>
          <Skull size={80} className="text-red-600 mx-auto mb-6 animate-pulse" />
          <h1 className="text-5xl font-black text-red-600 mb-2 tracking-widest uppercase">Система Offline</h1>
          <p className="text-zinc-500 text-sm uppercase tracking-widest mb-8">З'єднання втрачено</p>
          
          <div className="bg-red-950/10 border border-red-900/30 p-6 mb-8 text-left space-y-2">
            <div className="flex justify-between border-b border-red-900/30 pb-2">
              <span className="text-red-400">Час існування:</span>
              <span className="text-white font-bold">{gameData.turn} тижнів</span>
            </div>
            <div className="flex justify-between border-b border-red-900/30 pb-2">
              <span className="text-red-400">Залишок території:</span>
              <span className="text-white font-bold">{(gameData.territory/1000).toFixed(1)}k км²</span>
            </div>
            <div className="pt-2">
              <span className="text-red-400 block mb-1">Причина краху:</span>
              <span className="text-white font-bold uppercase text-sm">{gameData.gameOverReason}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={startGame} className="bg-white text-black px-6 py-3 font-bold uppercase hover:bg-slate-200 transition-colors w-full">
              Спробувати ще раз
            </button>
            <button onClick={shareResult} className="border border-zinc-700 text-zinc-400 px-6 py-3 font-bold uppercase hover:text-white hover:border-white transition-colors w-full flex items-center justify-center gap-2">
              <Share2 size={18} /> Поділитися результатом
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- PLAYING STATE ---
  return (
    // ЦЕНТРУВАННЯ ЯК У GAME.JSX
    <div className="min-h-screen bg-zinc-950 text-slate-300 font-mono p-4 flex justify-center items-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black">
      <style>{globalStyles}</style>
      
      {/* ГОЛОВНИЙ КОНТЕЙНЕР: Фіксовані пропорції, щоб не розвалювався */}
      <div className="w-full max-w-6xl aspect-[16/10] min-h-[600px] bg-black border-2 border-zinc-800 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="crt-scanline"></div>

        {/* HEADER */}
        <header className="bg-zinc-900 border-b border-zinc-800 h-16 flex items-center px-6 justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-black text-xl tracking-[0.2em] text-white">ENTROPY</h1>
            <div className="h-6 w-px bg-zinc-700"></div>
            <div className="flex gap-4 text-xs font-bold tracking-widest">
               <span className="text-emerald-500">T+{gameData.turn}</span>
               <span className="text-red-400 flex items-center gap-1"><MapIcon size={12}/> {(gameData.territory / 1000).toFixed(0)}k</span>
            </div>
          </div>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-zinc-500 hover:text-white">
            {soundEnabled ? <Volume2 size={20}/> : <VolumeX size={20}/>}
          </button>
        </header>

        {/* METRICS STRIP */}
        <div className="grid grid-cols-5 bg-black border-b border-zinc-800 shrink-0 h-20">
          <MetricCard icon={Shield} label="Щільність" value={(gameData.density * 100).toFixed(0) + '%'} color="text-blue-400" warning={gameData.density < DENSITY_CRIT} />
          <MetricCard icon={TrendingDown} label="Мораль" value={gameData.morale} color="text-amber-400" />
          <MetricCard icon={Users} label="Підтримка" value={gameData.support} color="text-emerald-400" />
          <MetricCard icon={Activity} label="Репутація" value={gameData.reputation} color="text-purple-400" />
          <MetricCard icon={BarChart3} label="Бюджет" value={gameData.budget} color="text-cyan-400" />
        </div>

        {/* WORKSPACE */}
        <div className="flex flex-1 overflow-hidden z-10">
          
          {/* LEFT: SCENARIO (60%) */}
          <div className="flex-[3] p-8 flex flex-col border-r border-zinc-800 bg-zinc-950/50 overflow-y-auto">
            {currentScenario && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
                <div className="mb-6">
                   <div className="flex items-center gap-2 mb-3">
                      <span className="bg-emerald-900/30 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">Вхідні дані</span>
                   </div>
                   <h2 className="text-3xl font-black text-white mb-4 uppercase leading-tight">{currentScenario.title}</h2>
                   <p className="text-lg text-slate-400 leading-relaxed font-light border-l-2 border-zinc-700 pl-4">
                     {currentScenario.description}
                   </p>
                </div>

                <div className="mt-auto grid grid-cols-1 gap-3">
                  {currentScenario.choices.map((choice, idx) => (
                    <button
                      key={idx}
                      onClick={() => processTurn(choice.effect)}
                      onMouseEnter={() => soundEnabled && playSound('hover')}
                      className="group relative flex items-center justify-between text-left bg-black border border-zinc-700 p-4 hover:border-emerald-500 hover:bg-zinc-900 transition-all btn-hover"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                           <span className="font-mono text-xs text-zinc-500 group-hover:text-emerald-500 transition-colors">0{idx + 1}</span>
                           <h3 className="font-bold text-base text-slate-200 group-hover:text-white uppercase">{choice.text}</h3>
                        </div>
                        <p className="text-xs text-zinc-500 group-hover:text-zinc-400 leading-snug">{choice.desc}</p>
                      </div>
                      <ChevronRight className="text-zinc-600 group-hover:text-emerald-500 transition-all opacity-50 group-hover:opacity-100" size={18} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: LOGS (40%) */}
          <div className="flex-[2] bg-black flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <Terminal size={12} /> System_Log
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2">
              {logs.map((log, idx) => (
                <div key={idx} className="text-emerald-500/70 border-l border-zinc-800 pl-3 py-1">
                  <span className="opacity-30 mr-2">[{idx}]</span> 
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}