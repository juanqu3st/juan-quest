import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getDeviceProfile } from '../../utils/deviceTier';

class PortraitErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}

/**
 * Full-Body Real-Time Articulated 3D Juan Osong Guide:
 * - Framed head-to-toe (salakot finial knob down to stitched leather slippers, zero cropping).
 * - Natural phrase-synced human body acting: each spoken phrase transitions smoothly into ONE
 *   clear, intentional pose (head, torso, weight-shift stance, shoulders, elbows, wrists & 5-finger hands)
 *   with subtle real-voice emphasis nods (NO repetitive windshield-wiper arm looping!).
 * - When speech finishes while waiting for tap, smoothly relaxes into a warm breathing standing idle.
 * - Live Web Audio AnalyserNode 3D talking mouth + periodic 3D eye blink locked directly to `bones.head`.
 */
function AnimatedJuanFullBody({ stepIdx, isTalkingRef, audioLevelRef, stepProgressRef }) {
    const { scene } = useGLTF('/models/juan.glb', '/draco/');
    const model = useMemo(() => cloneSkinned(scene), [scene]);

    const rig = useMemo(() => {
        const canonical = (s) => (s || '').replace(/[._\-\s]/g, '').toLowerCase();
        const wanted = new Set([
            'hips',
            'spine',
            'chest',
            'neck',
            'head',
            'shoulderl',
            'upperarml',
            'forearml',
            'handl',
            'shoulderr',
            'upperarmr',
            'forearmr',
            'handr',
            'thighl',
            'shinl',
            'footl',
            'thighr',
            'shinr',
            'footr',
        ]);
        const bones = {};
        const restQ = {};
        let mouthMesh = null;
        let eyeShineMesh = null;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                child.frustumCulled = false;
                if (child.name === 'J_Face_Mouth') mouthMesh = child;
                if (child.name === 'J_EyeShine') eyeShineMesh = child;
            }
            const key = canonical(child.name);
            if ((child.isBone || child.type === 'Bone') && wanted.has(key) && !bones[key]) {
                bones[key] = child;
                restQ[key] = child.quaternion.clone();
            }
        });

        model.updateMatrixWorld(true);

        // Attach sculpted 3D talking mouth + blinking eyelids directly to `head` bone so they lock 100% to head motion!
        let talkingMouth = null;
        let eyelidsGroup = null;

        if (bones.head) {
            const headWorldQ = new THREE.Quaternion();
            bones.head.getWorldQuaternion(headWorldQ);
            const invHeadQ = headWorldQ.clone().invert();

            // 1) 3D Sculpted Talking Mouth seated right over J_Face_Mouth (0.0, 0.737, 0.172)
            const mouthWorld = new THREE.Vector3(0, 0.737, 0.172);
            model.localToWorld(mouthWorld);
            const mouthLocal = bones.head.worldToLocal(mouthWorld.clone());

            talkingMouth = new THREE.Group();
            talkingMouth.position.copy(mouthLocal);
            talkingMouth.quaternion.copy(invHeadQ);
            talkingMouth.visible = false;

            const cavityGeo = new THREE.SphereGeometry(0.032, 16, 12);
            const cavityMat = new THREE.MeshBasicMaterial({ color: 0x5c1914 });
            const cavity = new THREE.Mesh(cavityGeo, cavityMat);
            cavity.scale.set(1.0, 0.85, 0.42);
            talkingMouth.add(cavity);

            const teethGeo = new THREE.SphereGeometry(0.021, 12, 8);
            const teethMat = new THREE.MeshBasicMaterial({ color: 0xfffdf7 });
            const teeth = new THREE.Mesh(teethGeo, teethMat);
            teeth.scale.set(1.14, 0.28, 0.42);
            teeth.position.set(0, 0.014, 0.008);
            talkingMouth.add(teeth);

            const tongueGeo = new THREE.SphereGeometry(0.019, 12, 8);
            const tongueMat = new THREE.MeshBasicMaterial({ color: 0xf47272 });
            const tongue = new THREE.Mesh(tongueGeo, tongueMat);
            tongue.scale.set(1.08, 0.46, 0.44);
            tongue.position.set(0, -0.012, 0.007);
            talkingMouth.add(tongue);

            bones.head.add(talkingMouth);

            // 2) Smooth kayumanggi skin-toned 3D blinking eyelids matching Juan v2 (#D29364)
            eyelidsGroup = new THREE.Group();
            const eyeGeo = new THREE.SphereGeometry(0.044, 14, 10);
            const eyeMat = new THREE.MeshStandardMaterial({
                color: 0xd29364,
                roughness: 0.62,
                metalness: 0.0,
            });
            const lashGeo = new THREE.BoxGeometry(0.070, 0.008, 0.013);
            const lashMat = new THREE.MeshBasicMaterial({ color: 0x22140e });

            [-0.062, 0.062].forEach((ex) => {
                const ew = new THREE.Vector3(ex, 0.806, 0.160);
                model.localToWorld(ew);
                const el = bones.head.worldToLocal(ew.clone());
                const lid = new THREE.Group();
                lid.position.copy(el);
                lid.quaternion.copy(invHeadQ);

                const cover = new THREE.Mesh(eyeGeo, eyeMat);
                cover.scale.set(1.0, 0.92, 0.56);
                lid.add(cover);

                const lash = new THREE.Mesh(lashGeo, lashMat);
                lash.position.set(0, -0.006, 0.024);
                lid.add(lash);

                eyelidsGroup.add(lid);
            });
            eyelidsGroup.visible = false;
            bones.head.add(eyelidsGroup);
        }

        const restHipsPos = bones.hips ? bones.hips.position.clone() : new THREE.Vector3(0, 0, 0.36);

        return { bones, restQ, restHipsPos, mouthMesh, eyeShineMesh, talkingMouth, eyelidsGroup };
    }, [model]);

    useEffect(() => {
        return () => {
            [rig.talkingMouth, rig.eyelidsGroup].forEach((grp) => {
                if (!grp) return;
                grp.traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                });
                if (grp.parent) grp.parent.remove(grp);
            });
        };
    }, [rig]);

    const stateRef = useRef({
        t: 0,
        lastStep: -1,
        stepElapsed: 0,
        mouthOpen: 0,
        voiceSmooth: 0,
        nextBlinkAt: 2.3,
        blinkElapsed: -1,
        cur: {
            shLx: 0, shLz: 0,
            armLx: 0, armLy: 0, armLz: 0,
            foreLx: -0.14, foreLy: 0, foreLz: 0,
            handLx: 0, handLy: 0, handLz: 0,
            shRx: 0, shRz: 0,
            armRx: 0, armRy: 0, armRz: 0,
            foreRx: -0.14, foreRy: 0, foreRz: 0,
            handRx: 0, handRy: 0, handRz: 0,
            neckX: 0, neckY: 0,
            headX: 0, headY: 0, headZ: 0,
            spineX: 0, spineY: 0, spineZ: 0,
            chestX: 0, chestY: 0, chestZ: 0,
            hipX: 0, hipY: 0, hipZ: 0,
            hipShiftX: 0, hipLift: 0,
            kneeL: 0, kneeR: 0,
        },
        euler: new THREE.Euler(0, 0, 0, 'XYZ'),
        quat: new THREE.Quaternion(),
    });

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const st = stateRef.current;
        st.t += dt;
        const t = st.t;

        if (st.lastStep !== stepIdx) {
            st.lastStep = stepIdx;
            st.stepElapsed = 0;
        }
        st.stepElapsed += dt;

        const { bones, restQ, restHipsPos, mouthMesh, eyeShineMesh, talkingMouth, eyelidsGroup } = rig;
        if (!bones.hips) return;

        const talking = Boolean(isTalkingRef?.current);
        const audioAmp = audioLevelRef?.current || 0;
        const p = Math.max(0, Math.min(1, stepProgressRef?.current ?? 0));

        // Smooth real-voice envelope (drives subtle natural emphasis nods — ZERO robotic sine flapping!)
        const targetVoice = talking ? (audioAmp > 0.015 ? Math.min(1, audioAmp * 2.2) : 0.25) : 0;
        st.voiceSmooth += (targetVoice - st.voiceSmooth) * Math.min(1, dt * 10);
        const vEmp = st.voiceSmooth;

        // 1) REAL-TIME 3D MOUTH LIP-SYNC
        let targetOpen = 0;
        if (talking) {
            if (audioAmp > 0.015) {
                targetOpen = Math.min(1, audioAmp * 2.35);
            } else {
                const syl = Math.max(0, Math.sin(t * 13.5) * 0.55 + Math.sin(t * 21.4) * 0.45);
                targetOpen = 0.14 + syl * 0.72;
            }
        }
        const mouthSpeed = targetOpen > st.mouthOpen ? 26 : 16;
        st.mouthOpen += (targetOpen - st.mouthOpen) * Math.min(1, dt * mouthSpeed);

        if (talkingMouth) {
            const showOpen = st.mouthOpen > 0.11;
            talkingMouth.visible = showOpen;
            if (mouthMesh) mouthMesh.visible = !showOpen;
            if (showOpen) {
                const vowel = 0.85 + Math.sin(t * 10.2) * 0.16;
                const sy = Math.max(0.28, Math.min(1.14, st.mouthOpen * 1.12));
                const sx = Math.max(0.72, Math.min(1.10, vowel));
                talkingMouth.scale.set(sx, sy, 1.0);
            }
        }

        // 2) NATURAL 3D EYE BLINKING every ~2.8–4.4s
        if (eyelidsGroup) {
            if (st.blinkElapsed >= 0) {
                st.blinkElapsed += dt;
                const blinkDur = 0.14;
                if (st.blinkElapsed >= blinkDur) {
                    st.blinkElapsed = -1;
                    eyelidsGroup.visible = false;
                    if (eyeShineMesh) eyeShineMesh.visible = true;
                    st.nextBlinkAt = t + 2.8 + (Math.sin(t * 6.7) * 0.5 + 0.5) * 1.8;
                } else {
                    eyelidsGroup.visible = true;
                    const mid = Math.sin((st.blinkElapsed / blinkDur) * Math.PI);
                    if (eyeShineMesh) eyeShineMesh.visible = mid < 0.45;
                }
            } else if (t >= st.nextBlinkAt) {
                st.blinkElapsed = 0;
            }
        }

        // 3) NATURAL HUMAN PHRASE-SYNCED FULL-BODY ACTING
        // Gentle slow breathing & natural subtle weight balance (NEVER fast windshield-wiper loops!)
        const breath = Math.sin(t * 1.9);
        const slowDrift = Math.sin(t * 0.75);

        // Baseline: Warm, Friendly, Grounded Relaxed Standing Idle (used whenever narration ends!)
        // Verified RigJuan bone axes in Three.js Y-up:
        //   spine/chest/neck/head: +rx = tilt BACK (LOOK UP), -rx = lean/nod FORWARD (LOOK DOWN), +ry = turn toward VIEWER'S RIGHT (toward top plaques!), +rz = tilt toward viewer's right
        //   shoulder.L/upperarm.L/forearm.L (viewer's RIGHT arm): -rz = lift UP-RIGHT toward top plaques (-1.80 rad = clear upward point!), -rx = swing FORWARD
        //   shoulder.R/upperarm.R/forearm.R (viewer's LEFT arm):  +rz = lift UP-LEFT, -rx = swing FORWARD
        let shLx = 0, shLz = 0;
        let armLx = -0.08, armLy = 0.06, armLz = -0.05;
        let foreLx = -0.22, foreLy = 0.04, foreLz = 0;
        let handLx = 0, handLy = 0.06, handLz = 0;

        let shRx = 0, shRz = 0;
        let armRx = -0.08, armRy = -0.06, armRz = 0.05;
        let foreRx = -0.22, foreRy = -0.04, foreRz = 0;
        let handRx = 0, handRy = -0.06, handRz = 0;

        let neckX = breath * 0.015, neckY = 0.02;
        let headX = breath * 0.018 - vEmp * 0.055; // Negative rx = natural downward emphasis nod on spoken syllables!
        let headY = 0.03 + slowDrift * 0.045;
        let headZ = Math.sin(t * 0.9) * 0.022;

        let spineX = breath * 0.015, spineY = 0.03, spineZ = slowDrift * 0.014;
        let chestX = breath * 0.012, chestY = 0.02, chestZ = 0;
        let hipX = 0, hipY = -0.02, hipZ = slowDrift * 0.012;
        let hipShiftX = slowDrift * 0.008;
        let hipLift = breath * 0.003;
        let kneeL = 0.03, kneeR = 0.03;

        // Only perform active speech gestures while actively speaking (p < 0.96 & talking)
        // so once narration finishes, Juan naturally rests into his relaxed standing idle!
        if (talking && p < 0.96) {
            if (stepIdx === 0) {
                // STEP 1: "Uy, buti nakarating ka! Ako si Juan Osong. Tara, sasamahan kita sa laro natin ngayon!"
                if (p < 0.29) {
                    // Phrase 1: "Uy, buti nakarating ka!" -> Warm friendly raised greeting wave (2 clean damped beats!)
                    const wavePhase = p / 0.29;
                    const waveEnv = Math.sin(wavePhase * Math.PI);
                    const twoWaves = Math.sin(wavePhase * Math.PI * 3.5) * 0.24 * waveEnv;
                    shLz = -0.18;
                    armLx = -0.44; armLy = 0.14; armLz = -1.56;
                    foreLx = -0.78; foreLy = 0.08; foreLz = twoWaves;
                    handLx = -0.10; handLz = twoWaves * 0.45;
                    armRx = -0.14; armRz = 0.10; foreRx = -0.38;
                    headX = 0.06 - vEmp * 0.05; headY = 0.05; headZ = 0.06;
                    spineX = 0.02; spineY = 0.05; spineZ = -0.02;
                    hipShiftX = -0.012; kneeR = 0.07;
                } else if (p < 0.58) {
                    // Phrase 2: "Ako si Juan Osong." -> Warm hand gently resting over chest/alampay + proud nod!
                    armLx = -0.60; armLy = -0.54; armLz = -0.18;
                    foreLx = -1.22; foreLy = -0.20; foreLz = 0.22;
                    handLx = 0.12; handLy = -0.18;
                    armRx = -0.18; armRy = -0.10; armRz = 0.14;
                    foreRx = -0.44;
                    headX = -0.03 - vEmp * 0.06; headY = 0.02; headZ = -0.04;
                    chestX = 0.04; spineY = 0.02;
                    hipShiftX = 0.010; kneeL = 0.06;
                } else {
                    // Phrase 3: "Tara, sasamahan kita sa laro natin ngayon!" -> Warm welcoming open-arms invitation!
                    shLz = -0.08; shRz = 0.08;
                    armLx = -0.56; armLy = 0.22; armLz = -0.74;
                    foreLx = -0.58 - vEmp * 0.07; foreLy = 0.18;
                    handLx = -0.14; handLy = 0.25;
                    armRx = -0.52; armRy = -0.18; armRz = 0.68;
                    foreRx = -0.58 - vEmp * 0.06; foreRy = -0.16;
                    handRx = -0.12; handRy = -0.22;
                    headX = 0.04 - vEmp * 0.055; headY = 0.06; headZ = 0.03;
                    spineX = -0.04; spineY = 0.06;
                    hipLift = 0.006 + vEmp * 0.005;
                }
            } else if (stepIdx === 1) {
                // STEP 2: "May limang mapa tayong dadaanan dito. Sampung puntos bawat isa, kaya pwedeng umabot ng singkwenta ang iskor mo!"
                if (p < 0.44) {
                    // Phrase 1: "May limang mapa tayong dadaanan dito."
                    // Juan looks directly UP-RIGHT at the 5-Map board and points clearly UP-RIGHT toward it with one smooth presenter sweep!
                    const sweep = Math.sin((p / 0.44) * Math.PI);
                    shLz = -0.22;
                    armLx = -0.44; armLy = 0.16; armLz = -1.78 - sweep * 0.12;
                    foreLx = -0.22 - vEmp * 0.05; foreLy = 0.10; foreLz = -0.08;
                    handLx = -0.10; handLy = 0.12;
                    armRx = -0.16; armRy = -0.08; armRz = 0.14;
                    foreRx = -0.48; foreRy = -0.06;
                    // Look UP (+rx) and toward viewer's RIGHT (+ry) straight at the 5 maps!
                    spineX = 0.04; spineY = 0.12; spineZ = -0.02;
                    chestX = 0.06; chestY = 0.14; chestZ = -0.02;
                    neckX = 0.08; neckY = 0.10;
                    headX = 0.22 - vEmp * 0.035; headY = 0.24 + sweep * 0.07; headZ = -0.04;
                    hipY = 0.04; hipShiftX = -0.012; kneeR = 0.06;
                } else if (p < 0.72) {
                    // Phrase 2: "Sampung puntos bawat isa,"
                    // Keeps left hand gesturing toward the 5-Map board while turning head back to make natural eye contact with the student!
                    shLz = -0.16;
                    armLx = -0.50; armLy = 0.16; armLz = -1.52;
                    foreLx = -0.34 - vEmp * 0.06; foreLy = 0.12;
                    handLx = -0.12; handLy = 0.16;
                    armRx = -0.50; armRy = -0.16; armRz = 0.42;
                    foreRx = -0.76 - vEmp * 0.07; foreRy = -0.14;
                    handRx = -0.12; handRy = -0.20;
                    spineX = 0.01; spineY = 0.08;
                    chestX = 0.02; chestY = 0.08;
                    neckX = 0.02; neckY = 0.02;
                    headX = 0.04 - vEmp * 0.06; headY = 0.04; headZ = -0.04;
                    hipShiftX = 0.010; kneeL = 0.06;
                } else {
                    // Phrase 3: "kaya pwedeng umabot ng singkwenta ang iskor mo!" -> Proud excited open celebration facing the student!
                    shLz = -0.14; shRz = 0.14;
                    armLx = -0.54; armLy = 0.18; armLz = -1.26;
                    foreLx = -0.68 - vEmp * 0.08;
                    handLx = -0.10;
                    armRx = -0.54; armRy = -0.18; armRz = 1.26;
                    foreRx = -0.68 - vEmp * 0.08;
                    handRx = -0.10;
                    headX = 0.08 - vEmp * 0.06; headY = 0.02; headZ = 0.03;
                    chestX = 0.05;
                    hipLift = 0.010 + vEmp * 0.006;
                    kneeL = 0.02; kneeR = 0.02;
                }
            } else if (stepIdx === 2) {
                // STEP 3: "Simple lang ang gagawin sa bawat mapa. Panoorin muna ang maikling video, basahin ang panuto, tapos sagutin ang mga tanong."
                if (p < 0.25) {
                    // Phrase 1: "Simple lang ang gagawin..." -> Friendly relaxed palms-out reassuring gesture
                    armLx = -0.40; armLy = 0.20; armLz = -0.48;
                    foreLx = -0.68; foreLy = 0.18; handLx = -0.16; handLy = 0.24;
                    armRx = -0.40; armRy = -0.20; armRz = 0.48;
                    foreRx = -0.68; foreRy = -0.18; handRx = -0.16; handRy = -0.24;
                    headX = -0.02 - vEmp * 0.05; headY = 0.03; headZ = 0.06;
                    spineZ = 0.02;
                } else if (p < 0.52) {
                    // Phrase 2: "Panoorin muna ang maikling video," -> Points UP-RIGHT toward step 1 on the board and glances up at it!
                    shLz = -0.20;
                    armLx = -0.46; armLy = 0.14; armLz = -1.72;
                    foreLx = -0.26 - vEmp * 0.06; foreLy = 0.10; handLx = -0.10;
                    armRx = -0.18; armRz = 0.14; foreRx = -0.46;
                    spineX = 0.03; spineY = 0.10;
                    chestX = 0.05; chestY = 0.12;
                    neckX = 0.07; neckY = 0.08;
                    headX = 0.19 - vEmp * 0.04; headY = 0.22; headZ = -0.03;
                    hipShiftX = -0.010; kneeR = 0.06;
                } else if (p < 0.74) {
                    // Phrase 3: "basahin ang panuto," -> Shifts pointing slightly higher/across to step 2 while glancing back toward student!
                    shLz = -0.18;
                    armLx = -0.48; armLy = 0.16; armLz = -1.60;
                    foreLx = -0.34 - vEmp * 0.07; foreLy = 0.14; handLx = -0.12;
                    armRx = -0.36; armRz = 0.30; foreRx = -0.68;
                    spineY = 0.08; chestY = 0.08;
                    headX = 0.06 - vEmp * 0.055; headY = 0.10; headZ = 0.03;
                    hipShiftX = 0.008; kneeL = 0.06;
                } else {
                    // Phrase 4: "tapos sagutin ang mga tanong." -> Both hands open decisively facing student + warm confident nod!
                    shLz = -0.08; shRz = 0.08;
                    armLx = -0.60; armLy = 0.22; armLz = -0.72;
                    foreLx = -0.64 - vEmp * 0.08; handLx = -0.12;
                    armRx = -0.60; armRy = -0.22; armRz = 0.72;
                    foreRx = -0.64 - vEmp * 0.08; handRx = -0.12;
                    headX = -0.04 - vEmp * 0.065; headY = 0.02; headZ = 0;
                    spineX = -0.05;
                }
            } else if (stepIdx === 3) {
                // STEP 4: "May tatlong puso ka sa bawat mapa bilang taga-ligtas. Kapag nagkamali ka, pwede kang gumamit ng isang puso para sumagot muli at makaiwas sa bawas ng puntos. Bantayan din ang oras!"
                if (p < 0.34) {
                    // Phrase 1: "May tatlong puso ka sa bawat mapa bilang taga-ligtas." -> Points UP-RIGHT at the 3 Puso plaque & looks up at it!
                    shLz = -0.21;
                    armLx = -0.45; armLy = 0.14; armLz = -1.78;
                    foreLx = -0.24 - vEmp * 0.05; foreLy = 0.10; handLx = -0.10;
                    armRx = -0.18; armRz = 0.14; foreRx = -0.48;
                    spineX = 0.03; spineY = 0.11;
                    chestX = 0.05; chestY = 0.12;
                    neckX = 0.07; neckY = 0.09;
                    headX = 0.20 - vEmp * 0.04; headY = 0.22; headZ = -0.03;
                    hipShiftX = -0.010; kneeR = 0.06;
                } else if (p < 0.78) {
                    // Phrase 2: "Kapag nagkamali ka, pwede kang gumamit ng isang puso para sumagot muli at makaiwas sa bawas ng puntos."
                    // Turns warmly to the student while keeping left hand gesturing toward "Sumagot Muli" & explaining clearly with right hand!
                    shLz = -0.15;
                    armLx = -0.50; armLy = 0.16; armLz = -1.46;
                    foreLx = -0.38 - vEmp * 0.06; foreLy = 0.12; handLx = -0.12;
                    armRx = -0.50; armRy = -0.16; armRz = 0.44;
                    foreRx = -0.74 - vEmp * 0.07; foreRy = -0.14; handRx = -0.12;
                    spineX = -0.02; spineY = 0.06;
                    chestY = 0.06;
                    headX = 0.02 - vEmp * 0.06; headY = 0.04; headZ = 0.03;
                    hipShiftX = 0.010; kneeL = 0.06;
                } else {
                    // Phrase 3: "Bantayan din ang oras!" -> Crisp alert glance & point up-right toward May Oras timer!
                    shLz = -0.22;
                    armLx = -0.42; armLy = 0.12; armLz = -1.84;
                    foreLx = -0.20 - vEmp * 0.05; foreLy = 0.10; handLx = -0.10;
                    armRx = -0.18; armRz = 0.14; foreRx = -0.44;
                    spineX = 0.03; spineY = 0.12;
                    chestX = 0.05; chestY = 0.12;
                    neckX = 0.07; neckY = 0.09;
                    headX = 0.21 - vEmp * 0.05; headY = 0.24; headZ = -0.03;
                    hipShiftX = -0.010; kneeR = 0.05;
                }
            } else {
                // STEP 5: "Ayos na! Pindutin mo lang ang Mapa 1 para magsimula. Kung nakalimutan mo, pindutin mo lang ang Gabay sa itaas anumang oras."
                if (p < 0.18) {
                    // Phrase 1: "Ayos na!" -> Crisp happy nod & energetic double-hand lift!
                    shLz = -0.10; shRz = 0.10;
                    armLx = -0.46; armLz = -0.78; foreLx = -0.84;
                    armRx = -0.46; armRz = 0.78; foreRx = -0.84;
                    headX = 0.06 - vEmp * 0.07; headY = 0.02; headZ = 0.04;
                    hipLift = 0.012;
                } else if (p < 0.55) {
                    // Phrase 2: "Pindutin mo lang ang Mapa 1 para magsimula." -> Points clearly UP-RIGHT at Mapa 1 plaque & looks up at it!
                    shLz = -0.21;
                    armLx = -0.45; armLy = 0.14; armLz = -1.78;
                    foreLx = -0.22 - vEmp * 0.05; foreLy = 0.10; handLx = -0.10;
                    armRx = -0.18; armRz = 0.14; foreRx = -0.46;
                    spineX = 0.03; spineY = 0.11;
                    chestX = 0.05; chestY = 0.12;
                    neckX = 0.07; neckY = 0.09;
                    headX = 0.20 - vEmp * 0.04; headY = 0.22; headZ = -0.03;
                    hipShiftX = -0.012; kneeR = 0.06;
                } else {
                    // Phrase 3: "Kung nakalimutan mo, pindutin mo lang ang Gabay sa itaas anumang oras." -> Points HIGHER UP-RIGHT toward Gabay & looks up-right!
                    shLz = -0.26;
                    armLx = -0.36; armLy = 0.12; armLz = -1.96;
                    foreLx = -0.16 - vEmp * 0.04; foreLy = 0.08; handLx = -0.12;
                    armRx = -0.16; armRz = 0.12; foreRx = -0.42;
                    spineX = 0.05; spineY = 0.14;
                    chestX = 0.07; chestY = 0.14;
                    neckX = 0.09; neckY = 0.10;
                    headX = 0.26 - vEmp * 0.04; headY = 0.26; headZ = -0.04;
                    hipShiftX = -0.012; kneeR = 0.05;
                }
            }
        }

        // Smooth human critically-damped interpolation (silky transitions between poses, never snappy or jittery!)
        const k = Math.min(1, dt * 6.2);
        const kHead = Math.min(1, dt * 9.0);
        const c = st.cur;

        c.shLx += (shLx - c.shLx) * k;
        c.shLz += (shLz - c.shLz) * k;
        c.armLx += (armLx - c.armLx) * k;
        c.armLy += (armLy - c.armLy) * k;
        c.armLz += (armLz - c.armLz) * k;
        c.foreLx += (foreLx - c.foreLx) * k;
        c.foreLy += (foreLy - c.foreLy) * k;
        c.foreLz += (foreLz - c.foreLz) * k;
        c.handLx += (handLx - c.handLx) * k;
        c.handLy += (handLy - c.handLy) * k;
        c.handLz += (handLz - c.handLz) * k;

        c.shRx += (shRx - c.shRx) * k;
        c.shRz += (shRz - c.shRz) * k;
        c.armRx += (armRx - c.armRx) * k;
        c.armRy += (armRy - c.armRy) * k;
        c.armRz += (armRz - c.armRz) * k;
        c.foreRx += (foreRx - c.foreRx) * k;
        c.foreRy += (foreRy - c.foreRy) * k;
        c.foreRz += (foreRz - c.foreRz) * k;
        c.handRx += (handRx - c.handRx) * k;
        c.handRy += (handRy - c.handRy) * k;
        c.handRz += (handRz - c.handRz) * k;

        c.neckX += (neckX - c.neckX) * kHead;
        c.neckY += (neckY - c.neckY) * kHead;
        c.headX += (headX - c.headX) * kHead;
        c.headY += (headY - c.headY) * kHead;
        c.headZ += (headZ - c.headZ) * kHead;

        c.spineX += (spineX - c.spineX) * k;
        c.spineY += (spineY - c.spineY) * k;
        c.spineZ += (spineZ - c.spineZ) * k;
        c.chestX += (chestX - c.chestX) * k;
        c.chestY += (chestY - c.chestY) * k;
        c.chestZ += (chestZ - c.chestZ) * k;

        c.hipX += (hipX - c.hipX) * k;
        c.hipY += (hipY - c.hipY) * k;
        c.hipZ += (hipZ - c.hipZ) * k;
        c.hipShiftX += (hipShiftX - c.hipShiftX) * k;
        c.hipLift += (hipLift - c.hipLift) * k;
        c.kneeL += (kneeL - c.kneeL) * k;
        c.kneeR += (kneeR - c.kneeR) * k;

        const applyBone = (key, rx, ry = 0, rz = 0) => {
            const bone = bones[key];
            const base = restQ[key];
            if (!bone || !base) return;
            st.euler.set(rx, ry, rz);
            st.quat.setFromEuler(st.euler);
            bone.quaternion.copy(base).multiply(st.quat);
        };

        // Grounded full-body stance: hips shift gently while feet stay planted on the ground!
        bones.hips.position.set(restHipsPos.x + c.hipShiftX, restHipsPos.y, restHipsPos.z + c.hipLift);
        applyBone('hips', c.hipX, c.hipY, c.hipZ);
        applyBone('thighl', -c.kneeL * 0.55, 0, -c.hipShiftX * 1.4);
        applyBone('shinl', c.kneeL, 0, 0);
        applyBone('footl', -c.kneeL * 0.45, 0, 0);
        applyBone('thighr', -c.kneeR * 0.55, 0, -c.hipShiftX * 1.4);
        applyBone('shinr', c.kneeR, 0, 0);
        applyBone('footr', -c.kneeR * 0.45, 0, 0);

        applyBone('spine', c.spineX, c.spineY, c.spineZ);
        applyBone('chest', c.chestX, c.chestY, c.chestZ);
        applyBone('neck', c.neckX, c.neckY, 0);
        applyBone('head', c.headX, c.headY, c.headZ);

        applyBone('shoulderl', c.shLx, 0, c.shLz);
        applyBone('upperarml', c.armLx, c.armLy, c.armLz);
        applyBone('forearml', c.foreLx, c.foreLy, c.foreLz);
        applyBone('handl', c.handLx, c.handLy, c.handLz);

        applyBone('shoulderr', c.shRx, 0, c.shRz);
        applyBone('upperarmr', c.armRx, c.armRy, c.armRz);
        applyBone('forearmr', c.foreRx, c.foreRy, c.foreRz);
        applyBone('handr', c.handRx, c.handRy, c.handRz);
    });

    return <primitive object={model} position={[0, 0, 0]} rotation={[0, 0.14, 0]} />;
}

