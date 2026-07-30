import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * VYOM Studio — story style & memory store.
 * Pre-seeded with the दादाजी viral YouTube Shorts formula (from Claude + GPT
 * chat exports). Sent on every /api/story/* call via client.js withKeys().
 */

// ── Reference 1: जादुई मोबाइल (original gold-standard sample) ──
const REF_MOBILE = `दादाजी को एक दिन सड़क पर पड़ा हुआ अजीब मोबाइल मिला। मोबाइल पुराना था, लेकिन उसकी स्क्रीन अपने आप चमक रही थी। दादाजी ने जैसे ही उसे हाथ में उठाया, मोबाइल अपने आप चालू हो गया। स्क्रीन पर लिखा आया — "जो लिखोगे, वही सच होगा।" दादाजी घबरा गए। उन्होंने डरते-डरते मोबाइल में लिखा, "काश गाँव के सूखे खेतों में बारिश हो जाए…" अगले ही पल पूरे आसमान में काले बादल छा गए। तेज़ बारिश शुरू हो गई। सूखे खेत पानी से भर गए और कुछ ही देर में पूरे खेत हरी फसलों से लहराने लगे। दादाजी हैरान रह गए। फिर उन्होंने लिखा, "काश गरीबों के कच्चे घर पक्के हो जाएँ…" अगले ही पल पूरे गाँव के मिट्टी के घर बड़े सुंदर पक्के मकानों में बदल गए। लोगों के फटे पुराने कपड़े नए कपड़ों में बदल गए। पूरा गाँव खुशियों से भर गया। धीरे-धीरे दादाजी उस मोबाइल से लोगों की मदद करने लगे। किसी की बंद दुकान फिर से चल पड़ती, किसी के घर पैसे पहुँच जाते, किसी की गरीबी खत्म हो जाती। लोग कहने लगे, "दादाजी के पास जादुई मोबाइल है!" लेकिन एक लालची चोर छुपकर सब देख रहा था। एक रात जब दादाजी सो रहे थे, चोर चुपके से घर में घुसा और मोबाइल चुराकर भाग गया। पहले-पहले उसने भी अच्छे काम किए। उसने लिखा, "मेरे पास बहुत सारे पैसे आ जाएँ…" अगले ही पल उसके सामने पैसों के ढेर लग गए। फिर उसने लिखा, "मेरा छोटा घर बड़ा महल बन जाए…" और कुछ ही सेकंड में उसका घर चमचमाते महल में बदल गया। अब चोर का लालच बढ़ने लगा। एक दिन गुस्से में उसने मोबाइल पर लिखा, "गाँव का मुखिया बर्बाद हो जाए…" लेकिन अगले ही पल जोरदार चमक हुई। चोर का महल अचानक गायब होने लगा। उसके सारे पैसे हवा में उड़ गए। उसके नए कपड़े भी गायब हो गए और वह फिर से गरीब बनकर सड़क पर खड़ा रह गया। चोर डर गया। तभी मोबाइल उसके हाथ से उड़कर आसमान में ऊपर जाने लगा। चोर उसे पकड़ने के लिए पीछे भागा, लेकिन मोबाइल बादलों के बीच गायब हो गया। अगली सुबह दादाजी उदास बैठे थे। तभी अचानक आसमान में तेज़ रोशनी चमकी। वही मोबाइल चमकता हुआ नीचे आया और सीधे दादाजी के हाथों में आ गिरा। उसी समय आसमान से आवाज़ गूँजी — "यह ताकत सिर्फ अच्छे कामों के लिए है… लालच के लिए नहीं।" दादाजी मुस्कुराए और मोबाइल में कुछ लिखने लगे। उन्होंने लिखा कि यह मोबाइल उसके पास चला जाए जो मेरी इस वीडियो को लाइक और चैनल को सब्सक्राइब करे। तभी मोबाइल आसमान में उड़ा और गायब हो गया। अब यह उसी के पास जाएगा जो इस वीडियो को लाइक और चैनल को सब्सक्राइब करेगा।`

