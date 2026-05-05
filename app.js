const canvas = document.getElementById('hwCanvas');
const ctx = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');
const guide = document.getElementById('cursor-guide');

let bridge = null;
let tool = 'pen';
let isDrawing = false;
let isDraggingMenu = false;
let pressTimer;
let lastSavedJson = "";

let scale = 1;
let offsetX = 0;
let offsetY = 0;
let pages = [[]];
let redoStack = [];
let currentPage = 0;
let config = { 
  width: 4, 
  eraser: 40, 
  ink: '#18181b', 
  pressure: true, 
  paper: 'white', 
  template: 'blank', 
  orient: 'horiz' 
};

function initCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  redraw();
}

function applyConfig() {
  toolbar.className = config.orient === 'vert' ? 'vertical' : '';
  const container = document.getElementById('canvas-container');
  
  // Apply paper colors and templates via CSS classes to avoid inline style CSP blocks
  container.style.backgroundColor = `var(--paper-${config.paper})`;
  document.body.style.backgroundColor = `var(--paper-${config.paper})`;
  container.className = config.template === 'blank' ? '' : `tpl-${config.template}`;
  
  document.documentElement.style.setProperty('--grid-color', config.paper === 'blue' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)');
  
  document.getElementById('setOrient').value = config.orient;
  document.getElementById('paperColor').value = config.paper;
  document.getElementById('template').value = config.template;
  document.getElementById('lineWidth').value = config.width;
  document.getElementById('lwVal').innerText = config.width;
  document.getElementById('usePressure').checked = config.pressure;
  
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === config.ink);
  });
  redraw();
}

