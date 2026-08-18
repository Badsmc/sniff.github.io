const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const newsEl = document.getElementById('news-ticker');
const energyFill = document.getElementById('energy-fill');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');

// Инициализация размеров canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight * 0.6;

// Состояние игры
let state = {
    running: false,
    score: 0,
    price: 100,
    history: [],
    energy: 100,
    maxEnergy: 100,
    trend: 0,
    upperBound: 180,
    lowerBound: 20,
    minGap: 70,       // Минимальная ширина канала
    shrinkRate: 0.5,  // Скорость сужения (каждую секунду)
    tickRate: 1000 / 30 // 30 FPS
};

const NEWS_EVENTS = [
    { text: "SEC одобряет ETF!", impact: 2.5 },
    { text: "Взлом крупной биржи!", impact: -3.0 },
    { text: "Маск упомянул монету", impact: 2.0 },
    { text: "Запрет майнинга", impact: -2.5 },
    { text: "Инфляция ниже ожиданий", impact: 1.0 },
    { text: "Киты сливают активы", impact: -2.0 },
    { text: "Новое партнерство", impact: 1.5 }
];

let scoreInterval, newsInterval;

function initGame() {
    state.running = true;
    state.score = 0;
    state.price = 100;
    state.history = new Array(Math.floor(canvas.width / 4)).fill(100);
    state.energy = 100;
    state.trend = 0;
    state.upperBound = 180;
    state.lowerBound = 20;
    
    gameOverScreen.classList.add('hidden');
    newsEl.innerText = "Рынок стабилен";
    scoreEl.innerText = "Время: 0s";
    
    clearInterval(scoreInterval);
    clearInterval(newsInterval);
    
    scoreInterval = setInterval(updateTimerAndBounds, 1000);
    newsInterval = setInterval(generateNews, 7000);
    
    requestAnimationFrame(gameLoop);
}

function updateTimerAndBounds() {
    if (!state.running) return;
    
    state.score++;
    scoreEl.innerText = `Время: ${state.score}s`;

    // Механика сужения коридора
    const currentGap = state.upperBound - state.lowerBound;
    if (currentGap > state.minGap) {
        state.upperBound -= state.shrinkRate;
        state.lowerBound += state.shrinkRate;
    }
}

function generateNews() {
    if (!state.running) return;
    
    const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    newsEl.innerText = `НОВОСТЬ: ${event.text}`;
    state.trend = event.impact;
    
    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred(event.impact > 0 ? 'success' : 'warning');
    }
    
    setTimeout(() => { 
        if (state.running) {
            state.trend = 0; 
            newsEl.innerText = "Рынок стабилизируется..."; 
        }
    }, 4000);
}

function applyPlayerForce(amount) {
    if (!state.running) return;
    if (state.energy >= 20) {
        state.price += amount;
        state.energy -= 20;
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
    } else {
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// Привязка управления (используем touchstart для мгновенного отклика)
document.getElementById('btn-pump').addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    applyPlayerForce(8); 
});
document.getElementById('btn-dump').addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    applyPlayerForce(-8); 
});

// Для теста на ПК оставляем mousedown
document.getElementById('btn-pump').addEventListener('mousedown', () => applyPlayerForce(8));
document.getElementById('btn-dump').addEventListener('mousedown', () => applyPlayerForce(-8));

document.getElementById('btn-restart').addEventListener('click', initGame);
document.getElementById('btn-restart').addEventListener('touchstart', (e) => {
    e.preventDefault();
    initGame();
});

function updateLogic() {
    // Шум толпы (волатильность)
    const crowdNoise = (Math.random() - 0.5) * 2.5; 
    
    // Движение цены
    state.price += crowdNoise + state.trend;
    
    // Регенерация энергии
    if (state.energy < state.maxEnergy) {
        state.energy += 0.3; // Скорость восстановления
        if (state.energy > state.maxEnergy) state.energy = state.maxEnergy;
    }
    energyFill.style.width = `${state.energy}%`;

    // Обновление массива истории (движение графика)
    state.history.push(state.price);
    state.history.shift();

    // Проверка поражения
    if (state.price >= state.upperBound || state.price <= state.lowerBound) {
        state.running = false;
        gameOverScreen.classList.remove('hidden');
        finalScoreEl.innerText = `Результат: ${state.score} секунд`;
        clearInterval(scoreInterval);
        clearInterval(newsInterval);
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const stepX = canvas.width / state.history.length;
    
    // Функция масштабирования (200 - максимальная высота шкалы)
    const scaleY = (val) => canvas.height - ((val / 200) * canvas.height);
    
    // Отрисовка красных зон (вне коридора)
    ctx.fillStyle = 'rgba(239, 83, 80, 0.15)';
    ctx.fillRect(0, 0, canvas.width, scaleY(state.upperBound)); 
    ctx.fillRect(0, scaleY(state.lowerBound), canvas.width, canvas.height);

    // Линии границ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, scaleY(state.upperBound)); ctx.lineTo(canvas.width, scaleY(state.upperBound));
    ctx.moveTo(0, scaleY(state.lowerBound)); ctx.lineTo(canvas.width, scaleY(state.lowerBound));
    ctx.stroke();
    ctx.setLineDash([]);

    // Отрисовка линии цены
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
    
    // Точка текущей цены
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

// Запуск
initGame();
