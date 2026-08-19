// --- ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// --- ГЛОБАЛЬНЫЕ ДАННЫЕ ---
let gameData = null;
let baseShapeType = 'rect'; 
let basePoints = []; // Точки базового контура [[x, y], ...]

// Храним цепочки гибов для КАЖДОЙ кромки отдельно
// flangesByEdge = { edgeIdx: [ { length: 50, angle: 90 }, { length: 20, angle: 90 }, ... ] }
let flangesByEdge = {}; 
let selectedEdge = 0;

// --- DOM ЭЛЕМЕНТЫ ---
const canvas = document.getElementById('flatCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvasWrapper');

// --- ЗАГРУЗКА JSON ---
async function loadData() {
  try {
    const response = await fetch('data.json');
    gameData = await response.json();
    populateSelects();
    initBaseShape();
  } catch (error) {
    console.error("Ошибка загрузки data.json:", error);
    alert("Запустите через локальный веб-сервер (Live Server).");
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

// --- 2D CANVAS ---
new ResizeObserver(() => {
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  if (basePoints.length > 0) draw2D();
}).observe(wrapper);

function initBaseShape() {
  baseShapeType = document.getElementById('baseShapeSel').value;
  basePoints = gameData.shapes[baseShapeType].points;
  flangesByEdge = {};
  selectedEdge = 0;
  updateOpList();
  draw2D();
}

// Расчёт полигонов всей цепочки гибов для 2D развёртки
function getEdgeChain2DPolygons(edgeIdx) {
  const p1 = basePoints[edgeIdx];
  const p2 = basePoints[(edgeIdx + 1) % basePoints.length];

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);

  // Вектор нормали строго наружу от базового полигона
  const midX = (p1[0] + p2[0]) / 2;
  const midY = (p1[1] + p2[1]) / 2;

  let nx = -dy / len;
  let ny = dx / len;

  if (midX * nx + midY * ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  const chain = flangesByEdge[edgeIdx] || [];
  const polygons = [];

  let currP1 = [p1[0], p1[1]];
  let currP2 = [p2[0], p2[1]];

  chain.forEach(seg => {
    const nextP1 = [currP1[0] + nx * seg.length, currP1[1] + ny * seg.length];
    const nextP2 = [currP2[0] + nx * seg.length, currP2[1] + ny * seg.length];

    polygons.push({
      poly: [currP1, currP2, nextP2, nextP1],
      seg: seg
    });

    currP1 = nextP1;
    currP2 = nextP2;
  });

  return polygons;
}

function draw2D() {
  if (canvas.width === 0 || canvas.height === 0) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Автомасштаб
  let minX = -80, maxX = 80, minY = -80, maxY = 80;
  basePoints.forEach(p => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });

  for (let e = 0; e < basePoints.length; e++) {
    const polys = getEdgeChain2DPolygons(e);
    polys.forEach(item => {
      item.poly.forEach(pt => {
        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
      });
    });
  }

  const boundingW = maxX - minX;
  const boundingH = maxY - minY;
  const scale = Math.min((canvas.width - 80) / boundingW, (canvas.height - 80) / boundingH, 1.5);

  // 1. Рисуем баковую деталь
  ctx.fillStyle = '#282835';
  ctx.strokeStyle = '#555566';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + basePoints[0][0] * scale, cy + basePoints[0][1] * scale);
  for (let i = 1; i < basePoints.length; i++) {
    ctx.lineTo(cx + basePoints[i][0] * scale, cy + basePoints[i][1] * scale);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 2. Рисуем развёртку всех цепочек полок
  for (let e = 0; e < basePoints.length; e++) {
    const polys = getEdgeChain2DPolygons(e);
    polys.forEach((item, idx) => {
      ctx.fillStyle = e === selectedEdge ? 'rgba(77, 166, 255, 0.35)' : 'rgba(200, 200, 220, 0.15)';
      ctx.strokeStyle = e === selectedEdge ? '#4da6ff' : '#8888a0';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(cx + item.poly[0][0] * scale, cy + item.poly[0][1] * scale);
      for (let k = 1; k < 4; k++) {
        ctx.lineTo(cx + item.poly[k][0] * scale, cy + item.poly[k][1] * scale);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Линии гибов внутри цепочки
      if (idx > 0) {
        ctx.strokeStyle = '#ffcc00';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx + item.poly[0][0] * scale, cy + item.poly[0][1] * scale);
        ctx.lineTo(cx + item.poly[1][0] * scale, cy + item.poly[1][1] * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  // 3. Линии базовых кромок
  for (let i = 0; i < basePoints.length; i++) {
    const p1 = basePoints[i];
    const p2 = basePoints[(i + 1) % basePoints.length];
    const hasFlanges = flangesByEdge[i] && flangesByEdge[i].length > 0;

    ctx.beginPath();
    ctx.moveTo(cx + p1[0] * scale, cy + p1[1] * scale);
    ctx.lineTo(cx + p2[0] * scale, cy + p2[1] * scale);

    if (i === selectedEdge) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 4;
    } else if (hasFlanges) {
      ctx.strokeStyle = '#ffcc00';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.setLineDash([]);

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

// Клик по Canvas
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  let minX = -80, maxX = 80, minY = -80, maxY = 80;
  basePoints.forEach(p => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  for (let eIdx = 0; eIdx < basePoints.length; eIdx++) {
    const polys = getEdgeChain2DPolygons(eIdx);
    polys.forEach(item => {
      item.poly.forEach(pt => {
        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
      });
    });
  }

  const scale = Math.min((canvas.width - 80) / (maxX - minX), (canvas.height - 80) / (maxY - minY), 1.5);

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

  if (minDist < 60) {
    selectedEdge = closestEdge;
    document.getElementById('lblEdge').textContent = `#${selectedEdge}`;
    draw2D();
    updateOpList();
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
  }
});

// --- UI УПРАВЛЕНИЕ ---
document.getElementById('baseShapeSel').addEventListener('change', initBaseShape);
document.getElementById('btnReset').addEventListener('click', initBaseShape);

// Добавить гиб в цепочку выбранной кромки
document.getElementById('btnAddBend').addEventListener('click', () => {
  const len = parseFloat(document.getElementById('inpLength').value);
  const ang = parseFloat(document.getElementById('inpAngle').value);

  if (!flangesByEdge[selectedEdge]) {
    flangesByEdge[selectedEdge] = [];
  }

  flangesByEdge[selectedEdge].push({ length: len, angle: ang });

  updateOpList();
  draw2D();
  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
});

// Инверсия знака угла (+ / -)
document.getElementById('btnToggleSign').addEventListener('click', () => {
  const inp = document.getElementById('inpAngle');
  let val = parseFloat(inp.value) || 0;
  inp.value = -val;
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
});

// Установка угла из кнопок пресетов
function setAngle(deg) {
  document.getElementById('inpAngle').value = deg;
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function updateOpList() {
  const ul = document.getElementById('opList');
  ul.innerHTML = '';

  const chain = flangesByEdge[selectedEdge] || [];
  if (chain.length === 0) {
    ul.innerHTML = '<li style="color:#666;">Нет гибов на этой кромке</li>';
    return;
  }

  chain.forEach((f, i) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';

    li.innerHTML = `
      <span>Гиб ${i + 1}: L=${f.length}мм | ∠${f.angle}°</span>
      <button onclick="removeBend(${i})" style="width: auto; height: 22px; padding: 0 6px; margin: 0; background: #ff4d4d; color: #fff; font-size: 0.7rem;">✕</button>
    `;
    ul.appendChild(li);
  });
}

function removeBend(index) {
  if (flangesByEdge[selectedEdge]) {
    flangesByEdge[selectedEdge].splice(index, 1);
    updateOpList();
    draw2D();
  }
}

// --- THREE.JS (3D РЕНДЕР) ---
let scene, camera, renderer, controls, sheetGroup;
let is3DInit = false;

function init3D() {
  const container = document.getElementById('container3d');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141418);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000);
  camera.position.set(220, -280, 220);
  camera.up.set(0, 0, 1);

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

  // 1. Базовый полигон
  const shape = new THREE.Shape();
  shape.moveTo(basePoints[0][0], basePoints[0][1]);
  for (let i = 1; i < basePoints.length; i++) {
    shape.lineTo(basePoints[i][0], basePoints[i][1]);
  }
  const baseGeo = new THREE.ShapeGeometry(shape);
  const baseMesh = new THREE.Mesh(baseGeo, material);
  sheetGroup.add(baseMesh);

  // 2. Построение цепочек гибов
  for (let edgeIdx = 0; edgeIdx < basePoints.length; edgeIdx++) {
    const chain = flangesByEdge[edgeIdx];
    if (!chain || chain.length === 0) continue;

    const p1 = basePoints[edgeIdx];
    const p2 = basePoints[(edgeIdx + 1) % basePoints.length];

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const width = Math.hypot(dx, dy);

    const midX = (p1[0] + p2[0]) / 2;
    const midY = (p1[1] + p2[1]) / 2;

    let outX = -dy / width;
    let outY = dx / width;
    if (midX * outX + midY * outY < 0) {
      outX = -outX;
      outY = -outY;
    }

    const edgeX = p2[0] - p1[0];
    const edgeY = p2[1] - p1[1];
    const edgeAngle = Math.atan2(edgeY, edgeX);

    let currentParent = new THREE.Group();
    currentParent.position.set(p1[0], p1[1], 0);
    currentParent.rotation.z = edgeAngle;
    sheetGroup.add(currentParent);

    const localOutY = -Math.sin(edgeAngle) * outX + Math.cos(edgeAngle) * outY;
    const bendSign = localOutY < 0 ? -1 : 1;

    chain.forEach(seg => {
      const segPivot = new THREE.Group();
      segPivot.rotation.x = bendSign * (seg.angle * Math.PI / 180);

      const flen = seg.length;
      const flangeGeo = new THREE.PlaneGeometry(width, flen);
      flangeGeo.translate(width / 2, -flen / 2, 0);

      const flangeMesh = new THREE.Mesh(flangeGeo, material);
      segPivot.add(flangeMesh);

      currentParent.add(segPivot);

      const nextParent = new THREE.Group();
      nextParent.position.set(0, -flen, 0);
      segPivot.add(nextParent);

      currentParent = nextParent;
    });
  }
}

function animate3D() {
  requestAnimationFrame(animate3D);
  controls.update();
  renderer.render(scene, camera);
}

// Показ модального окна 3D
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

// Старт
window.onload = loadData;
