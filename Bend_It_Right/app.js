// --- ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// --- ГЛОБАЛЬНЫЕ ДАННЫЕ ---
let gameData = null;
let baseShapeType = 'rect'; 
let basePoints = []; // Точки контура (x, y)
let flanges = [];    // { edgeIdx, length, angle }
let selectedEdge = 0;

// --- DOM ЭЛЕМЕНТЫ ---
const canvas = document.getElementById('flatCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvasWrapper');

// --- ЗАГРУЗКА ДАННЫХ ИЗ JSON ---
async function loadData() {
  try {
    const response = await fetch('data.json');
    gameData = await response.json();
    
    // Заполняем селекты интерфейса
    populateSelects();
    // Инициализируем стартовую деталь
    initBaseShape();
  } catch (error) {
    console.error("Ошибка загрузки data.json:", error);
    alert("Не удалось загрузить data.json. Убедитесь, что вы запускаете проект через локальный веб-сервер (Live Server).");
  }
}

function populateSelects() {
  // Формы
  const shapeSel = document.getElementById('baseShapeSel');
  shapeSel.innerHTML = '';
  for (const [key, obj] of Object.entries(gameData.shapes)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = obj.name;
    shapeSel.appendChild(opt);
  }

  // Инструменты
  const punchSel = document.getElementById('inpPunch');
  gameData.tools.punches.forEach(p => punchSel.add(new Option(p, p)));

  const dieSel = document.getElementById('inpDie');
  gameData.tools.dies.forEach(d => dieSel.add(new Option(d, d)));
}

// --- 2D CANVAS (РАЗВЁРТКА) ---
// ResizeObserver гарантирует, что канвас получит размеры контейнера ДО отрисовки
new ResizeObserver(() => {
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  if (basePoints.length > 0) draw2D();
}).observe(wrapper);

function initBaseShape() {
  baseShapeType = document.getElementById('baseShapeSel').value;
  basePoints = gameData.shapes[baseShapeType].points;
  flanges = [];
  selectedEdge = 0;
  updateOpList();
  draw2D();
}

