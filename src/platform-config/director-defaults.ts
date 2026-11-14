// ROUND-B: the Director's default field library, video types and fixed
// lines. Sample values only: the owner edits every one of them in Admin.
// Code reads them as data; none is a fixed rule.
type LT = { en: string; hi?: string };
const L = (en: string, hi?: string): LT => (hi ? { en, hi } : { en });
const o = (value: string, en: string, hi?: string) => ({
  value,
  label: L(en, hi),
});

export interface FieldBlockIn {
  id: string;
  label: LT;
  help?: LT;
  type: 'text' | 'longtext' | 'choice' | 'file' | 'link';
  options?: { value: string; label: LT }[];
  /** Words in a first message that fill this block (value: words). */
  hints?: Record<string, string[]>;
  /** The Project style field that prefills it. */
  styleField?: 'voice' | 'music' | 'look' | 'captions' | 'script';
  youDecide?: boolean;
}
export interface VideoTypeIn {
  id: string;
  name: LT;
  keywords: string[];
  blocks: { id: string; required?: boolean }[];
}

export function defaultFieldLibrary(): {
  blocks: FieldBlockIn[];
  types: VideoTypeIn[];
  fallbackType: string;
} {
  return {
    fallbackType: 'general',
    blocks: [
      {
        id: 'topic',
        label: L('What is the video about?', 'वीडियो किस बारे में है?'),
        type: 'longtext',
        youDecide: false,
      },
      {
        id: 'script',
        label: L('Script', 'स्क्रिप्ट'),
        type: 'choice',
        options: [
          o('write', 'Write it for me', 'आप लिख दें'),
          o('mine', 'I will paste my script', 'मैं अपनी स्क्रिप्ट दूँगा'),
        ],
        styleField: 'script',
      },
      {
        id: 'language',
        label: L('Language', 'भाषा'),
        type: 'choice',
        options: [
          o('hi', 'हिन्दी'),
          o('en', 'English'),
          o('mr', 'मराठी'),
          o('bn', 'বাংলা'),
          o('ta', 'தமிழ்'),
          o('te', 'తెలుగు'),
          o('gu', 'ગુજરાતી'),
          o('kn', 'ಕನ್ನಡ'),
        ],
        hints: {
          hi: ['hindi', 'हिन्दी', 'हिंदी'],
          en: ['english', 'अंग्रेज़ी'],
          mr: ['marathi', 'मराठी'],
          bn: ['bengali', 'bangla'],
          ta: ['tamil'],
          te: ['telugu'],
          gu: ['gujarati'],
          kn: ['kannada'],
        },
      },
      {
        id: 'length',
        label: L('Length', 'लंबाई'),
        type: 'choice',
        options: [
          o('30', '30 seconds', '30 सेकंड'),
          o('60', '1 minute', '1 मिनट'),
          o('120', '2 minutes', '2 मिनट'),
          o('300', '5 minutes', '5 मिनट'),
        ],
        hints: {
          '30': ['30 sec', '30 second', '30 सेकंड', 'short'],
          '60': ['1 min', 'one minute', '60 sec', '1 मिनट'],
          '120': ['2 min', 'two minute', '2 मिनट'],
          '300': ['5 min', 'five minute', '5 मिनट'],
        },
      },
      {
        id: 'aspect',
        label: L('Format', 'फ़ॉर्मैट'),
        type: 'choice',
        options: [
          o('16:9', 'Wide 16:9', 'चौड़ा 16:9'),
          o('9:16', 'Vertical 9:16', 'खड़ा 9:16'),
          o('1:1', 'Square 1:1', 'चौकोर 1:1'),
        ],
        hints: {
          '9:16': ['vertical', 'reel', 'shorts', 'short', 'tiktok', '9:16'],
          '16:9': ['wide', 'landscape', 'youtube video', '16:9'],
          '1:1': ['square', '1:1'],
        },
      },
      {
        id: 'platform',
        label: L('Where will it be posted?', 'कहाँ पोस्ट होगा?'),
        type: 'choice',
        options: [
          o('youtube', 'YouTube'),
          o('shorts', 'YouTube Shorts'),
          o('instagram', 'Instagram'),
          o('whatsapp', 'WhatsApp'),
          o('class', 'A classroom', 'कक्षा'),
        ],
        hints: {
          youtube: ['youtube'],
          shorts: ['shorts'],
          instagram: ['instagram', 'insta', 'reel'],
          whatsapp: ['whatsapp'],
          class: ['class', 'students', 'कक्षा'],
        },
      },
      {
        id: 'voice',
        label: L('Voice', 'आवाज़'),
        type: 'choice',
        options: [
          o('tts', 'A narrator voice', 'नैरेटर की आवाज़'),
          o('mine', 'I will record it', 'मैं रिकॉर्ड करूँगा'),
          o('none', 'No voice', 'आवाज़ नहीं'),
        ],
        hints: {
          none: ['no voice', 'without voice', 'silent'],
          mine: ['my voice', 'i will record', 'मेरी आवाज़'],
        },
        styleField: 'voice',
      },
      {
        id: 'music',
        label: L('Music', 'संगीत'),
        type: 'choice',
        options: [
          o('calm', 'Calm', 'शांत'),
          o('upbeat', 'Upbeat', 'जोशीला'),
          o('none', 'No music', 'संगीत नहीं'),
        ],
        hints: {
          none: ['no music', 'without music'],
          calm: ['calm music', 'soft music'],
          upbeat: ['upbeat', 'energetic'],
        },
        styleField: 'music',
      },
      {
        id: 'look',
        label: L('Look', 'लुक'),
        type: 'choice',
        options: [
          o('clean', 'Clean and bright', 'साफ़ और उजला'),
          o('bold', 'Bold colours', 'गहरे रंग'),
          o('dark', 'Dark and cinematic', 'गहरा, सिनेमाई'),
        ],
        styleField: 'look',
      },
      {
        id: 'captions',
        label: L('Captions', 'कैप्शन'),
        type: 'choice',
        options: [o('on', 'On', 'चालू'), o('off', 'Off', 'बंद')],
        hints: {
          off: ['no captions', 'without captions'],
          on: ['captions', 'subtitles'],
        },
        styleField: 'captions',
      },
      {
        id: 'reference',
        label: L('A video or page like this', 'ऐसा कोई वीडियो या पेज'),
        help: L(
          'Paste a link, or attach a chapter photo or PDF.',
          'लिंक चिपकाएँ, या अध्याय की फ़ोटो या PDF जोड़ें।',
        ),
        type: 'link',
      },
      {
        id: 'characters',
        label: L('Characters', 'पात्र'),
        type: 'text',
      },
      {
        id: 'brand',
        label: L('Logo and brand', 'लोगो और ब्रांड'),
        type: 'choice',
        options: [
          o('kit', 'Use my brand', 'मेरा ब्रांड लगाएँ'),
          o('none', 'No brand', 'ब्रांड नहीं'),
        ],
      },
      {
        id: 'product',
        label: L('The product', 'प्रोडक्ट'),
        help: L(
          'Its name and what it does; attach photos or paste a link.',
          'नाम और काम; फ़ोटो जोड़ें या लिंक चिपकाएँ।',
        ),
        type: 'longtext',
        youDecide: false,
      },
      {
        id: 'recording',
        label: L('Your recording', 'आपकी रिकॉर्डिंग'),
        help: L(
          'Attach the video or audio you recorded.',
          'अपनी रिकॉर्ड की हुई वीडियो या ऑडियो जोड़ें।',
        ),
        type: 'file',
        youDecide: false,
      },
      {
        id: 'hook',
        label: L('Opening line', 'शुरुआती लाइन'),
        type: 'text',
      },
      {
        id: 'notes',
        label: L('Anything else', 'और कुछ'),
        type: 'longtext',
      },
    ],
    types: [
      {
        id: 'explainer',
        name: L('Explainer', 'एक्सप्लेनर'),
        keywords: [
          'explain',
          'how ',
          'why ',
          'what is',
          'समझा',
          'कैसे',
          'क्यों',
        ],
        blocks: [
          { id: 'topic', required: true },
          { id: 'language', required: true },
          { id: 'length', required: true },
          { id: 'script' },
          { id: 'voice' },
          { id: 'music' },
          { id: 'captions' },
          { id: 'aspect' },
          { id: 'reference' },
        ],
      },
      {
        id: 'lesson',
        name: L('Lesson from a chapter', 'अध्याय से पाठ'),
        keywords: [
          'chapter',
          'lesson',
          'class ',
          'syllabus',
          'ncert',
          'अध्याय',
          'पाठ',
        ],
        blocks: [
          { id: 'topic', required: true },
          { id: 'reference', required: true },
          { id: 'language', required: true },
          { id: 'length' },
          { id: 'voice' },
          { id: 'captions' },
        ],
      },
      {
        id: 'story',
        name: L('Story', 'कहानी'),
        keywords: ['story', 'tale', 'fable', 'कहानी', 'किस्सा'],
        blocks: [
          { id: 'topic', required: true },
          { id: 'characters' },
          { id: 'language', required: true },
          { id: 'length', required: true },
          { id: 'voice' },
          { id: 'music' },
          { id: 'captions' },
          { id: 'aspect' },
        ],
      },
      {
        id: 'product',
        name: L('Product video', 'प्रोडक्ट वीडियो'),
        keywords: [
          'product',
          'ad ',
          'advert',
          'promo',
          'sell',
          'launch',
          'प्रोडक्ट',
          'विज्ञापन',
        ],
        blocks: [
          { id: 'product', required: true },
          { id: 'platform', required: true },
          { id: 'length' },
          { id: 'aspect' },
          { id: 'brand' },
          { id: 'hook' },
          { id: 'music' },
          { id: 'voice' },
        ],
      },
      {
        id: 'short',
        name: L('Short', 'शॉर्ट'),
        keywords: ['short', 'reel', 'tiktok', 'शॉर्ट', 'रील'],
        blocks: [
          { id: 'topic', required: true },
          { id: 'hook' },
          { id: 'platform' },
          { id: 'language', required: true },
          { id: 'music' },
          { id: 'captions' },
        ],
      },
      {
        id: 'recording',
        name: L('From my recording', 'मेरी रिकॉर्डिंग से'),
        keywords: ['my recording', 'i recorded', 'my footage', 'रिकॉर्डिंग'],
        blocks: [
          { id: 'recording', required: true },
          { id: 'topic' },
          { id: 'captions' },
          { id: 'music' },
          { id: 'brand' },
        ],
      },
      {
        id: 'general',
        name: L('General', 'सामान्य'),
        keywords: [],
        blocks: [
          { id: 'topic', required: true },
          { id: 'language', required: true },
          { id: 'length', required: true },
          { id: 'aspect' },
          { id: 'voice' },
          { id: 'music' },
          { id: 'notes' },
        ],
      },
    ],
  };
}

