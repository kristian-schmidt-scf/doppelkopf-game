"use strict";

/* ============================== CONSTANTS ============================== */

const SUITS = ["C", "S", "H", "D"];
const RANKS = ["9", "10", "J", "Q", "K", "A"];
const SUIT_SYMBOL = { C: "♣", S: "♠", H: "♥", D: "♦" };
const SUIT_COLOR = { C: "black", S: "black", H: "red", D: "red" };
const CARD_VALUE = { "9": 0, "10": 10, "J": 2, "Q": 3, "K": 4, "A": 11 };
const PLAYER_NAMES = ["You", "Herbert", "Gisela", "Dieter"];

// Tournament-rule announcement deadlines: the announcing player must still hold at least this
// many cards. Partnership (Re/Kontra) is only valid through the player's own first card; each
// Absage ("keine 90/60/30", "schwarz") has its own, later deadline, and requires that the
// announcer's own party has already announced Re/Kontra.
const ANNOUNCE_MIN_HAND = { partnership: 11, "90": 10, "60": 9, "30": 8, schwarz: 7 };
const ABSAGE_LEVELS = ["90", "60", "30", "schwarz"];

// Highest to lowest trump. Both copies of the 10 of Hearts outrank even the Queen of Clubs
// (a common regional house rule); the rest of the Hearts suit (A, K, 9) stays a plain suit.
const TRUMP_ORDER = [
  "H-10",
  "C-Q", "S-Q", "H-Q", "D-Q",
  "C-J", "S-J", "H-J", "D-J",
  "D-A", "D-10", "D-K", "D-9",
];
const TRUMP_RANK = new Map(TRUMP_ORDER.map((k, i) => [k, i]));
const PLAIN_ORDER = ["A", "10", "K", "9"];
const PLAIN_RANK = new Map(PLAIN_ORDER.map((r, i) => [r, i]));

function isTrump(card) { return TRUMP_RANK.has(card.suit + "-" + card.rank); }
function trumpRank(card) { return TRUMP_RANK.get(card.suit + "-" + card.rank); }
function plainRank(card) { return PLAIN_RANK.get(card.rank); }
function cardValue(card) { return CARD_VALUE[card.rank]; }
function cardLabel(card) { return `${card.rank}${SUIT_SYMBOL[card.suit]}`; }
function playerName(idx) { return PLAYER_NAMES[idx]; }

/* ============================== STATE =================================== */

const state = {
  hands: [[], [], [], []],
  teams: [null, null, null, null],
  trick: [],           // [{playerIndex, card}]
  trickNumber: 0,
  currentPlayer: 0,
  dealer: -1,           // becomes 0 on first deal
  leader: 0,
  reCardPoints: 0,
  kontraCardPoints: 0,
  reDoppelkopf: 0,
  kontraDoppelkopf: 0,
  matchScores: [0, 0, 0, 0],
  roundNumber: 0,
  roundActive: false,
  busy: false,
  announcements: {
    RE: { partnership: false, levels: [] },
    KONTRA: { partnership: false, levels: [] },
  },
  revealed: [null, null, null, null], // per player: null, or the team they've shown themselves to be
};

/* ============================== DECK / DEAL ============================= */

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let copy = 0; copy < 2; copy++) {
        deck.push({ suit, rank, copy, id: `${suit}${rank}_${copy}` });
      }
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function handComparator(a, b) {
  const at = isTrump(a), bt = isTrump(b);
  if (at && bt) return trumpRank(a) - trumpRank(b);
  if (at !== bt) return at ? -1 : 1;
  const suitOrder = ["C", "S", "H"];
  if (a.suit !== b.suit) return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
  return plainRank(a) - plainRank(b);
}

