import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { PLAYABLE_CHARACTERS, normalizeCharacterKey } from '../../utils/characters';

/**
 * Clean, responsive Character Picker modal displaying all 7 playable 3D Pixar-style characters
 * with real 3D portrait renders and warm Filipino storybook styling.
 */
export default function CharacterPickerModal({ open, selectedKey, onSelect, onClose }) {
    const activeKey = normalizeCharacterKey(selectedKey);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[70] bg-stone-950/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Pumili ng Karakter"
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-2xl bg-[#FAF8F5] border-t sm:border border-stone-200/90 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[86dvh] flex flex-col"
                    >
                        <div className="sm:hidden pt-2.5 flex justify-center">
                            <div className="w-10 h-1 rounded-full bg-stone-300" />
                        </div>

                        {/* Header */}
                        <div className="px-5 py-4 border-b border-stone-200/90 flex items-center justify-between gap-3 bg-white/80">
                            <div>
                                <h2 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                                    Pumili ng Karakter
                                </h2>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    Piliin kung sino ang maglalakbay sa 3D mundo ng JuanQuest
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Isara"
                                className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* 7-Character Grid */}
                        <div className="p-4 sm:p-5 overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                                {PLAYABLE_CHARACTERS.map((char) => {
                                    const isActive = char.key === activeKey;
                                    return (
                                        <button
                                            key={char.key}
                                            type="button"
                                            onClick={() => {
                                                onSelect?.(char.key);
                                                onClose?.();
                                            }}
                                            className={`group relative rounded-2xl p-2.5 sm:p-3 text-center transition cursor-pointer flex flex-col items-center border-2 ${
                                                isActive
                                                    ? 'bg-orange-50/90 border-[#C2410C] shadow-sm'
                                                    : 'bg-white border-stone-200/90 hover:border-[#C2410C]/50 hover:bg-[#FAF5EB]'
                                            }`}
                                        >
                                            {isActive && (
                                                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#C2410C] text-white inline-flex items-center justify-center shadow-xs">
                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                </span>
                                            )}

                                            <div
                                                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-[1.03] ${
                                                    isActive ? 'bg-[#F2E6D0]' : 'bg-[#F4EFE6]'
                                                }`}
                                            >
                                                <img
                                                    src={char.portraitUrl}
                                                    alt={char.name}
                                                    draggable={false}
                                                    className="w-full h-full object-contain select-none"
                                                />
                                            </div>

                                            <div className="mt-2 text-xs sm:text-[13px] font-extrabold text-stone-900 leading-tight">
                                                {char.name}
                                            </div>
                                            <div className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-stone-500 leading-tight">
                                                {char.role}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
