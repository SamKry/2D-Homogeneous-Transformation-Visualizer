// ===== Configuration =====
const CANVAS_SIZE = 800;
const STORAGE_KEY = 'transformation_matrix';
const SIZE_X_STORAGE_KEY = 'square_size_x';
const SIZE_Y_STORAGE_KEY = 'square_size_y';

// ===== State =====
let matrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
];

let xSize = 5; // Default x size (width)
let ySize = 5; // Default y size (height)

// Camera/view state
let camera = {
    zoom: 2,       // Pixels per world unit
    offsetX: 0,    // World units offset
    offsetY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
};

// Function to generate square corners from (0,0) to (xSize, ySize)
function getOriginalSquare() {
    return [
        { x: 0, y: 0, label: 'A' },
        { x: xSize, y: 0, label: 'B' },
        { x: xSize, y: ySize, label: 'C' },
        { x: 0, y: ySize, label: 'D' }
    ];
}

// ===== DOM Elements =====
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const matrixInputs = document.querySelectorAll('.matrix-input');
const coordsDisplay = document.getElementById('coords-display');
const projectiveWarning = document.getElementById('projective-warning');
const sizeXInput = document.getElementById('square-size-x');
const sizeYInput = document.getElementById('square-size-y');

// ===== Setup Canvas for High DPI =====
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width = CANVAS_SIZE + 'px';
    canvas.style.height = CANVAS_SIZE + 'px';
    ctx.scale(dpr, dpr);
}

// ===== Matrix Math =====

/**
 * Multiply 3x3 matrix M by column vector P = (x, y, 1)
 * Returns (x', y', w')
 */
function multiplyMatrixVector(M, point) {
    const x = point.x;
    const y = point.y;
    const w = 1; // Homogeneous coordinate
    
    const xPrime = M[0][0] * x + M[0][1] * y + M[0][2] * w;
    const yPrime = M[1][0] * x + M[1][1] * y + M[1][2] * w;
    const wPrime = M[2][0] * x + M[2][1] * y + M[2][2] * w;
    
    return { x: xPrime, y: yPrime, w: wPrime };
}

/**
 * Apply homogeneous divide: (x', y', w') -> (x'/w', y'/w')
 * If w' is 0 or very close to 0, return null (point at infinity)
 */
function homogeneousDivide(point) {
    if (Math.abs(point.w) < 1e-10) {
        return null; // Point at infinity
    }
    return {
        x: point.x / point.w,
        y: point.y / point.w
    };
}

/**
 * Transform a point using the current matrix
 */
function transformPoint(point) {
    const transformed = multiplyMatrixVector(matrix, point);
    const divided = homogeneousDivide(transformed);
    return {
        original: point,
        transformed: transformed,
        final: divided
    };
}

// ===== Input Handling =====

/**
 * Safely evaluate a math expression
 * Supports: +, -, *, /, %, **, parentheses, and Math functions
 */
function evaluateExpression(expr) {
    try {
        // Remove whitespace for validation
        const trimmed = expr.trim();
        
        // If empty, return 0
        if (trimmed === '') {
            return 0;
        }
        
        // Validate input - only allow safe mathematical characters and Math.* calls
        // Allow: digits, operators, parentheses, decimal points, Math word, dot, letters (for function names)
        const safePattern = /^[0-9+\-*/.()%\s,Math.a-zA-Z_]+$/;
        if (!safePattern.test(trimmed)) {
            return NaN;
        }
        
        // Additional security: ensure no dangerous keywords
        const dangerous = /(?:eval|function|Function|constructor|prototype|__proto__|import|require|process|global|window|document)/i;
        if (dangerous.test(trimmed)) {
            return NaN;
        }
        
        // Create a safe evaluation context with only Math available
        const safeEval = new Function(
            'Math',
            `"use strict"; return (${trimmed});`
        );
        
        const result = safeEval(Math);
        
        // Check if result is a valid number
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return result;
        }
        
        return NaN;
    } catch (e) {
        return NaN;
    }
}