function dealNewRound() {
  const deck = shuffle(createDeck());
  state.hands = [[], [], [], []];
  for (let i = 0; i < 48; i++) state.hands[i % 4].push(deck[i]);
  state.hands[0].sort(handComparator);

  state.teams = state.hands.map(hand => hand.some(c => c.suit === "C" && c.rank === "Q") ? "RE" : "KONTRA");

  state.trick = [];
  state.trickNumber = 0;
  state.reCardPoints = 0;
  state.kontraCardPoints = 0;
  state.reDoppelkopf = 0;
  state.kontraDoppelkopf = 0;
  state.dealer = (state.dealer + 1) % 4;
  state.leader = (state.dealer + 1) % 4;
  state.currentPlayer = state.leader;
  state.roundNumber++;
  state.roundActive = true;
  state.busy = false;
  state.announcements = {
    RE: { partnership: false, levels: [] },
    KONTRA: { partnership: false, levels: [] },
  };
  state.revealed = [null, null, null, null];

  document.getElementById("btn-new-round").classList.add("hidden");
  document.getElementById("btn-start").classList.add("hidden");

  renderAll();
  log(`— Round ${state.roundNumber} dealt. You hold the ${state.teams[0] === "RE" ? "♣Q" : "no ♣Q"} — you play for <b>${state.teams[0]}</b>. —`, true);

  for (let idx = 1; idx <= 3; idx++) aiConsiderPartnership(idx);
  renderAll();
  maybeAiTurn();
}

/* ============================== RULES ==================================== */

function getLegalMoves(hand, trick) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card;
  const ledIsTrump = isTrump(led);
  const matching = ledIsTrump
    ? hand.filter(c => isTrump(c))
    : hand.filter(c => !isTrump(c) && c.suit === led.suit);
  return matching.length > 0 ? matching : hand.slice();
}

const H10_RANK = TRUMP_RANK.get("H-10");

function evaluateTrick(trick) {
  const trumps = trick.filter(t => isTrump(t.card));
  if (trumps.length > 0) {
    let best = trumps[0];
    for (const t of trumps) {
      const r = trumpRank(t.card);
      const br = trumpRank(best.card);
      // Normally the first card played wins a tie. Exception: between the two 10 of Hearts,
      // the SECOND one played beats the first.
      if (r < br || (r === br && r === H10_RANK)) best = t;
    }
    return best.playerIndex;
  }
  const ledSuit = trick[0].card.suit;
  const matching = trick.filter(t => !isTrump(t.card) && t.card.suit === ledSuit);
  let best = matching[0];
  for (const t of matching) if (plainRank(t.card) < plainRank(best.card)) best = t;
  return best.playerIndex;
}

/* ============================== ANNOUNCEMENTS (ANSAGEN) ==================== */
// Tournament rules: a party member may call "Re"/"Kontra" while they still hold >=11 cards
// (i.e. before or with their own first card). After their own party has announced, either
// member may escalate with "keine 90/60/30" or "schwarz", each with its own later hand-size
// deadline. Playing a Queen of Clubs, or making any announcement, publicly reveals that
// individual player's team (not necessarily their partner's).

function canAnnouncePartnership(playerIdx) {
  if (!state.roundActive) return false;
  const team = state.teams[playerIdx];
  if (state.announcements[team].partnership) return false;
  return state.hands[playerIdx].length >= ANNOUNCE_MIN_HAND.partnership;
}

function canAnnounceAbsage(playerIdx, level) {
  if (!state.roundActive) return false;
  const team = state.teams[playerIdx];
  if (!state.announcements[team].partnership) return false;
  if (state.announcements[team].levels.includes(level)) return false;
  return state.hands[playerIdx].length >= ANNOUNCE_MIN_HAND[level];
}

function revealPlayer(playerIdx) {
  if (state.revealed[playerIdx]) return;
  state.revealed[playerIdx] = state.teams[playerIdx];
}

function announcePartnership(playerIdx) {
  if (!canAnnouncePartnership(playerIdx)) return;
  const team = state.teams[playerIdx];
  state.announcements[team].partnership = true;
  revealPlayer(playerIdx);
  log(`${playerName(playerIdx)} announces <b>"${team === "RE" ? "Re" : "Kontra"}"!</b>`, true);
  renderAll();
}

