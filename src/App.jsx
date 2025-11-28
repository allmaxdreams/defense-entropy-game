import React, { useState, useEffect, useCallback } from 'react';
import { 
  Shield, 
  Users, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Map as MapIcon,
  Skull,
  BarChart3
} from 'lucide-react';

// --- MATH CONSTANTS & CONFIG (Based on the Document) ---
const INITIAL_STATE = {
  turn: 1,
  territory: 100000, // sq km (symbolic remaining free territory)
  frontLength: 1200, // km
  manpower: 200000, // Active combat personnel
  units: 15, // Number of brigades/units (Optimal is 10)
  
  // Resources (0-100 scale)
  morale: 75,
  support: 80,
  reputation: 70,
  budget: 60,

  // Hidden/Calculated metrics
  efficiency: 1.0, // Ec
  density: 1.0, // Soldiers per km relative to norm
  
  gameOver: false,
  gameOverReason: null
};

// Derived Constants
const OPTIMAL_UNITS = 10;
const DENSITY_CRIT = 0.5; // Threshold where collapse begins
const BASE_TERRITORY_LOSS = 50; // "Creeping" loss per week
const RECRUIT_TRAINING_LAG = 3; // Turns

// --- SCENARIOS (Based on Document Section 7) ---
const SCENARIOS = [
  {
    id: 'leaky_bucket',
    title: 'Криза "Дірявого відра"',
    description: 'Поточна мобілізація дає людей, але до фронту доходить лише 60%. Бригади виснажені. Генеральний штаб пропонує рішення.',
    choices: [
      {
        text: 'Створити нові бригади',
        desc: 'Медіа в захваті (+Репутація), але це управлінський хаос.',
        effect: (state) => ({
          units: state.units + 2,
          reputation: Math.min(100, state.reputation + 5),
          log: 'Створено дві нові бригади. Управління ускладнилось.'
        })
      },
      {
        text: 'Поповнити існуючі підрозділи',
        desc: 'Тихо затикаємо діри. Жодного піару, але зберігаємо керованість.',
        effect: (state) => ({
          reputation: Math.max(0, state.reputation - 5),
          addEvent: { type: 'REINFORCEMENT', amount: 5000, turnDelay: 2 },
          log: 'Розпочато поповнення старих бригад. Ефект буде відчутний згодом.'
        })
      },
      {
        text: 'Жорстка "бусифікація"',
        desc: 'Знизити планку призову. Багато людей, але низька якість і падіння підтримки.',
        effect: (state) => ({
          support: Math.max(0, state.support - 15),
          morale: Math.max(0, state.morale - 10),
          addEvent: { type: 'REINFORCEMENT', amount: 15000, turnDelay: 3 }, // High number but low morale will cause high AWOL
          log: 'Проведено жорсткі рейди. Суспільство обурене.'
        })
      }
    ]
  },
  {
    id: 'density_collapse',
    title: 'Загроза прориву (Покровський напрямок)',
    description: 'Щільність оборони впала до критичної межі. Ворог концентрує сили. Прогнозується втрата значних територій.',
    choices: [
      {
        text: 'Ні кроку назад!',
        desc: 'Тримати позиції будь-якою ціною. Високі втрати людей.',
        effect: (state) => ({
          manpower: Math.floor(state.manpower * 0.9), // 10% instant loss
          morale: Math.max(0, state.morale - 5),
          log: 'Війська стоять на смерть. Величезні втрати особового складу.'
        })
      },
      {
        text: 'Оперативний відступ (Вирівнювання)',
        desc: 'Здати міста, щоб скоротити лінію фронту і підвищити щільність.',
        effect: (state) => ({
          territory: state.territory - 500,
          frontLength: Math.max(800, state.frontLength - 100), // Shorten front
          reputation: Math.max(0, state.reputation - 20),
          morale: Math.max(0, state.morale - 10),
          log: 'Ми залишили території заради збереження армії. Політичний рейтинг обвалився.'
        })
      },
      {
        text: 'Спалити стратегічні резерви',
        desc: 'Кинути в бій елітну школу операторів БПЛА як піхоту.',
        effect: (state) => ({
          budget: Math.max(0, state.budget - 30),
          manpower: state.manpower + 2000, // Small temporary bump
          efficiency: state.efficiency * 0.95, // Chaos increases slightly
          log: 'Резерви спалено. Бюджет вичерпано. Це лише відстрочка.'
        })
      }
    ]
  },
  {
    id: 'budget_dilemma',
    title: 'Економіка війни: Дрони чи Виплати?',
    description: 'Бюджет тріщить по швах. Потрібно обирати пріоритет на наступний місяць.',
    choices: [
      {
        text: 'Закупівля "Deep Strike"',
        desc: 'Інвестиція в далекобійні удари. Дорого, результат не гарантований.',
        effect: (state) => ({
          budget: Math.max(0, state.budget - 20),
          // Chance to slightly slow territory loss next turn logic
          log: 'Закуплено ракети. Ефективність залежить від адаптації ворога.'
        })
      },
      {
        text: 'Виплати військовим',
        desc: 'Підняти бойові. Це втримає мораль, але "з\'їсть" гроші на розвиток.',
        effect: (state) => ({
          budget: Math.max(0, state.budget - 15),
          morale: Math.min(100, state.morale + 10),
          log: 'Військові отримали виплати. Мораль стабілізовано.'
        })
      },
      {
        text: 'Оптимізація (Аудит)',
        desc: 'Спроба прибрати "мертві душі". Викликає спротив бюрократії.',
        effect: (state) => ({
          reputation: Math.max(0, state.reputation - 5),
          budget: Math.min(100, state.budget + 10),
          log: 'Проведено аудит. Знайдено кошти, але генерали незадоволені.'
        })
      }
    ]
  }
];

