// ROUND-C2: the export card's words, by key, in English and Hindi. The
// card picks the host's language (getHostContext().locale).
const EN = {
  loading: 'Getting the video ready…',
  preparing: 'Preparing the media…',
  code: 'Drawing the code graphics on this device: {pct}%',
  rendering: 'Rendering on this device: {pct}% · about {left} left',
  cancel: 'Cancel',
  cancelled: 'Export cancelled. Nothing was counted.',
  done: 'Your video is ready. Press play, or download it.',
  download: 'Download',
  downloading: 'Saving…',
  noDownload:
    'This app cannot save files from here. Press and hold the video (or right-click it) to save it.',
  downloadFailed: 'The download did not start. Try again.',
  credits: 'Credits',
  noCredits: 'Credits: everything in this video is your own or made here.',
  failed: 'The export stopped: {why}',
  ended: 'This export has ended. Ask Claude to export the video again.',
  hidden: 'Keep this card on screen; the video renders on this device.',
  seconds: '{n} s',
  minutes: '{n} min',
} as const;
type Key = keyof typeof EN;
const HI: Partial<Record<Key, string>> = {
  loading: 'वीडियो तैयार हो रहा है…',
  preparing: 'मीडिया तैयार हो रहा है…',
  code: 'कोड ग्राफ़िक्स इस डिवाइस पर बन रहे हैं: {pct}%',
  rendering: 'इस डिवाइस पर बन रहा है: {pct}% · लगभग {left} बाकी',
  cancel: 'रद्द करें',
  cancelled: 'एक्सपोर्ट रद्द हुआ। कुछ नहीं गिना गया।',
  done: 'आपका वीडियो तैयार है। चलाएँ या डाउनलोड करें।',
  download: 'डाउनलोड',
  downloading: 'सेव हो रहा है…',
  noDownload:
    'यह ऐप यहाँ से फ़ाइल सेव नहीं कर सकता। सेव करने के लिए वीडियो को दबाकर रखें (या राइट-क्लिक करें)।',
  downloadFailed: 'डाउनलोड शुरू नहीं हुआ। फिर कोशिश करें।',
  credits: 'श्रेय',
  noCredits: 'श्रेय: इस वीडियो में सब कुछ आपका है या यहीं बना है।',
  failed: 'एक्सपोर्ट रुक गया: {why}',
  ended:
    'यह एक्सपोर्ट खत्म हो गया। Claude से वीडियो फिर से एक्सपोर्ट करने को कहें।',
  hidden: 'इस कार्ड को स्क्रीन पर रखें; वीडियो इसी डिवाइस पर बनता है।',
  seconds: '{n} से.',
  minutes: '{n} मि.',
};
export type CardKey = Key;
export function cardText(
  locale: string | undefined,
  key: Key,
  vars: Record<string, string | number> = {},
): string {
  const text = (locale?.startsWith('hi') && HI[key]) || EN[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
