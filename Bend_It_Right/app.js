// --- ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// --- ГЛОБАЛЬНЫЕ ДАННЫЕ И FALLBACK ---
const DEFAULT_DATA = {
  shapes: {
    rect: {
      name: "Квадрат (Коробка)",
      points: [[-60, -60], [60, -60], [60, 60], [-60, 60]]
    },
    hex: {
      name: "Шестигранник",
      points: [[70, 0], [35, 60.62], [-35, 60.62], [-70, 0], [-35, -60.62], [35, -60.62]]
    },
    triangle: {
      name: "Треугольник",
      points: [[0, -80], [69.28, 40], [-69.28, 40]]
    }
  },
  tools: {
    punches: ["Прямой", "Гусиная шея", "Острый 30°"],
    dies: ["V=16", "V=12", "V=8"]
  }
};

let gameData = null;
let baseShapeType = 'rect'; 
let basePoints = []; 
let flangesByEdge = {}; 
let selectedEdge = 0;
const SHEET_THICKNESS = 1.5; // Толщина метала (мм)

// DOM Элементы
const canvas = document.getElementById('flatCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvasWrapper');

// --- ЗАГРУЗКА ДАННЫХ ---
async function loadData() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error("Network error");
    gameData = await response.json();
  } catch (error) {
    console.warn("Использование локального fallback конфигурации.", error);
    gameData = DEFAULT_DATA;
  }
  populateSelects();
  initBaseShape();
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
  if (wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    if (basePoints.length > 0) draw2D();
  }
}).observe(wrapper);

function initBaseShape() {
  baseShapeType = document.getElementById('baseShapeSel').value;
  basePoints = gameData.shapes[baseShapeType] ? gameData.shapes[baseShapeType].points : gameData.shapes['rect'].points;
  flangesByEdge = {};
  selectedEdge = 0;
  document.getElementById('lblEdge').textContent = `#${selectedEdge}`;
  updateOpList();
  draw2D();
}

function getEdgeChain2DPolygons(edgeIdx) {
  const p1 = basePoints[edgeIdx];
  const p2 = basePoints[(edgeIdx + 1) % basePoints.length];

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);

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

  chain.forEach((seg, idx) => {
    // В первом сегменте подрезаем углы на 45° для сопряжения стен в 3D
    const cut = idx === 0 ? seg.length : 0;
    
    // Вектор вдоль кромки
    const ex = dx / len;
    const ey = dy / len;

    const nextP1 = [currP1[0] + nx * seg.length + ex * cut, currP1[1] + ny * seg.length + ey * cut];
    const nextP2 = [currP2[0] + nx * seg.length - ex * cut, currP2[1] + ny * seg.length - ey * cut];

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

  // Базовая деталь (Дно)
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

  // Развёртка полок
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

  // Базовые кромки
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

document.getElementById('btnToggleSign').addEventListener('click', () => {
  const inp = document.getElementById('inpAngle');
  let val = parseFloat(inp.value) || 0;
  inp.value = -val;
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
});

window.setAngle = function(deg) {
  document.getElementById('inpAngle').value = deg;
  if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
};

window.removeBend = function(index) {
  if (flangesByEdge[selectedEdge]) {
    flangesByEdge[selectedEdge].splice(index, 1);
    updateOpList();
    draw2D();
  }
};

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
      <button onclick="window.removeBend(${i})" style="width: auto; height: 22px; padding: 0 6px; margin: 0; background: #ff4d4d; color: #fff; font-size: 0.7rem;">✕</button>
    `;
    ul.appendChild(li);
  });
}

// --- THREE.JS (3D РЕНДЕР С ПОДРЕЗКОЙ УГЛОВ) ---
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
  // Безопасная очистка старых объектов
  while (sheetGroup.children.length > 0) { 
    sheetGroup.remove(sheetGroup.children[0]); 
  }

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x4da6ff, 
    metalness: 0.5, 
    roughness: 0.3,
    side: THREE.DoubleSide 
  });

  const extrudeSettings = { depth: SHEET_THICKNESS, bevelEnabled: false };

  // 1. Отрисовка ДНА (Базового полигона)
  const baseShape = new THREE.Shape();
  baseShape.moveTo(basePoints[0][0], basePoints[0][1]);
  for (let i = 1; i < basePoints.length; i++) {
    baseShape.lineTo(basePoints[i][0], basePoints[i][1]);
  }
  baseShape.closePath();
  
  const baseGeo = new THREE.ExtrudeGeometry(baseShape, extrudeSettings);
  const baseMesh = new THREE.Mesh(baseGeo, material);
  sheetGroup.add(baseMesh);

  // 2. Отрисовка ПОЛОК с угловыми срезами (45° Miter)
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

    const edgeAngle = Math.atan2(dy, dx);

    let currentParent = new THREE.Group();
    currentParent.position.set(p1[0], p1[1], 0);
    currentParent.rotation.z = edgeAngle;
    sheetGroup.add(currentParent);

    const localOutY = -Math.sin(edgeAngle) * outX + Math.cos(edgeAngle) * outY;
    const bendSign = localOutY < 0 ? -1 : 1;

    chain.forEach((seg, segIdx) => {
      const segPivot = new THREE.Group();
      segPivot.rotation.x = bendSign * (seg.angle * Math.PI / 180);

      const flen = seg.length;
      
      // Геометрия фланца с подрезкой 45° на первом гибе для идеального сопряжения углов
      const flangeShape = new THREE.Shape();
      
      if (segIdx === 0 && Math.abs(seg.angle) >= 80) {
        // Трапеция (Miter joint под 45°)
        const miterOffset = flen; // Срез под 45°
        flangeShape.moveTo(0, 0);
        flangeShape.lineTo(width, 0);
        flangeShape.lineTo(Math.max(width / 2, width - miterOffset), -flen);
        flangeShape.lineTo(Math.min(width / 2, miterOffset), -flen);
      } else {
        // Прямоугольник
        flangeShape.moveTo(0, 0);
        flangeShape.lineTo(width, 0);
        flangeShape.lineTo(width, -flen);
        flangeShape.lineTo(0, -flen);
      }
      flangeShape.closePath();

      const flangeGeo = new THREE.ExtrudeGeometry(flangeShape, extrudeSettings);
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

window.onload = loadData;
