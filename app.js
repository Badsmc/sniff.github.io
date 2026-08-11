// Разворачиваем окно на весь экран, если открыто в Telegram
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.expand();
}

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
    } catch (error) {
        console.error("Ошибка загрузки файлов:", error);
    }
}

function updateUI() {
    const dict = translations[currentLang];
    if (!dict) return;

    // Обновляем статические заголовки
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
        
        // Название и описание берутся напрямую из game, кнопка переводится через dict
        card.innerHTML = `
            <h3>${game.name}</h3>
            <p>${game.description}</p>
            <a href="/${game.id}/" class="play-btn" data-i18n="play_btn">${dict['play_btn']}</a>
        `;
        container.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', init);