const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const dayEl = document.getElementById('day-counter');
const netWorthEl = document.getElementById('net-worth');
const usdEl = document.getElementById('usd-balance');
const assetEl = document.getElementById('asset-balance');
const newsEl = document.getElementById('news-ticker');
const energyFill = document.getElementById('energy-fill');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const finalMoneyEl = document.getElementById('final-money');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight * 0.45; // Уменьшили холст, чтобы влезли обе панели

let state = {
    running: false,
    day: 1,
    tickCounter: 0,
    ticksPerDay: 90,  // 3 секунды реального времени = 1 игровой день
    price: 100,
    history: [],
    
    // Экономика маркетмейкера
    mmBudget: 100,
    maxMmBudget: 100,
    
    // Экономика трейдера
    personalUsd: 1000,
    personalAsset: 0,
    
    trend: 0,
    upperBound: 180,
    lowerBound: 20,
    minGap: 70,
    shrinkRate: 2, // На сколько сужается коридор каждый игровой день
    tickRate: 1000 / 30 // 30 FPS
};

const NEWS_EVENTS = [
    { text: "SEC одобряет ETF!", impact: 1.5 },
    { text: "Взлом крупной биржи!", impact: -2.0 },
    { text: "Маск упомянул монету", impact: 1.5 },
    { text: "Запрет майнинга", impact: -1.5 },
    { text: "Инфляция ниже ожиданий", impact: 0.5 },
    { text: "Киты сливают активы", impact: -1.0 },
    { text: "Новое партнерство", impact: 1.0 }
];

let newsInterval;

function initGame() {
    state = {
        ...state,
        running: true,
        day: 1,
        tickCounter: 0,
        price: 100,
        mmBudget: 100,
        personalUsd: 1000,
        personalAsset: 0,
        trend: 0,
        upperBound: 180,
        lowerBound: 20,
        history: new Array(Math.floor(canvas.width / 4)).fill(100)
    };
    
    gameOverScreen.classList.add('hidden');
    newsEl.innerText = "Рынок стабилен";
    updateUI();
    
    clearInterval(newsInterval);
    newsInterval = setInterval(generateNews, 10000); // Новости реже, раз в 10 секунд
    
    requestAnimationFrame(gameLoop);
}

function generateNews() {
    if (!state.running) return;
    const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    newsEl.innerText = `НОВОСТЬ: ${event.text}`;
    state.trend = event.impact;
    
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(event.impact > 0 ? 'success' : 'warning');
    
    setTimeout(() => { 
        if (state.running) {
            state.trend = 0; 
            newsEl.innerText = "Рынок стабилизируется..."; 
        }
    }, 5000);
}

// Управление మార్кетмейкером
function applyMMForce(amount) {
    if (!state.running) return;
    if (state.mmBudget >= 25) { // Тратим 25% бюджета за клик
        state.price += amount;
        state.mmBudget -= 25;
        updateUI();
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    } else {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
}

// Управление Трейдером
function buyAsset() {
    if (!state.running) return;
    // Покупаем 1 актив
    if (state.personalUsd >= state.price) {
        state.personalUsd -= state.price;
        state.personalAsset += 1;
        updateUI();
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
}

function sellAsset() {
    if (!state.running) return;
    // Продаем 1 актив
    if (state.personalAsset >= 1) {
        state.personalUsd += state.price;
        state.personalAsset -= 1;
        updateUI();
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
}

document.getElementById('btn-pump').addEventListener('touchstart', (e) => { e.preventDefault(); applyMMForce(6); });
document.getElementById('btn-dump').addEventListener('touchstart', (e) => { e.preventDefault(); applyMMForce(-6); });
document.getElementById('btn-buy').addEventListener('touchstart', (e) => { e.preventDefault(); buyAsset(); });
document.getElementById('btn-sell').addEventListener('touchstart', (e) => { e.preventDefault(); sellAsset(); });

// Fallback для ПК
document.getElementById('btn-pump').addEventListener('mousedown', () => applyMMForce(6));
document.getElementById('btn-dump').addEventListener('mousedown', () => applyMMForce(-6));
document.getElementById('btn-buy').addEventListener('mousedown', () => buyAsset());
document.getElementById('btn-sell').addEventListener('mousedown', () => sellAsset());

document.getElementById('btn-restart').addEventListener('click', initGame);

function updateUI() {
    dayEl.innerText = `День: ${state.day}`;
    const netWorth = state.personalUsd + (state.personalAsset * state.price);
    netWorthEl.innerText = `Капитал: $${netWorth.toFixed(1)}`;
    usdEl.innerText = state.personalUsd.toFixed(1);
    assetEl.innerText = state.personalAsset;
    energyFill.style.width = `${(state.mmBudget / state.maxMmBudget) * 100}%`;
}

function updateLogic() {
    // Шум толпы снижен для более медленного движения
    const crowdNoise = (Math.random() - 0.5) * 1.2; 
    state.price += crowdNoise + state.trend;
    
    // Отсчет дней
    state.tickCounter++;
    if (state.tickCounter >= state.ticksPerDay) {
        state.day++;
        state.tickCounter = 0;
        state.mmBudget = state.maxMmBudget; // Восполнение бюджета раз в день
        
        // Сужение коридора происходит раз в день
        const currentGap = state.upperBound - state.lowerBound;
        if (currentGap > state.minGap) {
            state.upperBound -= state.shrinkRate;
            state.lowerBound += state.shrinkRate;
        }
    }

    updateUI();

    state.history.push(state.price);
    state.history.shift();

    if (state.price >= state.upperBound || state.price <= state.lowerBound) {
        state.running = false;
        gameOverScreen.classList.remove('hidden');
        finalScoreEl.innerText = `Прожито дней: ${state.day}`;
        const finalWorth = state.personalUsd + (state.personalAsset * state.price);
        finalMoneyEl.innerText = `Итоговый капитал: $${finalWorth.toFixed(1)}`;
        clearInterval(newsInterval);
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
}

function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const stepX = canvas.width / state.history.length;
    const scaleY = (val) => canvas.height - ((val / 200) * canvas.height);
    
    ctx.fillStyle = 'rgba(239, 83, 80, 0.15)';
    ctx.fillRect(0, 0, canvas.width, scaleY(state.upperBound)); 
    ctx.fillRect(0, scaleY(state.lowerBound), canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, scaleY(state.upperBound)); ctx.lineTo(canvas.width, scaleY(state.upperBound));
    ctx.moveTo(0, scaleY(state.lowerBound)); ctx.lineTo(canvas.width, scaleY(state.lowerBound));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    for (let i = 0; i < state.history.length; i++) {
        const x = i * stepX;
        const y = scaleY(state.history[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    const lastY = scaleY(state.history[state.history.length - 1]);
    ctx.beginPath();
    ctx.arc(canvas.width, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
}

let lastTime = 0;
function gameLoop(timestamp) {
    if (!state.running) return;
    if (timestamp - lastTime >= state.tickRate) {
        updateLogic();
        drawChart();
        lastTime = timestamp;
    }
    requestAnimationFrame(gameLoop);
}

initGame();