/**
 * Parse matrix from input fields
 */
function parseMatrix() {
    const newMatrix = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    
    let hasInvalid = false;
    
    matrixInputs.forEach(input => {
        const row = parseInt(input.dataset.row);
        const col = parseInt(input.dataset.col);
        
        // Evaluate the expression
        const value = evaluateExpression(input.value);
        
        if (input.value.trim() === '' || isNaN(value)) {
            newMatrix[row][col] = 0;
            input.classList.add('invalid');
            hasInvalid = true;
        } else {
            newMatrix[row][col] = value;
            input.classList.remove('invalid');
            
            // Update title to show evaluated value if it's an expression
            if (input.value.trim() !== value.toString()) {
                input.title = `= ${value.toFixed(6)}`;
            } else {
                input.title = '';
            }
        }
    });
    
    matrix = newMatrix;
    checkProjective();
    return !hasInvalid;
}

/**
 * Check if matrix is projective (non-affine)
 */
function checkProjective() {
    const isAffine = Math.abs(matrix[2][0]) < 1e-10 && 
                     Math.abs(matrix[2][1]) < 1e-10 && 
                     Math.abs(matrix[2][2] - 1) < 1e-10;
    
    if (isAffine) {
        projectiveWarning.classList.add('hidden');
    } else {
        projectiveWarning.classList.remove('hidden');
    }
}

/**
 * Update input fields from matrix
 */
function updateInputs() {
    matrixInputs.forEach(input => {
        const row = parseInt(input.dataset.row);
        const col = parseInt(input.dataset.col);
        input.value = matrix[row][col].toString();
        input.classList.remove('invalid');
    });
    checkProjective();
}

/**
 * Debounce function for live updates
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Handle input change
 */
const handleInputChange = debounce(() => {
    parseMatrix();
    saveMatrix();
    render();
}, 50);

// ===== Rendering =====

/**
 * Convert world coordinates to canvas coordinates
 */
function worldToCanvas(x, y) {
    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;
    
    // Apply camera transform: zoom and pan
    const worldX = x - camera.offsetX;
    const worldY = y - camera.offsetY;
    
    return {
        x: centerX + worldX * camera.zoom,
        y: centerY - worldY * camera.zoom // Flip y-axis (canvas y increases downward)
    };
}

/**
 * Convert canvas coordinates to world coordinates
 */
function canvasToWorld(canvasX, canvasY) {
    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;
    
    const worldX = (canvasX - centerX) / camera.zoom + camera.offsetX;
    const worldY = -(canvasY - centerY) / camera.zoom + camera.offsetY;
    
    return { x: worldX, y: worldY };
}

/**
 * Auto-fit the view to show both original and transformed shapes
 */
function autoFit() {
    const originalSquare = getOriginalSquare();
    const transformedPoints = originalSquare.map(transformPoint);
    
    // Collect all valid points
    const allPoints = [...originalSquare];
    transformedPoints.forEach(tp => {
        if (tp.final) {
            allPoints.push(tp.final);
        }
    });
    
    if (allPoints.length === 0) return;
    
    // Find bounding box
    let minX = allPoints[0].x;
    let maxX = allPoints[0].x;
    let minY = allPoints[0].y;
    let maxY = allPoints[0].y;
    
    allPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    });
    
    // Add padding (20% of range)
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const paddingX = rangeX * 0.2;
    const paddingY = rangeY * 0.2;
    
    minX -= paddingX;
    maxX += paddingX;
    minY -= paddingY;
    maxY += paddingY;
    
    // Calculate center
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calculate zoom to fit
    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    const zoomX = (CANVAS_SIZE * 0.9) / worldWidth;
    const zoomY = (CANVAS_SIZE * 0.9) / worldHeight;
    
    camera.zoom = Math.min(zoomX, zoomY, 50); // Cap at 50 for very small shapes
    camera.offsetX = centerX;
    camera.offsetY = centerY;
}

/**
 * Draw coordinate grid and axes
 */
