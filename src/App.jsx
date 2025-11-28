import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, TrendingDown, Activity, AlertTriangle, 
  Clock, FileText, Map as MapIcon, Skull, BarChart3, 
  Target, Zap, Radio, Terminal
} from 'lucide-react';

// --- CSS STYLES FOR CRT EFFECT & TERMINAL UI ---
const globalStyles = `
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  @keyframes flicker {
    0% { opacity: 0.97; }
    5% { opacity: 0.95; }
    10% { opacity: 0.9; }
    15% { opacity: 0.95; }
    20% { opacity: 0.99; }
    50% { opacity: 0.95; }
    80% { opacity: 0.9; }
    100% { opacity: 0.97; }
  }
  .crt-overlay {
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    background-size: 100% 2px, 3px 100%;
    pointer-events: none;
  }
  .crt-scanline {
    width: 100%;
    height: 100px;
    z-index: 10;
    background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(32, 255, 77, 0.04) 50%, rgba(0,0,0,0) 100%);
    opacity: 0.1;
    position: absolute;
    bottom: 100%;
    animation: scanline 10s linear infinite;
    pointer-events: none;
  }
  .terminal-text {
    font-family: 'Courier Prime', 'Courier New', monospace;
    text-shadow: 0 0 5px rgba(34, 197, 94, 0.3);
  }
  .btn-tactical {
    transition: all 0.2s;
    border-left: 4px solid transparent;
  }
  .btn-tactical:hover {
    border-left: 4px solid #22c55e;
    background: rgba(34, 197, 94, 0.1);
    padding-left: 1.25rem;
  }
  /* Custom scrollbar */
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #0f172a; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #334155; }
`;

// --- GAME CONFIG ---
const INITIAL_STATE = {
  turn: 1,
  territory: 100000,
  frontLength: 1200,
  manpower: 200000,
  units: 15,
  morale: 75,
  support: 80,
  reputation: 70,
  budget: 60,
  efficiency: 1.0,
  density: 1.0,
  gameOver: false,
  gameOverReason: null
};

const OPTIMAL_UNITS = 10;
const DENSITY_CRIT = 0.5;

