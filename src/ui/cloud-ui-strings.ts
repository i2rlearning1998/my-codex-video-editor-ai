// P2-R2 (P2B-38): the Phase 1 account slot's own strings. The slot is not
// mounted in the editor (D-349), so its words stay out of the editor bundle.
export const CLOUD_UI_STRINGS: Record<string, readonly [string, string]> = {
  'cloud.accountOf': ['Account: {email}', 'खाता: {email}'],
  'cloud.conflict': [
    'This project was saved from somewhere else since it was opened.',
    'खोलने के बाद यह प्रोजेक्ट कहीं और से सेव हुआ है।',
  ],
  'cloud.conflictAsk': [
    'This project was saved to the cloud from another tab or computer since you opened it. Save your version as a new cloud project? Nothing is overwritten.',
    'खोलने के बाद यह प्रोजेक्ट किसी दूसरे टैब या कंप्यूटर से क्लाउड में सेव हुआ है। अपना संस्करण नए क्लाउड प्रोजेक्ट के रूप में सेव करें? कुछ भी ओवरराइट नहीं होगा।',
  ],
  'cloud.conflictTitle': ['Saved somewhere else', 'कहीं और सेव हुआ'],
  'cloud.deleteAsk': [
    'Delete "{name}" from the cloud? Projects in this browser are not changed.',
    '"{name}" को क्लाउड से हटाएँ? इस ब्राउज़र के प्रोजेक्ट नहीं बदलेंगे।',
  ],
  'cloud.email': ['Email', 'ईमेल'],
  'cloud.failed': [
    'Cloud action failed: {error}. Your work is saved in this browser.',
    'क्लाउड काम विफल: {error}। आपका काम इस ब्राउज़र में सेव है।',
  ],
  'cloud.freeSpace': ['Free space', 'जगह खाली करें'],
  'cloud.freeSpaceAsk': [
    'Delete "{name}" from the cloud? No cloud project uses it.',
    '"{name}" को क्लाउड से हटाएँ? कोई क्लाउड प्रोजेक्ट इसका इस्तेमाल नहीं करता।',
  ],
  'cloud.freeSpaceDone': [
    '"{name}" was deleted from the cloud.',
    '"{name}" क्लाउड से हटा दी गई।',
  ],
  'cloud.freeSpaceIntro': [
    '{count} uploaded files ({size}) are not used by any of your cloud projects. Deleting one removes it from the cloud only; this browser keeps its copy.',
    '{count} अपलोड की गई फ़ाइलें ({size}) आपके किसी क्लाउड प्रोजेक्ट में इस्तेमाल नहीं होतीं। किसी को हटाने से वह सिर्फ़ क्लाउड से हटती है; इस ब्राउज़र में उसकी कॉपी रहती है।',
  ],
  'cloud.freeSpaceNone': [
    'Every uploaded file is used by one of your cloud projects.',
    'हर अपलोड की गई फ़ाइल आपके किसी क्लाउड प्रोजेक्ट में इस्तेमाल होती है।',
  ],
  'cloud.freeSpaceTitle': [
    'Free space in the cloud',
    'क्लाउड में जगह खाली करें',
  ],
  'cloud.google': ['Continue with Google', 'Google से जारी रखें'],
  'cloud.googleOff': [
    'Google sign-in is not set up for this editor yet.',
    'इस एडिटर में अभी Google साइन-इन सेट नहीं है।',
  ],
  'cloud.logIn': ['Log in', 'लॉग इन'],
  'cloud.logInHint': [
    'Log in to save projects to the cloud',
    'प्रोजेक्ट क्लाउड में सेव करने के लिए लॉग इन करें',
  ],
  'cloud.logInIntro': [
    'Log in to keep your projects and media on the server and open them on another computer. Your work in this browser stays as it is.',
    'अपने प्रोजेक्ट और मीडिया सर्वर पर रखने और दूसरे कंप्यूटर पर खोलने के लिए लॉग इन करें। इस ब्राउज़र का काम वैसा ही रहेगा।',
  ],
  'cloud.logInOrSignUp': ['Log in or sign up', 'लॉग इन या साइन अप'],
  'cloud.logInTitle': ['Log in', 'लॉग इन'],
  'cloud.logOut': ['Log out', 'लॉग आउट'],
  'cloud.needCredentials': [
    'Type your email and a password of at least 8 characters.',
    'अपना ईमेल और कम से कम 8 अक्षर का पासवर्ड लिखें।',
  ],
  'cloud.newerSchema': [
    'This cloud project was saved by a newer editor (version {version}). It was not opened, and it is not changed.',
    'यह क्लाउड प्रोजेक्ट नए एडिटर (संस्करण {version}) से सेव हुआ है। इसे खोला नहीं गया और बदला नहीं गया।',
  ],
  'cloud.noProjects': [
    'No cloud projects yet. Use Save to cloud first.',
    'अभी कोई क्लाउड प्रोजेक्ट नहीं। पहले क्लाउड में सेव करें।',
  ],
  'cloud.notConfigured': [
    'Cloud save is not set up on this computer. Local saving works as before.',
    'इस कंप्यूटर पर क्लाउड सेव सेट नहीं है। लोकल सेव पहले जैसा काम करता है।',
  ],
  'cloud.open': ['Open from cloud', 'क्लाउड से खोलें'],
  'cloud.openOne': ['Open', 'खोलें'],
  'cloud.openTitle': ['Your cloud projects', 'आपके क्लाउड प्रोजेक्ट'],
  'cloud.opened': [
    'Opened "{name}" from the cloud.',
    '"{name}" क्लाउड से खुल गया।',
  ],
  'cloud.openedMissing': [
    'Opened from the cloud, but {count} media files could not be downloaded; they show as missing.',
    'क्लाउड से खुला, पर {count} मीडिया फ़ाइलें डाउनलोड नहीं हुईं; वे गायब दिखेंगी।',
  ],
  'cloud.password': [
    'Password (at least 8 characters)',
    'पासवर्ड (कम से कम 8 अक्षर)',
  ],
  'cloud.saveAsNew': ['Save as new', 'नए के रूप में सेव करें'],
  'cloud.saved': [
    'Saved "{name}" to the cloud.',
    '"{name}" क्लाउड में सेव हो गया।',
  ],
  'cloud.savedMissing': [
    'Saved to the cloud, but {count} media files are not in this browser and were not uploaded.',
    'क्लाउड में सेव हुआ, पर {count} मीडिया फ़ाइलें इस ब्राउज़र में नहीं हैं, इसलिए अपलोड नहीं हुईं।',
  ],
  'cloud.saving': ['Saving to the cloud…', 'क्लाउड में सेव हो रहा है…'],
  'cloud.signUp': ['Create account', 'खाता बनाएँ'],
  'cloud.signedOut': [
    'Logged out. Your projects in this browser are still here.',
    'लॉग आउट हो गया। इस ब्राउज़र के प्रोजेक्ट यहीं हैं।',
  ],
  'cloud.sizeKb': ['{size} KB', '{size} KB'],
  'cloud.sizeMb': ['{size} MB', '{size} MB'],
  'cloud.unreachable': [
    'The cloud server cannot be reached. Your work is saved in this browser.',
    'क्लाउड सर्वर तक नहीं पहुँच पा रहे। आपका काम इस ब्राउज़र में सेव है।',
  ],
  'cloud.uploading': [
    'Uploading media {done} of {total}…',
    'मीडिया अपलोड {done} / {total}…',
  ],
};
