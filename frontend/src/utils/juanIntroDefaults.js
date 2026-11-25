// Shared default Intro (5 steps) & Outro (4 steps) script + audio definitions for Juan Osong.

export const JUAN_INTRO_DEFAULTS = [
    {
        id: 1,
        subtitle: 'Maligayang Pagdating',
        defaultAudio: '/audio/tutorial/step1.mp3',
        defaultText: 'Uy, buti nakarating ka! Ako si Juan Osong. Tara, sasamahan kita sa laro natin ngayon!',
        visual: 'welcome',
        cta: 'Susunod',
    },
    {
        id: 2,
        subtitle: 'Mga Mapa at Iskor',
        defaultAudio: '/audio/tutorial/step2.mp3',
        defaultText: 'May limang mapa tayong dadaanan dito. Sampung puntos bawat isa, kaya pwedeng umabot ng singkwenta ang iskor mo!',
        visual: 'maps',
        cta: 'Susunod',
    },
    {
        id: 3,
        subtitle: 'Paano Maglaro',
        defaultAudio: '/audio/tutorial/step3.mp3',
        defaultText: 'Simple lang ang gagawin sa bawat mapa. Panoorin muna ang maikling video, basahin ang panuto, tapos sagutin ang mga tanong.',
        visual: 'flow',
        cta: 'Susunod',
    },
    {
        id: 4,
        subtitle: 'Mga Puso at Oras',
        defaultAudio: '/audio/tutorial/step4.mp3',
        defaultText: 'May tatlong puso ka sa bawat mapa bilang taga-ligtas. Kapag nagkamali ka, pwede kang gumamit ng isang puso para sumagot muli at makaiwas sa bawas ng puntos. Bantayan din ang oras!',
        visual: 'hearts',
        cta: 'Susunod',
    },
    {
        id: 5,
        subtitle: 'Handa na sa Hamon',
        defaultAudio: '/audio/tutorial/step5.mp3',
        defaultText: 'Ayos na! Pindutin mo lang ang Mapa 1 para magsimula. Kung nakalimutan mo, pindutin mo lang ang Gabay sa itaas anumang oras.',
        visual: 'start',
        cta: 'Magsimula na',
    },
];

export const JUAN_OUTRO_DEFAULTS = [
    {
        id: 1,
        subtitle: 'Tapos na ang Limang Mapa',
        defaultAudio: null,
        defaultText: 'Uy, ang galing mo! Natapos mo lahat ng limang mapa sa kuwento ko. Nakaya mo lahat ng hamon dito sa barrio!',
        visual: 'outro_maps',
        cta: 'Susunod',
    },
    {
        id: 2,
        subtitle: 'Aral ng Kuwento',
        defaultAudio: null,
        defaultText: 'Sana nag-enjoy ka at may natutunan ka rin. Tandaan mo, sa talino at tamang diskarte, kayang-kaya mong lutasin ang kahit anong problema.',
        visual: 'outro_lesson',
        cta: 'Susunod',
    },
    {
        id: 3,
        subtitle: 'Hanggang sa Susunod',
        defaultAudio: null,
        defaultText: 'Hanggang dito muna ang lakbay natin ngayon, kaibigan. Sa susunod na bagong kuwento ulit tayo magkikita ha!',
        visual: 'outro_next',
        cta: 'Susunod',
    },
    {
        id: 4,
        subtitle: 'Handa na ang Resulta',
        defaultAudio: null,
        defaultText: 'Salamat sa pagsama sa akin! Pindutin mo na ang susunod para makita ang resulta ng laro mo.',
        visual: 'outro_result',
        cta: 'Tingnan ang Resulta',
    },
];

function mergeVoiceoverSteps(defaults, customList) {
    const list = Array.isArray(customList) ? customList : [];
    return defaults.map((def, idx) => {
        const custom = list[idx] && typeof list[idx] === 'object' ? list[idx] : null;
        const customAudioPath =
            custom && typeof custom.audio_path === 'string' && custom.audio_path.trim() !== ''
                ? custom.audio_path.trim()
                : null;
        const customText =
            custom && typeof custom.text === 'string' && custom.text.trim() !== ''
                ? custom.text.trim()
                : null;

        return {
            ...def,
            customAudioPath,
            audio: customAudioPath || def.defaultAudio,
            isCustomAudio: Boolean(customAudioPath),
            text: customText || def.defaultText,
            isCustomText: Boolean(customText && customText !== def.defaultText),
        };
    });
}

/**
 * Merge optional teacher-customized Juan Intro voice-overs & dialogue lines with built-in defaults.
 */
export function resolveJuanIntroSteps(onboardingVoiceovers) {
    return mergeVoiceoverSteps(JUAN_INTRO_DEFAULTS, onboardingVoiceovers);
}

/**
 * Merge optional teacher-customized Juan Outro voice-overs & dialogue lines with built-in defaults.
 */
export function resolveJuanOutroSteps(outroVoiceovers, { isOfflineMode = false } = {}) {
    return mergeVoiceoverSteps(JUAN_OUTRO_DEFAULTS, outroVoiceovers).map((step, idx, arr) => {
        if (idx === arr.length - 1 && isOfflineMode) {
            return { ...step, cta: 'Kunin ang Result QR' };
        }
        return step;
    });
}
