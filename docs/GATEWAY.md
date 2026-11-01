# Model gateway (P2-R1)

`src/gateway` is the one place that calls an AI model. It is plain
TypeScript: no DOM, no storage API and no network of its own, so the same code
runs in the browser now (with the offline mock) and on a server later (with
real keys). Everything it charges, allows or refuses comes from the Platform
Config (docs/PLATFORM-CONFIG.md).

## Pieces

| File                                                                               | What it does                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                                                                         | `GatewayRequest`, `Usage`, `ProviderAdapter`, `GatewayError` (a code plus one plain sentence).                                                                                                                                                                                                                                                                                 |
| `adapters/mock.ts`                                                                 | Deterministic offline model. Same input, same answer; tokens = characters / 4. Fails on request: `error`, `timeout`, `rate-limit`, `bad-json`.                                                                                                                                                                                                                                 |
| `adapters/anthropic.ts`, `openai.ts` (OpenAI, xAI, OpenAI-compatible), `google.ts` | Build the provider request and parse its answer. Header values are `secret:<keyRef>`; only a server transport may resolve them. Tested on response bodies in each provider's documented shape (`tests/fixtures/gateway`), not on live calls: every real model stays `tested: false`. Without a transport a call says "<Provider> is not connected. The server needs <keyRef>." |
| `cost.ts`                                                                          | Credits. Work credits (the owner's cost table) plus model credits = ceil(USD price of the tokens or media units × `creditMargin` × `creditRate`). `estimateDirector` gives min and max per scene and in total; `estimateStudio` for one Studio run.                                                                                                                            |
| `ledger.ts`                                                                        | Append-only credits ledger: grant, reserve, settle, refund, adjust. Every row has an idempotency key; the balance is the sum of the rows. `LedgerStore` is the storage seam (browser storage now).                                                                                                                                                                             |
| `checks.ts`                                                                        | `preCheck`: model (unknown, off, provider off, plan), tool (allow-list, off, plan, per-run cap), plan features, exports, voice clones, projects, storage, video budget, credits per day, calls per minute.                                                                                                                                                                     |
| `usage.ts`                                                                         | One row per call: model, role, credits, milliseconds, outcome (ok, failed, refused).                                                                                                                                                                                                                                                                                           |
| `gateway.ts`                                                                       | `run` (one call) and `startJob` (several calls under one reservation, for a whole video).                                                                                                                                                                                                                                                                                      |

## Credits rule (owner rule 3)

1. The cost is shown before anything runs (Plan card, Studio).
2. Approve reserves the maximum.
3. The end settles at what was really used (never more than was held); the
   difference comes back as its own `refund` row.
4. Any failure refunds the whole hold. Settling or refunding twice changes
   nothing.

## Putting real keys in later

Keys never go into the config or the browser. The config names them
(`providers[].keyRef`): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, `XAI_API_KEY`. A server sets those environment variables
and passes a `Transport` to the adapters; then the owner switches the provider
and its models on in Admin, replaces the sample prices, and marks a model
`tested` after a real run.
