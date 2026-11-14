// ROUND-A A4: the Studio tools' default forms, from the owner's Autodraft
// screenshots (briefs/ROUND-A.md, Part A4: the field lists are the spec).
// Every option list, limit and cost is a config value the owner edits in
// Admin; nothing here is read by code as a fixed rule. Default enabled tools:
// Image, Video, Story, SEO, Voice, Captions. The other tools stay in the
// config, switched off.
import type { z } from 'zod';
import type { PlatformConfig, studioSchema } from './schema';

type StudioIn = z.input<typeof studioSchema>;

type Studio = PlatformConfig['studios'][number];
type Field = NonNullable<Studio['inputs']>[number];
type LT = { en: string; hi?: string };
const L = (en: string, hi?: string): LT => (hi ? { en, hi } : { en });
const o = (
  value: string,
  label: LT,
  extra: { requires?: string[]; thumb?: string; preview?: string } = {},
) => ({ value, label, ...extra });
let order = 0;
const f = (
  id: string,
  type: Field['type'],
  label: LT,
  extra: Partial<Field> = {},
): Field => ({
  id,
  type,
  label,
  required: false,
  options: [],
  order: ++order,
  ...extra,
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TEN_MB = 10 * 1024 * 1024;

// ROUND-B B5: each language is written in its own script, in every UI language.
const LANGS_STORY = [
  o('en', L('English')),
  o('hi', L('हिन्दी')),
  o('mr', L('मराठी')),
  o('te', L('తెలుగు')),
  o('bn', L('বাংলা')),
  o('gu', L('ગુજરાતી')),
  o('ta', L('தமிழ்')),
  o('kn', L('ಕನ್ನಡ')),
];
const LANGS_SEO = [
  o('hi', L('हिन्दी')),
  o('bn', L('বাংলা')),
  o('mr', L('मराठी')),
  o('or', L('ଓଡ଼ିଆ')),
  o('te', L('తెలుగు')),
  o('en', L('English')),
  o('kn', L('ಕನ್ನಡ')),
  o('ml', L('മലയാളം')),
  o('ta', L('தமிழ்')),
];

/** Story ideas per category (the "template story ideas"). */
const IDEAS: Record<string, LT[]> = {
  animal: [
    L(
      'A clever crow finds water in a dry summer',
      'सूखी गर्मी में एक चतुर कौआ पानी ढूँढता है',
    ),
    L('The elephant who was afraid of a mouse', 'वह हाथी जो चूहे से डरता था'),
    L(
      'A lost puppy finds its way home in the rain',
      'बारिश में खोया पिल्ला घर का रास्ता ढूँढता है',
    ),
    L(
      'The tortoise and the hare race again',
      'कछुआ और खरगोश फिर से दौड़ते हैं',
    ),
    L(
      'A parrot who repeats only kind words',
      'एक तोता जो सिर्फ़ अच्छे शब्द दोहराता है',
    ),
    L('The monkey who shared his mangoes', 'वह बंदर जिसने अपने आम बाँटे'),
  ],
  family: [
    L(
      'Grandma’s secret recipe and the festival',
      'दादी की ख़ास रेसिपी और त्योहार',
    ),
    L(
      'Two brothers learn to share one bicycle',
      'दो भाई एक साइकिल बाँटना सीखते हैं',
    ),
    L('A father’s first day in a new city', 'नए शहर में पिता का पहला दिन'),
    L(
      'The family that planted one tree a year',
      'वह परिवार जो हर साल एक पेड़ लगाता था',
    ),
    L(
      'A daughter teaches her mother to read',
      'एक बेटी अपनी माँ को पढ़ना सिखाती है',
    ),
  ],
  horror: [
    L('The well that whispers at midnight', 'आधी रात को फुसफुसाने वाला कुआँ'),
    L(
      'A train station that is empty every night',
      'एक स्टेशन जो हर रात खाली रहता है',
    ),
    L('The old haveli and the locked room', 'पुरानी हवेली और बंद कमरा'),
    L(
      'Footsteps on the roof during the storm',
      'तूफ़ान में छत पर कदमों की आवाज़',
    ),
    L('A mirror that shows yesterday', 'एक आईना जो कल का दिखाता है'),
  ],
  fantasy: [
    L('A boy who can talk to the moon', 'एक लड़का जो चाँद से बात कर सकता है'),
    L('The magic pot that never empties', 'जादुई बर्तन जो कभी खाली नहीं होता'),
    L('A kingdom where colours were stolen', 'वह राज्य जहाँ रंग चुरा लिए गए'),
    L('The girl who found a dragon’s egg', 'वह लड़की जिसे ड्रैगन का अंडा मिला'),
    L(
      'A flying carpet that wants a holiday',
      'एक उड़ता क़ालीन जिसे छुट्टी चाहिए',
    ),
  ],
  moral: [
    L(
      'The honest woodcutter and the golden axe',
      'ईमानदार लकड़हारा और सोने की कुल्हाड़ी',
    ),
    L('Why the greedy dog lost his bone', 'लालची कुत्ते की हड्डी क्यों गई'),
    L('A small lie that grew too big', 'एक छोटा झूठ जो बहुत बड़ा हो गया'),
    L('The ant who helped the grasshopper', 'वह चींटी जिसने टिड्डे की मदद की'),
    L('Patience wins the village race', 'धैर्य गाँव की दौड़ जीतता है'),
  ],
  business: [
    L('A tea stall that became a brand', 'एक चाय की दुकान जो ब्रांड बन गई'),
    L(
      'Two friends start a small bakery',
      'दो दोस्त एक छोटी बेकरी शुरू करते हैं',
    ),
    L('The farmer who sold online', 'वह किसान जिसने ऑनलाइन बेचा'),
    L('Learning from a shop’s first loss', 'दुकान के पहले नुक़सान से सीख'),
    L(
      'A tailor who listened to every customer',
      'एक दर्ज़ी जो हर ग्राहक की सुनता था',
    ),
  ],
};
IDEAS.all = Object.values(IDEAS).flatMap((list) => list.slice(0, 2));

const VOICES = [
  o('aarav', L('Aarav · calm male', 'आरव · शांत पुरुष'), {
    preview: 'tone:aarav',
  }),
  o('diya', L('Diya · warm female', 'दिया · मधुर महिला'), {
    preview: 'tone:diya',
  }),
  o('kabir', L('Kabir · storyteller', 'कबीर · कहानीकार'), {
    preview: 'tone:kabir',
  }),
  o('meera', L('Meera · bright female', 'मीरा · चमकदार महिला'), {
    preview: 'tone:meera',
  }),
];

const base = (
  id: string,
  name: LT,
  output: Studio['output'],
  role: string,
  costId: string,
  inputs: Field[],
  extra: Partial<Studio> = {},
): Studio =>
  ({
    id,
    name,
    enabled: true,
    role,
    output,
    costId,
    inputs,
    groups: [],
    requires: [],
    workload: { units: 1 },
    order: 0,
    needsAssignment: false,
    ...extra,
  }) as Studio;

/** The six default tools (and their tabs). */
export function roundAStudios(): Studio[] {
  order = 0;
  const image = base(
    'images',
    L('Image Generation', 'इमेज बनाएँ'),
    'image',
    'studio-images',
    'image',
    [
      f('aspect', 'choice', L('Aspect ratio', 'आकार अनुपात'), {
        display: 'chips',
        required: true,
        default: '1:1',
        options: ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'].map((v) =>
          o(v, L(v)),
        ),
      }),
      f('look', 'choice', L('Style', 'स्टाइल'), {
        display: 'cards',
        default: 'none',
        options: [
          o('none', L('None', 'कोई नहीं')),
          o('dream', L('Dream Style', 'ड्रीम स्टाइल')),
          o('rural', L('Rural', 'ग्रामीण')),
          o('horror-2', L('Horror 2', 'हॉरर 2')),
          o('anime', L('Anime', 'एनीमे')),
          o('realistic', L('Realistic', 'असली जैसा')),
          o('3d', L('3D', '3D')),
          o('village-2', L('Village Style 2', 'गाँव स्टाइल 2')),
          o('3d-kids', L('3D Kids Animation Style', '3D किड्स एनिमेशन स्टाइल')),
          o('cartoon', L('Cartoon Style', 'कार्टून स्टाइल')),
          o('kids', L('Kids Animation Style', 'किड्स एनिमेशन स्टाइल')),
          o('village', L('Village Style', 'गाँव स्टाइल')),
        ],
      }),
      f('prompt', 'longtext', L('Prompt', 'प्रॉम्प्ट'), {
        required: true,
        maxLength: 2000,
        action: 'enhance',
        help: L(
          'Describe the picture you want.',
          'जो तस्वीर चाहिए उसका वर्णन करें।',
        ),
      }),
      f(
        'reference',
        'file',
        L('Use reference image', 'रेफ़रेंस इमेज इस्तेमाल करें'),
        {
          accept: IMAGE_TYPES,
          maxBytes: TEN_MB,
        },
      ),
      f('count', 'choice', L('Number of images', 'इमेज की संख्या'), {
        display: 'chips',
        required: true,
        default: '1',
        options: ['1', '2', '3', '4'].map((v) => o(v, L(v))),
      }),
      f('negative', 'longtext', L('Negative prompt', 'नेगेटिव प्रॉम्प्ट'), {
        group: 'advanced',
        maxLength: 1000,
        default:
          'blurry, low quality, distorted, extra fingers, watermark, text, cropped',
      }),
      f('strength', 'slider', L('Prompt strength', 'प्रॉम्प्ट की ताक़त'), {
        group: 'advanced',
        min: 1,
        max: 20,
        default: 7,
      }),
      f('seed', 'number', L('Seed (-1 = random)', 'सीड (-1 = कोई भी)'), {
        group: 'advanced',
        min: -1,
        max: 2147483647,
        default: -1,
      }),
      f('nsfw', 'slider', L('NSFW threshold', 'NSFW सीमा'), {
        group: 'advanced',
        min: 0,
        max: 100,
        default: 50,
      }),
    ],
    {
      family: 'image',
      familyName: L('Image', 'इमेज'),
      requires: ['studio-images'],
      workload: { countField: 'count', units: 1 },
      groups: [
        { id: 'advanced', label: L('Advanced', 'एडवांस्ड'), open: false },
      ],
      historyLabel: L('My generations', 'मेरी बनाई चीज़ें'),
      blurb: L('Pictures from a prompt.', 'प्रॉम्प्ट से तस्वीरें।'),
    },
  );
  const upload = (id: string, label: LT) =>
    f(id, 'file', label, {
      required: true,
      accept: IMAGE_TYPES,
      maxBytes: TEN_MB,
    });
  const upscale = base(
    'image-upscale',
    L('Upscale', 'बड़ा करें'),
    'image',
    'studio-image-upscale',
    'image',
    [upload('image', L('Image', 'इमेज'))],
    {
      family: 'image',
      familyName: L('Image', 'इमेज'),
      requires: ['studio-images'],
      needsAssignment: true,
    },
  );
  const removeBg = base(
    'image-remove-bg',
    L('Remove Background', 'बैकग्राउंड हटाएँ'),
    'image',
    'studio-image-remove-bg',
    'image',
    [upload('image', L('Image', 'इमेज'))],
    {
      family: 'image',
      familyName: L('Image', 'इमेज'),
      requires: ['studio-images'],
      needsAssignment: true,
    },
  );
  const story = base(
    'story',
    L('Story', 'कहानी'),
    'text',
    'studio-story',
    'story',
    [
      f('plot', 'longtext', L('Story plot', 'कहानी का प्लॉट'), {
        required: true,
        maxLength: 800,
      }),
      f('form', 'choice', L('Told as', 'कैसे सुनाएँ'), {
        display: 'toggle',
        required: true,
        default: 'narration',
        options: [
          o('dialogue', L('Dialogue', 'संवाद')),
          o('narration', L('Narration', 'नैरेशन')),
        ],
      }),
      f('language', 'choice', L('Language', 'भाषा'), {
        display: 'chips',
        required: true,
        default: 'hi',
        options: LANGS_STORY,
      }),
      f('category', 'choice', L('Category', 'श्रेणी'), {
        display: 'chips',
        default: 'all',
        options: [
          o('all', L('All', 'सभी')),
          o('animal', L('Animal', 'जानवर')),
          o('family', L('Family', 'परिवार')),
          o('horror', L('Horror', 'डरावनी')),
          o('fantasy', L('Magic/Fantasy', 'जादू/कल्पना')),
          o('moral', L('Moral', 'नैतिक')),
          o('business', L('Business', 'बिज़नेस')),
        ],
      }),
      f('ideas', 'ideas', L('Story ideas', 'कहानी के आइडिया'), {
        ideasFor: 'category',
        fills: 'plot',
        ideas: IDEAS,
        ideasShown: 4,
      }),
      f('duration', 'choice', L('Duration', 'अवधि'), {
        display: 'chips',
        required: true,
        default: '5',
        options: ['5', '10', '15', '20', '25', '30'].map((v) =>
          o(v, L(`${v} min`, `${v} मिनट`)),
        ),
      }),
    ],
    {
      blurb: L('A story in your language.', 'आपकी भाषा में कहानी।'),
      historyLabel: L('Generated history', 'बनी हुई कहानियाँ'),
    },
  );
  const video = base(
    'video',
    L('Video', 'वीडियो'),
    'video',
    'studio-video',
    'video-scene',
    [
      f('first', 'file', L('First frame', 'पहला फ़्रेम'), {
        accept: IMAGE_TYPES,
        maxBytes: TEN_MB,
        swapWith: 'last',
        help: L(
          'JPEG, PNG or WEBP, up to 10 MB.',
          'JPEG, PNG या WEBP, 10 MB तक।',
        ),
      }),
      f('last', 'file', L('Last frame', 'आख़िरी फ़्रेम'), {
        accept: IMAGE_TYPES,
        maxBytes: TEN_MB,
        help: L(
          'JPEG, PNG or WEBP, up to 10 MB.',
          'JPEG, PNG या WEBP, 10 MB तक।',
        ),
      }),
      f('prompt', 'longtext', L('Prompt', 'प्रॉम्प्ट'), {
        required: true,
        maxLength: 2000,
        action: 'generate',
      }),
      f('look', 'choice', L('Video style', 'वीडियो स्टाइल'), {
        display: 'cards',
        default: 'none',
        options: [
          o('none', L('None', 'कोई नहीं')),
          o('realistic', L('Realistic', 'असली जैसा')),
          o('village', L('Village', 'गाँव')),
          o('3d', L('3D', '3D')),
          o('anime', L('Anime', 'एनीमे')),
        ],
      }),
      f('resolution', 'choice', L('Resolution', 'रिज़ॉल्यूशन'), {
        display: 'chips',
        required: true,
        default: '720p',
        options: [
          o('480p', L('480p')),
          o('720p', L('720p')),
          o('1080p', L('1080p'), { requires: ['video-1080'] }),
        ],
      }),
      f('aspect', 'choice', L('Aspect', 'आकार'), {
        display: 'toggle',
        required: true,
        default: 'landscape',
        options: [
          o('landscape', L('Landscape', 'लैंडस्केप')),
          o('portrait', L('Portrait', 'पोर्ट्रेट')),
        ],
      }),
      f('duration', 'choice', L('Duration', 'अवधि'), {
        display: 'chips',
        required: true,
        default: '5',
        options: ['5', '7', '10'].map((v) => o(v, L(`${v} s`, `${v} सेकंड`))),
      }),
      f('audio', 'choice', L('Audio', 'ऑडियो'), {
        display: 'toggle',
        required: true,
        default: 'off',
        options: [o('on', L('On', 'चालू')), o('off', L('Off', 'बंद'))],
      }),
      f('sound', 'choice', L('Audio choice', 'ऑडियो का प्रकार'), {
        display: 'chips',
        default: 'ambient',
        showIf: { field: 'audio', in: ['on'] },
        options: [
          o('ambient', L('Ambient', 'आसपास की आवाज़')),
          o('music', L('Music', 'संगीत')),
          o('effects', L('Sound effects', 'साउंड इफ़ेक्ट')),
        ],
      }),
    ],
    {
      requires: ['studio-video'],
      toolId: 'ai-video',
      blurb: L(
        'A short clip from frames or a prompt.',
        'फ़्रेम या प्रॉम्प्ट से छोटा क्लिप।',
      ),
    },
  );
  const voiceFamily = { family: 'voice', familyName: L('Voice', 'आवाज़') };
  const voiceover = base(
    'voice',
    L('AI Voiceover', 'AI वॉइसओवर'),
    'audio',
    'studio-voice',
    'voice',
    [
      f('script', 'longtext', L('Script', 'स्क्रिप्ट'), {
        required: true,
        maxLength: 1500,
      }),
      f('voice', 'voice', L('Voice', 'आवाज़'), {
        required: true,
        default: 'aarav',
        options: VOICES,
      }),
      f('quality', 'choice', L('Quality', 'क्वालिटी'), {
        display: 'toggle',
        required: true,
        default: 'lite',
        options: [o('lite', L('Lite', 'लाइट')), o('pro', L('Pro', 'प्रो'))],
      }),
      f('emotion', 'choice', L('Emotion', 'भावना'), {
        display: 'chips',
        default: 'neutral',
        options: [
          o('neutral', L('Neutral', 'सामान्य')),
          o('happy', L('Happy', 'ख़ुश')),
          o('sad', L('Sad', 'उदास')),
          o('excited', L('Excited', 'उत्साहित')),
          o('calm', L('Calm', 'शांत')),
          o('angry', L('Angry', 'ग़ुस्सा')),
        ],
      }),
    ],
    {
      ...voiceFamily,
      requires: ['studio-voice'],
      workload: { textField: 'script', units: 1 },
      historyLabel: L('History', 'इतिहास'),
      blurb: L(
        'Narration, sounds and your own voice.',
        'नैरेशन, आवाज़ें और आपकी अपनी आवाज़।',
      ),
    },
  );
  const sound = base(
    'sfx',
    L('AI Sound', 'AI साउंड'),
    'audio',
    'studio-sfx',
    'sfx',
    [
      f('prompt', 'longtext', L('Describe the sound', 'आवाज़ का वर्णन करें'), {
        required: true,
        maxLength: 5000,
      }),
      f('seconds', 'choice', L('Duration', 'अवधि'), {
        display: 'chips',
        required: true,
        default: '5',
        options: ['3', '5', '10', '15', '22'].map((v) =>
          o(v, L(`${v} s`, `${v} सेकंड`)),
        ),
      }),
    ],
    { ...voiceFamily, requires: ['studio-audio'] },
  );
  const a2a = base(
    'voice-change',
    L('Audio to Audio', 'ऑडियो से ऑडियो'),
    'audio',
    'studio-voice-change',
    'voice-change',
    [
      f('sample', 'file', L('Your audio (MP3)', 'आपका ऑडियो (MP3)'), {
        required: true,
        accept: ['audio/mpeg', 'audio/mp3'],
        maxBytes: TEN_MB,
        help: L('MP3, up to 10 MB.', 'MP3, 10 MB तक।'),
      }),
      f('voice', 'voice', L('New voice', 'नई आवाज़'), {
        required: true,
        default: 'diya',
        options: VOICES,
      }),
      f('tips', 'info', L('Tips', 'सुझाव'), {
        lines: [
          L('Record in a quiet room.', 'शांत कमरे में रिकॉर्ड करें।'),
          L(
            'Speak clearly, one person at a time.',
            'साफ़ बोलें, एक समय में एक व्यक्ति।',
          ),
          L('Short clips change faster.', 'छोटे क्लिप जल्दी बदलते हैं।'),
        ],
      }),
    ],
    { ...voiceFamily, requires: ['studio-voice'] },
  );
  const clone = base(
    'voice-clone',
    L('Voice Clone', 'वॉइस क्लोन'),
    'audio',
    'studio-voice',
    'voice-clone',
    [
      f('how', 'info', L('How it works', 'यह कैसे काम करता है'), {
        lines: [
          L(
            '1. Upload a clear sample of your own voice.',
            '1. अपनी आवाज़ का साफ़ नमूना अपलोड करें।',
          ),
          L(
            '2. Confirm it is your voice or you have permission.',
            '2. पुष्टि करें कि यह आपकी आवाज़ है या आपके पास अनुमति है।',
          ),
          L(
            '3. The cloned voice joins your voices for voiceovers.',
            '3. क्लोन आवाज़ वॉइसओवर की आवाज़ों में जुड़ जाती है।',
          ),
        ],
      }),
      f('sample', 'file', L('Voice sample', 'आवाज़ का नमूना'), {
        required: true,
        accept: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'],
        maxBytes: TEN_MB,
      }),
      f('name', 'text', L('Name of the voice', 'आवाज़ का नाम'), {
        required: true,
        maxLength: 60,
      }),
    ],
    {
      ...voiceFamily,
      // Like its cost (voice-clone): a plan feature; the plan's voiceClones limit counts them.
      requires: ['voice-clone'],
      historyLabel: L('Cloned voices', 'क्लोन की गई आवाज़ें'),
      consent: L(
        'This is my own voice, or I have the speaker’s written permission.',
        'यह मेरी अपनी आवाज़ है, या मेरे पास बोलने वाले की लिखित अनुमति है।',
      ),
    },
  );
  const seo = base(
    'seo',
    L('SEO', 'SEO'),
    'text',
    'studio-seo',
    'seo',
    [
      f('title', 'text', L('Video title', 'वीडियो का शीर्षक'), {
        required: true,
        maxLength: 100,
      }),
      f('description', 'longtext', L('Description', 'विवरण'), {
        required: true,
        maxLength: 2000,
      }),
      f('language', 'choice', L('Language', 'भाषा'), {
        display: 'chips',
        required: true,
        default: 'hi',
        options: LANGS_SEO,
      }),
      f('category', 'choice', L('Category', 'श्रेणी'), {
        display: 'chips',
        required: true,
        default: 'moral',
        options: [
          o('moral', L('Moral', 'नैतिक')),
          o('rhymes', L('Rhymes', 'कविताएँ')),
          o('horror', L('Horror', 'डरावनी')),
          o('fantasy', L('Fantasy', 'कल्पना')),
          o('family', L('Family', 'परिवार')),
          o('animal', L('Animal', 'जानवर')),
        ],
      }),
      f('outputs', 'multi', L('Make', 'बनाएँ'), {
        required: true,
        display: 'chips',
        default: ['titles', 'description', 'tags', 'hashtags'],
        options: [
          o('titles', L('Titles', 'शीर्षक')),
          o('description', L('Description', 'विवरण')),
          o('tags', L('Tags', 'टैग')),
          o('hashtags', L('Hashtags', 'हैशटैग')),
        ],
      }),
    ],
    { blurb: L('Titles, tags and hashtags.', 'शीर्षक, टैग और हैशटैग।') },
  );
  // The list order is the Studio's order.
  return [
    image,
    upscale,
    removeBg,
    video,
    story,
    seo,
    voiceover,
    sound,
    a2a,
    clone,
  ].map((s, i) => layout({ ...s, order: i + 1 }));
}

/**
 * ROUND-B B5: where each field sits, after the reference screens: a controls
 * column on the left, a wide workspace on the right (the main input, the
 * action button with its cost, results and history, tips or an empty state).
 */
const LAYOUT: Record<
  string,
  { main: string[]; action: 'controls' | 'main'; empty?: [LT, LT] }
> = {
  images: { main: ['prompt', 'reference'], action: 'main' },
  'image-upscale': { main: ['image'], action: 'main' },
  'image-remove-bg': { main: ['image'], action: 'main' },
  video: {
    main: [],
    action: 'controls',
    empty: [
      L('Start creating now', 'अभी बनाना शुरू करें'),
      L(
        'Your video shows here when it is ready.',
        'तैयार होने पर आपका वीडियो यहाँ दिखेगा।',
      ),
    ],
  },
  story: {
    main: ['ideas'],
    action: 'controls',
    empty: [
      L('Craft a story in seconds', 'कुछ ही पल में कहानी बनाएँ'),
      L(
        'Pick an idea below or write your own plot on the left.',
        'नीचे से कोई आइडिया चुनें या बाईं ओर अपना प्लॉट लिखें।',
      ),
    ],
  },
  seo: {
    main: [],
    action: 'controls',
    empty: [
      L('Your SEO output awaits', 'आपका SEO नतीजा यहाँ आएगा'),
      L(
        'Add a title, description and category, then generate.',
        'शीर्षक, विवरण और श्रेणी भरें, फिर बनाएँ।',
      ),
    ],
  },
  voice: { main: ['script', 'voice', 'quality', 'emotion'], action: 'main' },
  sfx: { main: ['prompt', 'seconds'], action: 'main' },
  'voice-change': { main: ['sample', 'tips'], action: 'main' },
  'voice-clone': { main: ['sample', 'how'], action: 'main' },
};
function layout(s: Studio): Studio {
  const rule = LAYOUT[s.id];
  if (!rule) return s;
  return {
    ...s,
    actionPlace: rule.action,
    ...(rule.empty
      ? { emptyState: { title: rule.empty[0], text: rule.empty[1] } }
      : {}),
    inputs: s.inputs.map((x) =>
      rule.main.includes(x.id) ? { ...x, place: 'main' as const } : x,
    ),
  };
}

/**
 * The default Studio list: the Round A tools first, then every older tool
 * (kept in the config, switched off), except Captions, which stays on.
 */
export function withRoundAStudios(older: StudioIn[]): StudioIn[] {
  const fresh = roundAStudios();
  const ids = new Set(fresh.map((s) => s.id));
  return [
    ...fresh,
    ...older
      .filter((s) => !ids.has(s.id))
      .map((s) =>
        s.id === 'captions' ? { ...s, order: 90 } : { ...s, enabled: false },
      ),
  ];
}
