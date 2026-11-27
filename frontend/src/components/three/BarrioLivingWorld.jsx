import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    BARRIO_TINDAHANS,
    BRIDGE_X,
    getTerrainHeight,
    HEIGHT_SCALE,
    PATINTERO_ZONE,
    RIVER_FISHERMAN,
    RIVER_WASHER,
    riverCenterZ,
} from './worldConfig';

const WATER_Y = -0.32 * HEIGHT_SCALE;

// Shared lightweight geometries across all villagers, kids, running dogs & flying birds (zero GC / tiny mobile footprint!)
const GEO = {
    head: new THREE.SphereGeometry(0.16, 12, 10),
    eye: new THREE.SphereGeometry(0.022, 6, 6),
    torso: new THREE.CapsuleGeometry(0.16, 0.30, 5, 10),
    limb: new THREE.CapsuleGeometry(0.052, 0.26, 4, 8),
    salakot: new THREE.ConeGeometry(0.32, 0.14, 12),
    bilao: new THREE.CylinderGeometry(0.36, 0.32, 0.06, 12),
    shadow: new THREE.CircleGeometry(0.30, 12),
    dogBody: new THREE.SphereGeometry(0.24, 10, 8),
    dogHead: new THREE.SphereGeometry(0.15, 10, 8),
    dogSnout: new THREE.SphereGeometry(0.085, 8, 6),
    dogLeg: new THREE.CapsuleGeometry(0.044, 0.18, 4, 6),
    dogEar: new THREE.ConeGeometry(0.055, 0.14, 6),
    dogTail: new THREE.CapsuleGeometry(0.032, 0.22, 4, 6),
    birdBody: new THREE.ConeGeometry(0.12, 0.44, 6),
    birdWing: new THREE.BoxGeometry(0.46, 0.028, 0.18),
};

const MAT_SKIN = new THREE.MeshStandardMaterial({ color: '#C68A5E', roughness: 0.58 });
const MAT_HAIR = new THREE.MeshStandardMaterial({ color: '#1F1612', roughness: 0.72 });
const MAT_SALAKOT = new THREE.MeshStandardMaterial({ color: '#C99B53', roughness: 0.84 });
const MAT_SHADOW = new THREE.MeshBasicMaterial({ color: '#0F172A', transparent: true, opacity: 0.20, depthWrite: false });
const MAT_EYE = new THREE.MeshBasicMaterial({ color: '#1A110C' });

/**
 * Reusable ultra-lightweight articulated Pinoy villager / kid figure.
 * Accepts external refs for left/right arms, legs, and root group so parent useFrame drives animations cleanly!
 */
function PinoyFigure({
    groupRef,
    armLRef,
    armRRef,
    legLRef,
    legRRef,
    torsoRef,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1.65,
    shirtColor = '#E11D48',
    pantsColor = '#334155',
    hasSalakot = false,
    hasBilao = false,
    seated = false,
    kneeling = false,
    castShadow = false,
}) {
    const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.75 }), [shirtColor]);
    const pantsMat = useMemo(() => new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.80 }), [pantsColor]);

    useEffect(() => () => {
        shirtMat.dispose();
        pantsMat.dispose();
    }, [shirtMat, pantsMat]);

    const bodyY = seated ? -0.24 : kneeling ? -0.34 : 0;

    return (
        <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
            <mesh geometry={GEO.shadow} material={MAT_SHADOW} dispose={null} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />
            <group ref={torsoRef} position={[0, bodyY, 0]}>
                {/* Left & Right Articulated Legs */}
                <group ref={legLRef} position={[-0.085, 0.44, 0]} rotation={[seated ? -1.35 : kneeling ? 1.2 : 0, 0, 0]}>
                    <mesh geometry={GEO.limb} material={pantsMat} dispose={null} position={[0, -0.18, 0]} castShadow={castShadow} />
                </group>
                <group ref={legRRef} position={[0.085, 0.44, 0]} rotation={[seated ? -1.35 : kneeling ? 1.2 : 0, 0, 0]}>
                    <mesh geometry={GEO.limb} material={pantsMat} dispose={null} position={[0, -0.18, 0]} castShadow={castShadow} />
                </group>

                {/* Torso */}
                <mesh geometry={GEO.torso} material={shirtMat} dispose={null} position={[0, 0.74, 0]} castShadow={castShadow} />

                {/* Left & Right Articulated Arms */}
                <group ref={armLRef} position={[-0.21, 0.90, 0]}>
                    <mesh geometry={GEO.limb} material={shirtMat} dispose={null} position={[0, -0.16, 0]} castShadow={castShadow} />
                </group>
                <group ref={armRRef} position={[0.21, 0.90, 0]}>
                    <mesh geometry={GEO.limb} material={shirtMat} dispose={null} position={[0, -0.16, 0]} castShadow={castShadow} />
                </group>

                {/* Head + Hair + Eyes */}
                <group position={[0, 1.14, 0]}>
                    <mesh geometry={GEO.head} material={MAT_SKIN} dispose={null} castShadow={castShadow} />
                    <mesh geometry={GEO.head} material={MAT_HAIR} dispose={null} position={[0, 0.045, -0.025]} scale={[1.02, 0.82, 1.02]} />
                    <mesh geometry={GEO.eye} material={MAT_EYE} dispose={null} position={[-0.055, 0.01, 0.145]} />
                    <mesh geometry={GEO.eye} material={MAT_EYE} dispose={null} position={[0.055, 0.01, 0.145]} />
                    {hasSalakot && (
                        <mesh geometry={GEO.salakot} material={MAT_SALAKOT} dispose={null} position={[0, 0.15, 0]} castShadow={castShadow} />
                    )}
                    {hasBilao && (
                        <mesh geometry={GEO.bilao} material={MAT_SALAKOT} dispose={null} position={[0, 0.22, 0]} castShadow={castShadow} />
                    )}
                </group>
            </group>
        </group>
    );
}