function redraw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  (pages[currentPage] || []).forEach(stroke => {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation = stroke.type === 'eraser' ? 'destination-out' : 'source-over';
    
    stroke.points.forEach((p, i) => {
      ctx.lineWidth = p.p ? stroke.width * p.p : stroke.width;
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  });
}

function setupLongPress(btn, popover) {
  btn.onpointerdown = (e) => {
    pressTimer = setTimeout(() => {
      const rect = btn.getBoundingClientRect();
      popover.style.display = 'flex';
      popover.style.left = (toolbar.classList.contains('vertical') ? rect.right + 15 : rect.left) + 'px';
      popover.style.top = (toolbar.classList.contains('vertical') ? rect.top : rect.bottom + 15) + 'px';
    }, 500);
  };
  btn.onpointerup = () => clearTimeout(pressTimer);
}

setupLongPress(document.getElementById('penBtn'), document.getElementById('penPopover'));
setupLongPress(document.getElementById('eraserBtn'), document.getElementById('eraserPopover'));

canvas.onpointerdown = (e) => {
  if (e.target !== canvas || isDraggingMenu) return;
  isDrawing = true;
  const pos = { x: (e.clientX - offsetX) / scale, y: (e.clientY - offsetY) / scale };
  const p = config.pressure && e.pressure > 0 ? e.pressure : null;
  pages[currentPage].push({ 
    type: tool, 
    color: config.ink, 
    width: tool === 'eraser' ? config.eraser : config.width, 
    points: [{...pos, p}] 
  });
  redoStack = [];
};

window.onpointermove = (e) => {
  if (isDrawing) {
    const pos = { x: (e.clientX - offsetX) / scale, y: (e.clientY - offsetY) / scale };
    const p = config.pressure && e.pressure > 0 ? e.pressure : null;
    pages[currentPage][pages[currentPage].length - 1].points.push({...pos, p});
    redraw();
  }
  
  guide.style.display = 'block';
  guide.style.left = e.clientX + 'px';
  guide.style.top = e.clientY + 'px';
  const s = (tool === 'eraser' ? config.eraser : config.width) * scale;
  guide.style.width = s + 'px';
  guide.style.height = s + 'px';
  
  if (e.target.closest('#toolbar') || e.target.closest('.popover')) {
    guide.style.display = 'none';
  }
};

window.onpointerup = () => { 
  if(isDrawing) { 
    isDrawing = false; 
    save(); 
  } 
};

window.onwheel = (e) => {
  e.preventDefault();
  const zoom = e.deltaY > 0 ? 0.9 : 1.1;
  const bx = (e.clientX - offsetX) / scale;
  const by = (e.clientY - offsetY) / scale;
  scale *= zoom;
  offsetX = e.clientX - bx * scale;
  offsetY = e.clientY - by * scale;
  redraw();
};

document.getElementById('lineWidth').oninput = (e) => { 
  config.width = e.target.value; 
  document.getElementById('lwVal').innerText = e.target.value; 
};

document.getElementById('eraserSize').oninput = (e) => { 
  config.eraser = e.target.value; 
  document.getElementById('esVal').innerText = e.target.value; 
};

document.getElementById('usePressure').onchange = (e) => { 
  config.pressure = e.target.checked; 
  save(); 
};

document.getElementById('settingsBtn').onclick = () => { 
  document.getElementById('settingsModal').style.display = 'flex'; 
};

document.getElementById('closeSettings').onclick = () => {
  config.paper = document.getElementById('paperColor').value;
  config.template = document.getElementById('template').value;
  config.orient = document.getElementById('setOrient').value;
  applyConfig();
  document.getElementById('settingsModal').style.display = 'none';
  save();
};

document.querySelectorAll('.swatch').forEach(s => {
  s.onclick = () => { 
    document.querySelector('.swatch.selected').classList.remove('selected'); 
    s.classList.add('selected'); 
    config.ink = s.dataset.color; 
    save(); 
  };
});

document.getElementById('penBtn').onclick = () => { tool = 'pen'; updateBtns(); };
document.getElementById('eraserBtn').onclick = () => { tool = 'eraser'; updateBtns(); };

function updateBtns() { 
  document.getElementById('penBtn').classList.toggle('active', tool === 'pen'); 
  document.getElementById('eraserBtn').classList.toggle('active', tool === 'eraser'); 
}

document.getElementById('undoBtn').onclick = () => { 
  if(pages[currentPage].length) { 
    redoStack.push(pages[currentPage].pop()); 
    redraw(); 
    save(); 
  } 
};

document.getElementById('redoBtn').onclick = () => { 
  if(redoStack.length) { 
    pages[currentPage].push(redoStack.pop()); 
    redraw(); 
    save(); 
  } 
};

document.getElementById('clearBtn').onclick = () => { 
  if(confirm("Clear?")) { 
    pages[currentPage] = []; 
    redraw(); 
    save(); 
  } 
};

document.getElementById('resetView').onclick = () => { 
  scale = 1; 
  offsetX = 0; 
  offsetY = 0; 
  redraw(); 
};

document.getElementById('nextPage').onclick = () => { 
  currentPage++; 
  if(!pages[currentPage]) pages[currentPage] = []; 
  document.getElementById('pageDisplay').innerText = "Page " + (currentPage+1); 
  redraw(); 
  save(); 
};

document.getElementById('prevPage').onclick = () => { 
  if(currentPage > 0) { 
    currentPage--; 
    document.getElementById('pageDisplay').innerText = "Page " + (currentPage+1); 
    redraw(); 
    save(); 
  } 
};

toolbar.onpointerdown = (e) => { 
  if (e.target.closest('.handle')) { 
    isDraggingMenu = true; 
    toolbar.setPointerCapture(e.pointerId); 
  } 
};

toolbar.onpointermove = (e) => { 
  if (isDraggingMenu) { 
    toolbar.style.left = (e.clientX - 20) + 'px'; 
    toolbar.style.top = (e.clientY - 20) + 'px'; 
  } 
};

toolbar.onpointerup = () => isDraggingMenu = false;

window.onclick = (e) => { 
  if(!e.target.closest('.tool-btn') && !e.target.closest('.popover')) {
    document.querySelectorAll('.popover').forEach(p => p.style.display = 'none');
  }
};

window.onresize = initCanvas;
initCanvas();

// Initializing the bridge with the ComponentRelay
bridge = new ComponentRelay({
  targetWindow: window,
  onDataUpdate: (data) => {
    const text = data.item.content.text;
    if (text === lastSavedJson) return; 
    try {
      const saved = JSON.parse(text);
      if(saved.pages) pages = saved.pages;
      if(saved.config) config = {...config, ...saved.config};
      if(saved.currentPage !== undefined) currentPage = saved.currentPage;
      document.getElementById('pageDisplay').innerText = "Page " + (currentPage+1);
      applyConfig();
    } catch(e) {
      console.error("Failed to parse saved data", e);
    }
  }
});

function save() {
  if (!bridge) return;
  const payload = JSON.stringify({ pages, config, currentPage });
  lastSavedJson = payload;
  bridge.saveItemWithPayload({ 
    content: { 
      text: payload, 
      preview_title: "Quill Notebook" 
    } 
  });
}