/** Director's fixed lines ({name} style variables are filled by code). */
export const DIRECTOR_LINES: Record<string, LT> = {
  'type.understood': L(
    'I understand this as: {type}.',
    'मैं इसे ऐसे समझा: {type}।',
  ),
  'brief.intro': L(
    'A few things I still need. Pick, type, or let me decide.',
    'कुछ बातें और चाहिए। चुनें, लिखें, या मुझ पर छोड़ दें।',
  ),
  'brief.known': L('What I understood', 'मैंने क्या समझा'),
  'brief.styled': L(
    'This project already has a style, so I will follow it.',
    'इस प्रोजेक्ट का स्टाइल तय है, मैं उसी पर चलूँगा।',
  ),
  'plan.intro': L(
    'Here is the plan. Nothing is spent until you approve.',
    'यह रहा प्लान। आपकी मंज़ूरी तक कुछ ख़र्च नहीं होगा।',
  ),
  'plan.restate': L(
    'You want: {what}. I will make {scenes} scenes, about {seconds} seconds.',
    'आप चाहते हैं: {what}। मैं {scenes} सीन बनाऊँगा, लगभग {seconds} सेकंड।',
  ),
  'plan.rewritesLeft': L(
    'Plan rewrites left for this video: {n}.',
    'इस वीडियो के लिए बचे प्लान बदलाव: {n}।',
  ),
  'plan.noRewrites': L(
    'This video has used all its plan rewrites. Approve this plan or edit a scene.',
    'इस वीडियो के सभी प्लान बदलाव हो चुके। यह प्लान मंज़ूर करें या कोई सीन बदलें।',
  ),
  'assets.intro': L(
    'The plan needs these files. Choose how to get each one.',
    'प्लान को ये फ़ाइलें चाहिए। हर एक कैसे मिलेगी, चुनें।',
  ),
  'assets.none': L(
    'This plan needs no files from you. Ready to build.',
    'इस प्लान को आपसे कोई फ़ाइल नहीं चाहिए। बनाने को तैयार।',
  ),
  'build.start': L('Building on the canvas.', 'कैनवस पर बना रहा हूँ।'),
  'build.done': L(
    'Done. {scenes} scenes are on the canvas. {credits} credits used.',
    'हो गया। {scenes} सीन कैनवस पर हैं। {credits} क्रेडिट लगे।',
  ),
  'build.cancelled': L(
    'Build cancelled. Nothing was kept and every credit is back.',
    'बनाना रोका गया। कुछ नहीं रखा गया, सारे क्रेडिट वापस।',
  ),
  'build.failed': L(
    'The build failed. Nothing was kept and every credit is back.',
    'बनाना विफल रहा। कुछ नहीं रखा गया, सारे क्रेडिट वापस।',
  ),
  'build.busy': L(
    'I am building now. I will read this when the build ends.',
    'अभी बना रहा हूँ। बनते ही इसे पढ़ूँगा।',
  ),
  'style.filled': L(
    "This is the project's first video, so I saved its look, voice and music as the project's style.",
    'यह प्रोजेक्ट का पहला वीडियो है, इसलिए इसका लुक, आवाज़ और संगीत प्रोजेक्ट के स्टाइल में सेव किया।',
  ),
  'kind.question': L('Answering your question', 'आपके सवाल का जवाब'),
  'kind.selection': L(
    'A small change to what you selected',
    'चुनी हुई चीज़ में छोटा बदलाव',
  ),
  'kind.scene': L('Work on this scene', 'इस सीन पर काम'),
  'kind.newScene': L('A new scene', 'नया सीन'),
  'kind.newVideo': L('A new video', 'नया वीडियो'),
  'newVideo.ask': L(
    'Make this a new video in this project?',
    'क्या इसे इस प्रोजेक्ट में नया वीडियो बनाएँ?',
  ),
  'unsure.ask': L(
    'I am not sure what you mean. Which one?',
    'मैं ठीक से नहीं समझा। इनमें से कौन सा?',
  ),
  'cannot.make': L(
    'I cannot make that here. I can do one of these instead.',
    'यह मैं यहाँ नहीं बना सकता। इसकी जगह इनमें से कुछ कर सकता हूँ।',
  ),
  'handEdited.ask': L(
    'You changed "{layer}" by hand. May I change it too?',
    'आपने "{layer}" को हाथ से बदला है। क्या मैं भी इसे बदलूँ?',
  ),
  'locked.layer': L(
    '"{layer}" is locked. Unlock it in the editor first.',
    '"{layer}" लॉक है। पहले एडिटर में इसे अनलॉक करें।',
  ),
  'proposal.gone': L(
    'The layer this change was for is gone, so I cancelled it.',
    'जिस लेयर के लिए यह बदलाव था वह अब नहीं है, इसलिए इसे रद्द किया।',
  ),
  'scene.gone': L(
    'That scene is no longer in the video.',
    'वह सीन अब वीडियो में नहीं है।',
  ),
  'undo.seen': L(
    'I see you undid: {what}. I removed it from my notes.',
    'आपने यह बदलाव वापस लिया: {what}। मैंने इसे अपने नोट्स से हटाया।',
  ),
  'answer.scenes': L(
    'This video has {scenes} scenes and runs about {seconds} seconds.',
    'इस वीडियो में {scenes} सीन हैं और यह लगभग {seconds} सेकंड का है।',
  ),
  'answer.credits': L(
    'You have {credits} credits. Talking to me is free; I ask before anything costs credits.',
    'आपके पास {credits} क्रेडिट हैं। मुझसे बात करना मुफ़्त है; क्रेडिट लगने से पहले मैं पूछता हूँ।',
  ),
  'answer.can': L(
    'Select something and tell me what to change: text, colour, size, a picture. I can also add a scene, change the look, music or captions, or start a new video in this project.',
    'कुछ चुनें और बताएँ क्या बदलना है: टेक्स्ट, रंग, आकार, तस्वीर। मैं नया सीन जोड़ सकता हूँ, लुक, संगीत या कैप्शन बदल सकता हूँ, या इस प्रोजेक्ट में नया वीडियो शुरू कर सकता हूँ।',
  ),
  'answer.know': L(
    'Here is what I know about this video. {brief} It has {scenes} scenes on the canvas now.',
    'इस वीडियो के बारे में मुझे यह पता है। {brief} अभी कैनवस पर {scenes} सीन हैं।',
  ),
  'answer.selected': L('You have selected {what}.', 'आपने {what} चुना है।'),
  'chat.resume': L(
    'A new chat for the same video. I still have its sheet: {brief}',
    'उसी वीडियो की नई चैट। इसकी शीट मेरे पास है: {brief}',
  ),
  'assets.hint': L(
    'Choose how to get each file on the card above, then press Build the video.',
    'ऊपर के कार्ड में हर फ़ाइल का तरीका चुनें, फिर वीडियो बनाएँ दबाएँ।',
  ),
  'plan.hint': L(
    'Approve the plan above, or tell me what to change in it.',
    'ऊपर का प्लान मंज़ूर करें, या बताएँ उसमें क्या बदलना है।',
  ),
  'build.interrupted': L(
    'The build was interrupted before it finished. Nothing was kept. You can build again.',
    'बनाना बीच में रुक गया। कुछ नहीं रखा गया। आप फिर बना सकते हैं।',
  ),
  'drop.use': L(
    'I have "{name}". Use it in this scene?',
    'मेरे पास "{name}" है। इसे इस सीन में लगाएँ?',
  ),
  'paid.ask': L(
    'This needs a model call. It can cost up to {credits} credits.',
    'इसके लिए मॉडल को बुलाना होगा। इसमें अधिकतम {credits} क्रेडिट लग सकते हैं।',
  ),
  'style.hello': L(
    "Tell me what to change in this project's style: colours, fonts, voice, music, captions or a script rule. I only change the style, and only after you confirm.",
    'बताइए इस प्रोजेक्ट के स्टाइल में क्या बदलना है: रंग, फ़ॉन्ट, आवाज़, संगीत, कैप्शन या स्क्रिप्ट का नियम। मैं सिर्फ़ स्टाइल बदलता हूँ, और आपकी हाँ के बाद ही।',
  ),
  'style.restate': L(
    'Here is what would change. Nothing is saved until you apply it.',
    'यह बदलेगा। आपके लागू करने तक कुछ सेव नहीं होगा।',
  ),
  'style.unsure': L(
    'Which part of the style should change: colours, fonts, voice, music, captions or a script rule?',
    'स्टाइल का कौन-सा हिस्सा बदलना है: रंग, फ़ॉन्ट, आवाज़, संगीत, कैप्शन या स्क्रिप्ट का नियम?',
  ),
  'style.same': L(
    'The style already says that. Nothing to change.',
    'स्टाइल में यह पहले से है। बदलने को कुछ नहीं।',
  ),
  'style.applied': L(
    'Done. The project style is updated. Videos already made can take it in AI mode.',
    'हो गया। प्रोजेक्ट का स्टाइल बदल गया। बने हुए वीडियो इसे AI मोड में ले सकते हैं।',
  ),
  'style.discarded': L('Left as it was.', 'जैसा था वैसा रहने दिया।'),
  'style.only': L(
    'Here I only change the project style. To change a video, open it in AI mode.',
    'यहाँ मैं सिर्फ़ प्रोजेक्ट का स्टाइल बदलता हूँ। वीडियो बदलने के लिए उसे AI मोड में खोलें।',
  ),
  'newScene.narration': L(
    'This scene is about {idea}. Here is what matters most about it.',
    'यह सीन {idea} के बारे में है। इसमें सबसे ज़रूरी बात यह है।',
  ),
  'attach.tooBig': L(
    'That file is too big. The most is {n} MB.',
    'फ़ाइल बहुत बड़ी है। सीमा {n} MB है।',
  ),
  'attach.badType': L(
    'I cannot read that kind of file. Use a picture, PDF, text, audio or video.',
    'इस तरह की फ़ाइल मैं नहीं पढ़ सकता। तस्वीर, PDF, टेक्स्ट, ऑडियो या वीडियो दें।',
  ),
  'style.newAsk': L(
    "The project's style changed. Apply it to this video?",
    'प्रोजेक्ट का स्टाइल बदला है। क्या इसे इस वीडियो पर लगाएँ?',
  ),
};