function announceAbsage(playerIdx, level) {
  if (!canAnnounceAbsage(playerIdx, level)) return;
  const team = state.teams[playerIdx];
  state.announcements[team].levels.push(level);
  revealPlayer(playerIdx);
  const label = level === "schwarz" ? "schwarz" : `keine ${level}`;
  log(`${playerName(playerIdx)} calls <b>"${label}"</b> against the opposing team!`, true);
  renderAll();
}

function handStrength(hand) {
  const trumps = hand.filter(isTrump).length;
  const aces = hand.filter(c => !isTrump(c) && c.rank === "A").length;
  return trumps * 2 + aces;
}

function aiConsiderPartnership(playerIdx) {
  if (playerIdx === 0 || !canAnnouncePartnership(playerIdx)) return;
  if (handStrength(state.hands[playerIdx]) >= 13) announcePartnership(playerIdx);
}

function aiConsiderAbsage(playerIdx) {
  if (playerIdx === 0) return;
  const team = state.teams[playerIdx];
  if (!state.announcements[team].partnership || state.trickNumber === 0) return;
  const ownPoints = team === "RE" ? state.reCardPoints : state.kontraCardPoints;
  const avgPerTrick = ownPoints / state.trickNumber;
  if (avgPerTrick < 17) return; // not dominant enough to raise the stakes further
  for (const level of ABSAGE_LEVELS) {
    if (state.announcements[team].levels.includes(level)) continue;
    if (canAnnounceAbsage(playerIdx, level)) announceAbsage(playerIdx, level);
    break; // only ever escalate one level per trick
  }
}

/* ============================== AI ======================================== */

function chooseAiCard(playerIndex) {
  const hand = state.hands[playerIndex];
  const legal = getLegalMoves(hand, state.trick);
  if (legal.length === 1) return legal[0];

  if (state.trick.length === 0) {
    // Leading the trick.
    const plainAces = legal.filter(c => !isTrump(c) && c.rank === "A");
    if (plainAces.length > 0) return plainAces[0];
    const trumps = legal.filter(isTrump);
    if (trumps.length >= 5) return trumps.slice().sort((a, b) => trumpRank(b) - trumpRank(a))[0]; // weakest trump
    const plains = legal.filter(c => !isTrump(c));
    if (plains.length > 0) {
      return plains.slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
    }
    return trumps.slice().sort((a, b) => trumpRank(b) - trumpRank(a))[0];
  }

  // Following.
  const myTeam = state.teams[playerIndex];
  const winningIdx = evaluateTrick(state.trick);
  const partnerWinning = state.teams[winningIdx] === myTeam;
  const isLastToPlay = state.trick.length === 3;

  // Which legal cards would win if played now?
  const winningMoves = legal.filter(card => {
    const hypothetical = state.trick.concat([{ playerIndex, card }]);
    return evaluateTrick(hypothetical) === playerIndex;
  });

  if (partnerWinning) {
    // Feed points to partner (schmieren): play highest-value legal card.
    return legal.slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
  }

  const trickValueSoFar = state.trick.reduce((s, t) => s + cardValue(t.card), 0);

  if (winningMoves.length > 0 && (isLastToPlay || trickValueSoFar >= 8 || winningMoves.some(isTrump) === false)) {
    // Win as cheaply as possible.
    return winningMoves.slice().sort((a, b) => {
      const at = isTrump(a), bt = isTrump(b);
      if (at !== bt) return at ? 1 : -1; // prefer non-trump wins
      if (at && bt) return trumpRank(b) - trumpRank(a); // weakest trump first (higher rank index = weaker)
      return plainRank(b) - plainRank(a);
    })[0];
  }

  // Can't or don't want to win: dump the lowest-value card, saving trump if possible.
  return legal.slice().sort((a, b) => {
    const at = isTrump(a), bt = isTrump(b);
    if (at !== bt) return at ? 1 : -1; // prefer discarding non-trump
    return cardValue(a) - cardValue(b);
  })[0];
}

/* ============================== TURN FLOW ================================= */