/** 1. Authentic Open-Ground Patintero Match (5 Animated Pinoy Kids on a Wide Dirt Clearing Off the Road!) */
function PatinteroScene({ lowQuality }) {
    const taya1Ref = useRef();
    const taya2Ref = useRef();
    const patototRef = useRef();
    const run1Ref = useRef();
    const run2Ref = useRef();
    const legs = useRef([]);
    const arms = useRef([]);

    // Chalk-drawn Patintero court lines texture (transparent over the packed-earth clearing)
    const courtTex = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        ctx.strokeStyle = 'rgba(255, 252, 240, 0.85)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        // Outer rectangle (3 boxes long x 2 boxes wide)
        ctx.strokeRect(36, 36, 440, 440);
        // 2 interior horizontal cross-lines
        ctx.beginPath();
        ctx.moveTo(36, 182);
        ctx.lineTo(476, 182);
        ctx.moveTo(36, 330);
        ctx.lineTo(476, 330);
        // Center vertical spine line (patotot line)
        ctx.moveTo(256, 36);
        ctx.lineTo(256, 476);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, []);

    useEffect(() => () => courtTex.dispose(), [courtTex]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();

        // Taya 1 slides briskly left/right along front line (z = +1.7) with arms spread wide blocking!
        if (taya1Ref.current) {
            const x = Math.sin(t * 2.1) * 3.1;
            taya1Ref.current.position.set(x, 0, 1.7);
            taya1Ref.current.rotation.y = Math.cos(t * 2.1) * 0.25;
        }
        // Taya 2 guards back horizontal line (z = -1.7)
        if (taya2Ref.current) {
            const x = Math.sin(t * 1.85 + 2.2) * 3.1;
            taya2Ref.current.position.set(x, 0, -1.7);
            taya2Ref.current.rotation.y = Math.cos(t * 1.85 + 2.2) * 0.25;
        }
        // Patotot patrols the center vertical spine line (x = 0)
        if (patototRef.current) {
            const z = Math.sin(t * 1.6 + 0.8) * 3.4;
            patototRef.current.position.set(0, 0, z);
            patototRef.current.rotation.y = Math.cos(t * 1.6 + 0.8) > 0 ? 0 : Math.PI;
        }

        // Runner 1 darts forward across boxes, feints left/right, reaches far line, turns and runs back!
        if (run1Ref.current) {
            const cycle = (t * 0.34) % 2.0;
            const goingForward = cycle < 1.0;
            const u = goingForward ? cycle : 2.0 - cycle;
            const z = 4.6 - u * 9.2;
            const x = -2.1 + Math.sin(u * Math.PI * 3.0) * 1.15;
            run1Ref.current.position.set(x, 0, z);
            run1Ref.current.rotation.y = goingForward ? Math.PI : 0;
        }

        // Runner 2 darts on the opposite lane with phase offset
        if (run2Ref.current) {
            const cycle = (t * 0.31 + 0.85) % 2.0;
            const goingForward = cycle < 1.0;
            const u = goingForward ? cycle : 2.0 - cycle;
            const z = 4.6 - u * 9.2;
            const x = 2.1 + Math.cos(u * Math.PI * 2.5) * 1.1;
            run2Ref.current.position.set(x, 0, z);
            run2Ref.current.rotation.y = goingForward ? Math.PI : 0;
        }

        // Crisp limb animations
        if (!lowQuality) {
            for (let i = 0; i < 5; i++) {
                const swing = Math.sin(t * (i < 3 ? 8.5 : 11.0) + i * 1.4) * (i < 3 ? 0.55 : 0.85);
                if (legs.current[i * 2]) legs.current[i * 2].rotation.x = swing;
                if (legs.current[i * 2 + 1]) legs.current[i * 2 + 1].rotation.x = -swing;
                if (i < 3) {
                    // Taggers stretch arms out wide blocking!
                    if (arms.current[i * 2]) arms.current[i * 2].rotation.z = -1.15 + Math.sin(t * 5 + i) * 0.14;
                    if (arms.current[i * 2 + 1]) arms.current[i * 2 + 1].rotation.z = 1.15 - Math.sin(t * 5 + i) * 0.14;
                } else {
                    // Runners pump arms!
                    if (arms.current[i * 2]) arms.current[i * 2].rotation.x = -swing * 0.85;
                    if (arms.current[i * 2 + 1]) arms.current[i * 2 + 1].rotation.x = swing * 0.85;
                }
            }
        }
    });

    const groundY = getTerrainHeight(PATINTERO_ZONE.x, PATINTERO_ZONE.z);
    const kids = [
        { ref: taya1Ref, shirt: '#EF4444', pants: '#1E293B' },
        { ref: taya2Ref, shirt: '#F97316', pants: '#1E293B' },
        { ref: patototRef, shirt: '#DC2626', pants: '#334155' },
        { ref: run1Ref, shirt: '#2563EB', pants: '#78350F' },
        { ref: run2Ref, shirt: '#16A34A', pants: '#1E3A8A' },
    ];

    return (
        <group position={[PATINTERO_ZONE.x, groundY, PATINTERO_ZONE.z]} rotation={[0, PATINTERO_ZONE.yaw, 0]}>
            {/* White Chalk Patintero Court Lines on Open Packed Earth */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} receiveShadow>
                <planeGeometry args={[9.6, 10.6]} />
                <meshBasicMaterial map={courtTex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>

            {/* 5 Animated Pinoy Kids Playing Patintero */}
            {kids.map((k, idx) => (
                <PinoyFigure
                    key={idx}
                    groupRef={k.ref}
                    legLRef={(el) => (legs.current[idx * 2] = el)}
                    legRRef={(el) => (legs.current[idx * 2 + 1] = el)}
                    armLRef={(el) => (arms.current[idx * 2] = el)}
                    armRRef={(el) => (arms.current[idx * 2 + 1] = el)}
                    scale={1.36}
                    shirtColor={k.shirt}
                    pantsColor={k.pants}
                    castShadow={!lowQuality}
                />
            ))}
        </group>
    );
}

