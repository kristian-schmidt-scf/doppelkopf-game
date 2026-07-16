# Doppelkopf

A fully playable, single-page browser implementation of [Doppelkopf](https://en.wikipedia.org/wiki/Doppelkopf), the classic German trick-taking card game, playable against three computer opponents. No build step, no dependencies — just open `index.html`.

## Play

Open [`index.html`](index.html) in any modern browser (double-click it, or serve the folder with any static file server) and click **Start Match**.

## Features

- Full 48-card double deck, standard Doppelkopf trump hierarchy
- Hidden Re/Kontra teams — determined by who holds the Queen(s) of Clubs. A player's team is revealed
  individually (not their partner's) the moment they play a ♣Q or make an announcement; everyone is
  revealed at round end regardless
- Enforced follow-suit rules, with illegal cards greyed out in your hand
- Three named CPU opponents (Herbert, Gisela, Dieter) with simple but competent strategy (leading aces, feeding points to a winning partner, taking tricks cheaply, discarding safely) — and the judgment to call their own announcements
- **Ansagen (announcements)** per the German tournament rules: call "Re"/"Kontra" while still holding 11+ cards to raise the round's stakes by 2 points, then escalate with "keine 90/60/30" or "schwarz" as your hand allows, each paying off with +1 if you called it and it holds up
- Full scoring: 121+ card points to win for Re, bonus points for under-90/60/30/"schwarz" margins, Doppelkopf bonuses for 40+ point tricks, plus the announcement bonuses above
- Running match scoreboard across rounds, round-summary breakdown, and an in-app rules/trump-order reference

### House rule variant included

This implementation uses the "highest trump" house rule variant popular in some regions: **both copies of the Ten of Hearts outrank even the Queen of Clubs** as the two highest trumps, with the rest of the Hearts suit (Ace, King, 9) remaining a plain suit. As a further quirk of this variant, when the two Tens of Hearts meet in the same trick, the **second** one played wins — the reverse of the normal rule where an identical first-played card beats a later duplicate.

Full current trump order (highest → lowest):

```
♥10, ♣Q, ♠Q, ♥Q, ♦Q, ♣J, ♠J, ♥J, ♦J, ♦A, ♦10, ♦K, ♦9
```

## Scope

This covers standard rounds (the majority of real Doppelkopf hands) plus Ansagen. Solos and marriages ("Hochzeit") are not implemented.

## Project structure

```
index.html   Page structure and rules blurb
style.css    Table/card visuals
script.js    Game engine, AI, rendering — no dependencies
```

## License

MIT — see [LICENSE](LICENSE).
