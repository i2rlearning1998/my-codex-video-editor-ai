// P3U: the admin page's own strings ([English, Hindi]). Kept apart from the
// user panel's so neither bundle carries the other's text.
const S = {
  'ad.title': ['Admin', 'एडमिन'],
  'ad.loading': ['Loading…', 'लोड हो रहा है…'],
  'ad.signin': ['Admin sign-in', 'एडमिन साइन-इन'],
  'ad.signinLead': [
    'This area is for the owner only. Every change you make is written to the audit log.',
    'यह जगह सिर्फ़ ओनर के लिए है। आपका हर बदलाव ऑडिट लॉग में लिखा जाता है।',
  ],
  'ad.email': ['Email', 'ईमेल'],
  'ad.password': ['Password', 'पासवर्ड'],
  'ad.signinBtn': ['Sign in', 'साइन इन'],
  'ad.signinBad': [
    'That email or password is not right.',
    'ईमेल या पासवर्ड सही नहीं है।',
  ],
  'ad.demo': [
    'Demo mode: this page runs on sample data. Nothing here touches real people or money.',
    'डेमो मोड: यह पेज सैंपल डेटा पर चलता है। असली लोगों या पैसों पर कुछ असर नहीं पड़ता।',
  ],
  'ad.demoHint': [
    'Demo sign-in: admin@example.test / admin-demo',
    'डेमो साइन-इन: admin@example.test / admin-demo',
  ],
  'ad.noServer': [
    'Admin needs the gateway server. It is not connected on this page.',
    'एडमिन के लिए गेटवे सर्वर चाहिए। इस पेज पर वह जुड़ा नहीं है।',
  ],
  'ad.signout': ['Sign out', 'साइन आउट'],
  'ad.nav.dashboard': ['Dashboard', 'डैशबोर्ड'],
  'ad.nav.users': ['People', 'लोग'],
  'ad.nav.flags': ['Flags', 'फ़्लैग'],
  'ad.nav.settings': ['Chat & memory', 'चैट और याद'],
  'ad.nav.audit': ['Audit log', 'ऑडिट लॉग'],
  'ad.nav.emergency': ['Emergency', 'इमरजेंसी'],
  'ad.nav.group.run': ['Run the platform', 'प्लैटफ़ॉर्म चलाएँ'],
  'ad.nav.group.control': ['Control', 'कंट्रोल'],
  'ad.nav.group.safety': ['Safety', 'सेफ़्टी'],
  'ad.lang': ['हिन्दी', 'English'],
  'ad.theme': ['Light / dark', 'लाइट / डार्क'],
  'ad.banner.on': [
    'Emergency switch is ON: {what}',
    'इमरजेंसी स्विच ON है: {what}',
  ],
  'ad.banner.open': ['Open', 'खोलें'],
  /* dashboard */
  'ad.dash.title': ['Dashboard', 'डैशबोर्ड'],
  'ad.dash.range7': ['7 days', '7 दिन'],
  'ad.dash.range30': ['30 days', '30 दिन'],
  'ad.dash.range90': ['90 days', '90 दिन'],
  'ad.dash.revenue': ['Revenue', 'कमाई'],
  'ad.dash.sold': ['Credits sold', 'बिके क्रेडिट'],
  'ad.dash.spent': ['Credits spent', 'खर्च हुए क्रेडिट'],
  'ad.dash.cost': ['Provider cost', 'प्रोवाइडर का खर्च'],
  'ad.dash.margin': ['Margin', 'मार्जिन'],
  'ad.dash.newUsers': ['New people', 'नए लोग'],
  'ad.dash.active': ['Active people', 'एक्टिव लोग'],
  'ad.dash.marginNote': [
    'Estimated from revenue and provider cost (rate: ₹{rate} per USD).',
    'कमाई और प्रोवाइडर खर्च से अनुमान (दर: ₹{rate} प्रति USD)।',
  ],
  'ad.dash.chart': [
    'Credits spent and provider cost by day',
    'दिन के हिसाब से खर्च हुए क्रेडिट और प्रोवाइडर खर्च',
  ],
  'ad.dash.credits': ['Credits', 'क्रेडिट'],
  'ad.dash.costUsd': ['Cost (USD)', 'खर्च (USD)'],
  'ad.dash.byModel': ['By model', 'मॉडल के हिसाब से'],
  'ad.dash.model': ['Model', 'मॉडल'],
  'ad.dash.calls': ['Calls', 'कॉल'],
  'ad.dash.error': [
    'The numbers could not be loaded.',
    'आँकड़े लोड नहीं हो सके।',
  ],
  /* users */
  'ad.users.title': ['People', 'लोग'],
  'ad.users.search': ['Search by email', 'ईमेल से खोजें'],
  'ad.users.allPlans': ['All plans', 'सभी प्लान'],
  'ad.users.allFlags': ['Any flag', 'कोई भी फ़्लैग'],
  'ad.users.email': ['Email', 'ईमेल'],
  'ad.users.plan': ['Plan', 'प्लान'],
  'ad.users.credits': ['Credits', 'क्रेडिट'],
  'ad.users.seen': ['Last seen', 'आख़िरी बार'],
  'ad.users.joined': ['Joined', 'जुड़े'],
  'ad.users.status': ['Status', 'स्थिति'],
  'ad.users.active': ['Active', 'एक्टिव'],
  'ad.users.suspended': ['Suspended', 'रोका गया'],
  'ad.users.never': ['Never', 'कभी नहीं'],
  'ad.users.empty': [
    'Nobody matches this search.',
    'इस खोज में कोई नहीं मिला।',
  ],
  'ad.users.more': ['Load more', 'और दिखाएँ'],
  'ad.users.count': ['{n} shown', '{n} दिख रहे हैं'],
  /* user detail */
  'ad.user.back': ['All people', 'सभी लोग'],
  'ad.user.balance': ['Balance', 'बैलेंस'],
  'ad.user.adjust': ['Adjust credits', 'क्रेडिट बदलें'],
  'ad.user.changePlan': ['Change plan', 'प्लान बदलें'],
  'ad.user.suspend': ['Suspend', 'रोकें'],
  'ad.user.unsuspend': ['Allow again', 'फिर से चालू करें'],
  'ad.user.flags': ['Flags', 'फ़्लैग'],
  'ad.user.ledger': ['Credit history', 'क्रेडिट का इतिहास'],
  'ad.user.payments': ['Payments', 'पेमेंट'],
  'ad.user.noPayments': ['No payments yet.', 'अभी कोई पेमेंट नहीं।'],
  'ad.user.refund': ['Refund', 'रिफ़ंड'],
  'ad.user.suspendedNote': [
    'This person is suspended. Their projects and credits are kept.',
    'यह व्यक्ति रोका गया है। उनके प्रोजेक्ट और क्रेडिट सुरक्षित हैं।',
  ],
  'ad.user.notFound': ['That person was not found.', 'वह व्यक्ति नहीं मिला।'],
  /* dialogs */
  'ad.dlg.reason': [
    'Reason (required, saved in the audit log)',
    'वजह (ज़रूरी, ऑडिट लॉग में सेव होगी)',
  ],
  'ad.dlg.reasonMissing': ['Write a reason first.', 'पहले वजह लिखें।'],
  'ad.dlg.cancel': ['Cancel', 'रद्द करें'],
  'ad.dlg.confirm': ['Confirm', 'पक्का करें'],
  'ad.dlg.delta': [
    'Credits to add (negative to take away)',
    'जोड़ने के क्रेडिट (घटाने के लिए माइनस)',
  ],
  'ad.dlg.deltaBad': [
    'Enter a whole number, not zero.',
    'पूरी संख्या लिखें, शून्य नहीं।',
  ],
  'ad.dlg.after': ['Balance after: {n}', 'बाद में बैलेंस: {n}'],
  'ad.dlg.plan': ['New plan', 'नया प्लान'],
  'ad.dlg.refundAmount': ['Refund the full payment', 'पूरा पेमेंट रिफ़ंड करें'],
  'ad.dlg.revoke': [
    'Also take back the credits this payment gave',
    'इस पेमेंट से मिले क्रेडिट भी वापस लें',
  ],
  'ad.dlg.typeConfirm': [
    'Type {word} to confirm',
    'पक्का करने के लिए {word} लिखें',
  ],
  'ad.dlg.typeBad': ['That does not match.', 'यह मेल नहीं खाता।'],
  'ad.done.credits': ['Credits changed.', 'क्रेडिट बदल गए।'],
  'ad.done.plan': ['Plan changed.', 'प्लान बदल गया।'],
  'ad.done.suspend': ['Done.', 'हो गया।'],
  'ad.done.refund': ['Refunded.', 'रिफ़ंड हो गया।'],
  'ad.done.flag': ['Flag updated.', 'फ़्लैग बदल गया।'],
  'ad.done.emergency': [
    'Emergency switches saved.',
    'इमरजेंसी स्विच सेव हो गए।',
  ],
  'ad.done.settings': ['Settings saved.', 'सेटिंग सेव हो गईं।'],
  /* flags */
  'ad.flags.title': ['Flags', 'फ़्लैग'],
  'ad.flags.lead': [
    'A flag turns something on for chosen people. Open a person to add or remove one.',
    'फ़्लैग चुने हुए लोगों के लिए कुछ चालू करता है। जोड़ने या हटाने के लिए किसी व्यक्ति को खोलें।',
  ],
  'ad.flags.users': ['{n} people', '{n} लोग'],
  'ad.flags.see': ['See them', 'उन्हें देखें'],
  'ad.flags.empty': ['No flags exist yet.', 'अभी कोई फ़्लैग नहीं है।'],
  /* audit */
  'ad.audit.title': ['Audit log', 'ऑडिट लॉग'],
  'ad.audit.lead': [
    'Every change, newest first. Each row is chained to the one before it, so an edit or a missing row is detected.',
    'हर बदलाव, नया ऊपर। हर पंक्ति पिछली से जुड़ी है, इसलिए एडिट या ग़ायब पंक्ति पकड़ी जाती है।',
  ],
  'ad.audit.ok': [
    'Chain verified: no row was changed or removed.',
    'चेन ठीक है: कोई पंक्ति बदली या हटी नहीं।',
  ],
  'ad.audit.bad': [
    'Chain BROKEN: a row was changed or removed.',
    'चेन टूटी है: कोई पंक्ति बदली या हटी है।',
  ],
  'ad.audit.seq': ['#', '#'],
  'ad.audit.at': ['When', 'कब'],
  'ad.audit.actor': ['Who', 'किसने'],
  'ad.audit.action': ['What', 'क्या'],
  'ad.audit.target': ['On', 'किस पर'],
  'ad.audit.detail': ['Detail', 'ब्यौरा'],
  'ad.audit.filter': [
    'Filter by action (for example credits)',
    'एक्शन से फ़िल्टर करें (जैसे credits)',
  ],
  'ad.audit.more': ['Older rows', 'पुरानी पंक्तियाँ'],
  'ad.audit.empty': ['No rows match.', 'कोई पंक्ति नहीं मिली।'],
  /* emergency */
  'ad.em.title': ['Emergency switches', 'इमरजेंसी स्विच'],
  'ad.em.lead': [
    'Use these only when something is wrong. Each one takes effect at once and is written to the audit log.',
    'इन्हें सिर्फ़ गड़बड़ी में इस्तेमाल करें। हर स्विच तुरंत लागू होता है और ऑडिट लॉग में लिखा जाता है।',
  ],
  'ad.em.ai': ['Stop all AI calls', 'सभी AI कॉल रोकें'],
  'ad.em.aiHelp': [
    'Every model call is refused. Credits are not touched.',
    'हर मॉडल कॉल मना होती है। क्रेडिट नहीं छुए जाते।',
  ],
  'ad.em.signups': ['Stop new sign-ups', 'नए साइन-अप रोकें'],
  'ad.em.signupsHelp': [
    'People who already have an account can still log in.',
    'जिनका अकाउंट है वे लॉग इन कर सकते हैं।',
  ],
  'ad.em.payments': ['Stop payments and top-ups', 'पेमेंट और टॉप-अप रोकें'],
  'ad.em.paymentsHelp': [
    'Checkout is closed. Existing credits still work.',
    'चेकआउट बंद। मौजूदा क्रेडिट काम करते रहते हैं।',
  ],
  'ad.em.message': [
    'Message people see (English)',
    'लोगों को दिखने वाला संदेश (English)',
  ],
  'ad.em.messageHi': [
    'Message people see (Hindi)',
    'लोगों को दिखने वाला संदेश (हिन्दी)',
  ],
  'ad.em.save': ['Save switches', 'स्विच सेव करें'],
  'ad.em.allClear': [
    'Everything is running normally.',
    'सब कुछ सामान्य चल रहा है।',
  ],
  'ad.em.on': ['ON', 'ON'],
  'ad.em.off': ['off', 'बंद'],
  'ad.em.what.ai': ['AI is off', 'AI बंद है'],
  'ad.em.what.signups': ['sign-ups are off', 'साइन-अप बंद हैं'],
  'ad.em.what.payments': ['payments are off', 'पेमेंट बंद हैं'],
  /* settings */
  'ad.set.title': ['Chat, pictures and memory', 'चैट, तस्वीरें और याद'],
  'ad.set.lead': [
    'You decide the limits. Nothing here is fixed in the code.',
    'सीमाएँ आप तय करते हैं। यहाँ कुछ भी कोड में तय नहीं है।',
  ],
  'ad.set.chat': ['Editor chat', 'एडिटर चैट'],
  'ad.set.chatOn': ['Chat is on', 'चैट चालू है'],
  'ad.set.chatMax': [
    'Messages per person per day',
    'हर व्यक्ति के रोज़ के संदेश',
  ],
  'ad.set.chatTokens': [
    'History kept per chat (tokens)',
    'हर चैट में रखा इतिहास (टोकन)',
  ],
  'ad.set.vision': ['Pictures in chat', 'चैट में तस्वीरें'],
  'ad.set.visionOn': [
    'People can attach pictures',
    'लोग तस्वीरें जोड़ सकते हैं',
  ],
  'ad.set.visionCredits': ['Credits per picture', 'हर तस्वीर के क्रेडिट'],
  'ad.set.visionMax': ['Pictures per message', 'हर संदेश में तस्वीरें'],
  'ad.set.memory': ['Project memory', 'प्रोजेक्ट की याद'],
  'ad.set.keep': [
    'Recent messages kept word for word',
    'शब्दशः रखे गए हाल के संदेश',
  ],
  'ad.set.sumAbove': [
    'Summarise when history passes (tokens)',
    'इतिहास इतना होने पर सार बनाएँ (टोकन)',
  ],
  'ad.set.facts': ['Facts kept per project', 'हर प्रोजेक्ट के तथ्य'],
  'ad.set.rules': ['Rules kept per Style', 'हर Style के नियम'],
  'ad.set.security': ['Security windows', 'सुरक्षा विंडो'],
  'ad.set.ttl': [
    'Plan check lasts (seconds)',
    'प्लान की जाँच इतने सेकंड चलती है',
  ],
  'ad.set.replay': [
    'Payment message replay window (seconds)',
    'पेमेंट संदेश रीप्ले विंडो (सेकंड)',
  ],
  'ad.set.save': ['Save settings', 'सेटिंग सेव करें'],
  'ad.set.bad': [
    'Numbers must be whole and not negative.',
    'संख्याएँ पूरी और शून्य या ज़्यादा हों।',
  ],
  'ad.set.costHint': [
    'Costs {n} credits for a message with {m} pictures.',
    '{m} तस्वीरों वाले संदेश का खर्च {n} क्रेडिट।',
  ],
  'ad.error': ['Something went wrong: {m}', 'कुछ गड़बड़ हुई: {m}'],
  'ad.retry': ['Try again', 'फिर कोशिश करें'],
} satisfies Record<string, readonly [string, string]>;

export type AdminKey = keyof typeof S;
let locale: 'en' | 'hi' = 'en';
export const adminLocale = () => locale;
export function setAdminLocale(l: 'en' | 'hi') {
  locale = l;
  document.documentElement.lang = l;
}
export function at(
  key: AdminKey,
  params: Record<string, string | number> = {},
): string {
  const pair = S[key];
  let s: string = (locale === 'hi' ? pair[1] : pair[0]) || pair[0];
  for (const [k, v] of Object.entries(params))
    s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export const ADMIN_STRINGS = S;
