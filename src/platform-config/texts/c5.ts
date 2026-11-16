// ROUND-C5 TEXTS, word for word from briefs/ROUND-C5.md (English), with the
// Hindi written for this round (listed in reports/ROUND-C5.md). Strings only.
export const C5_TEXTS = {
  'maintenance-default': {
    en: 'We are making things better and will be back soon. Your work is safe.',
    hi: 'हम चीज़ें बेहतर बना रहे हैं और जल्द लौटेंगे। आपका काम सुरक्षित है।',
  },
  'maintenance-refused': {
    en: 'We are updating the platform right now, so this cannot be saved yet. Nothing was lost. Please try again in a little while.',
    hi: 'हम अभी प्लेटफ़ॉर्म अपडेट कर रहे हैं, इसलिए यह अभी सेव नहीं हो सकता। कुछ भी खोया नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।',
  },
  'upload-too-big': {
    en: 'This file is {size}. The limit here is {limit}.',
    hi: 'यह फ़ाइल {size} की है। यहाँ सीमा {limit} है।',
  },
  'upload-wrong-type': {
    en: 'This kind of file cannot be used here. Use {types}.',
    hi: 'इस तरह की फ़ाइल यहाँ इस्तेमाल नहीं हो सकती। {types} इस्तेमाल करें।',
  },
  'video-needs-poster': {
    en: 'A video needs a picture to show while it loads. Add a poster.',
    hi: 'वीडियो लोड होते समय दिखाने के लिए एक तस्वीर चाहिए। एक पोस्टर जोड़ें।',
  },
  'slot-unused': {
    en: 'Nothing in the platform uses this picture any more.',
    hi: 'प्लेटफ़ॉर्म में अब कुछ भी इस तस्वीर का इस्तेमाल नहीं करता।',
  },
  'override-note-required': {
    en: 'Write a short note about why this person gets this, so you remember later.',
    hi: 'एक छोटा नोट लिखें कि इस व्यक्ति को यह क्यों मिल रहा है, ताकि बाद में आपको याद रहे।',
  },
  'override-expired': {
    en: 'This override has ended and is no longer used.',
    hi: 'यह ओवरराइड ख़त्म हो गया है और अब इस्तेमाल नहीं होता।',
  },
  'who-has-this-plan': {
    en: 'Included in the {plan} plan.',
    hi: '{plan} प्लान में शामिल है।',
  },
  'who-has-this-off': {
    en: 'Switched off for everyone right now.',
    hi: 'अभी सबके लिए बंद है।',
  },
  'who-has-this-rollout': {
    en: 'In the group that gets this first ({percent} percent).',
    hi: 'उस समूह में है जिसे यह पहले मिलता है ({percent} प्रतिशत)।',
  },
  'who-has-this-not-yet': {
    en: 'Not in the group that gets this yet.',
    hi: 'अभी उस समूह में नहीं है जिसे यह मिलता है।',
  },
  'feature-locked': {
    en: 'This is not part of your plan.',
    hi: 'यह आपके प्लान का हिस्सा नहीं है।',
  },
  'config-conflict': {
    en: 'Someone saved a newer version while you were editing. Reload to see it; your changes were not saved.',
    hi: 'आपके एडिट करते समय किसी ने नया वर्ज़न सेव कर दिया। उसे देखने के लिए रीलोड करें; आपके बदलाव सेव नहीं हुए।',
  },
} as const;
export type C5TextId = keyof typeof C5_TEXTS;

/** A C5 text in a language, with {name} values filled in. */
export function c5(
  id: C5TextId,
  lang: 'en' | 'hi' = 'en',
  vars: Record<string, string | number> = {},
): string {
  return C5_TEXTS[id][lang].replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}