function drawGrid() {
    // Calculate grid spacing based on zoom
    const baseSpacing = 1; // 1 world unit
    const pixelSpacing = baseSpacing * camera.zoom;
    
    // Adjust grid spacing to reasonable pixel intervals (50-100px)
    let gridSpacing = baseSpacing;
    if (pixelSpacing < 50) {
        gridSpacing = Math.ceil(50 / camera.zoom);
    } else if (pixelSpacing > 200) {
        gridSpacing = Math.floor(200 / camera.zoom);
    }
    
    // Calculate visible world bounds
    const topLeft = canvasToWorld(0, 0);
    const bottomRight = canvasToWorld(CANVAS_SIZE, CANVAS_SIZE);
    
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    const startX = Math.floor(topLeft.x / gridSpacing) * gridSpacing;
    const endX = Math.ceil(bottomRight.x / gridSpacing) * gridSpacing;
    for (let x = startX; x <= endX; x += gridSpacing) {
        const canvas = worldToCanvas(x, 0);
        ctx.beginPath();
        ctx.moveTo(canvas.x, 0);
        ctx.lineTo(canvas.x, CANVAS_SIZE);
        ctx.stroke();
    }
    
    // Horizontal grid lines
    const startY = Math.floor(bottomRight.y / gridSpacing) * gridSpacing;
    const endY = Math.ceil(topLeft.y / gridSpacing) * gridSpacing;
    for (let y = startY; y <= endY; y += gridSpacing) {
        const canvas = worldToCanvas(0, y);
        ctx.beginPath();
        ctx.moveTo(0, canvas.y);
        ctx.lineTo(CANVAS_SIZE, canvas.y);
        ctx.stroke();
    }
    
    // Draw axes (thicker lines at x=0 and y=0)
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    
    const originX = worldToCanvas(0, 0);
    const originY = worldToCanvas(0, 0);
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(0, originX.y);
    ctx.lineTo(CANVAS_SIZE, originX.y);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(originY.x, 0);
    ctx.lineTo(originY.x, CANVAS_SIZE);
    ctx.stroke();
    
    // Origin label (if visible)
    if (originX.x > 10 && originX.x < CANVAS_SIZE - 10 && 
        originX.y > 10 && originX.y < CANVAS_SIZE - 10) {
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.fillText('(0,0)', originX.x + 5, originX.y + 15);
    }
}

/**
 * Draw a polygon given an array of points
 */
function drawPolygon(points, strokeColor, lineWidth = 2) {
    if (points.length < 3) return;
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    
    const first = worldToCanvas(points[0].x, points[0].y);
    ctx.moveTo(first.x, first.y);
    
    for (let i = 1; i < points.length; i++) {
        const p = worldToCanvas(points[i].x, points[i].y);
        ctx.lineTo(p.x, p.y);
    }
    
    ctx.closePath();
    ctx.stroke();
}

/**
 * Draw a point with label
 */
function drawPoint(x, y, label, color) {
    const canvas = worldToCanvas(x, y);
    
    // Draw circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(canvas.x, canvas.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw label
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, canvas.x + 8, canvas.y - 8);
}

/**
 * Main render function
 */
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Draw grid and axes
    drawGrid();
    
    // Get current square corners
    const originalSquare = getOriginalSquare();
    
    // Transform all corner points
    const transformedPoints = originalSquare.map(transformPoint);
    
    // Draw original square
    drawPolygon(originalSquare, '#3498db', 2);
    
    // Draw original corner points
    originalSquare.forEach(point => {
        drawPoint(point.x, point.y, point.label, '#3498db');
    });
    
    // Draw transformed square (if all points are valid)
    const validTransformed = transformedPoints
        .filter(tp => tp.final !== null)
        .map(tp => tp.final);
    
    if (validTransformed.length === originalSquare.length) {
        drawPolygon(validTransformed, '#e74c3c', 3);
        
        // Draw transformed corner points
        transformedPoints.forEach((tp, i) => {
            if (tp.final) {
                drawPoint(tp.final.x, tp.final.y, tp.original.label + "'", '#e74c3c');
            }
        });
    }
    
    // Update coordinate display
    updateCoordinatesDisplay(transformedPoints);
}

