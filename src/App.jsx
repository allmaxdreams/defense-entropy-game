import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Users, TrendingDown, Activity, AlertTriangle, 
  Clock, Map as MapIcon, Skull, BarChart3, 
  Terminal, ChevronRight, Share2, Volume2, VolumeX, Power, Database
} from 'lucide-react';

// --- MATH ENGINE CONSTANTS ---
const CONFIG = {
  OPTIMAL_SPAN_OF_CONTROL: 10, // Оптимальна к-сть бригад
  BASE_TERRITORY_LOSS: 50,     // "Повзуча" втрата км²/тиждень
  CRITICAL_DENSITY: 0.6,       // Поріг щільності, нижче якого фронт сиплеться
  MOBILIZATION_LAG: 3,         // Тижні затримки підготовки
  MAX_TURN: 52                 // Рік війни
};

// --- STYLES ---
const globalStyles = `
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  .crt-scanline {
    width: 100%;
    height: 100px;
    z-index: 50;
    background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(32, 255, 77, 0.04) 50%, rgba(0,0,0,0) 100%);
    opacity: 0.1;
    position: absolute;
    bottom: 100%;
    animation: scanline 8s linear infinite;
    pointer-events: none;
  }
  body { background-color: #000; overflow-x: hidden; }
  
  /* Blinking cursor for terminal feel */
  .cursor-blink { animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
`;

// --- AUDIO ENGINE ---
const playSound = (type, enabled) => {
  if (!enabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) {}
};

// --- SCENARIO GENERATOR ---
// Замість статичного списку, ми генеруємо події на основі стану системи
const generateIncident = (state) => {
  const incidents = [];

  // 1. DENSITY CRISIS (Якщо щільність низька)
  if (state.density < CONFIG.CRITICAL_DENSITY) {
    incidents.push({
      title: "ЗАГРОЗА ПРОРИВУ",
      type: 'critical',
      desc: `Щільність військ впала до критичних ${(state.density*100).toFixed(0)}%. Ворог накопичує сили для удару в стик бригад.`,
      choices: [
        { 
          text: "Скоротити лінію фронту", 
          desc: "Відступити, здати території, але врятувати людей і підняти щільність.", 
          effect: (s) => ({ 
            territory: s.territory - 800, 
            frontLength: Math.max(500, s.frontLength - 100), 
            reputation: Math.max(0, s.reputation - 15), 
            morale: Math.max(0, s.morale - 10),
            log: "Організований відступ. Щільність відновлено." 
          }) 
        },
        { 
          text: "Тримати позиції", 
          desc: "Політичний наказ 'Ні кроку назад'. Високі втрати.", 
          effect: (s) => ({ 
            manpower: Math.floor(s.manpower * 0.9), 
            morale: Math.max(0, s.morale - 5), 
            log: "Героїчна оборона. Бригада втратила боєздатність." 
          }) 
        }
      ]
    });
  }

  // 2. MANAGEMENT CHAOS (Якщо багато бригад)
  if (state.efficiency < 0.6) {
    incidents.push({
      title: "ПАРАЛІЧ ШТАБУ",
      type: 'management',
      desc: `Через надмірну кількість підрозділів (${state.units}) накази доходять із запізненням на 48 годин.`,
      choices: [
        { 
          text: "Розформувати нові бригади", 
          desc: "Влити їх як батальйони в старі бригади. Непопулярно серед командирів.", 
          effect: (s) => ({ 
            units: Math.max(10, s.units - 2), 
            reputation: Math.max(0, s.reputation - 10), 
            efficiency: Math.min(1.0, s.efficiency + 0.15),
            log: "Оптимізація структури. Керованість покращилась." 
          }) 
        },
        { 
          text: "Створити ОТУ (Прокладку)", 
          desc: "Створити проміжну ланку управління. Коштує грошей.", 
          effect: (s) => ({ 
            budget: Math.max(0, s.budget - 20), 
            efficiency: Math.min(1.0, s.efficiency + 0.05), 
            log: "Створено нові штаби. Бюрократія зросла." 
          }) 
        }
      ]
    });
  }

  // 3. MORALE / AWOL (Якщо низька мораль)
  if (state.morale < 40) {
    incidents.push({
      title: "МАСОВЕ СЗЧ",
      type: 'morale',
      desc: "Бійці залишають позиції цілими взводами. Потрібна реакція.",
      choices: [
        { 
          text: "Репресивні заходи", 
          desc: "Загороджувальні загони та арешти.", 
          effect: (s) => ({ 
            morale: Math.max(0, s.morale - 20), 
            manpower: Math.floor(s.manpower * 0.98), // Трохи зупиняє втечу, але вбиває мораль
            support: Math.max(0, s.support - 15),
            log: "Жорсткі заходи. Армія деморалізована." 
          }) 
        },
        { 
          text: "Ротація (Обіцянка)", 
          desc: "Пообіцяти відпочинок, якого немає.", 
          effect: (s) => ({ 
            reputation: Math.max(0, s.reputation - 20), 
            morale: Math.min(100, s.morale + 15), 
            log: "Обіцянки заспокоїли бунт. Надовго?" 
          }) 
        }
      ]
    });
  }

  // DEFAULT SCENARIOS (Якщо немає критичних, даємо ресурсні дилеми)
  const defaultScenarios = [
    {
      title: "Питання Мобілізації",
      desc: "Потік добровольців вичерпано. Як поповнювати резерви?",
      choices: [
        { text: "Нові бригади (для картинки)", desc: "Створити 155-ту та 156-ту бригади.", effect: (s) => ({ units: s.units + 2, reputation: s.reputation + 5, log: "Створено нові бригади. Ефективність впала." }) },
        { text: "Поповнення існуючих", desc: "Тихо закрити діри в штатах.", effect: (s) => ({ reputation: s.reputation - 5, addReinforcement: 5000, log: "Резерви направлено в діючі частини." }) }
      ]
    },
    {
      title: "Економіка Війни",
      desc: "Дефіцит бюджету критичний. На чому економити?",
      choices: [
        { text: "Урізати виплати", desc: "Зняти бойові з тилових частин.", effect: (s) => ({ budget: s.budget + 20, morale: s.morale - 10, log: "Економія коштів викликала обурення." }) },
        { text: "Друкувати гроші", desc: "Інфляція знецінить зарплати.", effect: (s) => ({ budget: s.budget + 30, support: s.support - 15, log: "Емісія гривні. Ціни ростуть." }) }
      ]
    }
  ];

  // Pick random default if no critical incidents
  if (incidents.length === 0) {
    return defaultScenarios[Math.floor(Math.random() * defaultScenarios.length)];
  }
  
  // Pick the most critical one
  return incidents[0];
};