// ── Reference 2: मिट्टी वाली शक्ति (user-approved Claude output) ──
const REF_MITTI = `दादाजी जिस चीज़ को छूते, वह मिट्टी की बन जाती। पानी का गिलास उठाया तो मिट्टी का बन गया। कुर्सी पकड़ी तो वह भी मिट्टी की हो गई। खेत में फसल को हाथ लगाया तो बालियां मिट्टी जैसी सख्त हो गईं। गांव वाले डर गए। मुखिया चिल्लाया — "इस बूढ़े को गांव से निकालो!" बेटे ने भी दरवाज़ा बंद करते हुए कहा — "पिताजी, अब आप हमारे लिए मुसीबत बन गए हो।" दादाजी की आंखें भर आईं। वह चुपचाप जंगल की तरफ चले गए। एक पेड़ के नीचे बैठकर रोने लगे। तभी एक बाबा प्रकट हुए और बोले — "मिट्टी से डरते क्यों हो? दुनिया की हर नई शुरुआत मिट्टी से ही होती है। अब दूसरों की मदद के लिए हाथ बढ़ाओ।" इतना कहकर बाबा गायब हो गए। दादाजी गांव लौटे। एक गरीब का टूटा घर देखा — हाथ लगाया, दीवार मिट्टी बनी, और अगले ही पल मज़बूत नए घर में बदल गई। सूखे खेत को छुआ — मिट्टी से हरी फसल उग आई। एक-एक करके पूरे गांव की ज़िंदगी बदल गई। जिन लोगों ने दादाजी को मनहूस कहा था, वही अब उनके पीछे-पीछे घूमने लगे। लेकिन अगली सुबह दादाजी अकेले बैठकर रो रहे थे — क्योंकि इतना सब करने के बाद भी आप लोगों ने अभी तक लाइक और सब्सक्राइब नहीं किया!`

// ── Reference 3: जादुई कैमरा (compressed GPT — ideal 50–60 sec length) ──
const REF_CAMERA = `दादाजी को एक दिन सड़क पर पड़ा हुआ अजीब कैमरा मिला। कैमरा पुराना था लेकिन उसकी लेंस चमक रही थी। दादाजी ने जैसे ही सूखे खेत की फोटो खींची, अगले ही पल पूरे खेत में हरी फसल लहराने लगी। फिर उन्होंने गरीबों के टूटे घरों की फोटो खींची और वे पक्के मकानों में बदल गए। पूरा गांव हैरान रह गया। अब दादाजी समझ गए कि जिस चीज़ की वह फोटो खींचते हैं, वह सच हो जाती है। लेकिन एक लालची आदमी छुपकर यह सब देख रहा था। एक रात वह कैमरा चुरा कर भाग गया। उसने सोने की फोटो खींची तो उसके सामने सोने का ढेर लग गया। फिर उसने महल की फोटो खींची और उसका घर महल बन गया। लेकिन जैसे ही उसने गांव की सारी दौलत मांगनी चाही, कैमरा तेज चमकने लगा। उसका सोना गायब हो गया, महल भी गायब हो गया और कैमरा उसके हाथ से उड़कर आसमान में चला गया। अगली सुबह वही कैमरा उड़ता हुआ वापस दादाजी के हाथों में आ गिरा। आसमान से आवाज़ आई — "यह शक्ति सिर्फ अच्छे कामों के लिए है, लालच के लिए नहीं।" दादाजी मुस्कुराए और कैमरे से एक आखिरी फोटो खींची। फोटो में लिखा था — "यह कैमरा उसी के पास जाएगा जो इस वीडियो को लाइक और चैनल को सब्सक्राइब करेगा।" इतना कहते ही कैमरा आसमान में उड़कर गायब हो गया।`

export const DEFAULT_SAMPLE_STORY = [
  '=== REFERENCE 1: जादुई मोबाइल (primary gold template) ===',
  REF_MOBILE,
  '',
  '=== REFERENCE 2: मिट्टी वाली शक्ति (approved style) ===',
  REF_MITTI,
  '',
  '=== REFERENCE 3: जादुई कैमरा (ideal compressed length — 8 scenes) ===',
  REF_CAMERA,
].join('\n')

