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
    populateSelects();
    initBaseShape();
  } catch (error) {
    console.error("Ошибка загрузки data.json:", error);
    alert("Не удалось загрузить data.json. Используйте Live Server или локальный веб-сервер.");
  }
}

function populateSelects() {
  const shapeSel = document.getElementById('baseShapeSel');
  shapeSel.innerHTML = '';
  for (const [key, obj] of Object.entries(gameData.shapes)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = obj.name;
    shapeSel.appendChild(opt);
  }

  const punchSel = document.getElementById('inpPunch');
  punchSel.innerHTML = '';
  gameData.tools.punches.forEach(p => punchSel.add(new Option(p, p)));

  const dieSel = document.getElementById('inpDie');
  dieSel.innerHTML = '';
  gameData.tools.dies.forEach(d => dieSel.add(new Option(d, d)));
}

// --- 2D CANVAS (ОТОБРАЖЕНИЕ ПОЛНОЙ РАЗВЁРТКИ) ---
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

// Расчёт глобальных координат 2D-полигона полки
function getFlangePolygon2D(f) {
  const p1 = basePoints[f.edgeIdx];
  const p2 = basePoints[(f.edgeIdx + 1) % basePoints.length];

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);

  // Вектор нормали наружу (в 2D)
  const nx = dy / len;
  const ny = -dx / len;

  const flen = f.length;

  return [
    [p1[0], p1[1]],
    [p2[0], p2[1]],
    [p2[0] + nx * flen, p2[1] + ny * flen],
    [p1[0] + nx * flen, p1[1] + ny * flen]
  ];
}

function draw2D() {
  if (canvas.width === 0 || canvas.height === 0) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Автомасштабирование: определяем габариты всей развёртки
  let minX = -100, maxX = 100, minY = -100, maxY = 100;
  basePoints.forEach(p => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });

  flanges.forEach(f => {
    const poly = getFlangePolygon2D(f);
    poly.forEach(p => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
  });

  const boundingW = maxX - minX;
  const boundingH = maxY - minY;
  const scale = Math.min((canvas.width - 60) / boundingW, (canvas.height - 60) / boundingH, 1.5);

  // 1. Отрисовка закрашенного тела ВСЕЙ развёртки (База + Полки как единая заготовка)
  ctx.fillStyle = '#2d323f';
  ctx.strokeStyle = '#4da6ff';
  ctx.lineWidth = 2;

  // Отрисовка базовой формы
  ctx.beginPath();
  ctx.moveTo(cx + basePoints[0][0] * scale, cy + basePoints[0][1] * scale);
  for (let i = 1; i < basePoints.length; i++) {
    ctx.lineTo(cx + basePoints[i][0] * scale, cy + basePoints[i][1] * scale);
  }
  ctx.closePath();
  ctx.fill();

  // Отрисовка прикреплённых полок
  flanges.forEach(f => {
    const poly = getFlangePolygon2D(f);
    ctx.fillStyle = 'rgba(77, 166, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(cx + poly[0][0] * scale, cy + poly[0][1] * scale);
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(cx + poly[i][0] * scale, cy + poly[i][1] * scale);
    }
    ctx.closePath();
    ctx.fill();

    // Внешний контур полки (за исключением линии гиба)
    ctx.strokeStyle = '#4da6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + poly[1][0] * scale, cy + poly[1][1] * scale);
    ctx.lineTo(cx + poly[2][0] * scale, cy + poly[2][1] * scale);
    ctx.lineTo(cx + poly[3][0] * scale, cy + poly[3][1] * scale);
    ctx.lineTo(cx + poly[0][0] * scale, cy + poly[0][1] * scale);
    ctx.stroke();
  });

  // 2. Линии гиба (пунктир) и выделение выбранной кромки
  for (let i = 0; i < basePoints.length; i++) {
    const p1 = basePoints[i];
    const p2 = basePoints[(i + 1) % basePoints.length];
    
    const hasFlange = flanges.some(f => f.edgeIdx === i);

    ctx.beginPath();
    ctx.moveTo(cx + p1[0] * scale, cy + p1[1] * scale);
    ctx.lineTo(cx + p2[0] * scale, cy + p2[1] * scale);
    
    if (i === selectedEdge) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff4d4d'; // Активная выбранная кромка
      ctx.lineWidth = 4;
    } else if (hasFlange) {
      ctx.setLineDash([5, 5]); // Линия гиба
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Маркер в центре кромки
    const mx = cx + ((p1[0] + p2[0]) / 2) * scale;
    const my = cy + ((p1[1] + p2[1]) / 2) * scale;
    
    if (i === selectedEdge) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Клик по холсту для выбора кромки
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Рассчитываем текущий scale
  let minX = -100, maxX = 100, minY = -100, maxY = 100;
  basePoints.forEach(p => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  flanges.forEach(f => {
    const poly = getFlangePolygon2D(f);
    poly.forEach(p => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
  });
  const scale = Math.min((canvas.width - 60) / (maxX - minX), (canvas.height - 60) / (maxY - minY), 1.5);

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

  if (minDist < 50) { 
    selectedEdge = closestEdge;
    document.getElementById('lblEdge').textContent = `#${selectedEdge}`;
    draw2D();
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
  }
});

// --- UI ОБРАБОТЧИКИ ---
document.getElementById('baseShapeSel').addEventListener('change', initBaseShape);
document.getElementById('btnReset').addEventListener('click', initBaseShape);

document.getElementById('btnAddBend').addEventListener('click', () => {
  const len = parseFloat(document.getElementById('inpLength').value);
  const ang = parseFloat(document.getElementById('inpAngle').value);

  const existingIdx = flanges.findIndex(f => f.edgeIdx === selectedEdge);
  if (existingIdx !== -1) {
    flanges[existingIdx] = { edgeIdx: selectedEdge, length: len, angle: ang };
  } else {
    flanges.push({ edgeIdx: selectedEdge, length: len, angle: ang });
  }

  updateOpList();
  draw2D();
  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
});

function updateOpList() {
  const ul = document.getElementById('opList');
  ul.innerHTML = '';
  flanges.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = `Гиб ${i+1}: Кромка #${f.edgeIdx} | L=${f.length}мм | ∠${f.angle}°`;
    ul.appendChild(li);
  });
}