/** 2. Riverside Life: Namimingwit sa Ilog (Fisherman) + Naglalaba sa Ilog (Washerwoman) */
function RiversideLife({ lowQuality }) {
    const rodRef = useRef();
    const bobberRef = useRef();
    const washArmL = useRef();
    const washArmR = useRef();
    const washTorso = useRef();

    const fishY = getTerrainHeight(RIVER_FISHERMAN.x, RIVER_FISHERMAN.z);
    const washY = getTerrainHeight(RIVER_WASHER.x, RIVER_WASHER.z);
    const waterRelFish = WATER_Y - fishY;

    useFrame(({ clock }) => {
        if (lowQuality) return;
        const t = clock.getElapsedTime();
        // Gentle periodic fish-nibble tug on fishing rod & bobber
        const nibble = Math.pow(Math.max(0, Math.sin(t * 0.9)), 6) * Math.sin(t * 14.0) * 0.08;
        if (rodRef.current) rodRef.current.rotation.x = 0.36 + Math.sin(t * 1.1) * 0.04 + nibble;
        if (bobberRef.current) bobberRef.current.position.y = waterRelFish + 0.05 + Math.sin(t * 3.0) * 0.04 - Math.abs(nibble) * 1.8;

        // Rhythmic scrubbing / laundry washing animation (kusot!)
        const scrub = Math.sin(t * 5.2);
        if (washArmL.current) washArmL.current.rotation.x = -1.15 + scrub * 0.32;
        if (washArmR.current) washArmR.current.rotation.x = -1.15 - scrub * 0.32;
        if (washTorso.current) washTorso.current.rotation.x = 0.42 + Math.sin(t * 5.2) * 0.06;
    });

    return (
        <group>
            {/* A. Namimingwit sa Ilog (Seated Villager with Salakot + Bamboo Rod + Bobber!) */}
            <group position={[RIVER_FISHERMAN.x, fishY, RIVER_FISHERMAN.z]} rotation={[0, RIVER_FISHERMAN.yaw, 0]}>
                {/* Riverside sitting boulder */}
                <mesh position={[0, 0.35, -0.1]} scale={[1.25, 0.72, 1.0]} castShadow={!lowQuality}>
                    <dodecahedronGeometry args={[0.78, 1]} />
                    <meshStandardMaterial color="#8A857C" roughness={0.9} />
                </mesh>
                {/* Wooden fish bucket (timba) beside him */}
                <mesh position={[1.1, 0.32, 0.15]} castShadow={!lowQuality}>
                    <cylinderGeometry args={[0.32, 0.24, 0.56, 10]} />
                    <meshStandardMaterial color="#9A6636" roughness={0.85} />
                </mesh>
                <PinoyFigure
                    position={[0, 0.62, 0.05]}
                    scale={1.72}
                    shirtColor="#F59E0B"
                    pantsColor="#57534E"
                    hasSalakot
                    seated
                    castShadow={!lowQuality}
                />
                {/* Curved Bamboo Fishing Rod (Bingwit) & Taut Line */}
                <group ref={rodRef} position={[0.38, 1.48, 0.45]} rotation={[0.36, 0, 0]}>
                    <mesh position={[0, 0.35, 1.75]} rotation={[1.28, 0, 0]}>
                        <cylinderGeometry args={[0.025, 0.055, 3.8, 6]} />
                        <meshStandardMaterial color="#B58946" roughness={0.78} />
                    </mesh>
                    {/* Fishing line dipping toward river */}
                    <mesh position={[0, -0.45, 3.55]}>
                        <cylinderGeometry args={[0.009, 0.009, 2.4, 4]} />
                        <meshBasicMaterial color="#F8FAFC" />
                    </mesh>
                </group>
                {/* Floating Red & White Fishing Bobber on River Surface */}
                <mesh ref={bobberRef} position={[0.38, waterRelFish + 0.05, 4.0]}>
                    <sphereGeometry args={[0.13, 8, 8]} />
                    <meshStandardMaterial color="#EF4444" roughness={0.35} />
                </mesh>
            </group>

            {/* B. Naglalaba sa Ilog (Nanay Kneeling by River Rock + Palanggana + Soap Suds + Basket!) */}
            <group position={[RIVER_WASHER.x, washY, RIVER_WASHER.z]} rotation={[0, RIVER_WASHER.yaw, 0]}>
                {/* Flat river washing stone (batong labahan) */}
                <mesh position={[0, 0.16, 1.15]} scale={[1.4, 0.38, 1.15]} receiveShadow>
                    <dodecahedronGeometry args={[0.78, 1]} />
                    <meshStandardMaterial color="#949087" roughness={0.88} />
                </mesh>
                {/* Colorful Turquoise Palanggana (Washbasin) with White Soap Foam */}
                <group position={[1.18, 0.24, 0.65]}>
                    <mesh castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.56, 0.42, 0.34, 14]} />
                        <meshStandardMaterial color="#0EA5E9" roughness={0.42} />
                    </mesh>
                    <mesh position={[0, 0.14, 0]}>
                        <cylinderGeometry args={[0.48, 0.48, 0.06, 12]} />
                        <meshStandardMaterial color="#F8FAFC" roughness={0.8} />
                    </mesh>
                </group>
                {/* Woven Laundry Basket with Colorful Folded Clothes */}
                <group position={[-1.12, 0.28, 0.35]}>
                    <mesh castShadow={!lowQuality}>
                        <cylinderGeometry args={[0.44, 0.34, 0.44, 12]} />
                        <meshStandardMaterial color="#B58342" roughness={0.88} />
                    </mesh>
                    <mesh position={[0, 0.24, 0]} scale={[1.1, 0.55, 1.0]}>
                        <sphereGeometry args={[0.34, 10, 8]} />
                        <meshStandardMaterial color="#FB7185" roughness={0.85} />
                    </mesh>
                </group>
                <PinoyFigure
                    torsoRef={washTorso}
                    armLRef={washArmL}
                    armRRef={washArmR}
                    position={[0, 0.15, -0.15]}
                    scale={1.68}
                    shirtColor="#EC4899"
                    pantsColor="#6D28D9"
                    kneeling
                    castShadow={!lowQuality}
                />
            </group>
        </group>
    );
}