export default function JuanGuide3D({ stepIdx, isTalkingRef, audioLevelRef, stepProgressRef }) {
    const fallbackImg = (
        <img
            src="/images/tutorial/juan_guide.png"
            alt="Si Juan Osong"
            draggable={false}
            className="w-full h-full object-contain select-none"
        />
    );

    const { isLowEnd } = useMemo(() => getDeviceProfile(), []);

    return (
        <PortraitErrorBoundary fallback={fallbackImg}>
            <div
                className="w-full h-full relative"
                style={{
                    // Full 5-pass die-cut white sticker halo on mid/high devices; lightweight single shadow on low-end phones to prevent compositor stalls!
                    filter: isLowEnd
                        ? 'drop-shadow(0 8px 14px rgba(15, 23, 42, 0.35))'
                        : 'drop-shadow(2px 0 0 #FFFFFF) drop-shadow(-2px 0 0 #FFFFFF) drop-shadow(0 2px 0 #FFFFFF) drop-shadow(0 -2px 0 #FFFFFF) drop-shadow(0 12px 20px rgba(15, 23, 42, 0.45))',
                }}
            >
                <Canvas
                    dpr={isLowEnd ? 0.85 : [1, 1.5]}
                    shadows={false}
                    gl={{
                        alpha: true,
                        antialias: !isLowEnd,
                        powerPreference: 'default',
                        toneMapping: THREE.ACESFilmicToneMapping,
                        toneMappingExposure: 1.08,
                    }}
                    camera={{ position: [0.09, 0.63, 2.86], fov: 29, near: 0.1, far: 25 }}
                    onCreated={({ camera, gl }) => {
                        camera.lookAt(0.07, 0.59, 0);
                        gl.setClearColor(0x000000, 0);
                    }}
                    style={{ width: '100%', height: '100%', background: 'transparent' }}
                >
                    <ambientLight intensity={0.70} color="#FFFAF0" />
                    <hemisphereLight args={['#FFFDF5', '#8C5E3C', 0.94]} />
                    <directionalLight position={[2.4, 3.8, 4.4]} intensity={1.50} color="#FFF6E5" />
                    <directionalLight position={[-2.8, 1.8, 3.2]} intensity={0.62} color="#E0F2FE" />
                    <directionalLight position={[0, 2.6, -3.4]} intensity={0.78} color="#FDE68A" />

                    <Suspense fallback={null}>
                        <AnimatedJuanFullBody
                            stepIdx={stepIdx}
                            isTalkingRef={isTalkingRef}
                            audioLevelRef={audioLevelRef}
                            stepProgressRef={stepProgressRef}
                        />
                    </Suspense>
                </Canvas>
            </div>
        </PortraitErrorBoundary>
    );
}