function draw2D() {
  if (canvas.width === 0 || canvas.height === 0) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const scale = 1.2; // Масштаб отображения в 2D

  // 1. Отрисовка фланцев (синие квадраты вокруг детали)
  flanges.forEach(f => {
    const p1 = basePoints[f.edgeIdx];
    const p2 = basePoints[(f.edgeIdx + 1) % basePoints.length];
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    
    // Нормаль наружу
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;

    const flen = f.length;
    
    const f1 = [p2[0], p2[1]];
    const f2 = [p1[0], p1[1]];
    const f3 = [p1[0] + nx * flen, p1[1] + ny * flen];
    const f4 = [p2[0] + nx * flen, p2[1] + ny * flen];

    ctx.fillStyle = 'rgba(77, 166, 255, 0.4)';
    ctx.strokeStyle = '#4da6ff';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(cx + f1[0]*scale, cy + f1[1]*scale);
    ctx.lineTo(cx + f2[0]*scale, cy + f2[1]*scale);
    ctx.lineTo(cx + f3[0]*scale, cy + f3[1]*scale);
    ctx.lineTo(cx + f4[0]*scale, cy + f4[1]*scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 2. Отрисовка базовой детали (центральный полигон)
  ctx.fillStyle = '#282833';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + basePoints[0][0]*scale, cy + basePoints[0][1]*scale);
  for (let i = 1; i < basePoints.length; i++) {
    ctx.lineTo(cx + basePoints[i][0]*scale, cy + basePoints[i][1]*scale);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Линии гиба и маркеры
  for (let i = 0; i < basePoints.length; i++) {
    const p1 = basePoints[i];
    const p2 = basePoints[(i + 1) % basePoints.length];
    
    ctx.beginPath();
    ctx.moveTo(cx + p1[0]*scale, cy + p1[1]*scale);
    ctx.lineTo(cx + p2[0]*scale, cy + p2[1]*scale);
    
    if (i === selectedEdge) {
      ctx.strokeStyle = '#ff4d4d'; // Активная кромка
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
    }
    ctx.stroke();

    // Кружок по центру кромки
    const mx = cx + ((p1[0] + p2[0]) / 2) * scale;
    const my = cy + ((p1[1] + p2[1]) / 2) * scale;
    
    if(i === selectedEdge) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// Клик по 2D для выбора кромки
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const scale = 1.2;

  let minDist = Infinity;
  let closestEdge = 0;

  for (let i = 0; i < basePoints.length; i++) {
    const p1 = basePoints[i];
    const p2 = basePoints[(i + 1) % basePoints.length];
    const mx = cx + ((p1[0] + p2[0]) / 2) * scale;
    const my = cy + ((p1[1] + p2[1]) / 2) * scale;

    const dist = Math.hypot(clickX - mx, clickY - my);
    if (dist < minDist) {
      minDist = dist;
      closestEdge = i;
    }
  }

  // Если кликнули достаточно близко к центру кромки
  if (minDist < 50) { 
    selectedEdge = closestEdge;
    document.getElementById('lblEdge').textContent = `#${selectedEdge}`;
    draw2D();
    if(tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
  }
});

// --- UI И СОБЫТИЯ ---
document.getElementById('baseShapeSel').addEventListener('change', initBaseShape);
document.getElementById('btnReset').addEventListener('click', initBaseShape);

document.getElementById('btnAddBend').addEventListener('click', () => {
  const len = parseFloat(document.getElementById('inpLength').value);
  const ang = parseFloat(document.getElementById('inpAngle').value);

  // Обновляем или добавляем фланец
  const existingIdx = flanges.findIndex(f => f.edgeIdx === selectedEdge);
  if (existingIdx !== -1) {
    flanges[existingIdx] = { edgeIdx: selectedEdge, length: len, angle: ang };
  } else {
    flanges.push({ edgeIdx: selectedEdge, length: len, angle: ang });
  }

  updateOpList();
  draw2D();
  
  if(tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
});

function updateOpList() {
  const ul = document.getElementById('opList');
  ul.innerHTML = '';
  flanges.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = `Гиб ${i+1}: Кромка #${f.edgeIdx} | L=${f.length} | ∠${f.angle}°`;
    ul.appendChild(li);
  });
}

// --- THREE.JS (3D МОДЕЛИРОВАНИЕ) ---
let scene, camera, renderer, controls, sheetGroup;
let is3DInit = false;

function init3D() {
  const container = document.getElementById('container3d');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181822);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
  camera.position.set(200, -250, 200);
  camera.up.set(0, 0, 1); // Ось Z смотрит вверх

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Свет
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(100, 100, 200);
  scene.add(dirLight);

  // Сетка (пол)
  const grid = new THREE.GridHelper(500, 25, 0x444455, 0x222233);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  sheetGroup = new THREE.Group();
  scene.add(sheetGroup);

  is3DInit = true;
  animate3D();
}

function build3DModel() {
  // Очистка предыдущей модели
  while(sheetGroup.children.length > 0){ 
      sheetGroup.remove(sheetGroup.children[0]); 
  }

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x82b1ff, 
    metalness: 0.6, 
    roughness: 0.4,
    side: THREE.DoubleSide 
  });

  // 1. Построение базы (основания)
  const shape = new THREE.Shape();
  shape.moveTo(basePoints[0][0], basePoints[0][1]);
  for (let i = 1; i < basePoints.length; i++) {
    shape.lineTo(basePoints[i][0], basePoints[i][1]);
  }
  const baseGeo = new THREE.ShapeGeometry(shape);
  const baseMesh = new THREE.Mesh(baseGeo, material);
  sheetGroup.add(baseMesh);

  // 2. Построение фланцев
  flanges.forEach(f => {
    const p1 = basePoints[f.edgeIdx];
    const p2 = basePoints[(f.edgeIdx + 1) % basePoints.length];
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const width = Math.hypot(dx, dy);
    const alpha = Math.atan2(dy, dx);

    // Pivot (Шарнир) на стартовой точке кромки
    const pivot = new THREE.Group();
    pivot.position.set(p1[0], p1[1], 0);
    pivot.rotation.z = alpha; 
    
    // Создаем плоскость фланца
    const flen = f.length;
    const flangeGeo = new THREE.PlaneGeometry(width, flen);
    // Сдвигаем геометрию так, чтобы край совпадал с шарниром
    flangeGeo.translate(width/2, -flen/2, 0); 

    const flangeMesh = new THREE.Mesh(flangeGeo, material);
    
    // Физика гиба: вращаем фланец по оси X на заданный угол
    pivot.rotation.x = f.angle * Math.PI / 180;

    pivot.add(flangeMesh);
    sheetGroup.add(pivot);
  });
}

function animate3D() {
  requestAnimationFrame(animate3D);
  controls.update();
  renderer.render(scene, camera);
}

// Управление модальным окном
document.getElementById('btnOpen3D').addEventListener('click', () => {
  document.getElementById('modal3d').style.display = 'flex';
  if(!is3DInit) init3D();
  
  // Обновляем размеры 3D окна после открытия
  const container = document.getElementById('container3d');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);

  build3DModel();
});

document.getElementById('btnClose3D').addEventListener('click', () => {
  document.getElementById('modal3d').style.display = 'none';
});

// СТАРТ
window.onload = loadData;