/** 3. Sari-Sari Store Life: Tindera behind Counter + Bumibili (Shoppers) + Tambay on Bench */
function TindahanLife({ lowQuality }) {
    const shopperRefs = useRef([]);

    useFrame(({ clock }) => {
        if (lowQuality) return;
        const t = clock.getElapsedTime();
        shopperRefs.current.forEach((el, idx) => {
            if (!el) return;
            // Subtle nodding/conversing motion while buying paninda!
            el.position.y = Math.sin(t * 2.2 + idx * 1.7) * 0.025;
        });
    });

    const configs = [
        { tinderaShirt: '#E11D48', buyerShirt: '#0284C7', buyerPants: '#334155', tambayShirt: '#16A34A' },
        { tinderaShirt: '#D97706', buyerShirt: '#7C3AED', buyerPants: '#475569', tambayShirt: null },
        { tinderaShirt: '#059669', buyerShirt: '#EA580C', buyerPants: '#1E293B', tambayShirt: '#2563EB' },
    ];

    return (
        <group>
            {BARRIO_TINDAHANS.map((st, idx) => {
                const y = getTerrainHeight(st.x, st.z);
                const cfg = configs[idx % configs.length];
                return (
                    <group key={idx} position={[st.x, y, st.z]} rotation={[0, st.yaw, 0]}>
                        {/* Tindera standing behind the store counter facing outward (+Z) */}
                        <PinoyFigure
                            position={[-0.35, 0.18, 0.35]}
                            rotation={[0, 0, 0]}
                            scale={1.58}
                            shirtColor={cfg.tinderaShirt}
                            pantsColor="#1F2937"
                        />
                        {/* Bumibili (Customer) standing right in front of counter facing the Tindera (-Z) */}
                        <PinoyFigure
                            torsoRef={(el) => (shopperRefs.current[idx] = el)}
                            position={[-0.32, 0.0, 2.55]}
                            rotation={[0, Math.PI, 0]}
                            scale={1.68}
                            shirtColor={cfg.buyerShirt}
                            pantsColor={cfg.buyerPants}
                            hasSalakot={idx === 1}
                            castShadow={!lowQuality}
                        />
                        {/* Tambay relaxing on the wooden bangko (Store 1 & 3) */}
                        {cfg.tambayShirt && !lowQuality && (
                            <PinoyFigure
                                position={[0.78, 0.42, 2.32]}
                                rotation={[0, 0.12, 0]}
                                scale={1.62}
                                shirtColor={cfg.tambayShirt}
                                pantsColor="#78350F"
                                seated
                                castShadow={!lowQuality}
                            />
                        )}
                    </group>
                );
            })}
        </group>
    );
}

