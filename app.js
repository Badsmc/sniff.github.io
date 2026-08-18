// Инициализация Telegram
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) tg.expand();

let currentLang = localStorage.getItem('appLang') || 'en';
let translations = {};
let gamesList = [];

async function init() {
    try {
        const [langRes, gamesRes] = await Promise.all([
            fetch('lang.json'),
            fetch('games.json')
        ]);
        
        translations = await langRes.json();
        gamesList = await gamesRes.json();

        document.getElementById('lang-select').value = currentLang;
        updateUI();
        
        document.getElementById('lang-select').addEventListener('change', (e) => {
            currentLang = e.target.value;
            localStorage.setItem('appLang', currentLang);
            updateUI();
        });

        // Настройка кнопки назад для обычного браузера
        document.getElementById('web-back-btn').addEventListener('click', closeGame);

        // Если это Telegram, настраиваем нативную кнопку назад
        if (tg && tg.initData) {
            document.getElementById('web-back-btn').style.display = 'none';
            tg.BackButton.onClick(closeGame);
        }

    } catch (error) {
        console.error("Ошибка загрузки файлов:", error);
    }
}

function updateUI() {
    const dict = translations[currentLang];
    if (!dict) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });

    renderGames(dict);
}

function renderGames(dict) {
    const container = document.getElementById('games-container');
    container.innerHTML = '';

    gamesList.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        
        card.innerHTML = `
            <h3>${game.name}</h3>
            <p>${game.description}</p>
            <button class="play-btn" onclick="openGame('${game.id}')" data-i18n="play_btn">${dict['play_btn']}</button>
        `;
        container.appendChild(card);
    });
}

// --- ЛОГИКА ЗАПУСКА ИГР В КОНТЕЙНЕРЕ ---

function openGame(gameId) {
    // Прячем каталог, показываем контейнер
    document.getElementById('catalog').classList.add('hidden');
    document.getElementById('game-wrapper').classList.remove('hidden');
    
    // Загружаем игру в окно
    document.getElementById('game-frame').src = `/${gameId}/`;

    // Показываем кнопку назад в Telegram
    if (tg && tg.initData) {
        tg.BackButton.show();
    }
}

function closeGame() {
    // Показываем каталог, прячем контейнер
    document.getElementById('game-wrapper').classList.add('hidden');
    document.getElementById('catalog').classList.remove('hidden');
    
    // Очищаем источник (чтобы остановить звуки и процессы игры)
    document.getElementById('game-frame').src = "";

    // Прячем кнопку назад в Telegram
    if (tg && tg.initData) {
        tg.BackButton.hide();
    }
}

document.addEventListener('DOMContentLoaded', init);