function playCard(playerIdx, card) {
  if (!state.roundActive || state.busy) return;
  if (playerIdx !== state.currentPlayer) return;

  const hand = state.hands[playerIdx];
  const legal = getLegalMoves(hand, state.trick);
  if (!legal.some(c => c.id === card.id)) {
    if (playerIdx === 0) log("That move isn't legal — you must follow suit if you can.");
    return;
  }

  state.hands[playerIdx] = hand.filter(c => c.id !== card.id);
  state.trick.push({ playerIndex: playerIdx, card });
  log(`${playerName(playerIdx)} plays <b>${cardLabel(card)}</b>.`);
  if (card.suit === "C" && card.rank === "Q") revealPlayer(playerIdx);
  renderAll();

  if (state.trick.length < 4) {
    state.currentPlayer = (playerIdx + 1) % 4;
    renderAll();
    maybeAiTurn();
  } else {
    state.busy = true;
    setTimeout(resolveTrick, 900);
  }
}

function resolveTrick() {
  const winnerIdx = evaluateTrick(state.trick);
  const trickPoints = state.trick.reduce((s, t) => s + cardValue(t.card), 0);
  const winningTeam = state.teams[winnerIdx];

  if (winningTeam === "RE") {
    state.reCardPoints += trickPoints;
    if (trickPoints >= 40) state.reDoppelkopf++;
  } else {
    state.kontraCardPoints += trickPoints;
    if (trickPoints >= 40) state.kontraDoppelkopf++;
  }

  log(`${playerName(winnerIdx)} wins the trick (${trickPoints} pts).`, true);

  state.trickNumber++;
  state.trick = [];
  state.currentPlayer = winnerIdx;
  state.leader = winnerIdx;
  state.busy = false;

  for (let idx = 1; idx <= 3; idx++) aiConsiderAbsage(idx);
  renderAll();

  if (state.trickNumber === 12) {
    endRound();
  } else {
    maybeAiTurn();
  }
}

function maybeAiTurn() {
  if (!state.roundActive) return;
  if (state.currentPlayer === 0) { renderAll(); return; }
  state.busy = true;
  setTimeout(() => {
    const idx = state.currentPlayer;
    const card = chooseAiCard(idx);
    state.busy = false;
    playCard(idx, card);
  }, 650);
}

/* ============================== SCORING =================================== */

function endRound() {
  state.roundActive = false;
  const reWins = state.reCardPoints >= 121;
  const loserPoints = reWins ? state.kontraCardPoints : state.reCardPoints;

  let gameValue = 1;
  if (loserPoints < 90) gameValue++;
  if (loserPoints < 60) gameValue++;
  if (loserPoints < 30) gameValue++;
  if (loserPoints === 0) gameValue++;

  // Announcing Re or Kontra raises the stakes for the whole round: +2 points, awarded to
  // whichever party ends up winning, regardless of who announced.
  let announceBonus = 0;
  if (state.announcements.RE.partnership) announceBonus += 2;
  if (state.announcements.KONTRA.partnership) announceBonus += 2;

  // Absagen ("keine 90/60/30", "schwarz") only pay off if the WINNING party made that specific
  // call themselves, and the final score actually bears it out.
  const winnerTeam = reWins ? "RE" : "KONTRA";
  const winnerAbsageBonus = state.announcements[winnerTeam].levels.reduce((sum, level) => {
    const met = level === "90" ? loserPoints < 90
      : level === "60" ? loserPoints < 60
        : level === "30" ? loserPoints < 30
          : loserPoints === 0; // schwarz
    return sum + (met ? 1 : 0);
  }, 0);

  gameValue += announceBonus + winnerAbsageBonus;

  let net = reWins ? gameValue : -gameValue; // from Re's perspective
  net += state.reDoppelkopf - state.kontraDoppelkopf;

  state.teams.forEach((team, idx) => {
    state.matchScores[idx] += (team === "RE" ? net : -net);
  });

  log(`Round ${state.roundNumber} over. Re: ${state.reCardPoints} pts, Kontra: ${state.kontraCardPoints} pts. ${reWins ? "RE" : "KONTRA"} wins the round.`, true);

  state.revealed = state.teams.slice(); // round is over - everyone's team is public now

  showRoundSummary({ reWins, gameValue, net, loserPoints, announceBonus, winnerAbsageBonus });
  renderAll();
  document.getElementById("btn-new-round").classList.remove("hidden");
  document.getElementById("btn-new-match").classList.remove("hidden");
}

