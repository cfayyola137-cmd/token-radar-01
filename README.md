[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cfayyola137-cmd/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/cfayyola137-cmd/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

A token launch radar for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01): it reads a sealed snapshot of every protocol DefiLlama tracks, ranks the ones whose token does not exist yet by an implied value, and tells you how to farm each one before its token drops.

## What the board shows

- **200 ranked rows** — every protocol on the snapshot's watchlist (TVL ≥ $50M, no token) plus the strongest candidates below the floor, ranked by implied value.
- **Implied value** — derived from each row's own figures: `TVL × base multiple × category multiplier × growth multiplier × urgency factor`, where growth uses the 7-day TVL change and urgency rises the younger a protocol runs with no token. No hardcoded names anywhere.
- **Confidence tiers** — high / medium / low, from how complete a row's fields are.
- **Farm plans** — 3–5 concrete steps per protocol with estimated cost ranges and durations, templated per category.

## The dashboard

A static page (no framework, no network): sortable columns, search, category and chain filters, a summary header with total TVL at stake and median implied value, and a detail drawer per protocol with the valuation breakdown and the farm steps.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, the dashboard's `data.js`, the dashboard and its screenshots, and the judge's `dossier.json` into the output directory.

## License

MIT — see [LICENSE](LICENSE).
