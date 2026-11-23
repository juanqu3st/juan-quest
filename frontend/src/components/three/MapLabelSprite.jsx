import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const STYLES = {
    done: { bg: '#15803D', edge: '#14532D', chipBg: '#FFFFFF', chipText: '#15803D' },
    open: { bg: '#C2410C', edge: '#7C2D12', chipBg: '#FAF8F5', chipText: '#9A3412' },
    locked: { bg: '#475569', edge: '#1E293B', chipBg: '#1E293B', chipText: '#FACC15' },
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawStar(ctx, cx, cy, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawLock(ctx, cx, cy, s, color) {
    // Shackle arch
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.14, s * 0.34, Math.PI, 0);
    ctx.stroke();

    // Padlock body
    ctx.fillStyle = color;
    roundRect(ctx, cx - s * 0.56, cy - s * 0.12, s * 1.12, s * 0.88, s * 0.18);
    ctx.fill();

    // High-contrast keyhole cutout
    ctx.fillStyle = '#422006';
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.22, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - s * 0.06, cy + s * 0.26, s * 0.12, s * 0.28);
}

function drawCheck(ctx, cx, cy, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.35);
    ctx.stroke();
}

/**
 * Small name tag that floats above a map's buildings (drawn on a canvas, no DOM).
 * Same look as the old HTML tag: name + score chip (star, check when done, lock when locked).
 */
export default function MapLabelSprite({ title, state, score, maxScore = 10, position, height = 1.0 }) {
    const { texture, aspect } = useMemo(() => {
        const st = STYLES[state];
        const font = '800 64px Inter, "Segoe UI", Arial, sans-serif';
        const chipFont = '800 50px Inter, "Segoe UI", Arial, sans-serif';
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = font;
        const titleW = measure.measureText(title).width;
        measure.font = chipFont;
        const chipText = state === 'locked' ? '' : `${score}/${maxScore}`;
        const chipTextW = chipText ? measure.measureText(chipText).width : 0;
        const chipW = 70 + chipTextW + (chipText ? 26 : 0);

        const H = 150;
        const pad = 40;
        const W = Math.ceil(pad + titleW + 28 + chipW + pad);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // edge (bottom lip) + body
        ctx.fillStyle = st.edge;
        roundRect(ctx, 4, 10, W - 8, H - 14, 34);
        ctx.fill();
        ctx.fillStyle = st.bg;
        roundRect(ctx, 4, 4, W - 8, H - 26, 34);
        ctx.fill();

        ctx.font = font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, pad, (H - 22) / 2 + 4);

        const cx = pad + titleW + 28;
        const cy = (H - 22) / 2 + 4;
        ctx.fillStyle = st.chipBg;
        roundRect(ctx, cx, cy - 38, chipW, 76, 20);
        ctx.fill();
        const iconX = cx + 38;
        if (state === 'done') drawCheck(ctx, iconX, cy, 40, st.chipText);
        else if (state === 'open') drawStar(ctx, iconX, cy, 24, '#F59E0B');
        else drawLock(ctx, iconX + (chipW - 76) / 2, cy, 44, st.chipText);
        if (chipText) {
            ctx.font = chipFont;
            ctx.fillStyle = st.chipText;
            ctx.fillText(chipText, cx + 66, cy + 2);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return { texture: tex, aspect: W / H };
    }, [title, state, score, maxScore]);

    useEffect(() => () => texture.dispose(), [texture]);

    return (
        <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
            <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} />
        </sprite>
    );
}