// --- HELPER COMPONENTS ---

const MetricCard = ({ icon: Icon, label, value, color, subValue = null }) => (
  <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex flex-col items-center justify-center min-w-[100px]">
    <div className={`flex items-center gap-2 ${color} mb-1`}>
      <Icon size={18} />
      <span className="font-bold text-sm">{label}</span>
    </div>
    <span className="text-xl font-mono font-bold text-white">{typeof value === 'number' ? value.toFixed(0) : value}</span>
    {subValue && <span className="text-xs text-slate-400">{subValue}</span>}
  </div>
);

const ProgressBar = ({ value, max = 100, color = "bg-blue-500", label }) => (
  <div className="w-full mb-2">
    <div className="flex justify-between text-xs mb-1 text-slate-400">
      <span>{label}</span>
      <span>{value.toFixed(0)}%</span>
    </div>
    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
      <div 
        className={`h-full ${color} transition-all duration-500`} 
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);

// --- MAIN APP ---

export default function DefenseEntropyGame() {
  const [gameState, setGameState] = useState(INITIAL_STATE);
  const [eventQueue, setEventQueue] = useState([]); // Array of { type, turnDue, amount, ... }
  const [logs, setLogs] = useState(["Гра почалася. Ситуація складна, але контрольована."]);
  const [currentScenario, setCurrentScenario] = useState(SCENARIOS[0]);
  const [activeTab, setActiveTab] = useState('briefing'); // 'briefing', 'analytics', 'history'

  // --- CALCULATION ENGINE ---

  // 2.1 Span of Control Formula (Grekunas-Chmut)
  const calculateEfficiency = (units) => {
    // Formula: 1 / (1 + alpha * e^(beta * (Ua - Uopt)))
    // Uopt = 10, beta = 0.25, alpha = 0.1
    const U_opt = OPTIMAL_UNITS;
    const alpha = 0.1;
    const beta = 0.25;
    const Ec = 1 / (1 + alpha * Math.exp(beta * (units - U_opt)));
    return Ec;
  };

  // 4.1 & 4.2 Density & Territory Loss
  const calculateAttrition = (state, efficiency) => {
    // Density = Personnel / FrontLength
    // Norm is ~2500 per km (very rough generic), let's normalize so 1.0 is "okay"
    // In doc: "200 people per line" is bad.
    // Let's say "good" density is 150 soldiers/km for this abstract model scaling
    const soldiersPerKm = state.manpower / state.frontLength;
    const densityNorm = 150; 
    const relativeDensity = soldiersPerKm / densityNorm;

    // Loss calculation
    let loss = BASE_TERRITORY_LOSS; // Base "creeping" loss
    
    // Exponential collapse if density is low
    if (relativeDensity < DENSITY_CRIT) {
      // L_terr = L_base + A * e^(B * (D_crit - D))
      // A=100, B=5 (tuning for game balance)
      loss += 100 * Math.exp(5 * (DENSITY_CRIT - relativeDensity));
    }

    // Apply Efficiency penalty to holding ground
    loss = loss / efficiency; 

    return { loss, relativeDensity };
  };

  // 3.2 SZCH (AWOL) Loop
  const calculateAWOL = (manpower, morale) => {
    let awolRate = 0.01; // Base 1% per week
    if (morale < 50) {
      // Quadratic increase: k * ((100-Morale)/100)^2
      awolRate += 0.2 * Math.pow((50 - morale) / 50, 2);
    }
    return Math.floor(manpower * awolRate);
  };

  // --- TURN PROCESSOR ---

  const processTurn = (choiceEffect) => {
    setGameState(prev => {
      let newState = { ...prev };
      
      // 1. Apply Immediate Choice Effects
      const choiceResult = choiceEffect(newState);
      newState = { ...newState, ...choiceResult };
      
      // Handle "addEvent" from choice
      if (choiceResult.addEvent) {
        setEventQueue(q => [...q, { ...choiceResult.addEvent, turnDue: newState.turn + choiceResult.addEvent.turnDelay }]);
        delete newState.addEvent;
      }
      
      const turnLog = [`Тиждень ${newState.turn}: ${choiceResult.log}`];

      // 2. Process Event Queue (Time Lag)
      const dueEvents = eventQueue.filter(e => e.turnDue === newState.turn + 1);
      const remainingEvents = eventQueue.filter(e => e.turnDue !== newState.turn + 1);
      setEventQueue(remainingEvents);

      dueEvents.forEach(e => {
        if (e.type === 'REINFORCEMENT') {
          // Leaky Bucket: Apply losses to arriving troops based on current Morale/Bureaucracy
          // Formula: R_arrival = R_recruited * (1 - lambda)
          // Lambda includes Bureau (0.3) + SZCH factor
          let arrivalEfficiency = 0.7; // Base bureaucracy loss
          if (newState.morale < 40) arrivalEfficiency -= 0.2; // Morale penalty
          
          const actualArrivals = Math.floor(e.amount * arrivalEfficiency);
          newState.manpower += actualArrivals;
          turnLog.push(`Прибуло поповнення: +${actualArrivals} (Мобілізовано: ${e.amount}, Втрати "дірявого відра": ${e.amount - actualArrivals})`);
        }
      });

      // 3. Recalculate System Metrics
      const efficiency = calculateEfficiency(newState.units);
      newState.efficiency = efficiency;

      const { loss: terrLoss, relativeDensity } = calculateAttrition(newState, efficiency);
      newState.density = relativeDensity;
      newState.territory -= terrLoss;

      const awolLosses = calculateAWOL(newState.manpower, newState.morale);
      newState.manpower -= awolLosses;

      // Natural Decay / Costs
      newState.budget = Math.max(0, newState.budget - 2); // Weekly burn
      newState.morale = Math.max(0, newState.morale - 1); // Weekly fatigue
      
      // Logging
      if (terrLoss > 200) turnLog.push(`⚠️ Критична втрата території: -${terrLoss.toFixed(0)} км² через низьку щільність!`);
      else turnLog.push(`Втрата території: -${terrLoss.toFixed(0)} км².`);
      
      if (awolLosses > 500) turnLog.push(`⚠️ СЗЧ за тиждень: -${awolLosses} бійців.`);

      // 4. Game Over Checks
      if (newState.territory <= 0) {
        newState.gameOver = true;
        newState.gameOverReason = "Ворог окупував всю територію.";
      } else if (newState.support <= 0 && newState.reputation <= 0) {
        newState.gameOver = true;
        newState.gameOverReason = "Політичний колапс та втрата легітимності.";
      } else if (newState.manpower <= 5000) {
        newState.gameOver = true;
        newState.gameOverReason = "Армія перестала існувати як організована сила.";
      }

      newState.turn += 1;
      setLogs(prevLogs => [...turnLog, ...prevLogs]);
      return newState;
    });

    // Pick next scenario (Random for now, barring special logic)
    const nextScen = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    setCurrentScenario(nextScen);
  };

  const restartGame = () => {
    setGameState(INITIAL_STATE);
    setEventQueue([]);
    setLogs(["Нова каденція. Спробуйте втримати систему."]);
    setCurrentScenario(SCENARIOS[0]);
  };

  // --- RENDER HELPERS ---

  if (gameState.gameOver) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-100 font-mono p-4">
        <Skull size={64} className="text-red-600 mb-4" />
        <h1 className="text-4xl font-bold mb-2">СИСТЕМА КОЛАПСУВАЛА</h1>
        <p className="text-xl text-red-400 mb-6">{gameState.gameOverReason}</p>
        <div className="bg-slate-900 p-6 rounded border border-slate-700 max-w-md w-full mb-6">
          <p>Тижнів протримано: <span className="text-white font-bold">{gameState.turn}</span></p>
          <p className="text-slate-400 text-sm mt-4">
            "Майстерність полягає в тому, щоб обрати ту метрику для пожертви, яка на даний момент найменш критична..."
          </p>
        </div>
        <button 
          onClick={restartGame}
          className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded flex items-center gap-2"
        >
          <Activity size={20} /> Спробувати ще раз
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono flex flex-col md:flex-row overflow-hidden">
      
      {/* SIDEBAR / LOGS (Mobile: Bottom, Desktop: Left) */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-slate-900 border-r border-slate-800 flex flex-col h-[300px] md:h-screen">
        <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
          <h2 className="text-lg font-bold flex items-center gap-2 text-amber-500">
            <FileText size={20} /> Оперативний Журнал
          </h2>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {logs.map((log, idx) => (
            <div key={idx} className="text-xs md:text-sm border-l-2 border-slate-700 pl-3 py-1 opacity-80 hover:opacity-100 transition-opacity">
              {log.includes('⚠️') ? <span className="text-red-400">{log}</span> : log}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        
        {/* TOP HUD */}
        <div className="bg-slate-900 border-b border-slate-800 p-4 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <span className="bg-slate-800 px-3 py-1 rounded text-sm text-slate-400">Тиждень {gameState.turn}</span>
              <span className="bg-red-900/30 text-red-400 px-3 py-1 rounded text-sm flex items-center gap-1">
                <MapIcon size={14} /> {(gameState.territory / 1000).toFixed(1)}k км²
              </span>
            </div>
            <div className="flex gap-2">
               {eventQueue.length > 0 && (
                 <div className="text-xs text-blue-400 flex items-center gap-1 animate-pulse">
                   <Clock size={12} /> {eventQueue.length} подій в черзі
                 </div>
               )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
            <MetricCard icon={Shield} label="Щільність" value={(gameState.density * 100).toFixed(0) + '%'} color="text-blue-400" subValue={gameState.density < DENSITY_CRIT ? "КРИТИЧНО" : "Норма"} />
            <MetricCard icon={TrendingDown} label="Мораль" value={gameState.morale} color="text-amber-400" />
            <MetricCard icon={Users} label="Підтримка" value={gameState.support} color="text-green-400" />
            <MetricCard icon={Activity} label="Репутація" value={gameState.reputation} color="text-purple-400" />
            <MetricCard icon={BarChart3} label="Бюджет" value={gameState.budget} color="text-emerald-400" />
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full flex-1 flex flex-col gap-6">
          
          {/* TABS */}
          <div className="flex gap-4 border-b border-slate-800 pb-2">
            <button 
              onClick={() => setActiveTab('briefing')}
              className={`pb-2 px-2 ${activeTab === 'briefing' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
            >
              Ситуаційна кімната
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`pb-2 px-2 ${activeTab === 'analytics' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
            >
              Аналітика штабу
            </button>
          </div>

          {activeTab === 'briefing' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <h2 className="text-2xl font-bold mb-2 text-white">{currentScenario.title}</h2>
                <p className="text-slate-300 mb-4 leading-relaxed">{currentScenario.description}</p>
                
                {/* Warning Flags */}
                {gameState.efficiency < 0.5 && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-2 rounded mb-4">
                    <AlertTriangle size={16} />
                    <span>УВАГА: Втрата керованості військами (Хаос: {((1 - gameState.efficiency) * 100).toFixed(0)}%)</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {currentScenario.choices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => processTurn(choice.effect)}
                    className="group flex flex-col text-left bg-slate-900 border border-slate-700 hover:border-blue-500 p-4 rounded transition-all hover:-translate-y-1"
                  >
                    <span className="font-bold text-blue-400 mb-2 group-hover:text-blue-300">ВАРІАНТ {String.fromCharCode(65 + idx)}</span>
                    <h3 className="font-semibold text-lg text-slate-200 mb-2">{choice.text}</h3>
                    <p className="text-sm text-slate-400 leading-snug">{choice.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><TrendingDown size={20} /> Модель "Діряве відро"</h3>
                <div className="space-y-4">
                   <ProgressBar label="Ефективність Управління (Span of Control)" value={gameState.efficiency * 100} color={gameState.efficiency < 0.5 ? 'bg-red-500' : 'bg-blue-500'} />
                   <p className="text-xs text-slate-500">
                     Кількість бригад: {gameState.units} (Оптимально: {OPTIMAL_UNITS}). 
                     Перевищення норми створює хаос, що знижує реальну бойову міць, незважаючи на кількість людей.
                   </p>
                   
                   <div className="h-px bg-slate-800 my-4"></div>
                   
                   <ProgressBar label="Коефіцієнт СЗЧ" value={Math.min(100, (1 - (gameState.morale/100)) * 50)} color="bg-red-500" />
                   <p className="text-xs text-slate-500">
                     Залежить від Моралі. При моралі нижче 50%, дезертирство зростає квадратично.
                   </p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Shield size={20} /> Щільність та Території</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span>Особовий склад:</span>
                    <span className="text-white">{gameState.manpower.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>Довжина фронту:</span>
                    <span className="text-white">{gameState.frontLength} км</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span>Щільність:</span>
                    <span className={`${gameState.density < DENSITY_CRIT ? 'text-red-500 font-bold' : 'text-green-500'}`}>
                      {(gameState.density * 100).toFixed(0)}% від норми
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Якщо щільність впаде нижче 50%, втрати території стануть експоненційними (формула Force-to-Space Ratio).
                    Єдиний спосіб підвищити щільність без людей — скоротити фронт (відступити).
                  </p>
                </div>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}