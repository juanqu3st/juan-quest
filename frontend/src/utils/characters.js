/**
 * Central catalog of all 7 playable 3D Pixar-style characters in JuanQuest.
 */
export const PLAYABLE_CHARACTERS = [
    {
        key: 'juan',
        name: 'Juan Osong',
        shortName: 'Juan',
        role: 'Pangunahing Bida',
        modelUrl: '/models/juan.glb',
        portraitUrl: '/images/characters/juan.png',
        shirtColor: '#E6D8B8',
        pantsColor: '#8A5A36',
    },
    {
        key: 'pedro',
        name: 'Pedro',
        shortName: 'Pedro',
        role: 'Kuya ni Juan',
        modelUrl: '/models/pedro.glb',
        portraitUrl: '/images/characters/pedro.png',
        shirtColor: '#3F72B5',
        pantsColor: '#3B342D',
    },
    {
        key: 'maria',
        name: 'Maria',
        shortName: 'Maria',
        role: 'Dalagang Barrio',
        modelUrl: '/models/maria.glb',
        portraitUrl: '/images/characters/maria.png',
        shirtColor: '#FAF0E2',
        pantsColor: '#C84B2F',
    },
    {
        key: 'alkalde',
        name: 'Alkalde',
        shortName: 'Alkalde',
        role: 'Pinuno ng Bayan',
        modelUrl: '/models/alkalde.glb',
        portraitUrl: '/images/characters/alkalde.png',
        shirtColor: '#F5EFE1',
        pantsColor: '#252830',
    },
    {
        key: 'pulis',
        name: 'Pulis',
        shortName: 'Pulis',
        role: 'Bantay-Curfew',
        modelUrl: '/models/pulis.glb',
        portraitUrl: '/images/characters/pulis.png',
        shirtColor: '#1E3C6E',
        pantsColor: '#142646',
    },
    {
        key: 'guwardya',
        name: 'Guwardya',
        shortName: 'Guwardya',
        role: 'Sundalo ng Kuwartel',
        modelUrl: '/models/guwardya.glb',
        portraitUrl: '/images/characters/guwardya.png',
        shirtColor: '#49612A',
        pantsColor: '#374723',
    },
    {
        key: 'magnanakaw',
        name: 'Magnanakaw',
        shortName: 'Magnanakaw',
        role: 'Tuso sa Mapa 5',
        modelUrl: '/models/magnanakaw.glb',
        portraitUrl: '/images/characters/magnanakaw.png',
        shirtColor: '#2E333C',
        pantsColor: '#3D2E22',
    },
];

export const VALID_CHARACTER_KEYS = new Set(PLAYABLE_CHARACTERS.map((c) => c.key));

export function normalizeCharacterKey(key) {
    return VALID_CHARACTER_KEYS.has(key) ? key : 'juan';
}

export function getCharacterMeta(key) {
    const safeKey = normalizeCharacterKey(key);
    return PLAYABLE_CHARACTERS.find((c) => c.key === safeKey) || PLAYABLE_CHARACTERS[0];
}