/** 4. Taong Dumadaan (Programmed Walking Barrio Villagers — Including Bridge Crosser & Nanay with Bilao!) */
function WalkingVillagers({ lowQuality }) {
    const walkerRefs = useRef([]);
    const legRefs = useRef([]);
    const armRefs = useRef([]);

    // Precompute bridge yaw & deck arch helper so Walker #3 strolls cleanly over our arched wooden footbridge!
    const bridgeParams = useMemo(() => {
        const bz = riverCenterZ(BRIDGE_X);
        const slope = (riverCenterZ(BRIDGE_X + 1) - riverCenterZ(BRIDGE_X - 1)) / 2;
        const yaw = -Math.atan2(slope, 1);
        const halfSpan = 8.4;
        const nx = BRIDGE_X - halfSpan * Math.sin(yaw);
        const nz = bz - halfSpan * Math.cos(yaw);
        const sx = BRIDGE_X + halfSpan * Math.sin(yaw);
        const sz = bz + halfSpan * Math.cos(yaw);
        const yNorth = getTerrainHeight(nx, nz) + 0.04;
        const ySouth = getTerrainHeight(sx, sz) + 0.04;
        return { bz, yaw, halfSpan, yNorth, ySouth };
    }, []);

    const routes = useMemo(() => {
        const { bz, yaw } = bridgeParams;
        const all = [
            // Nanay balancing a woven bilao walking along west village hillside
            { ax: -55, az: 3, bx: -45, bz: -6, speed: 0.14, phase: 0.1, shirt: '#DB2777', pants: '#3B0764', hasBilao: true, hasSalakot: false, onBridge: false },
            // Tatay with salakot strolling along south barrio lane near Patintero yard
            { ax: -23, az: 20, bx: -14, bz: 26, speed: 0.16, phase: 0.6, shirt: '#F59E0B', pants: '#44403C', hasBilao: false, hasSalakot: true, onBridge: false },
            // Villager walking back-and-forth across the Arched Timber Bridge over the flowing river!
            {
                ax: BRIDGE_X - 9.2 * Math.sin(yaw),
                az: bz - 9.2 * Math.cos(yaw),
                bx: BRIDGE_X + 9.2 * Math.sin(yaw),
                bz: bz + 9.2 * Math.cos(yaw),
                speed: 0.12,
                phase: 0.35,
                shirt: '#0D9488',
                pants: '#1E293B',
                hasBilao: false,
                hasSalakot: true,
                onBridge: true,
            },
            // East hillside barrio resident strolling past kubos
            { ax: 38, az: -4, bx: 48, bz: 3, speed: 0.15, phase: 0.8, shirt: '#2563EB', pants: '#57534E', hasBilao: false, hasSalakot: false, onBridge: false },
        ];
        return lowQuality ? all.slice(0, 2) : all;
    }, [bridgeParams, lowQuality]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const { bz, yaw, halfSpan, yNorth, ySouth } = bridgeParams;

        routes.forEach((r, i) => {
            const grp = walkerRefs.current[i];
            if (!grp) return;
            const cycle = (t * r.speed + r.phase) % 2.0;
            const fwd = cycle < 1.0;
            const u = fwd ? cycle : 2.0 - cycle;
            // Smooth ease near turnaround points
            const smoothU = u * u * (3 - 2 * u);

            const x = r.ax + (r.bx - r.ax) * smoothU;
            const z = r.az + (r.bz - r.az) * smoothU;
            let y = getTerrainHeight(x, z);

            if (r.onBridge) {
                const zLocal = -9.2 + smoothU * 18.4;
                if (Math.abs(zLocal) <= halfSpan) {
                    const frac = (zLocal + halfSpan) / (2 * halfSpan);
                    const arch = Math.cos((Math.abs(zLocal) / halfSpan) * Math.PI * 0.5) * 1.18;
                    y = yNorth + frac * (ySouth - yNorth) + arch + 0.12;
                }
            }

            grp.position.set(x, y, z);
            const dx = fwd ? r.bx - r.ax : r.ax - r.bx;
            const dz = fwd ? r.bz - r.az : r.az - r.bz;
            grp.rotation.y = Math.atan2(dx, dz);

            const swing = Math.sin(t * 7.2 + i * 2.1) * 0.55;
            if (legRefs.current[i * 2]) legRefs.current[i * 2].rotation.x = swing;
            if (legRefs.current[i * 2 + 1]) legRefs.current[i * 2 + 1].rotation.x = -swing;
            if (armRefs.current[i * 2]) armRefs.current[i * 2].rotation.x = -swing * 0.65;
            if (armRefs.current[i * 2 + 1]) armRefs.current[i * 2 + 1].rotation.x = swing * 0.65;
        });
    });

    return (
        <group>
            {routes.map((r, idx) => (
                <PinoyFigure
                    key={idx}
                    groupRef={(el) => (walkerRefs.current[idx] = el)}
                    legLRef={(el) => (legRefs.current[idx * 2] = el)}
                    legRRef={(el) => (legRefs.current[idx * 2 + 1] = el)}
                    armLRef={(el) => (armRefs.current[idx * 2] = el)}
                    armRRef={(el) => (armRefs.current[idx * 2 + 1] = el)}
                    scale={1.68}
                    shirtColor={r.shirt}
                    pantsColor={r.pants}
                    hasBilao={r.hasBilao}
                    hasSalakot={r.hasSalakot}
                    castShadow={!lowQuality}
                />
            ))}
        </group>
    );
}