/** ROUND-B B4: the Style chat's word lists (the owner's; samples here). */
export function defaultStyleChat(): {
  moods: { id: string; words: string[]; palette: string[] }[];
  fonts: string[];
} {
  return {
    moods: [
      {
        id: 'dark',
        words: ['dark', 'darker', 'night', 'गहरा', 'डार्क'],
        palette: ['#0f1220', '#f4f5fb', '#7c5cff', '#ffc857'],
      },
      {
        id: 'light',
        words: ['light', 'lighter', 'bright', 'white', 'हल्का', 'लाइट', 'उजला'],
        palette: ['#ffffff', '#1a1c23', '#5b37f0', '#ff8a3d'],
      },
      {
        id: 'warm',
        words: ['warm', 'warmer', 'sunset', 'गर्म'],
        palette: ['#fff4e6', '#3b1f0b', '#e8590c', '#f59f00'],
      },
      {
        id: 'cool',
        words: ['cool', 'cooler', 'ocean', 'ठंडा'],
        palette: ['#eef6ff', '#0b2545', '#1971c2', '#22b8cf'],
      },
      {
        id: 'pastel',
        words: ['pastel', 'soft', 'पेस्टल', 'नरम'],
        palette: ['#fdf6fb', '#40354a', '#b197fc', '#ffa8a8'],
      },
      {
        id: 'bold',
        words: ['bold', 'vivid', 'punchy', 'बोल्ड', 'चटक'],
        palette: ['#111111', '#ffffff', '#ff0054', '#ffbd00'],
      },
    ],
    fonts: [
      'Inter',
      'Poppins',
      'Noto Sans Devanagari',
      'Georgia',
      'Arial',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
      'Courier New',
    ],
  };
}
