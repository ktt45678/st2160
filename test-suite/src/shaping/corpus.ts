// Shaping corpus: curated subtitle text per script plus seeded random syllables.

export interface ShapingSuite {
  readonly name: string;
  /** OpenType script tag. */
  readonly script: string;
  readonly direction: 'ltr' | 'rtl';
  /** Files from fonts/manifest.json. */
  readonly fonts: readonly string[];
  readonly texts: readonly string[];
  readonly fuzz: {
    readonly ranges: readonly (readonly [number, number])[];
    readonly count: number;
  };
}

export const shapingSuites: readonly ShapingSuite[] = [
  {
    name: 'latin',
    script: 'latn',
    direction: 'ltr',
    fonts: ['Lato-Regular.ttf', 'SourceSans3-Regular.otf'],
    texts: [
      'The quick brown fox jumps over the lazy dog',
      'Office affluent ffi ffl fi fl ff',
      'AVATAR WAVE Tyrant LT AV To Yo Te Wa',
      'naïve café résumé façade',
      '“Quotes” — dashes – and…',
      '1/2 ½ 10:30 H₂O x²',
      // Decomposed on purpose (NFD, combining marks in non-canonical order for ộ).
      'e\u0301 a\u0308 o\u0302\u0323 n\u0303',
      'Tiếng Việt có dấu: Ả Ẫ ặ ữ',
      "Wait... what?! I-I didn't mean it!",
      'Привет, мир! Ёжик в тумане',
      'Γειά σου Κόσμε ΆΈΉ',
    ],
    fuzz: {
      ranges: [
        [0x41, 0x5a],
        [0x61, 0x7a],
        [0x300, 0x30f],
      ],
      count: 150,
    },
  },
  {
    name: 'arabic',
    script: 'arab',
    direction: 'rtl',
    fonts: ['Amiri-Regular.ttf', 'NotoNaskhArabic-Regular.ttf'],
    texts: [
      'السلام عليكم',
      'لا إله إلا الله',
      'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
      'مرحبا بالعالم ١٢٣',
      'می‌خواهم',
      'اردو زبان',
      'كـــتاب',
      'فِي الْبَيْتِ',
    ],
    fuzz: {
      ranges: [
        [0x621, 0x64a],
        [0x64b, 0x652],
      ],
      count: 300,
    },
  },
  {
    name: 'hebrew',
    script: 'hebr',
    direction: 'rtl',
    fonts: ['NotoSansHebrew-Regular.ttf'],
    texts: ['שלום עולם', 'בְּרֵאשִׁית בָּרָא אֱלֹהִים', 'עברית ותרגום'],
    fuzz: {
      ranges: [
        [0x5d0, 0x5ea],
        [0x5b0, 0x5bc],
      ],
      count: 200,
    },
  },
  {
    name: 'devanagari',
    script: 'deva',
    direction: 'ltr',
    fonts: ['NotoSansDevanagari-Regular.ttf'],
    texts: [
      'नमस्ते दुनिया',
      'क्षत्रिय ज्ञान श्री',
      'र्क र्‍क',
      'कि की कु कू कृ के कै को कौ',
      'द्ध द्व ह्म ह्य',
      'अर्द्ध',
      'स्त्री',
      'हिन्दी में अनुवाद',
    ],
    fuzz: {
      ranges: [
        [0x915, 0x939],
        [0x93e, 0x94d],
        [0x901, 0x903],
      ],
      count: 300,
    },
  },
  {
    name: 'bengali',
    script: 'beng',
    direction: 'ltr',
    fonts: ['NotoSansBengali-Regular.ttf'],
    texts: ['আমি বাংলায় গান গাই', 'ক্ষ জ্ঞ ন্ত্র র্ক', 'কি কী কু কূ কে কৈ কো কৌ'],
    fuzz: {
      ranges: [
        [0x995, 0x9b9],
        [0x9be, 0x9cd],
      ],
      count: 300,
    },
  },
  {
    name: 'tamil',
    script: 'taml',
    direction: 'ltr',
    fonts: ['NotoSansTamil-Regular.ttf'],
    texts: ['வணக்கம் உலகம்', 'க்ஷ ஸ்ரீ கொ கோ கௌ'],
    fuzz: {
      ranges: [
        [0xb95, 0xbb9],
        [0xbbe, 0xbcd],
      ],
      count: 200,
    },
  },
  {
    name: 'telugu',
    script: 'telu',
    direction: 'ltr',
    fonts: ['NotoSansTelugu-Regular.ttf'],
    texts: ['నమస్కారం ప్రపంచం', 'క్ష్మ స్త్ర'],
    fuzz: {
      ranges: [
        [0xc15, 0xc39],
        [0xc3e, 0xc4d],
      ],
      count: 200,
    },
  },
  {
    name: 'gujarati',
    script: 'gujr',
    direction: 'ltr',
    fonts: ['NotoSansGujarati-Regular.ttf'],
    texts: ['નમસ્તે દુનિયા', 'ક્ષ જ્ઞ શ્રી'],
    fuzz: {
      ranges: [
        [0xa95, 0xab9],
        [0xabe, 0xacd],
      ],
      count: 200,
    },
  },
  {
    name: 'sinhala',
    script: 'sinh',
    direction: 'ltr',
    fonts: ['NotoSansSinhala-Regular.ttf'],
    texts: ['ආයුබෝවන්', 'ශ්‍රී ලංකාව', 'ක්‍ෂ'],
    fuzz: {
      ranges: [
        [0xd9a, 0xdc6],
        [0xdcf, 0xddf],
        [0xdca, 0xdca],
      ],
      count: 200,
    },
  },
  {
    name: 'thai',
    script: 'thai',
    direction: 'ltr',
    fonts: ['NotoSansThai-Regular.ttf'],
    texts: ['สวัสดีชาวโลก', 'น้ำ ทำ กำ', 'ปู่ ญี่ปุ่น ฐ ฎ', 'ภาษาไทย'],
    fuzz: {
      ranges: [
        [0xe01, 0xe2e],
        [0xe31, 0xe3a],
        [0xe47, 0xe4e],
      ],
      count: 200,
    },
  },
  {
    name: 'khmer',
    script: 'khmr',
    direction: 'ltr',
    fonts: ['NotoSansKhmer-Regular.ttf'],
    texts: ['សួស្តីពិភពលោក', 'ភាសាខ្មែរ', 'ស្ត្រី ក្ស'],
    fuzz: {
      ranges: [
        [0x1780, 0x17a2],
        [0x17b6, 0x17c5],
        [0x17d2, 0x17d2],
      ],
      count: 300,
    },
  },
  {
    name: 'myanmar',
    script: 'mymr',
    direction: 'ltr',
    fonts: ['NotoSansMyanmar-Regular.ttf'],
    texts: ['မင်္ဂလာပါ', 'မြန်မာဘာသာ', 'ကြွ'],
    fuzz: {
      ranges: [
        [0x1000, 0x1021],
        [0x102b, 0x103e],
      ],
      count: 300,
    },
  },
  {
    name: 'cjk',
    script: 'hani',
    direction: 'ltr',
    fonts: ['NotoSansCJKjp-Regular.otf', 'NotoSansSC-SmokeSubset-Regular.ttf'],
    texts: [
      'こんにちは世界',
      '日本語のテキスト、句読点。「引用」',
      '漢字かなカナ ｶﾀｶﾅ',
      '안녕하세요 세계',
      '你好，世界！',
      '……！？（）',
    ],
    fuzz: {
      ranges: [
        [0x3041, 0x3096],
        [0x30a1, 0x30fa],
        [0x4e00, 0x4e80],
      ],
      count: 100,
    },
  },
];

/** mulberry32, so fuzz runs repeat exactly. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fuzzTexts(suite: ShapingSuite): string[] {
  const rand = mulberry32(2160 + suite.name.length);
  const out: string[] = [];
  for (let i = 0; i < suite.fuzz.count; i++) {
    const len = 2 + Math.floor(rand() * 7);
    let s = '';
    for (let j = 0; j < len; j++) {
      const range = suite.fuzz.ranges[Math.floor(rand() * suite.fuzz.ranges.length)];
      if (!range) throw new Error(`${suite.name}: empty fuzz ranges`);
      const [a, b] = range;
      s += String.fromCodePoint(a + Math.floor(rand() * (b - a + 1)));
    }
    out.push(s);
  }
  return out;
}
