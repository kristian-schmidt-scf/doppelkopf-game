# Doppelkopf

A fully playable, single-page browser implementation of [Doppelkopf](https://en.wikipedia.org/wiki/Doppelkopf), the classic German trick-taking card game, playable against three computer opponents. No build step, no dependencies — just open `index.html`.

## Play

Open [`index.html`](index.html) in any modern browser (double-click it, or serve the folder with any static file server) and click **Start Match**.

## Features

- Full 48-card double deck, standard Doppelkopf trump hierarchy
- Hidden Re/Kontra teams — determined by who holds the Queen(s) of Clubs, revealed at round end
- Enforced follow-suit rules, with illegal cards greyed out in your hand
- Three CPU opponents with simple but competent strategy (leading aces, feeding points to a winning partner, taking tricks cheaply, discarding safely)
- Full scoring: 121+ card points to win for Re, bonus points for under-90/60/30/"schwarz" margins, and Doppelkopf bonuses for 40+ point tricks
- Running match scoreboard across rounds, round-summary breakdown, and an in-app rules/trump-order reference

### House rule variant included

This implementation uses the "highest trump" house rule variant popular in some regions: **both copies of the Ten of Hearts outrank even the Queen of Clubs** as the two highest trumps, with the rest of the Hearts suit (Ace, King, 9) remaining a plain suit. As a further quirk of this variant, when the two Tens of Hearts meet in the same trick, the **second** one played wins — the reverse of the normal rule where an identical first-played card beats a later duplicate.

Full current trump order (highest → lowest):

```
♥10, ♣Q, ♠Q, ♥Q, ♦Q, ♣J, ♠J, ♥J, ♦J, ♦A, ♦10, ♦K, ♦9
```

## Scope

This covers standard rounds (the majority of real Doppelkopf hands). Solos, marriages ("Hochzeit"), and Re/Kontra announcements are not implemented.

## Project structure

```
index.html   Page structure and rules blurb
style.css    Table/card visuals
script.js    Game engine, AI, rendering — no dependencies
```

## License

MIT — see [LICENSE](LICENSE).