/** 5. Articulated Running / Trotting Pinoy Askals (4 Moving Legs + Wagging Tail + Back-and-Forth Yard Loops!) */
function RunningAskals({ lowQuality }) {
    const dogRefs = useRef([]);
    const legRefs = useRef([]);
    const tailRefs = useRef([]);

    const furTan = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C68642', roughness: 0.78 }), []);
    const furBrown = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9E5A28', roughness: 0.78 }), []);
    const furCream = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F0DEC0', roughness: 0.80 }), []);
    const collarRed = useMemo(() => new THREE.MeshStandardMaterial({ color: '#DC2626', roughness: 0.50 }), []);
    const noseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1F1612', roughness: 0.45 }), []);

    useEffect(() => () => {
        furTan.dispose();
        furBrown.dispose();
        furCream.dispose();
        collarRed.dispose();
        noseMat.dispose();
    }, [furTan, furBrown, furCream, collarRed, noseMat]);

    const dogLoops = useMemo(() => {
        const all = [
            // Dog 1: Trotting joyfully across Tindahan 1's front grassy yard (100% off the main dirt road!)
            { ax: -38.8, az: 11.4, bx: -35.2, bz: 6.2, speed: 0.26, phase: 0.0, coat: furTan },
            // Dog 2: Running cheerfully near Patintero playground sideline!
            { ax: -10.5, az: 12.2, bx: 1.5, bz: 11.2, speed: 0.30, phase: 0.65, coat: furBrown },
            // Dog 3: Trotting near Mapa 4 Bahay Kubo yard (clear of road & Juan)
            { ax: 18.2, az: 8.5, bx: 21.8, bz: 15.8, speed: 0.24, phase: 1.3, coat: furTan },
        ];
        return lowQuality ? all.slice(0, 2) : all;
    }, [lowQuality, furTan, furBrown]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        dogLoops.forEach((d, i) => {
            const grp = dogRefs.current[i];
            if (!grp) return;

            // Loop with brief playful sniff/wag pause at each end (cycle 0..2.4)
            const raw = (t * d.speed + d.phase) % 2.4;
            let u = 0;
            let running = false;
            let fwd = true;
            if (raw < 0.95) {
                u = raw / 0.95;
                running = true;
                fwd = true;
            } else if (raw < 1.2) {
                u = 1.0;
                running = false;
                fwd = true;
            } else if (raw < 2.15) {
                u = 1.0 - (raw - 1.2) / 0.95;
                running = true;
                fwd = false;
            } else {
                u = 0.0;
                running = false;
                fwd = false;
            }

            const x = d.ax + (d.bx - d.ax) * u;
            const z = d.az + (d.bz - d.az) * u;
            const bounce = running ? Math.abs(Math.sin(t * 12.0 + i)) * 0.09 : 0;
            grp.position.set(x, getTerrainHeight(x, z) + bounce, z);

            const dx = fwd ? d.bx - d.ax : d.ax - d.bx;
            const dz = fwd ? d.bz - d.az : d.az - d.bz;
            grp.rotation.y = Math.atan2(dx, dz);

            // 4 articulated legs striding cleanly when running!
            const stride = running ? Math.sin(t * 12.0 + i * 1.5) * 0.65 : 0;
            const baseIdx = i * 4;
            if (legRefs.current[baseIdx]) legRefs.current[baseIdx].rotation.x = stride; // front-left
            if (legRefs.current[baseIdx + 1]) legRefs.current[baseIdx + 1].rotation.x = -stride; // front-right
            if (legRefs.current[baseIdx + 2]) legRefs.current[baseIdx + 2].rotation.x = -stride; // back-left
            if (legRefs.current[baseIdx + 3]) legRefs.current[baseIdx + 3].rotation.x = stride; // back-right

            // Happy continuous tail wagging (faster when paused!)
            if (tailRefs.current[i]) {
                tailRefs.current[i].rotation.z = Math.sin(t * (running ? 11.0 : 16.0) + i) * 0.45;
            }
        });
    });

    return (
        <group>
            {dogLoops.map((d, i) => (
                <group key={i} ref={(el) => (dogRefs.current[i] = el)} scale={1.48}>
                    <mesh geometry={GEO.shadow} material={MAT_SHADOW} dispose={null} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[1.1, 1.4, 1]} />
                    {/* Barrel Torso + Cream Chest (facing +Z) */}
                    <mesh geometry={GEO.dogBody} material={d.coat} dispose={null} position={[0, 0.44, 0]} scale={[0.78, 0.84, 1.38]} castShadow={!lowQuality} />
                    <mesh geometry={GEO.dogBody} material={furCream} dispose={null} position={[0, 0.37, 0.16]} scale={[0.62, 0.65, 0.72]} />

                    {/* Neck Collar + Perked Head + Snout + Ears */}
                    <mesh position={[0, 0.56, 0.30]} rotation={[0.45, 0, 0]}>
                        <cylinderGeometry args={[0.11, 0.12, 0.06, 10]} />
                        <primitive object={collarRed} attach="material" dispose={null} />
                    </mesh>
                    <group position={[0, 0.68, 0.42]}>
                        <mesh geometry={GEO.dogHead} material={d.coat} dispose={null} castShadow={!lowQuality} />
                        <mesh geometry={GEO.dogSnout} material={furCream} dispose={null} position={[0, -0.04, 0.13]} scale={[0.85, 0.75, 1.15]} />
                        <mesh geometry={GEO.eye} material={noseMat} dispose={null} position={[0, -0.015, 0.22]} scale={1.3} />
                        <mesh geometry={GEO.eye} material={MAT_EYE} dispose={null} position={[-0.065, 0.035, 0.12]} />
                        <mesh geometry={GEO.eye} material={MAT_EYE} dispose={null} position={[0.065, 0.035, 0.12]} />
                        <mesh geometry={GEO.dogEar} material={d.coat} dispose={null} position={[-0.11, 0.11, -0.02]} rotation={[0.15, 0, 0.35]} />
                        <mesh geometry={GEO.dogEar} material={d.coat} dispose={null} position={[0.11, 0.11, -0.02]} rotation={[0.15, 0, -0.35]} />
                    </group>

                    {/* 4 Articulated Legs (FL, FR, BL, BR) */}
                    {[
                        [-0.10, 0.22],
                        [0.10, 0.22],
                        [-0.10, -0.22],
                        [0.10, -0.22],
                    ].map(([lx, lz], lIdx) => (
                        <group key={lIdx} ref={(el) => (legRefs.current[i * 4 + lIdx] = el)} position={[lx, 0.36, lz]}>
                            <mesh geometry={GEO.dogLeg} material={lIdx < 2 ? d.coat : furCream} dispose={null} position={[0, -0.17, 0]} castShadow={!lowQuality} />
                        </group>
                    ))}

                    {/* Happy Wagging Tail */}
                    <group ref={(el) => (tailRefs.current[i] = el)} position={[0, 0.50, -0.32]} rotation={[-0.65, 0, 0]}>
                        <mesh geometry={GEO.dogTail} material={d.coat} dispose={null} position={[0, 0.12, -0.06]} />
                    </group>
                </group>
            ))}
        </group>
    );
}