/**
 * Update the coordinates display
 */
function updateCoordinatesDisplay(transformedPoints) {
    let html = '';
    
    transformedPoints.forEach((tp, i) => {
        const orig = `(${formatCoord(tp.original.x)}, ${formatCoord(tp.original.y)})`;
        
        let trans;
        if (tp.final) {
            trans = `(${formatCoord(tp.final.x)}, ${formatCoord(tp.final.y)})`;
            if (Math.abs(tp.transformed.w - 1) > 0.01) {
                trans += ` [w=${tp.transformed.w.toFixed(2)}]`;
            }
        } else {
            trans = '(∞, ∞)';
        }
        
        html += `
            <div class="coord-row">
                <div class="coord-label">${tp.original.label}:</div>
                <div class="coord-original">${orig}</div>
                <div class="coord-transformed">→ ${trans}</div>
            </div>
        `;
    });
    
    coordsDisplay.innerHTML = html;
}

/**
 * Format coordinate value for display
 */
function formatCoord(value) {
    // Show integers without decimals, floats with appropriate precision
    if (Math.abs(value - Math.round(value)) < 0.001) {
        return Math.round(value).toString();
    }
    return value.toFixed(2);
}

// ===== Button Actions =====

function setIdentity() {
    matrix = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

function resetSquare() {
    // Same as identity for this app
    setIdentity();
}

function setTranslate() {
    matrix = [
        [1, 0, 80],
        [0, 1, 40],
        [0, 0, 1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

function setRotate() {
    const angleDeg = 30;
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    matrix = [
        [cos, -sin, 0],
        [sin,  cos, 0],
        [0,    0,   1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

function setScale() {
    const sx = 1.5;
    const sy = 0.75;
    
    matrix = [
        [sx, 0,  0],
        [0,  sy, 0],
        [0,  0,  1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

function setRotateScale() {
    const angleDeg = 30;
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const sx = 1.5;
    const sy = 0.75;
    
    // Combined rotation and scale: first scale, then rotate
    // This is achieved by multiplying R * S
    matrix = [
        [cos * sx, -sin * sy, 0],
        [sin * sx,  cos * sy, 0],
        [0,         0,        1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

function setRotateTranslate() {
    const angleDeg = 30;
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    matrix = [
        [cos, -sin, 80],
        [sin,  cos, 40],
        [0,    0,   1]
    ];
    updateInputs();
    saveMatrix();
    render();
}

// ===== LocalStorage =====

function saveMatrix() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
    } catch (e) {
        console.error('Failed to save matrix:', e);
    }
}

function loadMatrix() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const loaded = JSON.parse(saved);
            if (Array.isArray(loaded) && loaded.length === 3) {
                matrix = loaded;
                return true;
            }
        }
    } catch (e) {
        console.error('Failed to load matrix:', e);
    }
    return false;
}

function saveSize() {
    try {
        localStorage.setItem(SIZE_X_STORAGE_KEY, xSize.toString());
        localStorage.setItem(SIZE_Y_STORAGE_KEY, ySize.toString());
    } catch (e) {
        console.error('Failed to save size:', e);
    }
}

function loadSize() {
    try {
        const savedX = localStorage.getItem(SIZE_X_STORAGE_KEY);
        const savedY = localStorage.getItem(SIZE_Y_STORAGE_KEY);
        
        if (savedX) {
            const loadedX = parseFloat(savedX);
            if (!isNaN(loadedX) && loadedX > 0) {
                xSize = loadedX;
            }
        }
        
        if (savedY) {
            const loadedY = parseFloat(savedY);
            if (!isNaN(loadedY) && loadedY > 0) {
                ySize = loadedY;
            }
        }
        
        if (sizeXInput) {
            sizeXInput.value = xSize.toString();
        }
        if (sizeYInput) {
            sizeYInput.value = ySize.toString();
        }
        
        return true;
    } catch (e) {
        console.error('Failed to load size:', e);
    }
    return false;
}

function handleSizeXChange() {
    const value = parseFloat(sizeXInput.value);
    if (!isNaN(value) && value > 0) {
        xSize = value;
        saveSize();
        render();
    }
}

function handleSizeYChange() {
    const value = parseFloat(sizeYInput.value);
    if (!isNaN(value) && value > 0) {
        ySize = value;
        saveSize();
        render();
    }
}

// ===== Mouse Interaction Handlers =====

function handleMouseWheel(e) {
    e.preventDefault();
    
    // Get mouse position in canvas coordinates
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
    const canvasY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);
    
    // Get world position before zoom
    const worldBefore = canvasToWorld(canvasX, canvasY);
    
    // Adjust zoom
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    camera.zoom *= zoomFactor;
    camera.zoom = Math.max(0.1, Math.min(camera.zoom, 100)); // Clamp zoom
    
    // Get world position after zoom
    const worldAfter = canvasToWorld(canvasX, canvasY);
    
    // Adjust offset to keep mouse position fixed
    camera.offsetX += worldBefore.x - worldAfter.x;
    camera.offsetY += worldBefore.y - worldAfter.y;
    
    render();
}

function handleMouseDown(e) {
    if (e.button === 0) { // Left mouse button
        camera.isDragging = true;
        const rect = canvas.getBoundingClientRect();
        camera.lastMouseX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
        camera.lastMouseY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);
        canvas.style.cursor = 'grabbing';
    }
}

function handleMouseMove(e) {
    if (camera.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const currentX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
        const currentY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);
        
        const deltaX = currentX - camera.lastMouseX;
        const deltaY = currentY - camera.lastMouseY;
        
        // Update camera offset (convert canvas delta to world delta)
        camera.offsetX -= deltaX / camera.zoom;
        camera.offsetY += deltaY / camera.zoom; // Flip Y
        
        camera.lastMouseX = currentX;
        camera.lastMouseY = currentY;
        
        render();
    }
}

function handleMouseUp(e) {
    camera.isDragging = false;
    canvas.style.cursor = 'grab';
}

// ===== Event Listeners =====

function setupEventListeners() {
    // Matrix input changes
    matrixInputs.forEach(input => {
        input.addEventListener('input', handleInputChange);
        input.addEventListener('focus', (e) => e.target.select());
    });
    
    // Size input changes
    sizeXInput.addEventListener('input', debounce(handleSizeXChange, 100));
    sizeXInput.addEventListener('focus', (e) => e.target.select());
    sizeYInput.addEventListener('input', debounce(handleSizeYChange, 100));
    sizeYInput.addEventListener('focus', (e) => e.target.select());
    
    // Canvas mouse controls
    canvas.addEventListener('wheel', handleMouseWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    
    // Button clicks
    document.getElementById('btn-identity').addEventListener('click', setIdentity);
    document.getElementById('btn-reset').addEventListener('click', resetSquare);
    document.getElementById('btn-autofit').addEventListener('click', () => {
        autoFit();
        render();
    });
    document.getElementById('btn-translate').addEventListener('click', setTranslate);
    document.getElementById('btn-rotate').addEventListener('click', setRotate);
    document.getElementById('btn-scale').addEventListener('click', setScale);
    document.getElementById('btn-rotate-scale').addEventListener('click', setRotateScale);
    document.getElementById('btn-combo').addEventListener('click', setRotateTranslate);
    
    // Handle window resize
    window.addEventListener('resize', debounce(() => {
        setupCanvas();
        render();
    }, 200));
}

// ===== Initialization =====

function init() {
    setupCanvas();
    
    // Load saved matrix or use identity
    loadMatrix();
    
    // Load saved size or use default
    loadSize();
    
    // Update inputs to reflect current matrix
    updateInputs();
    
    // Setup event listeners
    setupEventListeners();
    
    // Auto-fit and render
    autoFit();
    render();
}

// Start the application
init();
