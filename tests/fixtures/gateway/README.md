Response bodies in the shape each provider documents (Anthropic Messages,
OpenAI Chat Completions, Gemini generateContent, xAI chat completions). They
were written by hand from the public API shapes, not captured from a live
call: no key and no network to these providers in P2-R1. The adapters are
tested on them only, so every real model stays `tested: false`.