/* ============================== RENDERING ================================= */

function log(msg, important) {
  const panel = document.getElementById("log");
  const entry = document.createElement("div");
  entry.className = "log-entry" + (important ? " important" : "");
  entry.innerHTML = msg;
  panel.appendChild(entry);
}

function makeCardEl(card, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "card " + SUIT_COLOR[card.suit] + (opts.illegal ? " illegal" : "");
  el.innerHTML = `
    <div class="rank-top">${card.rank}${SUIT_SYMBOL[card.suit]}</div>
    <div class="suit-mid">${SUIT_SYMBOL[card.suit]}</div>
    <div class="rank-bottom">${card.rank}${SUIT_SYMBOL[card.suit]}</div>
  `;
  if (opts.onClick) el.addEventListener("click", opts.onClick);
  return el;
}

function renderHand() {
  const container = document.getElementById("hand-0");
  container.innerHTML = "";
  const isMyTurn = state.roundActive && state.currentPlayer === 0 && !state.busy;
  const legal = isMyTurn ? getLegalMoves(state.hands[0], state.trick) : [];
  for (const card of state.hands[0]) {
    const legalNow = !isMyTurn ? true : legal.some(c => c.id === card.id);
    const el = makeCardEl(card, {
      illegal: isMyTurn && !legalNow,
      onClick: () => { if (isMyTurn && legalNow) playCard(0, card); }
    });
    container.appendChild(el);
  }
  document.getElementById("your-team").textContent = state.teams[0] || "?";
}

function teamTagHtml(team) {
  if (!team) return "";
  return ` <span class="team-tag ${team.toLowerCase()}">${team}</span>`;
}

function renderOpponents() {
  for (const idx of [1, 2, 3]) {
    const back = document.getElementById(`hand-${idx}`);
    back.innerHTML = "";
    const count = state.hands[idx].length;
    for (let i = 0; i < count; i++) {
      const c = document.createElement("div");
      c.className = "card-back";
      back.appendChild(c);
    }
    const label = document.getElementById(`label-${idx}`);
    label.innerHTML = playerName(idx) + teamTagHtml(state.revealed[idx]);
    label.classList.toggle("active", state.roundActive && state.currentPlayer === idx);
  }
  const label0 = document.querySelector(".hand-area .player-label");
  if (label0) label0.classList.toggle("active", state.roundActive && state.currentPlayer === 0);
}

function renderAnnouncements() {
  const panel = document.getElementById("announce-panel");
  if (!panel) return;
  if (!state.roundActive) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");

  const team = state.teams[0];
  const partnershipBtn = document.getElementById("btn-announce-partnership");
  partnershipBtn.textContent = `Announce "${team === "RE" ? "Re" : "Kontra"}"`;
  partnershipBtn.disabled = !canAnnouncePartnership(0);

  for (const level of ABSAGE_LEVELS) {
    const btn = document.getElementById(`btn-absage-${level}`);
    btn.disabled = !canAnnounceAbsage(0, level);
  }
}

function renderTrick() {
  const area = document.getElementById("trick-area");
  area.innerHTML = "";
  for (const play of state.trick) {
    const el = makeCardEl(play.card);
    el.classList.add("trick-card", `pos-${play.playerIndex}`);
    area.appendChild(el);
  }
}