// --- THREE.JS (3D МОДЕЛИРОВАНИЕ) ---
let scene, camera, renderer, controls, sheetGroup;
let is3DInit = false;

function init3D() {
  const container = document.getElementById('container3d');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141418);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
  camera.position.set(200, -250, 250);
  camera.up.set(0, 0, 1); // Z смотрит вверх

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(150, -150, 300);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(500, 25, 0x444455, 0x222233);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  sheetGroup = new THREE.Group();
  scene.add(sheetGroup);

  is3DInit = true;
  animate3D();
}

function build3DModel() {
  while (sheetGroup.children.length > 0) { 
    sheetGroup.remove(sheetGroup.children[0]); 
  }

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x4da6ff, 
    metalness: 0.5, 
    roughness: 0.3,
    side: THREE.DoubleSide 
  });

  // 1. Основание детали
  const shape = new THREE.Shape();
  shape.moveTo(basePoints[0][0], basePoints[0][1]);
  for (let i = 1; i < basePoints.length; i++) {
    shape.lineTo(basePoints[i][0], basePoints[i][1]);
  }
  const baseGeo = new THREE.ShapeGeometry(shape);
  const baseMesh = new THREE.Mesh(baseGeo, material);
  sheetGroup.add(baseMesh);

  // 2. Полки (Фланцы) с правильной ориентацией осей гиба
  flanges.forEach(f => {
    const p1 = basePoints[f.edgeIdx];
    const p2 = basePoints[(f.edgeIdx + 1) % basePoints.length];
    
    const edgeVector = new THREE.Vector2(p2[0] - p1[0], p2[1] - p1[1]);
    const width = edgeVector.length();
    
    // Угол наклона кромки в плоскости XY
    const edgeAngle = Math.atan2(edgeVector.y, edgeVector.x);

    // Локальный шарнир на кромке
    const pivot = new THREE.Group();
    pivot.position.set(p1[0], p1[1], 0);
    pivot.rotation.z = edgeAngle; // Направляем X вдоль кромки

    // Создаём фланец. В его локальной системе X = длина кромки, Y = отгиб
    const flen = f.length;
    const flangeGeo = new THREE.PlaneGeometry(width, flen);
    // Центрируем плоскость по X и сдвигаем наружу от гиба по Y
    flangeGeo.translate(width / 2, -flen / 2, 0);

    const flangeMesh = new THREE.Mesh(flangeGeo, material);

    // КОРРЕКТНЫЙ ГИБ: поворот вокруг локальной оси X (оси кромки)
    pivot.rotation.x = (f.angle * Math.PI) / 180;

    pivot.add(flangeMesh);
    sheetGroup.add(pivot);
  });
}

function animate3D() {
  requestAnimationFrame(animate3D);
  controls.update();
  renderer.render(scene, camera);
}

// Управление 3D окном
document.getElementById('btnOpen3D').addEventListener('click', () => {
  document.getElementById('modal3d').style.display = 'flex';
  if (!is3DInit) init3D();
  
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
