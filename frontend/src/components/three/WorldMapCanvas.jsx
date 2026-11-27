import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor, Sky } from '@react-three/drei';
import { RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { getDeviceProfile } from '../../utils/deviceTier';
import { createWorldCurve, WORLD_SCALE } from './worldConfig';
import { resetPbrTextures } from './pbrTextures';
import TerrainAndWater from './TerrainAndWater';
import SteppingStonePath from './SteppingStonePath';
import CameraRig from './CameraRig';
import PlayerCharacter from './PlayerCharacter';
import MapLandmarkNode from './MapLandmarkNode';
import EnvironmentInstanced from './EnvironmentInstanced';
import PinoyBarrioProps from './PinoyBarrioProps';
import BarrioLivingWorld from './BarrioLivingWorld';
import PahingahanNode from './PahingahanNode';

const DREAM_THOUGHTS = [
    ['Hays, buti tapos na', 'ang buong kuwento...'],
    ['Sarap magduyan! Ligtas na', 'sa curfew at magnanakaw!'],
    ['Zzz... ang galing mo pala!', 'Pahinga muna tayo...'],
];

/**
 * Pure native Retina SVG + DOM 3D Fluffy Cloud Dream Bubble (zero WebGL mipmap blur, zero React 19 drei Html errors!).
 * Positioned at 60fps directly by DreamBubbleProjector inside PahingahanNode.
 */
function DreamCloudOverlay({ elRef, active }) {
    const [idx, setIdx] = useState(0);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (!active) return undefined;
        let fadeTimer = null;
        const cycle = setInterval(() => {
            setVisible(false);
            fadeTimer = setTimeout(() => {
                setIdx((prev) => (prev + 1) % DREAM_THOUGHTS.length);
                setVisible(true);
            }, 320);
        }, 5400);
        return () => {
            clearInterval(cycle);
            clearTimeout(fadeTimer);
        };
    }, [active]);

    if (!active) return null;

    const lines = DREAM_THOUGHTS[idx];

    return (
        <div
            ref={elRef}
            className="pointer-events-none select-none fixed top-0 left-0 z-10 will-change-transform"
            style={{ visibility: 'hidden' }}
        >
            <div
                className="transition-opacity duration-300 ease-out"
                style={{
                    opacity: visible ? 1 : 0,
                    animation: 'jqDreamCloudFloat 3.6s ease-in-out infinite',
                }}
            >
                <style>{`
                    @keyframes jqDreamCloudFloat {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-5px); }
                    }
                `}</style>
                <div className="relative w-[224px] sm:w-[258px] h-[112px] sm:h-[126px] flex items-center justify-center">
                    <svg
                        viewBox="0 0 320 160"
                        className="absolute inset-0 w-full h-full overflow-visible"
                        style={{ filter: 'drop-shadow(0 8px 14px rgba(15, 23, 42, 0.24))' }}
                        aria-hidden="true"
                    >
                        <defs>
                            <linearGradient id="jqCloudGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FFFFFF" />
                                <stop offset="56%" stopColor="#FAFBFD" />
                                <stop offset="82%" stopColor="#E6EEF8" />
                                <stop offset="100%" stopColor="#C8D7EA" />
                            </linearGradient>
                            <radialGradient id="jqDotGrad" cx="35%" cy="32%" r="68%">
                                <stop offset="0%" stopColor="#FFFFFF" />
                                <stop offset="62%" stopColor="#F1F5F9" />
                                <stop offset="100%" stopColor="#C5D5E8" />
                            </radialGradient>
                        </defs>
                        {/* Plush seamless fluffy 3D cloud silhouette */}
                        <g fill="url(#jqCloudGrad)">
                            <circle cx="52" cy="78" r="28" />
                            <circle cx="82" cy="52" r="30" />
                            <circle cx="130" cy="40" r="34" />
                            <circle cx="184" cy="40" r="34" />
                            <circle cx="234" cy="52" r="30" />
                            <circle cx="268" cy="78" r="28" />
                            <circle cx="238" cy="100" r="26" />
                            <circle cx="186" cy="104" r="28" />
                            <circle cx="132" cy="104" r="28" />
                            <circle cx="82" cy="98" r="25" />
                            <ellipse cx="160" cy="74" rx="108" ry="34" />
                        </g>
                        {/* Soft sunlit cotton highlights on upper domes */}
                        <g fill="#FFFFFF" opacity="0.68">
                            <ellipse cx="130" cy="24" rx="20" ry="8.5" />
                            <ellipse cx="184" cy="24" rx="20" ry="8.5" />
                            <ellipse cx="84" cy="38" rx="14" ry="6.5" />
                            <ellipse cx="234" cy="38" rx="14" ry="6.5" />
                        </g>
                        {/* 3 Plush 3D Cloudlet Trail Dots curving down toward the sleeping character */}
                        <circle cx="108" cy="130" r="9.5" fill="url(#jqDotGrad)" />
                        <circle cx="90" cy="144" r="6.8" fill="url(#jqDotGrad)" />
                        <circle cx="76" cy="154" r="4.5" fill="url(#jqDotGrad)" />
                    </svg>

                    <div className="relative z-10 px-6 pb-3.5 text-center">
                        <p className="text-[12.5px] sm:text-[14px] font-extrabold text-slate-900 leading-[1.28] tracking-[-0.01em] whitespace-nowrap">
                            {lines[0]}
                        </p>
                        <p className="text-[12.5px] sm:text-[14px] font-extrabold text-slate-900 leading-[1.28] tracking-[-0.01em] whitespace-nowrap">
                            {lines[1]}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

const TEXTURE_SLOTS = [
    'map',
    'bumpMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'aoMap',
    'alphaMap',
];

/**
 * Ensures every material texture in a freshly mounted/recovered WebGL2 context (including cached
 * useGLTF textures and regenerated 2D CanvasTextures) is flagged for GPU upload cleanly.
 */
function SceneTextureReuploadGuard({ generation }) {
    const { scene, gl } = useThree();

    useEffect(() => {
        const markTextures = () => {
            if (gl?.getContext?.()?.isContextLost?.()) return;
            const seen = new Set();
            scene.traverse((obj) => {
                if (!obj.isMesh && !obj.isSprite) return;
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const mat of mats) {
                    if (!mat) continue;
                    for (const slot of TEXTURE_SLOTS) {
                        const tex = mat[slot];
                        if (tex && tex.isTexture && tex.image && !seen.has(tex)) {
                            seen.add(tex);
                            tex.needsUpdate = true;
                        }
                    }
                }
            });
        };

        markTextures();
        const t1 = setTimeout(markTextures, 350);
        const t2 = setTimeout(markTextures, 1100);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [scene, gl, generation]);

    return null;
}

export default function WorldMapCanvas({
    maps = [],
    characterKey,
    currentMapNumber,
    startMapNumber,
    targetMapNumber,
    isWalking,
    isResting = false,
    allMapsCompleted = false,
    tourActive,
    guideStep = null,
    isSessionWaiting = false,
    hideScores = false,
    openedMapIds,
    unlockingMapId = null,
    lockScreenProjectorRef,
    paused = false,
    onEnterMap,
    onSelectPahingahan,
    onArrived,
    onTourCardChange,
    onTourFinish,
}) {
    const device = useMemo(() => getDeviceProfile(), []);
    const isMobileDevice = device.isMobile;
    const isLowEndDevice = device.isLowEnd;

    const [quality, setQuality] = useState(() => (isLowEndDevice ? 'low' : 'balanced'));
    const [contextLost, setContextLost] = useState(false);
    const [autoRecovering, setAutoRecovering] = useState(false);
    const [isTabVisible, setIsTabVisible] = useState(() =>
        typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
    );
    const [canvasKey, setCanvasKey] = useState(0);
    const controlsRef = useRef();
    const playerPosRef = useRef(new THREE.Vector3());
    const dreamBubbleElRef = useRef(null);
    const glCleanupRef = useRef(null);
    const glRef = useRef(null);
    const pendingRecoveryRef = useRef(false);
    const autoRecoverTimesRef = useRef([]);
    const recoverTimerRef = useRef(null);
    const curve = useMemo(() => createWorldCurve(), []);
    const lowQuality = quality === 'low';
    const S = WORLD_SCALE;
    const shadowSize = isMobileDevice ? 512 : 1024;
    // Scalar DPR in lowQuality guarantees genuine pixel reduction (vs [0.75, 1] clamping to 1.0 on 2x-3x budget phones!)
    const activeDpr = lowQuality
        ? guideStep !== null
            ? 0.6
            : 0.72
        : isMobileDevice
          ? [1, 1.25]
          : [1, 1.5];

    const triggerCleanRemount = useCallback(() => {
        clearTimeout(recoverTimerRef.current);
        glCleanupRef.current?.();
        glCleanupRef.current = null;
        glRef.current = null;
        pendingRecoveryRef.current = false;
        // Rebuild all procedural 2D CanvasTextures fresh so Android-evicted black canvases NEVER survive reload!
        resetPbrTextures();
        setContextLost(false);
        setAutoRecovering(false);
        setCanvasKey((k) => k + 1);
    }, []);

    const scheduleAutoRecoverIfNeeded = useCallback(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const ctxLostNow =
            pendingRecoveryRef.current || Boolean(glRef.current?.getContext?.()?.isContextLost?.());
        if (!ctxLostNow) return;

        const now = Date.now();
        autoRecoverTimesRef.current = autoRecoverTimesRef.current.filter((ts) => now - ts < 30000);
        if (autoRecoverTimesRef.current.length >= 3) {
            setAutoRecovering(false);
            setContextLost(true);
            return;
        }

        autoRecoverTimesRef.current.push(now);
        setAutoRecovering(true);
        clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = setTimeout(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            triggerCleanRemount();
        }, 180);
    }, [triggerCleanRemount]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        const onVisibilityOrFocus = () => {
            const visible = document.visibilityState !== 'hidden';
            setIsTabVisible(visible);
            if (visible) {
                // Brief settle for mobile GPU surface wakeup after returning from Messenger / another app
                clearTimeout(recoverTimerRef.current);
                recoverTimerRef.current = setTimeout(() => {
                    scheduleAutoRecoverIfNeeded();
                }, 160);
            }
        };

        document.addEventListener('visibilitychange', onVisibilityOrFocus);
        window.addEventListener('pageshow', onVisibilityOrFocus);
        window.addEventListener('focus', onVisibilityOrFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
            window.removeEventListener('pageshow', onVisibilityOrFocus);
            window.removeEventListener('focus', onVisibilityOrFocus);
        };
    }, [scheduleAutoRecoverIfNeeded]);

    useEffect(() => {
        return () => {
            clearTimeout(recoverTimerRef.current);
            glCleanupRef.current?.();
            glCleanupRef.current = null;
            glRef.current = null;
            resetPbrTextures();
        };
    }, []);

    const handleCanvasCreated = useCallback(
        ({ gl }) => {
            glCleanupRef.current?.();
            glRef.current = gl;
            const dom = gl.domElement;
            if (!dom) return;

            const onLost = (e) => {
                e.preventDefault();
                pendingRecoveryRef.current = true;
                setContextLost(true);
                if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
                    scheduleAutoRecoverIfNeeded();
                }
            };
            const onRestored = () => {
                // Always rebuild 2D canvas textures & remount cleanly because Android Chrome evicts 2D canvas pixels too
                pendingRecoveryRef.current = true;
                if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
                    scheduleAutoRecoverIfNeeded();
                }
            };

            dom.addEventListener('webglcontextlost', onLost, false);
            dom.addEventListener('webglcontextrestored', onRestored, false);
            glCleanupRef.current = () => {
                dom.removeEventListener('webglcontextlost', onLost, false);
                dom.removeEventListener('webglcontextrestored', onRestored, false);
            };
        },
        [scheduleAutoRecoverIfNeeded]
    );

    const handleReload3D = () => {
        autoRecoverTimesRef.current = [];
        triggerCleanRemount();
    };

    const effectivePaused = paused || !isTabVisible || contextLost;

    return (
        <div className="relative w-full h-full">
            <Canvas
                key={canvasKey}
                onCreated={handleCanvasCreated}
                frameloop={effectivePaused ? 'never' : 'always'}
                shadows={!lowQuality}
                dpr={activeDpr}
                gl={{
                    antialias: !isLowEndDevice,
                    powerPreference: isMobileDevice ? 'default' : 'high-performance',
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.15,
                }}
                camera={{ position: [-28 * S, 16, 26 * S], fov: 44, near: 0.5, far: 560 }}
                className="w-full h-full"
            >
            <SceneTextureReuploadGuard generation={canvasKey} />
            <color attach="background" args={['#8CD0F2']} />
            <fog attach="fog" args={['#CDEAF7', 74 * S, 200 * S]} />

            {!lowQuality && (
                <Sky
                    distance={650}
                    sunPosition={[34 * S, 26 * S, 28 * S]}
                    turbidity={4.6}
                    rayleigh={1.2}
                    mieCoefficient={0.004}
                    mieDirectionalG={0.78}
                />
            )}

            <PerformanceMonitor
                bounds={() => [28, 55]}
                flipflops={2}
                onDecline={() => setQuality('low')}
                onIncline={() => setQuality('balanced')}
            />

            {/* Balanced Daylight 3-Point Rig so buildings are bright, warm, and never crushed black */}
            <ambientLight intensity={0.48} color="#FFFBF0" />
            <hemisphereLight args={['#FFFDF5', '#4D7C2E', 1.05]} />
            <directionalLight
                position={[34 * S, 46 * S, 32 * S]}
                intensity={1.65}
                color="#FFF7E6"
                castShadow={!lowQuality}
                shadow-mapSize-width={shadowSize}
                shadow-mapSize-height={shadowSize}
                shadow-camera-left={-48 * S}
                shadow-camera-right={48 * S}
                shadow-camera-top={40 * S}
                shadow-camera-bottom={-40 * S}
                shadow-camera-far={240 * S}
                shadow-bias={-0.0004}
            />
            {/* Soft cool-warm front fill light eliminating black front-facade shadows */}
            <directionalLight position={[-30 * S, 24 * S, 38 * S]} intensity={0.55} color="#E0F2FE" />

            <TerrainAndWater lowQuality={lowQuality} />

            <SteppingStonePath
                curve={curve}
                maps={maps}
                lowQuality={lowQuality}
                playerPosRef={playerPosRef}
                tourActive={tourActive}
            />

            {maps.map((map) => (
                <MapLandmarkNode
                    key={map.id}
                    map={map}
                    currentMapNumber={currentMapNumber}
                    isSessionWaiting={isSessionWaiting}
                    hasBeenOpened={Boolean(openedMapIds?.has(map.id) || map.progress)}
                    isUnlocking={unlockingMapId === map.id}
                    lockScreenProjectorRef={lockScreenProjectorRef}
                    playerPosRef={playerPosRef}
                    onEnterMap={onEnterMap}
                    tourActive={tourActive}
                    guideActive={guideStep !== null}
                    hideScores={hideScores}
                    lowQuality={lowQuality}
                />
            ))}

            <PinoyBarrioProps lowQuality={lowQuality} playerPosRef={playerPosRef} tourActive={tourActive} />
            {/* Skip heavy multi-part background crowd (~180 draw calls) in lowQuality so budget phones stay 50-60 FPS */}
            {!lowQuality && <BarrioLivingWorld lowQuality={false} />}

            <PahingahanNode
                characterKey={characterKey}
                allCompleted={allMapsCompleted}
                isResting={isResting}
                tourActive={tourActive}
                guideActive={guideStep !== null}
                lowQuality={lowQuality}
                playerPosRef={playerPosRef}
                dreamBubbleElRef={dreamBubbleElRef}
                onSelectPahingahan={onSelectPahingahan}
            />

            <PlayerCharacter
                characterKey={characterKey}
                curve={curve}
                startMapNumber={startMapNumber ?? currentMapNumber}
                targetMapNumber={targetMapNumber}
                isWalking={isWalking}
                isResting={isResting}
                tourActive={tourActive}
                lowQuality={lowQuality}
                controlsRef={controlsRef}
                playerPosRef={playerPosRef}
                onArrived={onArrived}
            />

            <EnvironmentInstanced lowQuality={lowQuality} playerPosRef={playerPosRef} tourActive={tourActive} />

            <CameraRig
                controlsRef={controlsRef}
                tourActive={tourActive}
                guideStep={guideStep}
                isWalking={isWalking}
                startMapNumber={startMapNumber ?? currentMapNumber}
                onTourCardChange={onTourCardChange}
                onTourFinish={onTourFinish}
            />
        </Canvas>

        <DreamCloudOverlay
            elRef={dreamBubbleElRef}
            active={Boolean(isResting && !tourActive && guideStep === null && !paused)}
        />

        {contextLost && (
            <div className="absolute inset-0 z-30 bg-[#FAF8F5]/95 flex items-center justify-center p-6">
                <div className="max-w-xs w-full bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3.5 shadow-sm">
                    {autoRecovering ? (
                        <>
                            <div className="w-10 h-10 mx-auto rounded-xl bg-orange-50 border border-orange-200 text-[#C2410C] flex items-center justify-center">
                                <RotateCcw className="w-5 h-5 animate-spin" />
                            </div>
                            <h3 className="text-base font-bold text-stone-900">Ibinabalik ang 3D Mapa...</h3>
                            <p className="text-xs text-stone-600 leading-relaxed">
                                Sandali lang habang muling inihahanda ang 3D display ng device.
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-base font-bold text-stone-900">Napahinga ang 3D Mapa</h3>
                            <p className="text-xs text-stone-600 leading-relaxed">
                                Pansamantalang huminto ang 3D display ng device. Pindutin sa ibaba upang ibalik agad ang mapa.
                            </p>
                            <button
                                type="button"
                                onClick={handleReload3D}
                                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.99]"
                            >
                                <RotateCcw className="w-4 h-4" />
                                <span>I-reload ang 3D Mapa</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        )}
    </div>
    );
}