function renderScoreboard() {
  const sb = document.getElementById("scoreboard");
  sb.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const div = document.createElement("div");
    div.className = "sb-entry";
    div.innerHTML = `${playerName(i)}: <b>${state.matchScores[i]}</b>`;
    sb.appendChild(div);
  }
  if (state.roundActive) {
    const div = document.createElement("div");
    div.className = "sb-entry";
    div.innerHTML = `Trick ${state.trickNumber + 1}/12 &nbsp; Re: <b>${state.reCardPoints}</b> · Kontra: <b>${state.kontraCardPoints}</b>`;
    sb.appendChild(div);
  }
}

function renderTurnIndicator() {
  const el = document.getElementById("turn-indicator");
  if (!state.roundActive) { el.textContent = ""; return; }
  el.textContent = state.currentPlayer === 0 ? "Your turn" : `${playerName(state.currentPlayer)} is thinking…`;
}

function renderAll() {
  renderHand();
  renderOpponents();
  renderTrick();
  renderScoreboard();
  renderTurnIndicator();
  renderAnnouncements();
}

/* ============================== MODAL ===================================== */

function showRoundSummary(info) {
  const overlay = document.getElementById("modal-overlay");
  const modal = document.getElementById("modal");
  const reTeamPlayers = state.teams.map((t, i) => t === "RE" ? playerName(i) : null).filter(Boolean).join(", ");
  const kontraTeamPlayers = state.teams.map((t, i) => t === "KONTRA" ? playerName(i) : null).filter(Boolean).join(", ");

  modal.innerHTML = `
    <h2>${info.reWins ? "RE wins the round!" : "KONTRA wins the round!"}</h2>
    <table>
      <tr><th></th><th>Team</th><th>Card points</th></tr>
      <tr><td>Re</td><td>${reTeamPlayers}</td><td>${state.reCardPoints}</td></tr>
      <tr><td>Kontra</td><td>${kontraTeamPlayers}</td><td>${state.kontraCardPoints}</td></tr>
    </table>
    <p>Game value: <b>${info.gameValue}</b> point${info.gameValue === 1 ? "" : "s"}
      (loser had ${info.loserPoints} pts)${(state.reDoppelkopf + state.kontraDoppelkopf) > 0
        ? ` + Doppelkopf bonuses (Re ${state.reDoppelkopf}, Kontra ${state.kontraDoppelkopf})` : ""}${info.announceBonus > 0
        ? ` + ${info.announceBonus} for announced Re/Kontra` : ""}${info.winnerAbsageBonus > 0
        ? ` + ${info.winnerAbsageBonus} for fulfilled Absage(n)` : ""}.</p>
    <p>Net swing: <b>${info.net >= 0 ? "+" : ""}${info.net}</b> for Re / <b>${info.net <= 0 ? "+" : "-"}${Math.abs(info.net)}</b> for Kontra.</p>
    <div class="modal-actions">
      <button id="modal-close">Continue</button>
    </div>
  `;
  overlay.classList.remove("hidden");
  document.getElementById("modal-close").addEventListener("click", () => {
    overlay.classList.add("hidden");
  });
}

/* ============================== INIT ======================================= */

function newMatch() {
  state.matchScores = [0, 0, 0, 0];
  state.dealer = -1;
  state.roundNumber = 0;
  document.getElementById("log").innerHTML = "";
  document.getElementById("btn-new-match").classList.add("hidden");
  document.getElementById("btn-new-round").classList.add("hidden");
  document.getElementById("btn-start").classList.remove("hidden");
  renderScoreboard();
  log("New match started. Click \"Start Match\" to deal the first round.", true);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-start").addEventListener("click", dealNewRound);
  document.getElementById("btn-new-round").addEventListener("click", dealNewRound);
  document.getElementById("btn-new-match").addEventListener("click", newMatch);
  document.getElementById("btn-announce-partnership").addEventListener("click", () => announcePartnership(0));
  for (const level of ABSAGE_LEVELS) {
    document.getElementById(`btn-absage-${level}`).addEventListener("click", () => announceAbsage(0, level));
  }
  renderScoreboard();
  log("Welcome to Doppelkopf! Click \"Start Match\" to deal the first round.", true);
});