// --- COMPONENTS ---
const MetricCard = ({ icon: Icon, label, value, color, warning, subtext }) => (
  <div className={`
    relative bg-zinc-900 border-2 p-3 flex flex-col justify-between h-full transition-all duration-500
    ${warning ? 'border-red-500 bg-red-950/20' : 'border-zinc-800'}
  `}>
    <div className={`flex items-center gap-2 mb-1 ${color}`}>
      <Icon size={18} />
      <span className="font-mono text-xs font-bold uppercase tracking-widest opacity-80">{label}</span>
    </div>
    <span className={`text-2xl lg:text-3xl font-mono font-bold ${color}`}>
      {typeof value === 'number' ? value.toFixed(0) : value}
    </span>
    {subtext && <span className="text-[10px] text-zinc-500 font-mono mt-1">{subtext}</span>}
    {warning && <AlertTriangle className="absolute top-2 right-2 text-red-500 w-4 h-4 animate-pulse" />}
  </div>
);

// --- MAIN APP ---
export default function DefenseEntropyGame() {
  const [gameState, setGameState] = useState('intro'); // intro, playing, gameover
  
  // STATE OBJECT
  const [state, setState] = useState({
    turn: 1,
    territory: 100000,
    frontLength: 1200,
    manpower: 200000,
    units: 15,
    morale: 80,
    support: 80,
    reputation: 70,
    budget: 50,
    efficiency: 1.0, // Calculated
    density: 1.0,    // Calculated
    reinforcementQueue: [] // Array of {amount, turnsLeft}
  });

  const [logs, setLogs] = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const logsEndRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // --- INITIALIZATION ---
  const startGame = () => {
    playSound('click', soundEnabled);
    setState({
      turn: 1, territory: 100000, frontLength: 1200, manpower: 200000, units: 15,
      morale: 80, support: 80, reputation: 70, budget: 50,
      efficiency: 0.85, density: 1.1, reinforcementQueue: []
    });
    setLogs(["[SYSTEM INIT]... СИМУЛЯЦІЯ ЗАПУЩЕНА", "ЦІЛЬ: МАКСИМІЗАЦІЯ ЧАСУ ІСНУВАННЯ"]);
    
    // Generate first scenario immediately
    const firstScenario = generateIncident({
       density: 1.1, efficiency: 0.85, morale: 80, units: 15 // Mock state for first turn
    });
    setCurrentScenario(firstScenario);
    setGameState('playing');
  };

  // --- TURN PROCESSOR (THE MATH CORE) ---
  const processTurn = (choiceEffect) => {
    playSound('click', soundEnabled);
    
    setState(prev => {
      let s = { ...prev };
      
      // 1. Apply Choice Effect
      const effectResult = choiceEffect(s);
      s = { ...s, ...effectResult };
      
      // 2. Add Reinforcements to Queue (Leaky Bucket Input)
      if (effectResult.addReinforcement) {
        // "Mobilization Lag": People arrive in 3 weeks
        s.reinforcementQueue.push({ amount: effectResult.addReinforcement, turnsLeft: CONFIG.MOBILIZATION_LAG });
      }

      // 3. Process Reinforcement Queue (Arrivals)
      let arrivals = 0;
      s.reinforcementQueue = s.reinforcementQueue.map(batch => ({ ...batch, turnsLeft: batch.turnsLeft - 1 }))
                                             .filter(batch => {
                                               if (batch.turnsLeft <= 0) {
                                                 arrivals += batch.amount;
                                                 return false; 
                                               }
                                               return true;
                                             });
      
      // "Leaky Bucket" Logic on Arrivals:
      // Bureaucracy + Medical losses + AWOL during training
      const leakCoefficient = 0.3 + (0.5 * (1 - s.morale/100)); // Increases if morale is low
      const realArrivals = Math.floor(arrivals * (1 - leakCoefficient));
      s.manpower += realArrivals;

      // 4. Update System Metrics (The Formulas)
      
      // Grekunas Formula (Span of Control)
      // Ec = 1 / (1 + alpha * e^(beta * (Units - Optimal)))
      s.efficiency = 1 / (1 + 0.1 * Math.exp(0.25 * (s.units - CONFIG.OPTIMAL_SPAN_OF_CONTROL)));
      
      // Density Calculation
      const soldiersPerKm = s.manpower / s.frontLength;
      s.density = soldiersPerKm / 150; // Normalize (150 soldiers/km is base "1.0")

      // 5. Territory Loss (Force-to-Space Ratio)
      // Loss depends on Density and EFFICIENCY. Poor command = higher loss even with troops.
      let turnLoss = CONFIG.BASE_TERRITORY_LOSS;
      if (s.density < CONFIG.CRITICAL_DENSITY) {
        // Exponential collapse
        turnLoss += 300 * Math.exp(3 * (CONFIG.CRITICAL_DENSITY - s.density));
        playSound('alert', soundEnabled);
      }
      // Efficiency Penalty: Inefficient command multiplies losses
      turnLoss = turnLoss / s.efficiency;
      s.territory -= Math.floor(turnLoss);

      // 6. Attrition & AWOL (Death Spiral)
      // AWOL rate increases quadratically as morale drops below 50
      let awolRate = 0.01; // Base 1%
      if (s.morale < 50) {
        awolRate += 0.05 * Math.pow((50 - s.morale)/50, 2);
      }
      const losses = Math.floor(s.manpower * awolRate);
      s.manpower -= losses;

      // 7. Natural Decay
      s.budget = Math.max(0, s.budget - 2);
      s.morale = Math.max(0, s.morale - 1);
      s.turn += 1;

      // 8. Logs
      const logMsg = `[T+${s.turn}] ${effectResult.log}`;
      setLogs(l => [...l, logMsg, `> Втрати тер.: -${turnLoss.toFixed(0)} км² | СЗЧ: -${losses}`]);
      if (arrivals > 0) {
        setLogs(l => [...l, `> Прибуло: +${realArrivals} (Мобілізовано: ${arrivals}, Втрати: ${arrivals - realArrivals})`]);
      }

      // 9. Check Game Over
      if (s.territory <= 0) return { ...s, gameOver: true, gameOverReason: "ТЕРИТОРІАЛЬНИЙ КОЛАПС" };
      if (s.manpower <= 5000) return { ...s, gameOver: true, gameOverReason: "АРМІЯ ПРИПИНИЛА ІСНУВАННЯ" };
      if (s.support <= 0 && s.reputation <= 0) return { ...s, gameOver: true, gameOverReason: "ВТРАТА ЛЕГІТИМНОСТІ" };

      // 10. Generate Next Scenario based on NEW state
      setTimeout(() => {
        const next = generateIncident(s);
        setCurrentScenario(next);
      }, 500);

      return s;
    });
  };

  const shareResult = () => {
    const text = `ENTROPY SIMULATION REPORT\nТиждень: ${state.turn}\nТериторія: ${(state.territory/1000).toFixed(1)}k\nПричина: ${state.gameOverReason}`;
    navigator.clipboard.writeText(text);
    alert("Скопійовано!");
  };

  // --- RENDERS ---

  if (gameState === 'intro') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono">
        <style>{globalStyles}</style>
        <div className="max-w-3xl w-full bg-black border-2 border-emerald-900 p-8 md:p-12 relative shadow-2xl">
          <div className="crt-scanline"></div>
          <div className="text-center relative z-10">
            <Database size={64} className="text-emerald-500 mx-auto mb-4" />
            <h1 className="text-6xl font-black text-white mb-2 tracking-tighter terminal-text">ENTROPY</h1>
            <p className="text-emerald-500 uppercase tracking-[0.5em] mb-8 text-sm">Military Management Sim v3.0</p>
            
            <div className="text-left bg-zinc-900/50 border border-zinc-800 p-6 mb-8 text-slate-300 space-y-4 text-sm md:text-base">
              <h3 className="text-white font-bold uppercase border-b border-zinc-700 pb-2 mb-2">Параметри симуляції:</h3>
              <ul className="space-y-2 list-disc pl-5">
                <li><strong className="text-emerald-400">Span of Control:</strong> Створення нових бригад експоненційно знижує ефективність управління (Formula: Grekunas).</li>
                <li><strong className="text-emerald-400">Leaky Bucket:</strong> Мобілізація має часовий лаг (3 тижні) та коефіцієнт втрат (бюрократія).</li>
                <li><strong className="text-emerald-400">Force-to-Space:</strong> Якщо щільність {'<'} 0.6, втрати території стають лавиноподібними.</li>
              </ul>
            </div>

            <button onClick={startGame} className="bg-emerald-900/20 text-emerald-500 border-2 border-emerald-500 px-10 py-3 text-lg font-bold uppercase hover:bg-emerald-500 hover:text-black transition-all flex items-center justify-center gap-2 mx-auto">
              <Power size={20} /> Запустити Симуляцію
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.gameOver) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono text-slate-200">
        <style>{globalStyles}</style>
        <div className="max-w-xl w-full border-2 border-red-600 bg-black p-8 text-center relative shadow-[0_0_50px_rgba(220,38,38,0.3)]">
          <div className="crt-scanline"></div>
          <Skull size={80} className="text-red-600 mx-auto mb-6 animate-pulse" />
          <h1 className="text-5xl font-black text-red-600 mb-2 tracking-widest uppercase">CRITICAL ERROR</h1>
          <p className="text-zinc-500 text-sm uppercase tracking-widest mb-8">Симуляцію зупинено</p>
          
          <div className="bg-red-950/10 border border-red-900/30 p-6 mb-8 text-left space-y-2 text-sm">
            <div className="flex justify-between border-b border-red-900/30 pb-2">
              <span className="text-red-400">Тижнів протримано:</span>
              <span className="text-white font-bold">{state.turn}</span>
            </div>
            <div className="flex justify-between border-b border-red-900/30 pb-2">
              <span className="text-red-400">Кінцева територія:</span>
              <span className="text-white font-bold">{(state.territory/1000).toFixed(1)}k км²</span>
            </div>
            <div className="pt-2 text-center mt-4">
              <span className="text-red-500 font-bold uppercase text-lg">{state.gameOverReason}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={startGame} className="bg-white text-black px-6 py-3 font-bold uppercase hover:bg-slate-200 w-full">Restart</button>
            <button onClick={shareResult} className="border border-zinc-700 text-zinc-400 px-6 py-3 font-bold uppercase hover:text-white w-full flex items-center justify-center gap-2"><Share2 size={18} /> Share</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-300 font-mono p-4 flex justify-center items-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black">
      <style>{globalStyles}</style>
      
      {/* MAIN CONTAINER */}
      <div className="w-full max-w-6xl aspect-[16/10] min-h-[600px] bg-black border-2 border-zinc-800 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="crt-scanline"></div>

        {/* HEADER */}
        <header className="bg-zinc-900 border-b border-zinc-800 h-16 flex items-center px-6 justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-black text-xl tracking-[0.2em] text-white hidden md:block">ENTROPY <span className="text-emerald-600 text-xs">v3.0</span></h1>
            <div className="h-6 w-px bg-zinc-700 hidden md:block"></div>
            <div className="flex gap-6 text-sm font-bold tracking-widest">
               <div className="flex flex-col leading-none">
                 <span className="text-[10px] text-zinc-500">ЧАС</span>
                 <span className="text-emerald-500">T+{state.turn}</span>
               </div>
               <div className="flex flex-col leading-none">
                 <span className="text-[10px] text-zinc-500">ПІД КОНТРОЛЕМ</span>
                 <span className="text-red-400">{(state.territory / 1000).toFixed(0)}k <span className="text-[10px] text-zinc-600">км²</span></span>
               </div>
            </div>
          </div>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-zinc-500 hover:text-white">
            {soundEnabled ? <Volume2 size={20}/> : <VolumeX size={20}/>}
          </button>
        </header>

        {/* METRICS */}
        <div className="grid grid-cols-5 bg-black border-b border-zinc-800 shrink-0 h-24">
          <MetricCard 
            icon={Shield} label="Щільність" 
            value={(state.density * 100).toFixed(0) + '%'} 
            color="text-blue-400" 
            warning={state.density < CONFIG.CRITICAL_DENSITY}
            subtext="Фронт/Люди"
          />
          <MetricCard 
            icon={Activity} label="Ефективність" 
            value={(state.efficiency * 100).toFixed(0) + '%'} 
            color="text-purple-400" 
            warning={state.efficiency < 0.6}
            subtext={`Бригад: ${state.units}`}
          />
          <MetricCard icon={Users} label="Люди" value={(state.manpower/1000).toFixed(1) + 'k'} color="text-emerald-400" />
          <MetricCard icon={TrendingDown} label="Мораль" value={state.morale} color="text-amber-400" />
          <MetricCard icon={BarChart3} label="Бюджет" value={state.budget} color="text-cyan-400" />
        </div>

        {/* WORKSPACE */}
        <div className="flex flex-1 overflow-hidden z-10">
          
          {/* LEFT: SCENARIO */}
          <div className="flex-[3] p-8 flex flex-col border-r border-zinc-800 bg-zinc-950/50 overflow-y-auto relative">
            {currentScenario && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col justify-center">
                
                <div className="mb-8">
                   <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider border ${currentScenario.type === 'critical' ? 'text-red-500 border-red-500 bg-red-950/20' : 'text-emerald-500 border-emerald-500 bg-emerald-950/20'}`}>
                        {currentScenario.type === 'critical' ? 'КРИТИЧНА ЗАГРОЗА' : 'ОПЕРАТИВНЕ РІШЕННЯ'}
                      </span>
                   </div>
                   <h2 className="text-3xl lg:text-4xl font-black text-white mb-4 uppercase leading-none">{currentScenario.title}</h2>
                   <p className="text-lg text-slate-300 leading-relaxed font-light border-l-4 border-zinc-700 pl-6 py-2">
                     {currentScenario.desc}
                   </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {currentScenario.choices.map((choice, idx) => (
                    <button
                      key={idx}
                      onClick={() => processTurn(choice.effect)}
                      className="group relative flex items-center justify-between text-left bg-black border-2 border-zinc-800 p-5 hover:border-emerald-500 hover:bg-zinc-900 transition-all min-h-[100px]"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                           <span className="font-mono text-xs text-zinc-500 group-hover:text-emerald-500 transition-colors">0{idx + 1}</span>
                           <h3 className="font-bold text-lg text-slate-200 group-hover:text-white uppercase">{choice.text}</h3>
                        </div>
                        <p className="text-sm text-zinc-500 group-hover:text-zinc-400 leading-snug pl-6">{choice.desc}</p>
                      </div>
                      <ChevronRight className="text-zinc-700 group-hover:text-emerald-500 transition-all opacity-100 group-hover:translate-x-1" size={24} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: LOGS */}
          <div className="flex-[2] bg-black flex flex-col min-w-[300px]">
            <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                <Terminal size={12} /> System_Log
              </div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2">
              {logs.map((log, idx) => (
                <div key={idx} className="text-emerald-500/70 border-l border-zinc-800 pl-3 py-1 leading-relaxed">
                  <span className="opacity-30 mr-2">[{idx.toString().padStart(3,'0')}]</span> 
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
              <div className="text-emerald-500/30 animate-pulse">_</div>
            </div>
            
            {/* Reinforcement Queue Visualization */}
            {state.reinforcementQueue.length > 0 && (
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/20">
                <div className="text-[10px] text-zinc-500 uppercase mb-2">Черга підготовки:</div>
                <div className="space-y-1">
                  {state.reinforcementQueue.map((batch, i) => (
                    <div key={i} className="flex justify-between text-xs text-emerald-600">
                      <span>+{batch.amount} люд.</span>
                      <span>через {batch.turnsLeft} тиж.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}