/** 6. Randomly Flying Pinoy Birds (Maya & White Tagak Flapping Gracefully Between Tree Canopies!) */
function FlyingBirds({ lowQuality }) {
    const birdRefs = useRef([]);
    const wingLRefs = useRef([]);
    const wingRRefs = useRef([]);

    const matMaya = useMemo(() => new THREE.MeshStandardMaterial({ color: '#78350F', roughness: 0.7 }), []);
    const matTagak = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FAF8F5', roughness: 0.6 }), []);

    useEffect(() => () => {
        matMaya.dispose();
        matTagak.dispose();
    }, [matMaya, matTagak]);

    const flock = useMemo(() => {
        const all = [
            { cx: -46, cz: 10, rx: 18, rz: 14, h: 12.5, speed: 0.34, phase: 0.2, white: false },
            { cx: -26, cz: -8, rx: 22, rz: 16, h: 14.0, speed: 0.29, phase: 1.5, white: true },
            { cx: 4, cz: -24, rx: 26, rz: 12, h: 11.8, speed: 0.36, phase: 2.8, white: true },
            { cx: 24, cz: -14, rx: 20, rz: 15, h: 13.5, speed: 0.31, phase: 4.1, white: false },
            { cx: -4, cz: 18, rx: 24, rz: 18, h: 15.0, speed: 0.27, phase: 5.2, white: false },
            { cx: 44, cz: 10, rx: 18, rz: 16, h: 13.0, speed: 0.33, phase: 0.9, white: true },
            { cx: -14, cz: 22, rx: 19, rz: 14, h: 16.0, speed: 0.28, phase: 3.4, white: false },
            { cx: 30, cz: 16, rx: 22, rz: 15, h: 14.5, speed: 0.32, phase: 2.1, white: false },
            { cx: 12, cz: -34, rx: 28, rz: 12, h: 12.2, speed: 0.35, phase: 4.9, white: true },
            { cx: -56, cz: -12, rx: 16, rz: 14, h: 13.8, speed: 0.30, phase: 1.1, white: false },
        ];
        return lowQuality ? all.slice(0, 4) : all;
    }, [lowQuality]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        flock.forEach((b, i) => {
            const grp = birdRefs.current[i];
            if (!grp) return;
            const a = t * b.speed + b.phase;
            // Organic figure-8 / curved tree-to-tree flight path
            const x = b.cx + Math.sin(a) * b.rx;
            const z = b.cz + Math.sin(a * 0.72 + 1.1) * b.rz;
            const y = b.h + Math.sin(a * 1.9) * 1.8;

            const dx = Math.cos(a) * b.rx * b.speed;
            const dz = Math.cos(a * 0.72 + 1.1) * b.rz * b.speed * 0.72;
            grp.position.set(x, y, z);
            grp.rotation.y = Math.atan2(dx, dz);

            // Real wing-flapping animation!
            const flap = Math.sin(t * 13.5 + i * 2.3) * 0.62;
            if (wingLRefs.current[i]) wingLRefs.current[i].rotation.z = flap;
            if (wingRRefs.current[i]) wingRRefs.current[i].rotation.z = -flap;
        });
    });

    return (
        <group>
            {flock.map((b, i) => {
                const mat = b.white ? matTagak : matMaya;
                const sc = b.white ? 1.35 : 1.05;
                return (
                    <group key={i} ref={(el) => (birdRefs.current[i] = el)} scale={sc}>
                        <mesh geometry={GEO.birdBody} material={mat} dispose={null} rotation={[Math.PI / 2, 0, 0]} />
                        <group ref={(el) => (wingLRefs.current[i] = el)} position={[-0.08, 0.02, 0]}>
                            <mesh geometry={GEO.birdWing} material={mat} dispose={null} position={[-0.22, 0, 0]} />
                        </group>
                        <group ref={(el) => (wingRRefs.current[i] = el)} position={[0.08, 0.02, 0]}>
                            <mesh geometry={GEO.birdWing} material={mat} dispose={null} position={[0.22, 0, 0]} />
                        </group>
                    </group>
                );
            })}
        </group>
    );
}

/**
 * Complete Living Pinoy Barrio World:
 * Patintero Kids Playground + Riverside Fisherman & Washerwoman + Tindahan Shoppers +
 * Strolling Villagers (including Bridge Crosser) + Articulated Running Askals + Flying Birds!
 */
export default function BarrioLivingWorld({ lowQuality }) {
    return (
        <group>
            <PatinteroScene lowQuality={lowQuality} />
            <RiversideLife lowQuality={lowQuality} />
            <TindahanLife lowQuality={lowQuality} />
            <WalkingVillagers lowQuality={lowQuality} />
            <RunningAskals lowQuality={lowQuality} />
            <FlyingBirds lowQuality={lowQuality} />
        </group>
    );
}