// --- EXPANDED SCENARIOS ---
const ALL_SCENARIOS = [
  {
    id: 'leaky_bucket',
    title: 'Криза "Дірявого відра"',
    description: 'Мобілізація дає людей, але до фронту доходить лише 60%. Бригади виснажені. Генеральний штаб вимагає рішення.',
    choices: [
      {
        text: 'Створити нові бригади',
        desc: 'Сформувати 160-ту та 161-шу бригади. Красива картинка для ТБ.',
        effect: (state) => ({
          units: state.units + 2,
          reputation: Math.min(100, state.reputation + 5),
          log: 'Створено нові бригади. Управління ускладнилось (Ефективність ↓).'
        })
      },
      {
        text: 'Поповнити існуючі',
        desc: 'Тихо відправити людей в 72-гу та 110-ту. Жодного піару.',
        effect: (state) => ({
          reputation: Math.max(0, state.reputation - 5),
          addEvent: { type: 'REINFORCEMENT', amount: 5000, turnDelay: 2 },
          log: 'Поповнення старих бригад. Ефективність збережено.'
        })
      },
      {
        text: 'Тотальна "бусифікація"',
        desc: 'Рейди по спортзалах. Швидко, але токсично.',
        effect: (state) => ({
          support: Math.max(0, state.support - 15),
          morale: Math.max(0, state.morale - 10),
          addEvent: { type: 'REINFORCEMENT', amount: 15000, turnDelay: 2 },
          log: 'Масові рейди. Суспільство обурене, мораль впала.'
        })
      }
    ]
  },
  {
    id: 'density_collapse',
    title: 'Загроза прориву (Схід)',
    description: 'Щільність оборони впала до критичної межі. Ворог концентрує сили для удару.',
    choices: [
      {
        text: 'Ні кроку назад!',
        desc: 'Політичний наказ тримати руїни. Високі втрати.',
        effect: (state) => ({
          manpower: Math.floor(state.manpower * 0.9),
          morale: Math.max(0, state.morale - 5),
          log: 'Війська стоять на смерть. Втрати особового складу -10%.'
        })
      },
      {
        text: 'Оперативний відступ',
        desc: 'Здати місто, скоротити лінію фронту, врятувати людей.',
        effect: (state) => ({
          territory: state.territory - 500,
          frontLength: Math.max(800, state.frontLength - 100),
          reputation: Math.max(0, state.reputation - 20),
          morale: Math.max(0, state.morale - 10),
          log: 'Ми відступили. Територію втрачено, але фронт ущільнено.'
        })
      },
      {
        text: 'Кинути спецрезерв',
        desc: 'Відправити операторів БПЛА в окопи як піхоту.',
        effect: (state) => ({
          budget: Math.max(0, state.budget - 30),
          manpower: state.manpower + 2000,
          efficiency: state.efficiency * 0.95,
          log: 'Елітні фахівці загинули в окопах. Ситуацію стабілізовано тимчасово.'
        })
      }
    ]
  },
  {
    id: 'energy_crisis',
    title: 'Блекаут та Логістика',
    description: 'Ворог знищив ключові ТЕС. Залізниця зупинилася. Потрібно перерозподілити дизель.',
    choices: [
      {
        text: 'Пріоритет армії',
        desc: 'Все паливо на фронт. Міста без світла та тепла.',
        effect: (state) => ({
          support: Math.max(0, state.support - 20),
          efficiency: state.efficiency, // maintained
          log: 'Тил сидить у темряві. Армія забезпечена паливом.'
        })
      },
      {
        text: 'Баланс (Рятувати економіку)',
        desc: 'Дати частину палива бізнесу, щоб був Бюджет.',
        effect: (state) => ({
          budget: Math.min(100, state.budget + 10),
          manpower: state.manpower - 1000, // logistics failure
          log: 'Спроба врятувати економіку. Логістика фронту постраждала.'
        })
      }
    ]
  },
  {
    id: 'shell_hunger',
    title: 'Снарядний голод',
    description: 'Західна допомога затримується на 2 місяці. Артилерія мовчить.',
    choices: [
      {
        text: 'FPV-дрони замість арти',
        desc: 'Масова закупівля дронів. Дешевше, але менший радіус.',
        effect: (state) => ({
          budget: Math.max(0, state.budget - 15),
          density: state.density * 1.05, // temporary boost
          log: 'Ставка на FPV. Це допомагає в ближньому бою.'
        })
      },
      {
        text: 'Розконсервація мотлоху',
        desc: 'Використати гармати 1950-х років. Високий ризик розриву стволів.',
        effect: (state) => ({
          morale: Math.max(0, state.morale - 5),
          efficiency: state.efficiency * 0.98,
          log: 'Стара техніка ламається, але хоч щось стріляє.'
        })
      }
    ]
  },
  {
    id: 'corruption_scandal',
    title: 'Скандал із закупівлями',
    description: 'Журналісти виявили завищені ціни на їжу. Суспільство вимагає голів.',
    choices: [
      {
        text: 'Звільнити генерала',
        desc: 'Покарати винного. Хаос в управлінні на час передачі справ.',
        effect: (state) => ({
          efficiency: state.efficiency * 0.9,
          reputation: Math.min(100, state.reputation + 10),
          log: 'Гучне звільнення. Рейтинг врятовано, але штаб паралізовано.'
        })
      },
      {
        text: 'Ігнорувати ("На часі")',
        desc: 'Зам\'яти скандал. "Не розхитуйте човен".',
        effect: (state) => ({
          support: Math.max(0, state.support - 15),
          reputation: Math.max(0, state.reputation - 10),
          log: 'Скандал зам\'ято. Довіра волонтерів впала.'
        })
      }
    ]
  },
   {
    id: 'training_center',
    title: 'Якість підготовки',
    description: 'Новобранці гинуть в першому ж бою. Потрібно збільшити час підготовки.',
    choices: [
      {
        text: 'Збільшити курс до 3 місяців',
        desc: 'Якісні солдати, але фронт не отримає поповнення 12 тижнів.',
        effect: (state) => ({
          manpower: state.manpower - 2000, // gap in reinforcement
          efficiency: Math.min(1.0, state.efficiency + 0.05),
          morale: Math.min(100, state.morale + 5),
          log: 'Реформа навчання. Фронт "голодує" без людей, але якість зросте.'
        })
      },
      {
        text: 'Експрес-курс (3 тижні)',
        desc: 'Швидко закрити дірки. Високі втрати у майбутньому.',
        effect: (state) => ({
          addEvent: { type: 'REINFORCEMENT', amount: 8000, turnDelay: 1 },
          morale: Math.max(0, state.morale - 5),
          log: 'Конвеєр "м\'яса". Діри закрито, але ціною життів.'
        })
      }
    ]
  }
];

