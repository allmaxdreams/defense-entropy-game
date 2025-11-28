import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, TrendingDown, Activity, AlertTriangle, 
  Clock, Map as MapIcon, Skull, BarChart3, 
  Target, Terminal, ChevronRight
} from 'lucide-react';

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
    top: 0;
    left: 0;
    pointer-events: none;
    animation: scanline 8s linear infinite;
  }
`;

// --- CONFIG ---
const INITIAL_STATE = {
  turn: 1, territory: 100000, frontLength: 1200, manpower: 200000, units: 15,
  morale: 75, support: 80, reputation: 70, budget: 60,
  efficiency: 1.0, density: 1.0, gameOver: false, gameOverReason: null
};

const DENSITY_CRIT = 0.5;

const ALL_SCENARIOS = [
  {
    id: 'leaky_bucket',
    title: 'Криза "Дірявого відра"',
    description: 'Мобілізація дає людей, але до фронту доходить лише 60%. Бригади виснажені. Генеральний штаб вимагає рішення.',
    choices: [
      { text: 'Створити нові бригади', desc: 'Красива картинка для ТБ, але хаос в управлінні.', effect: (s) => ({ units: s.units + 2, reputation: Math.min(100, s.reputation + 5), log: 'Створено нові бригади. Ефективність впала.' }) },
      { text: 'Поповнити існуючі', desc: 'Тихо відправити людей в 72-гу та 110-ту. Ефективно.', effect: (s) => ({ reputation: Math.max(0, s.reputation - 5), addEvent: { type: 'REINFORCEMENT', amount: 5000, turnDelay: 2 }, log: 'Поповнення старих бригад.' }) },
      { text: 'Тотальна мобілізація', desc: 'Рейди. Швидко, але токсично.', effect: (s) => ({ support: Math.max(0, s.support - 15), morale: Math.max(0, s.morale - 10), addEvent: { type: 'REINFORCEMENT', amount: 15000, turnDelay: 2 }, log: 'Масові рейди. Мораль впала.' }) }
    ]
  },
  {
    id: 'density_collapse',
    title: 'Загроза прориву (Схід)',
    description: 'Щільність оборони впала до критичної межі. Ворог концентрує сили для удару.',
    choices: [
      { text: 'Ні кроку назад!', desc: 'Політичний наказ. Високі втрати.', effect: (s) => ({ manpower: Math.floor(s.manpower * 0.9), morale: Math.max(0, s.morale - 5), log: 'Війська стоять на смерть. Втрати -10%.' }) },
      { text: 'Оперативний відступ', desc: 'Здати місто, врятувати людей.', effect: (s) => ({ territory: s.territory - 500, frontLength: Math.max(800, s.frontLength - 100), reputation: Math.max(0, s.reputation - 20), morale: Math.max(0, s.morale - 10), log: 'Відступ. Територію втрачено, фронт ущільнено.' }) },
      { text: 'Кинути спецрезерв', desc: 'Оператори БПЛА в окопах як піхота.', effect: (s) => ({ budget: Math.max(0, s.budget - 30), manpower: s.manpower + 2000, efficiency: s.efficiency * 0.95, log: 'Еліта загинула в окопах. Ситуацію стабілізовано.' }) }
    ]
  },
  {
    id: 'shells',
    title: 'Снарядний голод',
    description: 'Артилерія мовчить. Потрібне рішення.',
    choices: [
      { text: 'FPV замість арти', desc: 'Масова закупівля дронів.', effect: (s) => ({ budget: Math.max(0, s.budget - 15), density: s.density * 1.05, log: 'Ставка на FPV.' }) },
      { text: 'Старі гармати', desc: 'Техніка 50-х років. Ризиковано.', effect: (s) => ({ morale: Math.max(0, s.morale - 5), efficiency: s.efficiency * 0.98, log: 'Техніка ламається, але стріляє.' }) }
    ]
  }
];

const MetricCard = ({ icon: Icon, label, value, color, warning }) => (
  <div className={`
    relative bg-zinc-900/50 border border-zinc-700 p-3 flex flex-col justify-between
    ${warning ? 'border-red-500 bg-red-950/20 animate-pulse' : ''}
  `}>
    <div className={`flex items-center gap-2 mb-1 ${color}`}>
      <Icon size={18} />
      <span className="font-mono text-xs font-bold uppercase tracking-widest opacity-80">{label}</span>
    </div>
    <span className={`text-3xl font-mono font-bold ${color}`}>
      {typeof value === 'number' ? value.toFixed(0) : value}
    </span>
  </div>
);

export default function DefenseEntropyGame() {
  const [gameState, setGameState] = useState(INITIAL_STATE);
  const [logs, setLogs] = useState(["[SYSTEM INIT]... З'ЄДНАННЯ ВСТАНОВЛЕНО"]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { startNewGame(); }, []);

  const startNewGame = () => {
    setGameState(INITIAL_STATE);
    setLogs(["[SYSTEM INIT]... З'ЄДНАННЯ ВСТАНОВЛЕНО"]);
    setCurrentScenario(ALL_SCENARIOS.sort(() => Math.random() - 0.5)[0]);
  };

  const processTurn = (choiceEffect) => {
    setGameState(prev => {
      let s = { ...prev };
      const res = choiceEffect(s);
      s = { ...s, ...res };
      s.efficiency = 1 / (1 + 0.1 * Math.exp(0.25 * (s.units - 10)));
      const relDensity = (s.manpower / s.frontLength) / 150;
      let loss = 50;
      if (relDensity < DENSITY_CRIT) loss += 100;
      s.territory -= loss;
      s.turn += 1;
      if (s.territory <= 0) { s.gameOver = true; s.gameOverReason = "ТЕРИТОРІАЛЬНИЙ КОЛАПС"; }
      setLogs(l => [...l, `[T+${s.turn}] ${res.log}`]);
      return s;
    });
    setCurrentScenario(ALL_SCENARIOS[Math.floor(Math.random() * ALL_SCENARIOS.length)]);
  };

  if (gameState.gameOver) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono text-slate-200">
        <div className="max-w-lg w-full border-2 border-red-600 bg-black p-8 text-center shadow-[0_0_50px_rgba(220,38,38,0.5)]">
          <Skull size={64} className="text-red-600 mx-auto mb-6" />
          <h1 className="text-4xl font-black text-red-600 mb-4 tracking-widest">СИСТЕМА OFFLINE</h1>
          <p className="text-xl mb-8">{gameState.gameOverReason}</p>
          <button onClick={startNewGame} className="bg-red-900/20 border border-red-600 text-red-500 px-8 py-3 hover:bg-red-600 hover:text-black transition-colors uppercase font-bold tracking-widest">
            REBOOT
          </button>
        </div>
      </div>
    );
  }

  return (
    // ЗОВНІШНІЙ КОНТЕЙНЕР (Як у Game.jsx)
    // min-h-screen + flex + justify-center центрують гру на екрані, не розтягуючи її на всю ширину
    <div className="min-h-screen bg-zinc-950 text-slate-300 font-mono p-4 md:p-8 flex justify-center items-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black">
      <style>{globalStyles}</style>
      
      {/* ОСНОВНЕ ВІКНО ГРИ (Обмежена ширина max-w-6xl, як у прикладі) */}
      <div className="w-full max-w-6xl bg-black border-2 border-zinc-800 shadow-2xl relative flex flex-col min-h-[800px] overflow-hidden">
        <div className="crt-scanline"></div>

        {/* HEADER */}
        <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex flex-col md:flex-row justify-between items-center gap-4 z-10">
          <div className="flex items-center gap-6 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                <Terminal size={20} className="text-emerald-500" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-[0.2em] text-white leading-none">ENTROPY <span className="text-red-500 text-xs">OS</span></h1>
                <div className="text-[10px] text-zinc-500 uppercase mt-1">ОПЕРАТИВНИЙ КОНТРОЛЬ</div>
              </div>
            </div>
            <div className="h-8 w-px bg-zinc-800"></div>
            <div>
               <div className="text-[10px] text-zinc-500 uppercase">ЧАС</div>
               <div className="text-xl font-bold text-emerald-500">T+{gameState.turn}</div>
            </div>
            <div>
               <div className="text-[10px] text-zinc-500 uppercase">ТЕРИТОРІЯ</div>
               <div className="text-xl font-bold text-red-400">{(gameState.territory / 1000).toFixed(0)}k</div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 w-full md:w-auto flex-1 md:max-w-2xl">
            <MetricCard icon={Shield} label="Щільність" value={(gameState.density * 100).toFixed(0) + '%'} color="text-blue-400" warning={gameState.density < DENSITY_CRIT} />
            <MetricCard icon={TrendingDown} label="Мораль" value={gameState.morale} color="text-amber-400" />
            <MetricCard icon={Users} label="Підтримка" value={gameState.support} color="text-emerald-400" />
            <MetricCard icon={Activity} label="Репутація" value={gameState.reputation} color="text-purple-400" />
            <MetricCard icon={BarChart3} label="Бюджет" value={gameState.budget} color="text-cyan-400" />
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <div className="flex flex-col lg:flex-row flex-1 relative z-10">
          
          {/* LEFT: SCENARIO (65%) */}
          <div className="flex-[2] p-6 md:p-8 flex flex-col gap-6 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-zinc-950/30">
            {currentScenario && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col h-full">
                
                {/* Scenario Description */}
                <div className="mb-8 relative">
                   <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-transparent opacity-50"></div>
                   <div className="flex items-center gap-3 mb-4">
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 text-xs font-bold tracking-widest border border-emerald-500/20">ВХІДНІ ДАНІ</span>
                   </div>
                   <h2 className="text-3xl font-bold text-white mb-4 uppercase tracking-tight">{currentScenario.title}</h2>
                   <p className="text-lg text-slate-400 leading-relaxed font-light">{currentScenario.description}</p>
                </div>

                {/* Choices Grid */}
                <div className="mt-auto grid grid-cols-1 gap-4">
                  {currentScenario.choices.map((choice, idx) => (
                    <button
                      key={idx}
                      onClick={() => processTurn(choice.effect)}
                      className="group relative flex items-center justify-between text-left bg-black border border-zinc-700 p-5 hover:border-emerald-500 hover:bg-zinc-900 transition-all"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                           <span className="font-mono text-xs text-zinc-500 group-hover:text-emerald-500 transition-colors">0{idx + 1}</span>
                           <h3 className="font-bold text-lg text-slate-200 group-hover:text-white uppercase">{choice.text}</h3>
                        </div>
                        <p className="text-sm text-zinc-500 group-hover:text-zinc-400 leading-snug">{choice.desc}</p>
                      </div>
                      <ChevronRight className="text-zinc-600 group-hover:text-emerald-500 transition-all opacity-50 group-hover:opacity-100 group-hover:translate-x-1" size={20} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: LOGS (35%) */}
          <div className="flex-[1] bg-black flex flex-col min-h-[300px] lg:min-h-0">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest">
              <Terminal size={14} /> Системний журнал
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-3">
              {logs.map((log, idx) => (
                <div key={idx} className="text-emerald-500/70 border-l border-zinc-800 pl-3 py-1 hover:bg-white/5 transition-colors">
                  <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}]</span> 
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