export const DEFAULT_STYLE_NOTES = `CHANNEL: दादाजी magical-object YouTube Shorts (Hindi Devanagari only).
TARGET: 50–60 seconds narration. ~400–500 Hindi words. ONE flowing paragraph (or max 2). Almost NO dialogue.

USER PROMPT (mental template for every generation):
"इस स्टोरी को ध्यान से पढ़ो और बिल्कुल इसी फॉर्मेट में मेरी एक नई स्क्रिप्ट जनरेट करो। आइडिया मैं थोड़ा बता देता हूं — इस आईडिया पर बढ़िया और मजेदार स्क्रिप्ट बना दो, बिल्कुल इसी स्टाइल में।"

VIRAL FORMULA — follow EXACTLY, 8 scenes only (fewer = easier AI video):

1. HOOK (0–5s): Start IN the action. NEVER "एक गाँव में एक दादाजी रहते थे…"
   ✅ "दादाजी को सड़क पर अजीब मोबाइल मिला…" / "दादाजी जिस चीज़ को छूते वह मिट्टी बन जाती…"

2. MAGIC DISCOVERY (5–12s): Odd object OR power appears.
   Objects: जादुई मोबाइल, घड़ा, चिराग+जिन्न, लॉकेट, कैमरा, घंटी, चाबी, सूटकेस।
   Powers: छूने से बदलाव, सोच सच होना, लिखने से सच होना, फोटो खींचने से सच होना।

3. QUICK PROOF (12–20s): 2 fast demos. "काश बारिश हो" → बारिश। "गिलास छुआ" → मिट्टी।

4. VILLAGE HELP (20–35s): Selfless use — गरीबों के घर, सूखे खेत, स्कूल, बच्चों के खिलौने, टूटी सड़क, बीमार जानवर। Power used for OTHERS, never selfishly.

5. VILLAIN (35–45s): लालची चोर / साहूकार watches hidden → steals magic at night → uses for gold, महल, गाड़ी → greed grows.

6. PUNISHMENT (45–50s): Magic backfires. सोना गायब, महल टूटा, object flies to sky. Lesson: "लालच के लिए नहीं।"

7. MAGIC RETURNS (50–55s): दादाजी उदास → आसमान में तेज रोशनी → object flies back to dadaji's hands. Optional voice from sky.

8. LIKE & SUBSCRIBE ENDING — pick ONE:
   • Type A: "अब यह जादुई चीज़ उसी के पास जाएगी जो इस वीडियो को लाइक और चैनल को सब्सक्राइब करेगा।" → object flies away.
   • Type B (emotional — preferred for touch-power stories): "दादाजी अकेले बैठकर रो रहे थे क्योंकि इतना अच्छा काम करने के बाद भी आप लोगों ने लाइक और सब्सक्राइब नहीं किया।"

TOUCH-POWER VARIANT (when idea is छूने से बदलाव):
- Village rejects dadaji (मुखिया + बेटा दरवाज़ा बंद).
- Dadaji walks to jungle alone, cries under tree.
- बाबा / साधु appears: "जिसे दुनिया श्राप समझती है वही वरदान है" — teach to help with good intent.
- Return to village → transform broken homes/fields through touch.

WRITING RULES:
- Simple Hindi. Fast events. Skip "थोड़ी देर बाद" — jump beat to beat in 1–2 sentences.
- Almost no dialogue; occasional "दादाजी बोले —" only.
- No bullet points, no scene headers, no English words in story text.
- No filler adjectives. Rural Indian village. Emotional + wonder tone.
- Villain MUST be punished. Magic MUST return to dadaji. Ending MUST have like/subscribe twist.
- Match REFERENCE 3 (कैमरा) length when unsure — shortest approved version.`

const useStoryStyleStore = create(
  persist(
    (set, get) => ({
      sampleStory: DEFAULT_SAMPLE_STORY,
      styleNotes: DEFAULT_STYLE_NOTES,
      language: 'hindi',
      enableSampleStory: true,
      enableStyleNotes: true,

      rememberedProjects: [],
      memoryLimit: 8,
      includeMemoryInPrompt: true,

      setSampleStory: (v) => set({ sampleStory: v }),
      setStyleNotes: (v) => set({ styleNotes: v }),
      setLanguage: (v) => set({ language: v }),
      setEnableSampleStory: (v) => set({ enableSampleStory: v }),
      setEnableStyleNotes: (v) => set({ enableStyleNotes: v }),
      setMemoryLimit: (v) => set({ memoryLimit: v }),
      setIncludeMemoryInPrompt: (v) => set({ includeMemoryInPrompt: v }),

      rememberProject: (entry) => set((state) => {
        if (!entry || !entry.idea) return state
        const list = state.rememberedProjects || []
        const next = [
          { id: entry.id || `mem_${Date.now()}`, idea: entry.idea, summary: entry.summary || '', provider: entry.provider || '', createdAt: entry.createdAt || new Date().toISOString() },
          ...list.filter((p) => p.idea !== entry.idea),
        ].slice(0, state.memoryLimit || 8)
        return { rememberedProjects: next }
      }),

      forgetProject: (id) => set((state) => ({
        rememberedProjects: state.rememberedProjects.filter((p) => p.id !== id),
      })),

      clearMemory: () => set({ rememberedProjects: [] }),

      resetStyle: () => set({
        sampleStory: DEFAULT_SAMPLE_STORY,
        styleNotes: DEFAULT_STYLE_NOTES,
        language: 'hindi',
        enableSampleStory: true,
        enableStyleNotes: true,
        rememberedProjects: [],
        includeMemoryInPrompt: true,
        memoryLimit: 8,
      }),
    }),
    {
      name: 'vyom-story-style',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          return {
            ...persisted,
            sampleStory: DEFAULT_SAMPLE_STORY,
            styleNotes: DEFAULT_STYLE_NOTES,
            language: persisted.language || 'hindi',
            enableSampleStory: true,
            enableStyleNotes: true,
          }
        }
        return persisted
      },
      partialize: (state) => ({
        sampleStory: state.sampleStory,
        styleNotes: state.styleNotes,
        language: state.language,
        enableSampleStory: state.enableSampleStory,
        enableStyleNotes: state.enableStyleNotes,
        rememberedProjects: state.rememberedProjects,
        memoryLimit: state.memoryLimit,
        includeMemoryInPrompt: state.includeMemoryInPrompt,
      }),
    }
  )
)

export default useStoryStyleStore