// --- HELPER COMPONENTS ---

const MetricCard = ({ icon: Icon, label, value, color, warning }) => (
  <div className={`
    relative bg-slate-900/80 border p-3 flex flex-col items-center justify-center min-w-[100px] backdrop-blur-sm transition-all
    ${warning ? 'border-red-500 animate-pulse bg-red-950/20' : 'border-slate-700 hover:border-slate-500'}
  `}>
    {warning && (
      <div className="absolute -top-2 -right-2 text-red-500 bg-black rounded-full p-0.5 border border-red-500">
        <AlertTriangle size={12} />
      </div>
    )}
    <div className={`flex items-center gap-2 mb-2 ${color}`}>
      <Icon size={16} />
      <span className="font-mono text-xs uppercase tracking-widest opacity-80">{label}</span>
    </div>
    <span className={`text-2xl font-mono font-bold terminal-text ${color}`}>
      {typeof value === 'number' ? value.toFixed(0) : value}
    </span>
    {/* Decorative corner markers */}
    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-600"></div>
    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-600"></div>
  </div>
);

const ProgressBar = ({ value, max = 100, color = "bg-emerald-500", label }) => (
  <div className="w-full mb-4">
    <div className="flex justify-between text-xs mb-1 font-mono text-slate-400 uppercase">
      <span>{label}</span>
      <span>{value.toFixed(0)}%</span>
    </div>
    <div className="h-3 bg-slate-900 border border-slate-700 relative overflow-hidden">
      {/* Striped background for empty part */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_25%,rgba(255,255,255,0.1)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.1)_75%,rgba(255,255,255,0.1)_100%)] bg-[length:10px_10px]"></div>
      
      <div 
        className={`h-full ${color} transition-all duration-700 relative`} 
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      >
        {/* Shine effect */}
        <div className="absolute top-0 right-0 h-full w-1 bg-white opacity-50 shadow-[0_0_10px_white]"></div>
      </div>
    </div>
  </div>
);

// --- MAIN APP ---

