import * as THREE from 'three';

const cache = {};
let pbrGeneration = 0;

/**
 * Dispose & clear all cached procedural 2D CanvasTextures so the next mount or WebGL context
 * recovery paints brand-new 2D canvases (preventing pitch-black terrain/roads/mountains on mobile
 * after Android Chrome evicts backgrounded 2D canvas GPU surfaces).
 */
export function resetPbrTextures() {
    for (const key of Object.keys(cache)) {
        const val = cache[key];
        if (val && typeof val.dispose === 'function') {
            try {
                val.dispose();
            } catch {
                // ignore already-disposed textures
            }
        }
        delete cache[key];
    }
    pbrGeneration += 1;
}

export function getPbrTexturesGeneration() {
    return pbrGeneration;
}

function makeCanvas(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return [canvas, canvas.getContext('2d')];
}

export function getPbrTextures() {
    if (cache.initialized) return cache;

    // 1. Warm Sunlit Pinoy Tropical Meadow Grass + Micro-Bump (matches rural village reference!)
    const [gCanvas, gCtx] = makeCanvas(256);
    const [gbCanvas, gbCtx] = makeCanvas(256);
    gCtx.fillStyle = '#68B436';
    gCtx.fillRect(0, 0, 256, 256);
    gbCtx.fillStyle = '#808080';
    gbCtx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 2400; i++) {
        const x = (i * 79) % 256;
        const y = (i * 131 + Math.floor(i / 6) * 23) % 256;
        const len = 3 + (i % 5);
        const dx = ((i % 5) - 2) * 0.9;
        gCtx.strokeStyle = i % 3 === 0 ? '#8AD24A' : i % 3 === 1 ? '#4F9424' : '#96DA54';
        gCtx.lineWidth = 1.4;
        gCtx.globalAlpha = 0.36;
        gCtx.beginPath();
        gCtx.moveTo(x, y);
        gCtx.lineTo(x + dx, y - len);
        gCtx.stroke();

        gbCtx.fillStyle = i % 2 === 0 ? '#B2B2B2' : '#565656';
        gbCtx.fillRect(x, y, 2, 2);
    }

    const grassMap = new THREE.CanvasTexture(gCanvas);
    grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
    grassMap.repeat.set(22, 18);
    grassMap.colorSpace = THREE.SRGBColorSpace;

    const grassBump = new THREE.CanvasTexture(gbCanvas);
    grassBump.wrapS = grassBump.wrapT = THREE.RepeatWrapping;
    grassBump.repeat.set(22, 18);

    // 2. Natural Pinoy Rural Dirt Road (Lupa) Texture with Soft Feathered Grass-Edge Alpha
    const [dCanvas, dCtx] = makeCanvas(256);
    const [dbCanvas, dbCtx] = makeCanvas(256);
    dCtx.clearRect(0, 0, 256, 256);
    dbCtx.fillStyle = '#808080';
    dbCtx.fillRect(0, 0, 256, 256);

    // Feathered vertical gradient across road width (v=0..1) so dirt edges blend smoothly into grass!
    const dirtGrad = dCtx.createLinearGradient(0, 0, 0, 256);
    dirtGrad.addColorStop(0.0, 'rgba(186, 134, 72, 0.0)');
    dirtGrad.addColorStop(0.14, 'rgba(186, 134, 72, 0.92)');
    dirtGrad.addColorStop(0.32, 'rgba(206, 154, 88, 1.0)');
    dirtGrad.addColorStop(0.5, 'rgba(218, 168, 102, 1.0)');
    dirtGrad.addColorStop(0.68, 'rgba(206, 154, 88, 1.0)');
    dirtGrad.addColorStop(0.86, 'rgba(186, 134, 72, 0.92)');
    dirtGrad.addColorStop(1.0, 'rgba(186, 134, 72, 0.0)');
    dCtx.fillStyle = dirtGrad;
    dCtx.fillRect(0, 0, 256, 256);

    // Subtle worn dusty wheel/footpath ruts along center
    dCtx.fillStyle = 'rgba(154, 102, 48, 0.22)';
    dCtx.fillRect(0, 74, 256, 26);
    dCtx.fillRect(0, 156, 256, 26);

    // Pebbles & organic soil grain (wrapped seamlessly along U)
    for (let i = 0; i < 650; i++) {
        const x = (i * 67) % 256;
        const y = 30 + ((i * 97) % 196);
        const r = 1.2 + (i % 3) * 0.9;
        dCtx.fillStyle = i % 3 === 0 ? 'rgba(130, 84, 38, 0.34)' : i % 3 === 1 ? 'rgba(242, 206, 146, 0.30)' : 'rgba(166, 114, 58, 0.28)';
        dCtx.beginPath();
        dCtx.arc(x, y, r, 0, Math.PI * 2);
        dCtx.fill();

        dbCtx.fillStyle = i % 2 === 0 ? '#B8B8B8' : '#4E4E4E';
        dbCtx.fillRect(x, y, 2, 2);
    }

    const dirtMap = new THREE.CanvasTexture(dCanvas);
    dirtMap.wrapS = THREE.RepeatWrapping;
    dirtMap.wrapT = THREE.ClampToEdgeWrapping;
    dirtMap.repeat.set(28, 1);
    dirtMap.colorSpace = THREE.SRGBColorSpace;

    const dirtBump = new THREE.CanvasTexture(dbCanvas);
    dirtBump.wrapS = THREE.RepeatWrapping;
    dirtBump.wrapT = THREE.ClampToEdgeWrapping;
    dirtBump.repeat.set(28, 1);

    // 3. Mortared Stone Texture (Bridge abutments, piers & river boulders)
    const [sCanvas, sCtx] = makeCanvas(256);
    const [sbCanvas, sbCtx] = makeCanvas(256);
    sCtx.fillStyle = '#A8A296';
    sCtx.fillRect(0, 0, 256, 256);
    sbCtx.fillStyle = '#383838';
    sbCtx.fillRect(0, 0, 256, 256);

    const rows = 8;
    const cols = 4;
    const rh = 256 / rows;
    const cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
            const x = c * cw + offset + 3;
            const y = r * rh + 3;
            const shade = 192 + ((r * 17 + c * 31) % 34);
            sCtx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
            sCtx.fillRect(x, y, cw - 6, rh - 6);
            sbCtx.fillStyle = '#DCDCDC';
            sbCtx.fillRect(x, y, cw - 6, rh - 6);
        }
    }

    const stoneMap = new THREE.CanvasTexture(sCanvas);
    stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping;
    stoneMap.repeat.set(3, 3);
    stoneMap.colorSpace = THREE.SRGBColorSpace;

    const stoneBump = new THREE.CanvasTexture(sbCanvas);
    stoneBump.wrapS = stoneBump.wrapT = THREE.RepeatWrapping;
    stoneBump.repeat.set(3, 3);

    // 4. Warm Bridge Timber Plank Texture
    const [wCanvas, wCtx] = makeCanvas(256);
    wCtx.fillStyle = '#A86E3B';
    wCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 64; i++) {
        wCtx.fillStyle = i % 2 === 0 ? 'rgba(60,30,10,0.18)' : 'rgba(235,185,125,0.16)';
        wCtx.fillRect(0, i * 4, 256, 2);
    }
    const woodMap = new THREE.CanvasTexture(wCanvas);
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    woodMap.colorSpace = THREE.SRGBColorSpace;

    // 5. Seamlessly Tileable Flowing River Texture (turquoise creek + bright whitewater flow streaks!)
    const [wfCanvas, wfCtx] = makeCanvas(256);
    const grad = wfCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#A5F3FC');
    grad.addColorStop(0.12, '#38BDF8');
    grad.addColorStop(0.5, '#0284C7');
    grad.addColorStop(0.88, '#38BDF8');
    grad.addColorStop(1.0, '#A5F3FC');
    wfCtx.fillStyle = grad;
    wfCtx.fillRect(0, 0, 256, 256);

    const drawWrappedWave = (ctx, x, y, len, amp, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (const shift of [0, -256, 256]) {
            const sx = x + shift;
            if (sx + len < 0 || sx > 256) continue;
            ctx.beginPath();
            ctx.moveTo(sx, y);
            ctx.quadraticCurveTo(sx + len * 0.5, y + amp, sx + len, y);
            ctx.stroke();
        }
    };

    for (let i = 0; i < 42; i++) {
        const sx = (i * 41) % 256;
        const len = 22 + (i % 26);
        drawWrappedWave(wfCtx, sx, 8 + (i % 10), len, 2.2, 'rgba(255, 255, 255, 0.62)', 3.0);
        drawWrappedWave(wfCtx, (sx + 96) % 256, 238 + (i % 10), len, -2.2, 'rgba(255, 255, 255, 0.62)', 3.0);
    }

    for (let i = 0; i < 120; i++) {
        const x = (i * 53) % 256;
        const y = 24 + ((i * 71) % 208);
        const len = 28 + (i % 38);
        const amp = (i % 2 === 0 ? 1 : -1) * 4.5;
        const col =
            i % 3 === 0
                ? 'rgba(255, 255, 255, 0.58)'
                : i % 3 === 1
                  ? 'rgba(186, 230, 253, 0.44)'
                  : 'rgba(12, 74, 110, 0.24)';
        drawWrappedWave(wfCtx, x, y, len, amp, col, i % 4 === 0 ? 3.0 : 1.8);
    }

    const waterFlowMap = new THREE.CanvasTexture(wfCanvas);
    waterFlowMap.wrapS = THREE.RepeatWrapping;
    waterFlowMap.wrapT = THREE.ClampToEdgeWrapping;
    waterFlowMap.repeat.set(14, 1);
    waterFlowMap.colorSpace = THREE.SRGBColorSpace;

    // 6. Seamlessly Tileable Flowing Water Bump Map
    const [waCanvas, waCtx] = makeCanvas(256);
    waCtx.fillStyle = '#787878';
    waCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
        const x = (i * 47) % 256;
        const y = (i * 83) % 256;
        drawWrappedWave(waCtx, x, y, 30, 4.5, i % 2 === 0 ? '#E2E2E2' : '#323232', 2.4);
    }
    const waterBump = new THREE.CanvasTexture(waCanvas);
    waterBump.wrapS = THREE.RepeatWrapping;
    waterBump.wrapT = THREE.RepeatWrapping;
    waterBump.repeat.set(16, 2);

    const allTex = [
        grassMap,
        grassBump,
        dirtMap,
        dirtBump,
        stoneMap,
        stoneBump,
        woodMap,
        waterFlowMap,
        waterBump,
    ];
    for (const tex of allTex) {
        tex.needsUpdate = true;
    }

    Object.assign(cache, {
        initialized: true,
        generation: pbrGeneration,
        grassMap,
        grassBump,
        dirtMap,
        dirtBump,
        stoneMap,
        stoneBump,
        woodMap,
        waterFlowMap,
        waterBump,
    });

    return cache;
}
