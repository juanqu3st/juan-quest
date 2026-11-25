import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { cameraOffset, getWalkHeight, MAP_NODE_STOPS, WORLD_SCALE } from './worldConfig';

const S = WORLD_SCALE;
const H = 1.6;

// First-visit fly-over (base positions scaled to the bigger world)
const FLYTHROUGH_WAYPOINTS = [
    { pos: [0, 22, 34], look: [0, 1, 2], mapIndex: 0 },
    { pos: [-27, 7.5, 21], look: [-24, 1.5, 13], mapIndex: 1 },
    { pos: [-14, 7.5, 11], look: [-11, 1.5, 2], mapIndex: 2 },
    { pos: [1, 7.5, 2], look: [2, 1.5, -8], mapIndex: 3 },
    { pos: [13, 7.5, 13], look: [14, 1.5, 4], mapIndex: 4 },
    { pos: [26, 8.5, 21], look: [25, 1.5, 12], mapIndex: 5 },
].map((w) => ({
    pos: new THREE.Vector3(w.pos[0] * S, w.pos[1] * H, w.pos[2] * S),
    look: new THREE.Vector3(w.look[0] * S, w.look[1] * H, w.look[2] * S),
    mapIndex: w.mapIndex,
}));

function standPoint(mapNumber) {
    const stop = MAP_NODE_STOPS[mapNumber] || MAP_NODE_STOPS[1];
    return new THREE.Vector3(stop.x, getWalkHeight(stop.x, stop.z) + 1.4, stop.z);
}

export default function CameraRig({
    controlsRef,
    tourActive,
    guideStep = null,
    isWalking,
    startMapNumber,
    onTourCardChange,
    onTourFinish,
}) {
    const { camera, size } = useThree();
    const aspect = size.width / Math.max(1, size.height);
    const elapsedRef = useRef(0);
    const guideTimeRef = useRef(0);
    const lastStageRef = useRef(0);
    const snappedInitialRef = useRef(false);
    const guideTmpPos = useRef(new THREE.Vector3());
    const guideTmpLook = useRef(new THREE.Vector3());
    const totalDuration = 13.5;

    useEffect(() => {
        if (!tourActive && guideStep === null && !snappedInitialRef.current && controlsRef?.current) {
            const p = standPoint(startMapNumber);
            camera.position.copy(p).add(cameraOffset(aspect));
            controlsRef.current.target.copy(p);
            controlsRef.current.update();
            snappedInitialRef.current = true;
        }
    }, [tourActive, guideStep, startMapNumber, camera, controlsRef]);

    useEffect(() => {
        if (tourActive) {
            elapsedRef.current = 0;
            lastStageRef.current = 0;
            onTourCardChange?.(0);
        }
    }, [tourActive]);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);

        // Live cinematic camera transitions synced to Juan Osong's 5-step onboarding tutorial!
        if (!tourActive && guideStep !== null) {
            guideTimeRef.current += dt;
            const gt = guideTimeRef.current;
            const dstPos = guideTmpPos.current;
            const dstLook = guideTmpLook.current;

            if (guideStep === 0) {
                // Step 1: Warm welcoming shot framing Mapa 1 & Juan
                const p = standPoint(1);
                dstPos.copy(p).add(cameraOffset(aspect));
                dstPos.x += Math.sin(gt * 0.45) * 1.6;
                dstLook.copy(p);
            } else if (guideStep === 1) {
                // Step 2: Panoramic sunlit overview framing ALL 5 COLORFUL 3D BUILDINGS along the barrio trail!
                const pan = Math.sin(gt * 0.55) * 14;
                const zoomK = aspect < 1 ? 1.32 : 1.0;
                dstPos.set(pan, 34 * zoomK, 68 * zoomK);
                dstLook.set(pan * 0.25, 2.2, 8);
            } else if (guideStep === 2) {
                // Step 3: Smooth close-in on Mapa 1: Ang Curfew (Bahay na Bato)
                const m1 = standPoint(1);
                dstPos.set(m1.x - 4.5, m1.y + 7.5, m1.z + 13.5);
                dstLook.set(m1.x - 1.8, m1.y + 1.5, m1.z - 2.2);
            } else if (guideStep === 3) {
                // Step 4: Gentle barrio showcase framing Mapa 2 (Kuwartel) & trail
                const m2 = standPoint(2);
                dstPos.set(m2.x - 4 + Math.sin(gt * 0.5) * 2.5, m2.y + 10.5, m2.z + 18);
                dstLook.set(m2.x, m2.y + 1.2, m2.z - 1.5);
            } else {
                // Step 5: Smoothly land right back on Mapa 1 gameplay angle for zero-jump start!
                const p = standPoint(startMapNumber || 1);
                dstPos.copy(p).add(cameraOffset(aspect));
                dstLook.copy(p);
            }

            const ease = Math.min(1, dt * 3.2);
            camera.position.lerp(dstPos, ease);
            if (controlsRef?.current) {
                controlsRef.current.target.lerp(dstLook, ease);
                controlsRef.current.update();
            } else {
                camera.lookAt(dstLook);
            }
            return;
        }

        if (!tourActive) return;

        elapsedRef.current += delta;
        const progress = Math.min(1, elapsedRef.current / totalDuration);

        const endLook = standPoint(startMapNumber);
        const endPos = endLook.clone().add(cameraOffset(aspect));
        const all = [...FLYTHROUGH_WAYPOINTS, { pos: endPos, look: endLook, mapIndex: 0 }];

        const scaled = progress * (all.length - 1);
        const idx = Math.min(all.length - 2, Math.floor(scaled));
        const localT = scaled - idx;
        const smoothT = localT * localT * (3 - 2 * localT);
        const from = all[idx];
        const to = all[idx + 1];

        camera.position.lerpVectors(from.pos, to.pos, smoothT);
        const look = new THREE.Vector3().lerpVectors(from.look, to.look, smoothT);
        if (controlsRef?.current) {
            controlsRef.current.target.copy(look);
            controlsRef.current.update();
        } else {
            camera.lookAt(look);
        }

        const card = to.mapIndex || from.mapIndex;
        if (card !== lastStageRef.current) {
            lastStageRef.current = card;
            onTourCardChange?.(card);
        }
        if (progress >= 1) {
            snappedInitialRef.current = true;
            onTourFinish?.();
        }
    });

    return (
        <OrbitControls
            ref={controlsRef}
            enabled={!tourActive && guideStep === null && !isWalking}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.25}
            minPolarAngle={0.3}
            minDistance={8}
            maxDistance={aspect < 1 ? 95 : 70}
        />
    );
}