export default function DefenseEntropyGame() {
  const [gameState, setGameState] = useState(INITIAL_STATE);
  const [eventQueue, setEventQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [scenarioDeck, setScenarioDeck] = useState([]); // "Deck" logic to prevent repeats
  const [activeTab, setActiveTab] = useState('briefing');
  
  const logsEndRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Init Game
  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    setGameState(INITIAL_STATE);
    setEventQueue([]);
    setLogs(["[SYSTEM INIT]... ВІДНОВЛЕННЯ З'ЄДНАННЯ", "ОПЕРАТИВНИЙ КОНТРОЛЬ ВСТАНОВЛЕНО."]);
    // Create a shuffled deck
    reshuffleDeck(ALL_SCENARIOS);
  };

  const reshuffleDeck = (scenarios) => {
    const shuffled = [...scenarios].sort(() => Math.random() - 0.5);
    setScenarioDeck(shuffled);
    setCurrentScenario(shuffled[0]);
  };

  const drawNextScenario = () => {
    let newDeck = [...scenarioDeck];
    newDeck.shift(); // Remove current

    if (newDeck.length === 0) {
      // Deck empty? Reshuffle ALL, but ensure the very first one isn't the one we just played
      const justPlayedId = currentScenario.id;
      let reshuffled = [...ALL_SCENARIOS].sort(() => Math.random() - 0.5);
      
      // Simple swap if first card is same as last played
      if (reshuffled[0].id === justPlayedId && reshuffled.length > 1) {
        [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
      }
      
      newDeck = reshuffled;
      setLogs(prev => [...prev, ">> ОНОВЛЕННЯ ОПЕРАТИВНИХ ДАНИХ... НОВІ ВИКЛИКИ."]);
    }
    
    setScenarioDeck(newDeck);
    setCurrentScenario(newDeck[0]);
  };

  // --- CALCULATION ENGINE ---

  const calculateEfficiency = (units) => {
    const alpha = 0.1;
    const beta = 0.25;
    return 1 / (1 + alpha * Math.exp(beta * (units - OPTIMAL_UNITS)));
  };

  const calculateAttrition = (state, efficiency) => {
    const soldiersPerKm = state.manpower / state.frontLength;
    const densityNorm = 150; 
    const relativeDensity = soldiersPerKm / densityNorm;

    let loss = 50; // Base creep
    if (relativeDensity < DENSITY_CRIT) {
      loss += 100 * Math.exp(5 * (DENSITY_CRIT - relativeDensity));
    }
    loss = loss / efficiency; 
    return { loss, relativeDensity };
  };

  const processTurn = (choiceEffect) => {
    setGameState(prev => {
      let newState = { ...prev };
      
      // 1. Choice Effect
      const choiceResult = choiceEffect(newState);
      newState = { ...newState, ...choiceResult };
      
      if (choiceResult.addEvent) {
        setEventQueue(q => [...q, { ...choiceResult.addEvent, turnDue: newState.turn + choiceResult.addEvent.turnDelay }]);
        delete newState.addEvent;
      }
      
      // Log formatting
      const turnLog = `[T+${newState.turn}] >> ${choiceResult.log}`;

      // 2. Events
      const dueEvents = eventQueue.filter(e => e.turnDue === newState.turn + 1);
      const remainingEvents = eventQueue.filter(e => e.turnDue !== newState.turn + 1);
      setEventQueue(remainingEvents);

      dueEvents.forEach(e => {
        if (e.type === 'REINFORCEMENT') {
          let arrivalEfficiency = 0.7;
          if (newState.morale < 40) arrivalEfficiency -= 0.2;
          const actualArrivals = Math.floor(e.amount * arrivalEfficiency);
          newState.manpower += actualArrivals;
          setLogs(l => [...l, `[LOG] ПРИБУЛО ПІДКРІПЛЕННЯ: +${actualArrivals}`]);
        }
      });

      // 3. Metrics
      newState.efficiency = calculateEfficiency(newState.units);
      const { loss, relativeDensity } = calculateAttrition(newState, newState.efficiency);
      newState.density = relativeDensity;
      newState.territory -= loss;
      
      // AWOL
      let awolRate = 0.01;
      if (newState.morale < 50) awolRate += 0.2 * Math.pow((50 - newState.morale) / 50, 2);
      const awolLosses = Math.floor(newState.manpower * awolRate);
      newState.manpower -= awolLosses;

      // Natural Decay
      newState.budget = Math.max(0, newState.budget - 2);
      newState.morale = Math.max(0, newState.morale - 1);
      
      if (loss > 200) setLogs(l => [...l, `!!! УВАГА: ПРОРИВ ФРОНТУ (-${loss.toFixed(0)} км²)`]);
      else setLogs(l => [...l, `Втрата території: -${loss.toFixed(0)} км²`]);

      // 4. Game Over
      if (newState.territory <= 0) { newState.gameOver = true; newState.gameOverReason = "ТЕРИТОРІАЛЬНИЙ КОЛАПС"; }
      else if (newState.support <= 0 && newState.reputation <= 0) { newState.gameOver = true; newState.gameOverReason = "ВТРАТА ЛЕГІТИМНОСТІ"; }
      else if (newState.manpower <= 5000) { newState.gameOver = true; newState.gameOverReason = "ДЕМОГРАФІЧНИЙ КОЛАПС АРМІЇ"; }

      newState.turn += 1;
      setLogs(l => [...l, turnLog]);
      return newState;
    });

    drawNextScenario();
  };

  // --- RENDER ---

  if (gameState.gameOver) {
    return (
      <div className="h-screen w-full bg-black text-green-500 font-mono flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <style>{globalStyles}</style>
        <div className="crt-overlay absolute inset-0 z-50"></div>
        <div className="crt-scanline"></div>
        
        <div className="border-4 border-red-900 p-8 bg-black/90 z-10 max-w-lg text-center shadow-[0_0_50px_rgba(255,0,0,0.3)]">
          <Skull size={64} className="text-red-600 mx-auto mb-6 animate-pulse" />
          <h1 className="text-4xl font-bold mb-4 text-red-600 tracking-tighter">СИСТЕМА OFFLINE</h1>
          <p className="text-xl text-red-400 mb-6 font-bold">{gameState.gameOverReason}</p>
          <div className="text-green-500 text-left space-y-2 mb-8 border-t border-b border-red-900/50 py-4">
            <p>ЧАС ІСНУВАННЯ: {gameState.turn} ТИЖНІВ</p>
            <p>ЗАЛИШОК ТЕРИТОРІЇ: {(gameState.territory / 1000).toFixed(1)}k км²</p>
          </div>
          <button 
            onClick={startNewGame}
            className="w-full bg-red-900/20 border border-red-600 text-red-500 py-3 hover:bg-red-600 hover:text-black transition-all uppercase font-bold tracking-widest"
          >
            ПЕРЕЗАВАНТАЖЕННЯ СИСТЕМИ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-black text-slate-300 font-mono flex flex-col md:flex-row overflow-hidden relative selection:bg-green-900 selection:text-white">
      <style>{globalStyles}</style>
      <div className="crt-overlay absolute inset-0 z-50 pointer-events-none"></div>
      <div className="crt-scanline"></div>

      {/* LEFT SIDEBAR: LOGS */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-zinc-950 border-r border-zinc-800 flex flex-col h-[300px] md:h-screen z-10">
        <div className="p-3 border-b border-zinc-800 bg-black flex items-center justify-between">
          <h2 className="text-xs font-bold text-emerald-500 flex items-center gap-2 tracking-widest uppercase">
            <Terminal size={14} /> Системний Журнал
          </h2>
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2 font-mono text-xs">
          {logs.map((log, idx) => (
            <div key={idx} className={`leading-relaxed ${log.includes('!!!') ? 'text-red-400 font-bold border-l-2 border-red-500 pl-2' : 'text-emerald-500/80'}`}>
              <span className="opacity-50 mr-2">{idx > 0 ? `>` : `$`}</span>
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden z-10 relative bg-zinc-900/50">
        
        {/* HEADER STATS */}
        <div className="bg-zinc-950 border-b border-zinc-800 p-4 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <span className="bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 px-3 py-1 text-sm font-bold tracking-wider">
                ТИЖДЕНЬ {gameState.turn}
              </span>
              <span className="bg-red-900/10 border border-red-500/30 text-red-400 px-3 py-1 text-sm flex items-center gap-2">
                <MapIcon size={14} /> {(gameState.territory / 1000).toFixed(1)}k KM²
              </span>
            </div>
            {eventQueue.length > 0 && (
              <div className="text-xs text-amber-500 flex items-center gap-1 animate-pulse border border-amber-500/50 px-2 py-1 bg-amber-900/10">
                <Clock size={12} /> PENDING: {eventQueue.length}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
            <MetricCard 
              icon={Shield} label="Щільність" 
              value={(gameState.density * 100).toFixed(0) + '%'} 
              color="text-blue-400" 
              warning={gameState.density < DENSITY_CRIT} 
            />
            <MetricCard icon={TrendingDown} label="Мораль" value={gameState.morale} color="text-amber-400" />
            <MetricCard icon={Users} label="Підтримка" value={gameState.support} color="text-emerald-400" />
            <MetricCard icon={Activity} label="Репутація" value={gameState.reputation} color="text-purple-400" />
            <MetricCard icon={BarChart3} label="Бюджет" value={gameState.budget} color="text-cyan-400" />
          </div>
        </div>

        {/* WORKSPACE */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6 relative">
          
          {/* TABS */}
          <div className="flex gap-1 border-b border-zinc-800">
            <button 
              onClick={() => setActiveTab('briefing')}
              className={`px-6 py-2 text-sm font-bold uppercase tracking-widest border-t border-l border-r transition-all ${activeTab === 'briefing' ? 'bg-zinc-800 border-zinc-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              Ситуаційна Кімната
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-2 text-sm font-bold uppercase tracking-widest border-t border-l border-r transition-all ${activeTab === 'analytics' ? 'bg-zinc-800 border-zinc-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              Аналітика G-3
            </button>
          </div>

          {activeTab === 'briefing' && currentScenario && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* SCENARIO CARD */}
              <div className="bg-black border border-zinc-700 p-6 mb-6 relative shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                {/* Decorative UI Lines */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
                <div className="absolute -left-1 top-4 bottom-4 w-1 bg-zinc-800 flex flex-col justify-between py-2">
                    <div className="w-full h-8 bg-emerald-500/20"></div>
                    <div className="w-full h-8 bg-emerald-500/20"></div>
                </div>

                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold text-white uppercase tracking-tight terminal-text">
                        <span className="text-emerald-500 mr-2">>>></span>
                        {currentScenario.title}
                    </h2>
                    <span className="text-xs font-mono text-zinc-500 border border-zinc-800 px-2 py-1">SCENARIO_ID: {currentScenario.id.toUpperCase()}</span>
                </div>
                
                <p className="text-lg text-slate-300 mb-6 font-light leading-relaxed border-l-2 border-zinc-800 pl-4">
                  {currentScenario.description}
                </p>
                
                {/* Warning Flags */}
                {gameState.efficiency < 0.5 && (
                  <div className="flex items-center gap-3 text-red-400 text-sm bg-red-950/30 border border-red-900/50 p-3 mb-4 animate-pulse">
                    <AlertTriangle size={18} />
                    <span className="font-bold tracking-wider">УВАГА: ВТРАТА КЕРОВАНОСТІ (ХАОС {((1 - gameState.efficiency) * 100).toFixed(0)}%)</span>
                  </div>
                )}
              </div>

              {/* CHOICES */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentScenario.choices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => processTurn(choice.effect)}
                    className="btn-tactical group relative flex flex-col text-left bg-zinc-900 border border-zinc-700 p-5 hover:bg-zinc-800 transition-all overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Target size={48} />
                    </div>
                    <span className="font-mono text-xs text-emerald-500 mb-2 tracking-widest group-hover:text-emerald-400">
                        ВАРІАНТ 0{idx + 1}
                    </span>
                    <h3 className="font-bold text-lg text-white mb-2 font-mono group-hover:text-emerald-300 transition-colors">
                        {choice.text}
                    </h3>
                    <p className="text-sm text-slate-400 leading-snug font-mono opacity-80 group-hover:opacity-100">
                        {choice.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-black border border-zinc-700 p-6 relative">
                 <h3 className="text-emerald-500 font-bold mb-6 flex items-center gap-2 uppercase tracking-wider border-b border-zinc-800 pb-2">
                    <TrendingDown size={18} /> Ефективність Управління
                 </h3>
                 <div className="space-y-6">
                   <ProgressBar label="Span of Control" value={gameState.efficiency * 100} color={gameState.efficiency < 0.5 ? 'bg-red-500' : 'bg-blue-500'} />
                   <div className="flex justify-between text-xs font-mono text-zinc-500">
                        <span>UNIT_COUNT: {gameState.units}</span>
                        <span>OPTIMAL: {OPTIMAL_UNITS}</span>
                   </div>
                   <p className="text-xs text-slate-400 border-l-2 border-zinc-700 pl-3">
                     Перевищення норми створює "Туман Війни" та затримки наказів. Коефіцієнт ефективності прямо впливає на здатність утримувати території.
                   </p>
                   
                   <div className="h-px bg-zinc-800 my-4"></div>
                   
                   <ProgressBar label="Рівень СЗЧ" value={Math.min(100, (1 - (gameState.morale/100)) * 50)} color="bg-red-500" />
                   <p className="text-xs text-slate-400 border-l-2 border-zinc-700 pl-3">
                     Прогнозовані втрати через дезертирство. Критичне зростання при моралі &lt; 50%.
                   </p>
                </div>
              </div>

              <div className="bg-black border border-zinc-700 p-6 relative">
                <h3 className="text-emerald-500 font-bold mb-6 flex items-center gap-2 uppercase tracking-wider border-b border-zinc-800 pb-2">
                    <Shield size={18} /> Щільність Фронту
                </h3>
                <div className="space-y-4 font-mono">
                  <div className="flex justify-between items-center p-2 bg-zinc-900 border border-zinc-800">
                    <span className="text-slate-400 text-sm">ОСОБОВИЙ СКЛАД</span>
                    <span className="text-white font-bold">{gameState.manpower.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-zinc-900 border border-zinc-800">
                    <span className="text-slate-400 text-sm">ДОВЖИНА ЛІНІЇ</span>
                    <span className="text-white font-bold">{gameState.frontLength} KM</span>
                  </div>
                  <div className="p-4 border border-zinc-800 bg-zinc-900/50 text-center">
                    <div className="text-xs text-slate-500 mb-1">ПОТОЧНА ЩІЛЬНІСТЬ</div>
                    <div className={`text-3xl font-bold ${gameState.density < DENSITY_CRIT ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
                      {(gameState.density * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">ВІД НОРМАТИВУ</div>
                  </div>
                  
                  <div className="text-xs text-amber-500/80 mt-4 flex gap-2 items-start">
                    <AlertTriangle size={14} className="mt-0.5" />
                    <span>
                      FORCE-TO-SPACE RATIO: При падінні щільності нижче 50%, втрати території зростають за експонентою (колапс фронту).
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}