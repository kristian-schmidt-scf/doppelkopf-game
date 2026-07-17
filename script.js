"use strict";

/* ============================== CONSTANTS ============================== */

const SUITS = ["C", "S", "H", "D"];
const RANKS = ["9", "10", "J", "Q", "K", "A"];
const SUIT_SYMBOL = { C: "♣", S: "♠", H: "♥", D: "♦" };
const SUIT_COLOR = { C: "black", S: "black", H: "red", D: "red" };
const CARD_VALUE = { "9": 0, "10": 10, "J": 2, "Q": 3, "K": 4, "A": 11 };
const PLAYER_NAMES = ["You", "Herbert", "Gisela", "Dieter"];

// Natural suit-internal rank order (descending strength). Used for ANY plain-suit comparison,
// in ANY game type: whichever ranks aren't trump this round still compare in this relative order
// (e.g. a Damensolo's Clubs suit is A>10>K>J>9 - exactly this list with Q filtered out).
const NATURAL_RANK_ORDER = ["A", "10", "K", "Q", "J", "9"];
const PLAIN_RANK = new Map(NATURAL_RANK_ORDER.map((r, i) => [r, i]));

const ANNOUNCE_MIN_HAND = { partnership: 11, "90": 10, "60": 9, "30": 8, schwarz: 7 };
const ABSAGE_LEVELS = ["90", "60", "30", "schwarz"];

const GAME_TYPES = {
  NORMAL: "normal",
  SOLO_C: "solo-C",
  SOLO_S: "solo-S",
  SOLO_H: "solo-H",
  SOLO_D: "solo-D",
  SOLO_Q: "solo-Q",
  SOLO_J: "solo-J",
  SOLO_FLESHLESS: "solo-fleshless",
};
const SOLO_GAME_TYPES = [GAME_TYPES.SOLO_C, GAME_TYPES.SOLO_S, GAME_TYPES.SOLO_H, GAME_TYPES.SOLO_D, GAME_TYPES.SOLO_Q, GAME_TYPES.SOLO_J, GAME_TYPES.SOLO_FLESHLESS];
function isSoloType(gt) { return SOLO_GAME_TYPES.includes(gt); }

const GAME_TYPE_LABEL = {
  [GAME_TYPES.NORMAL]: "Normal game",
  [GAME_TYPES.SOLO_C]: "Clubs Solo",
  [GAME_TYPES.SOLO_S]: "Spades Solo",
  [GAME_TYPES.SOLO_H]: "Hearts Solo",
  [GAME_TYPES.SOLO_D]: "Diamonds Solo",
  [GAME_TYPES.SOLO_Q]: "Queens Solo",
  [GAME_TYPES.SOLO_J]: "Jacks Solo",
  [GAME_TYPES.SOLO_FLESHLESS]: "Fleshless Solo (no trump)",
};

// Builds the trump order (highest -> lowest) for a given game type. `schweinchenPlayer` !== null
// promotes both Diamond Aces to the single highest trump, above even the Ten of Hearts (Normal
// games only).
function buildTrumpOrder(gameType, schweinchenPlayer) {
  let order;
  if (gameType === GAME_TYPES.NORMAL) {
    // Both Ten-of-Hearts outrank even the Club Queens (this project's house rule variant); all
    // Diamonds are trump otherwise.
    order = ["H-10", "C-Q", "S-Q", "H-Q", "D-Q", "C-J", "S-J", "H-J", "D-J", "D-A", "D-10", "D-K", "D-9"];
  } else if (gameType === GAME_TYPES.SOLO_Q) {
    order = ["C-Q", "S-Q", "H-Q", "D-Q"];
  } else if (gameType === GAME_TYPES.SOLO_J) {
    order = ["C-J", "S-J", "H-J", "D-J"];
  } else if (gameType === GAME_TYPES.SOLO_FLESHLESS) {
    order = [];
  } else {
    // Farbsolo: the chosen suit's Ten sits at the very top (mirroring the confirmed Herzsolo
    // structure), its Queen/Jack join the normal cross-suit tiers, and its remaining Ace/King/9
    // fill the bottom tier.
    const suit = gameType.replace("solo-", "");
    order = [`${suit}-10`, "C-Q", "S-Q", "H-Q", "D-Q", "C-J", "S-J", "H-J", "D-J", `${suit}-A`, `${suit}-K`, `${suit}-9`];
  }
  if (schweinchenPlayer !== null && schweinchenPlayer !== undefined && gameType === GAME_TYPES.NORMAL) {
    order = order.filter(k => k !== "D-A");
    order.unshift("D-A"); // Schweinchen: the single highest trump, above the Ten of Hearts
  }
  return order;
}

function cardValue(card) { return CARD_VALUE[card.rank]; }
function cardLabel(card) { return `${card.rank}${SUIT_SYMBOL[card.suit]}`; }
function cardLabelHtml(card) {
  const cls = SUIT_COLOR[card.suit] === "red" ? "suit-red" : "suit-black";
  return `<span class="${cls}">${cardLabel(card)}</span>`;
}
function playerName(idx) { return PLAYER_NAMES[idx]; }

/* ============================== SETTINGS ================================= */

const settings = {
  solos: true,
  hochzeit: true,
  armut: true,
  karlchen: true,
  fuchs: true,
  schweinchen: true,
  genschern: true,
  schmeissen: true,
};

function readSettingsFromUI() {
  settings.solos = document.getElementById("setting-solos").checked;
  settings.hochzeit = document.getElementById("setting-hochzeit").checked;
  settings.armut = document.getElementById("setting-armut").checked;
  settings.karlchen = document.getElementById("setting-karlchen").checked;
  settings.fuchs = document.getElementById("setting-fuchs").checked;
  settings.schweinchen = document.getElementById("setting-schweinchen").checked;
  settings.genschern = document.getElementById("setting-genschern").checked;
  settings.schmeissen = document.getElementById("setting-schmeissen").checked;
}

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
  reFuchs: 0,
  kontraFuchs: 0,
  reKarlchen: 0,
  kontraKarlchen: 0,
  // Per-player ledgers, independent of team labels - the source of truth that the Re/Kontra team
  // totals above are derived from (see recomputeTeamTotals). Needed because Genschern can reassign
  // state.teams mid-round, after some of these have already accrued under the old assignment.
  playerPoints: [0, 0, 0, 0],
  playerDoppelkopf: [0, 0, 0, 0],
  playerFuchs: [0, 0, 0, 0],
  playerKarlchen: [0, 0, 0, 0],
  matchScores: [0, 0, 0, 0],
  roundNumber: 0,
  roundActive: false,
  busy: false,
  phase: "none", // "bidding" | "playing"
  announcements: {
    RE: { partnership: false, levels: [] },
    KONTRA: { partnership: false, levels: [] },
  },
  revealed: [null, null, null, null],

  gameType: GAME_TYPES.NORMAL,
  trumpOrder: [],
  trumpRankMap: new Map(),
  isSolo: false,
  soloPlayer: null,

  isHochzeit: false,
  hochzeitAnnouncer: null,
  hochzeitResolved: true,
  isArmut: false,

  genschernPlayer: null,
  genschernDKPlayed: 0,
  genschernUsed: false,
  pendingGenschernChooser: null, // set while waiting on the human's partner pick

  biddingOrder: [],
  biddingStep: 0,
  biddingDeclarations: [null, null, null, null],
};

/* ============================== RULES (dynamic per game type) ============ */

function isTrump(card) { return state.trumpRankMap.has(card.suit + "-" + card.rank); }
function trumpRank(card) { return state.trumpRankMap.get(card.suit + "-" + card.rank); }
function plainRank(card) { return PLAIN_RANK.get(card.rank); }

function getLegalMoves(hand, trick) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card;
  const ledIsTrump = isTrump(led);
  const matching = ledIsTrump
    ? hand.filter(c => isTrump(c))
    : hand.filter(c => !isTrump(c) && c.suit === led.suit);
  return matching.length > 0 ? matching : hand.slice();
}

function evaluateTrick(trick) {
  const trumps = trick.filter(t => isTrump(t.card));
  if (trumps.length > 0) {
    const h10Rank = state.trumpRankMap.get("H-10"); // undefined if H-10 isn't trump this round
    let best = trumps[0];
    for (const t of trumps) {
      const r = trumpRank(t.card);
      const br = trumpRank(best.card);
      // Normally the first card played wins a tie. Exception: between the two Ten of Hearts
      // (whenever they're trump at all), the SECOND one played beats the first.
      if (r < br || (r === br && r === h10Rank)) best = t;
    }
    return best.playerIndex;
  }
  const ledSuit = trick[0].card.suit;
  const matching = trick.filter(t => !isTrump(t.card) && t.card.suit === ledSuit);
  let best = matching[0];
  for (const t of matching) if (plainRank(t.card) < plainRank(best.card)) best = t;
  return best.playerIndex;
}

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
  if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  return plainRank(a) - plainRank(b);
}

function dealNewRound(redeal) {
  const isRedeal = redeal === true; // guards against the click handler passing its MouseEvent through
  readSettingsFromUI();
  const deck = shuffle(createDeck());
  state.hands = [[], [], [], []];
  for (let i = 0; i < 48; i++) state.hands[i % 4].push(deck[i]);

  state.trick = [];
  state.trickNumber = 0;
  state.reCardPoints = 0;
  state.kontraCardPoints = 0;
  state.reDoppelkopf = 0;
  state.kontraDoppelkopf = 0;
  state.reFuchs = 0;
  state.kontraFuchs = 0;
  state.reKarlchen = 0;
  state.kontraKarlchen = 0;
  state.playerPoints = [0, 0, 0, 0];
  state.playerDoppelkopf = [0, 0, 0, 0];
  state.playerFuchs = [0, 0, 0, 0];
  state.playerKarlchen = [0, 0, 0, 0];
  // Schmeissen redeals with the same dealer (the thrown-in hand doesn't count as a played round);
  // every other path advances the dealer and round counter as normal.
  if (!isRedeal) {
    state.dealer = (state.dealer + 1) % 4;
    state.roundNumber++;
  }
  state.leader = (state.dealer + 1) % 4;
  state.currentPlayer = state.leader;
  state.roundActive = true;
  state.busy = false;
  state.announcements = {
    RE: { partnership: false, levels: [] },
    KONTRA: { partnership: false, levels: [] },
  };
  state.revealed = [null, null, null, null];
  state.teams = [null, null, null, null];

  state.gameType = GAME_TYPES.NORMAL;
  state.trumpOrder = buildTrumpOrder(GAME_TYPES.NORMAL, null);
  state.trumpRankMap = new Map(state.trumpOrder.map((k, i) => [k, i]));
  state.hands[0].sort(handComparator); // sort as a normal game while the Vorbehalte are still being asked
  state.isSolo = false;
  state.soloPlayer = null;
  state.isHochzeit = false;
  state.hochzeitAnnouncer = null;
  state.hochzeitResolved = true;
  state.isArmut = false;
  state.genschernPlayer = null;
  state.genschernDKPlayed = 0;
  state.genschernUsed = false;
  state.pendingGenschernChooser = null;

  document.getElementById("btn-new-round").classList.add("hidden");
  document.getElementById("btn-start").classList.add("hidden");
  document.getElementById("settings-panel").classList.add("hidden");

  log(isRedeal ? `— Redealt by the same dealer (Round ${state.roundNumber}). —` : `— Round ${state.roundNumber} dealt. —`, true);
  startBiddingPhase();
}

/* ============================== BIDDING PHASE (VORBEHALTE) ================ */
// After dealing, players are asked in turn (starting left of the dealer) whether they have a
// reservation. Precedence: Schmeissen > Solo > Hochzeit > Armut > healthy. Schmeissen throws the
// whole deal out regardless of anyone else's declaration - it's not really a Vorbehalt so much as
// a veto of the deal itself. Whoever holds the highest-precedence declaration (earliest-asked wins
// ties) determines the round; "Pflichtsolo" (a forced solo for a trump-less hand) isn't modeled -
// every solo here is a voluntary "Lustsolo".

function countTrumpsForGameType(hand, gameType) {
  const order = buildTrumpOrder(gameType, null);
  const keys = new Set(order);
  return hand.filter(c => keys.has(c.suit + "-" + c.rank)).length;
}

function aiChooseSoloType(hand) {
  const candidates = [GAME_TYPES.SOLO_C, GAME_TYPES.SOLO_S, GAME_TYPES.SOLO_H, GAME_TYPES.SOLO_D, GAME_TYPES.SOLO_Q, GAME_TYPES.SOLO_J, GAME_TYPES.SOLO_FLESHLESS];
  let best = candidates[0], bestCount = -1;
  for (const gt of candidates) {
    const count = countTrumpsForGameType(hand, gt);
    if (count > bestCount) { bestCount = count; best = gt; }
  }
  return { gameType: best, trumpCount: bestCount };
}

function aiDecideBidding(playerIdx) {
  const hand = state.hands[playerIdx];

  if (settings.schmeissen && hand.filter(c => c.rank === "K").length >= 5) {
    return { type: "schmeissen" };
  }
  if (settings.solos) {
    // Picking the best of 7 candidate game types is a max-of-7 draw, which inflates how often a
    // hand looks "strong" far more than a naive per-type threshold suggests - calibrated against
    // 20,000 simulated random hands: threshold 10 gives a ~9% round-level solo rate (>=1 of 3 AI
    // players declares), threshold 8 gave an unplayable ~81%.
    const { gameType, trumpCount } = aiChooseSoloType(hand);
    if (trumpCount >= 10) return { type: "solo", soloType: gameType };
  }
  if (settings.hochzeit && hand.filter(c => c.suit === "C" && c.rank === "Q").length === 2) {
    return { type: "hochzeit" };
  }
  if (settings.armut && countTrumpsForGameType(hand, GAME_TYPES.NORMAL) <= 3) {
    return { type: "armut" };
  }
  return { type: "healthy" };
}

function startBiddingPhase() {
  state.phase = "bidding";
  state.biddingOrder = [1, 2, 3, 0].map(off => (state.dealer + off) % 4);
  state.biddingStep = 0;
  state.biddingDeclarations = [null, null, null, null];
  renderAll();
  advanceBidding();
}

function advanceBidding() {
  if (state.biddingStep >= 4) {
    resolveBidding();
    return;
  }
  const idx = state.biddingOrder[state.biddingStep];
  if (idx === 0) {
    renderAll(); // show the human bidding panel and wait for a button click
  } else {
    state.busy = true;
    setTimeout(() => {
      state.busy = false;
      const decl = aiDecideBidding(idx);
      submitBiddingDeclaration(idx, decl);
    }, 500);
  }
}

function submitBiddingDeclaration(idx, decl) {
  state.biddingDeclarations[idx] = decl;
  if (decl.type !== "healthy") {
    const label = decl.type === "solo" ? GAME_TYPE_LABEL[decl.soloType]
      : decl.type === "hochzeit" ? "Hochzeit"
        : decl.type === "armut" ? "Armut" : "Schmeissen (5+ Kings)";
    log(`${playerName(idx)} has a reservation: <b>${label}</b>.`, true);
  }
  state.biddingStep++;
  renderAll();
  advanceBidding();
}

function resolveBidding() {
  const declared = state.biddingOrder
    .map(idx => ({ idx, decl: state.biddingDeclarations[idx] }))
    .filter(x => x.decl && x.decl.type !== "healthy");

  const schmeissen = declared.find(x => x.decl.type === "schmeissen");
  if (schmeissen) { schmeissenRedeal(schmeissen.idx); return; }

  const solo = declared.find(x => x.decl.type === "solo");
  const hochzeit = declared.find(x => x.decl.type === "hochzeit");
  const armut = declared.find(x => x.decl.type === "armut");
  const winner = solo || hochzeit || armut || null;

  if (!winner) startNormalRound();
  else if (winner.decl.type === "solo") startSoloRound(winner.idx, winner.decl.soloType);
  else if (winner.decl.type === "hochzeit") startHochzeitRound(winner.idx);
  else startArmutRound(winner.idx);
}

function schmeissenRedeal(playerIdx) {
  log(`${playerName(playerIdx)} holds 5 or more Kings and throws in the hand - <b>Schmeissen!</b> No round played; the same dealer redeals.`, true);
  dealNewRound(true);
}

function detectSchweinchenAndGenschern() {
  state.trumpOrder = buildTrumpOrder(GAME_TYPES.NORMAL, null);
  let schweinchenPlayer = null;
  if (settings.schweinchen) {
    for (let i = 0; i < 4; i++) {
      if (state.hands[i].filter(c => c.suit === "D" && c.rank === "A").length === 2) { schweinchenPlayer = i; break; }
    }
  }
  state.trumpOrder = buildTrumpOrder(GAME_TYPES.NORMAL, schweinchenPlayer);
  state.trumpRankMap = new Map(state.trumpOrder.map((k, i) => [k, i]));
  if (schweinchenPlayer !== null) {
    log(`${playerName(schweinchenPlayer)} holds both Diamond Aces - <b>Schweinchen!</b> They are now the single highest trump, above the Ten of Hearts.`, true);
  }

  state.genschernPlayer = null;
  if (settings.genschern && !state.isHochzeit) {
    for (let i = 0; i < 4; i++) {
      if (state.hands[i].filter(c => c.suit === "D" && c.rank === "K").length === 2) { state.genschernPlayer = i; break; }
    }
  }
}

function beginPlayPhase() {
  state.phase = "playing";
  state.hands[0].sort(handComparator);
  state.currentPlayer = state.leader;
  renderAll();
  maybeAiTurn();
}

function startNormalRound() {
  state.gameType = GAME_TYPES.NORMAL;
  state.teams = state.hands.map(hand => hand.some(c => c.suit === "C" && c.rank === "Q") ? "RE" : "KONTRA");
  detectSchweinchenAndGenschern();
  const clubQueenHtml = cardLabelHtml({ suit: "C", rank: "Q" });
  log(`Normal game. You hold ${state.teams[0] === "RE" ? clubQueenHtml : "no " + clubQueenHtml} - you play for <b>${state.teams[0]}</b>.`, true);
  for (let idx = 1; idx <= 3; idx++) aiConsiderPartnership(idx);
  beginPlayPhase();
}

function startSoloRound(playerIdx, soloType) {
  state.gameType = soloType;
  state.isSolo = true;
  state.soloPlayer = playerIdx;
  state.teams = [0, 1, 2, 3].map(i => i === playerIdx ? "RE" : "KONTRA");
  state.trumpOrder = buildTrumpOrder(soloType, null);
  state.trumpRankMap = new Map(state.trumpOrder.map((k, i) => [k, i]));
  state.revealed[playerIdx] = "RE"; // announcing a solo is inherently public
  log(`${playerName(playerIdx)} plays a <b>${GAME_TYPE_LABEL[soloType]}</b>, alone against the other three! (score tripled)`, true);
  beginPlayPhase();
}

function startHochzeitRound(announcerIdx) {
  state.gameType = GAME_TYPES.NORMAL;
  state.isHochzeit = true;
  state.hochzeitAnnouncer = announcerIdx;
  state.hochzeitResolved = false;
  state.teams = [0, 1, 2, 3].map(i => i === announcerIdx ? "RE" : null);
  state.revealed[announcerIdx] = "RE";
  detectSchweinchenAndGenschern(); // Genschern is skipped while isHochzeit is true (see above)
  log(`${playerName(announcerIdx)} announces <b>Hochzeit</b> (marriage)! Their partner will be whoever wins the first trick they don't win themselves.`, true);
  beginPlayPhase();
}

function startArmutRound(armutPlayerIdx) {
  state.gameType = GAME_TYPES.NORMAL;
  state.isArmut = true;
  state.trumpOrder = buildTrumpOrder(GAME_TYPES.NORMAL, null);
  state.trumpRankMap = new Map(state.trumpOrder.map((k, i) => [k, i]));

  const isNormalTrump = c => state.trumpRankMap.has(c.suit + "-" + c.rank);
  const hand = state.hands[armutPlayerIdx];
  const nonTrumps = hand.filter(c => !isNormalTrump(c)).sort((a, b) => cardValue(a) - cardValue(b));

  let helperIdx = null, bestTrumpCount = -1;
  for (let i = 0; i < 4; i++) {
    if (i === armutPlayerIdx) continue;
    const cnt = state.hands[i].filter(isNormalTrump).length;
    if (cnt > bestTrumpCount) { bestTrumpCount = cnt; helperIdx = i; }
  }
  const helperHand = state.hands[helperIdx];
  const helperTrumpsWeakestFirst = helperHand.filter(isNormalTrump).sort((a, b) => trumpRank(b) - trumpRank(a));
  const swapCount = Math.min(3, nonTrumps.length, helperTrumpsWeakestFirst.length);
  const armutGives = nonTrumps.slice(0, swapCount);
  const helperGives = helperTrumpsWeakestFirst.slice(0, swapCount);

  state.hands[armutPlayerIdx] = hand.filter(c => !armutGives.includes(c)).concat(helperGives);
  state.hands[helperIdx] = helperHand.filter(c => !helperGives.includes(c)).concat(armutGives);
  log(`${playerName(armutPlayerIdx)} declares <b>Armut</b> (poverty) and trades ${swapCount} card${swapCount === 1 ? "" : "s"} with ${playerName(helperIdx)}, who takes them on as partner. (This implementation resolves the trade automatically rather than offering an interactive negotiation.)`, true);

  state.teams = [0, 1, 2, 3].map(i => (i === armutPlayerIdx || i === helperIdx) ? "RE" : "KONTRA");
  state.revealed[armutPlayerIdx] = "RE";
  state.revealed[helperIdx] = "RE";
  detectSchweinchenAndGenschern();
  for (let idx = 1; idx <= 3; idx++) aiConsiderPartnership(idx);
  beginPlayPhase();
}

/* ============================== ANNOUNCEMENTS (ANSAGEN) ==================== */

function canAnnouncePartnership(playerIdx) {
  if (!state.roundActive || state.phase !== "playing") return false;
  if (state.isHochzeit && !state.hochzeitResolved) return false; // announcements wait for the clarification trick
  const team = state.teams[playerIdx];
  if (!team) return false; // undecided (mid-Hochzeit) - can't announce yet
  if (state.announcements[team].partnership) return false;
  return state.hands[playerIdx].length >= ANNOUNCE_MIN_HAND.partnership;
}

function canAnnounceAbsage(playerIdx, level) {
  if (!state.roundActive || state.phase !== "playing") return false;
  if (state.isHochzeit && !state.hochzeitResolved) return false;
  const team = state.teams[playerIdx];
  if (!team) return false;
  if (!state.announcements[team].partnership) return false;
  if (state.announcements[team].levels.includes(level)) return false;
  return state.hands[playerIdx].length >= ANNOUNCE_MIN_HAND[level];
}

function revealPlayer(playerIdx) {
  if (state.revealed[playerIdx]) return;
  if (!state.teams[playerIdx]) return; // team not decided yet (mid-Hochzeit)
  state.revealed[playerIdx] = state.teams[playerIdx];
}

// What `observerIdx` can honestly claim to know about `targetIdx`'s team. Everyone always knows
// their own team (it's determined by their own hand/actions); anyone else's team is only known
// once it's been publicly revealed (announced, a played ♣Q, a solo/Hochzeit/Armut/Genschern
// declaration). AI decisions that depend on "is this player my partner" must go through this
// instead of reading `state.teams` directly, or they end up playing with information a real
// player wouldn't have yet.
function believedTeam(observerIdx, targetIdx) {
  if (targetIdx === observerIdx) return state.teams[observerIdx];
  return state.revealed[targetIdx];
}

// Whether the full Re/Kontra split is public knowledge yet. Solo, a resolved Hochzeit, Armut, and
// a used Genschern all fix a specific pairing the moment they're declared/resolved, so the whole
// table is implicitly known from that point on even without every player individually announcing.
// A plain Normal game has no such structural tell, so it only counts once every player has been
// explicitly revealed - otherwise showing a Re/Kontra point split would leak who's on which side
// before anyone announced it.
function teamsFullyKnown() {
  if (state.isSolo) return true;
  if (state.isHochzeit) return state.hochzeitResolved;
  if (state.isArmut) return true;
  if (state.genschernUsed) return true;
  return state.revealed.every(t => t !== null);
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

// How many tricks must have been played before the AI will even consider announcing each level.
// Tournament deadlines (ANNOUNCE_MIN_HAND) force every Absage to be committed early - by trick
// 2/3/4/5 for keine-90/60/30/schwarz respectively, since the hand-size floor keeps shrinking - so
// there's no room to "wait for more evidence" the way a naive fix might reach for. Instead these
// match each level's deadline exactly: the AI waits for the most evidence it's legally allowed to
// gather before deciding, rather than jumping at the first opportunity like the old code did.
const ABSAGE_MIN_TRICKS = { "90": 2, "60": 3, "30": 4, "schwarz": 5 };
// The opponent's own points (not the announcer's) are what each level actually claims about, so
// that's what gates escalation. `fraction` is how much of the opponent's pace-adjusted allowance
// (their threshold, pro-rated for tricks played so far) they're still permitted to have used up -
// the deeper the level, the less room for error is left to survive an unlucky trick or two.
const ABSAGE_OPPONENT_THRESHOLD = { "90": 90, "60": 60, "30": 30, "schwarz": 0 };
const ABSAGE_PACE_FRACTION = { "90": 0.5, "60": 0.35, "30": 0.2, "schwarz": 0 };

function aiConsiderAbsage(playerIdx) {
  if (playerIdx === 0) return;
  const team = state.teams[playerIdx];
  if (!team || !state.announcements[team].partnership) return;

  const opponentPoints = team === "RE" ? state.kontraCardPoints : state.reCardPoints;
  for (const level of ABSAGE_LEVELS) {
    if (state.announcements[team].levels.includes(level)) continue;
    if (state.trickNumber < ABSAGE_MIN_TRICKS[level]) break; // levels are checked in escalating order, so a later one would fail this too
    if (!canAnnounceAbsage(playerIdx, level)) break;
    const allowedSoFar = ABSAGE_OPPONENT_THRESHOLD[level] * (state.trickNumber / 12) * ABSAGE_PACE_FRACTION[level];
    if (opponentPoints <= allowedSoFar) announceAbsage(playerIdx, level);
    break;
  }
}

/* ============================== AI (card play) ============================= */

function chooseAiCard(playerIndex) {
  const hand = state.hands[playerIndex];
  const legal = getLegalMoves(hand, state.trick);
  if (legal.length === 1) return legal[0];

  if (state.trick.length === 0) {
    const plainAces = legal.filter(c => !isTrump(c) && c.rank === "A");
    if (plainAces.length > 0) return plainAces[0];
    const trumps = legal.filter(isTrump);
    if (trumps.length >= 5) return trumps.slice().sort((a, b) => trumpRank(b) - trumpRank(a))[0];
    const plains = legal.filter(c => !isTrump(c));
    if (plains.length > 0) return plains.slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
    return trumps.slice().sort((a, b) => trumpRank(b) - trumpRank(a))[0];
  }

  const myTeam = state.teams[playerIndex];
  const winningIdx = evaluateTrick(state.trick);
  // Only treat the current trick-winner as a partner worth feeding points to if their team has
  // actually been revealed - otherwise the AI would be playing with knowledge a real player at
  // the table doesn't have yet.
  const partnerWinning = myTeam !== null && believedTeam(playerIndex, winningIdx) === myTeam;
  const isLastToPlay = state.trick.length === 3;

  const winningMoves = legal.filter(card => {
    const hypothetical = state.trick.concat([{ playerIndex, card }]);
    return evaluateTrick(hypothetical) === playerIndex;
  });

  if (partnerWinning) {
    return legal.slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
  }

  const trickValueSoFar = state.trick.reduce((s, t) => s + cardValue(t.card), 0);

  if (winningMoves.length > 0 && (isLastToPlay || trickValueSoFar >= 8 || winningMoves.some(isTrump) === false)) {
    return winningMoves.slice().sort((a, b) => {
      const at = isTrump(a), bt = isTrump(b);
      if (at !== bt) return at ? 1 : -1;
      if (at && bt) return trumpRank(b) - trumpRank(a);
      return plainRank(b) - plainRank(a);
    })[0];
  }

  return legal.slice().sort((a, b) => {
    const at = isTrump(a), bt = isTrump(b);
    if (at !== bt) return at ? 1 : -1;
    return cardValue(a) - cardValue(b);
  })[0];
}

/* ============================== GENSCHERN =================================== */

function resolveGenschernChoice(chooserIdx, partnerIdx) {
  state.genschernUsed = true;
  state.teams = [0, 1, 2, 3].map(i => (i === chooserIdx || i === partnerIdx) ? "RE" : "KONTRA");
  state.revealed = state.teams.slice(); // declaring it is inherently public
  // Tricks already played were tallied under the OLD team split - rebuild the Re/Kontra totals
  // from the per-player ledgers now that the teams have changed, or points/bonuses already earned
  // would stay stuck under whichever side used to hold that player.
  recomputeTeamTotals();
  log(`${playerName(chooserIdx)} calls <b>"Genscher"</b> and picks ${playerName(partnerIdx)} as their new partner for the rest of the round!`, true);
  renderAll();
}

function aiGenschernPartnerChoice(chooserIdx) {
  let bestIdx = null, bestPoints = -1;
  for (let i = 0; i < 4; i++) {
    if (i === chooserIdx) continue;
    if (state.playerPoints[i] > bestPoints) { bestPoints = state.playerPoints[i]; bestIdx = i; }
  }
  return bestIdx;
}

/* ============================== TURN FLOW ================================= */

function playCard(playerIdx, card) {
  if (!state.roundActive || state.busy || state.phase !== "playing") return;
  if (playerIdx !== state.currentPlayer) return;

  const hand = state.hands[playerIdx];
  const legal = getLegalMoves(hand, state.trick);
  if (!legal.some(c => c.id === card.id)) {
    if (playerIdx === 0) log("That move isn't legal — you must follow suit if you can.");
    return;
  }

  state.hands[playerIdx] = hand.filter(c => c.id !== card.id);
  state.trick.push({ playerIndex: playerIdx, card });
  log(`${playerName(playerIdx)} plays <b>${cardLabelHtml(card)}</b>.`);
  if (card.suit === "C" && card.rank === "Q") revealPlayer(playerIdx);

  if (settings.genschern && state.genschernPlayer === playerIdx && !state.genschernUsed && card.suit === "D" && card.rank === "K") {
    state.genschernDKPlayed++;
    if (state.genschernDKPlayed === 2) {
      if (playerIdx === 0) {
        state.pendingGenschernChooser = 0;
        renderAll();
        return; // pause here - the human's modal choice will call continueAfterCardPlayed
      }
      resolveGenschernChoice(playerIdx, aiGenschernPartnerChoice(playerIdx));
    }
  }

  renderAll();
  continueAfterCardPlayed(playerIdx);
}

function continueAfterCardPlayed(playerIdx) {
  if (state.trick.length < 4) {
    state.currentPlayer = (playerIdx + 1) % 4;
    renderAll();
    maybeAiTurn();
  } else {
    state.busy = true;
    setTimeout(resolveTrick, 900);
  }
}

// Derives the Re/Kontra team totals from the per-player ledgers under the CURRENT state.teams.
// Must be called any time state.teams changes after tricks have already been played (currently
// only Genschern does this), or a stale team's totals would keep counting points/bonuses earned
// by a player who has since switched sides.
function recomputeTeamTotals() {
  state.reCardPoints = 0; state.kontraCardPoints = 0;
  state.reDoppelkopf = 0; state.kontraDoppelkopf = 0;
  state.reFuchs = 0; state.kontraFuchs = 0;
  state.reKarlchen = 0; state.kontraKarlchen = 0;
  for (let i = 0; i < 4; i++) {
    const team = state.teams[i];
    if (team !== "RE" && team !== "KONTRA") continue; // undecided (mid-Hochzeit) - nothing to credit yet
    const sign = team === "RE" ? "re" : "kontra";
    state[sign + "CardPoints"] += state.playerPoints[i];
    state[sign + "Doppelkopf"] += state.playerDoppelkopf[i];
    state[sign + "Fuchs"] += state.playerFuchs[i];
    state[sign + "Karlchen"] += state.playerKarlchen[i];
  }
}

function resolveTrick() {
  const winnerIdx = evaluateTrick(state.trick);

  // Hochzeit partnership resolution happens before points are credited, since crediting depends
  // on state.teams[winnerIdx] being correct.
  if (state.isHochzeit && !state.hochzeitResolved) {
    if (winnerIdx !== state.hochzeitAnnouncer) {
      state.teams[winnerIdx] = "RE";
      for (let i = 0; i < 4; i++) if (!state.teams[i]) state.teams[i] = "KONTRA";
      state.hochzeitResolved = true;
      log(`${playerName(winnerIdx)} wins the clarification trick and becomes ${playerName(state.hochzeitAnnouncer)}'s partner!`, true);
      revealPlayer(winnerIdx);
      for (let i = 1; i <= 3; i++) aiConsiderPartnership(i);
    } else if (state.trickNumber === 2) {
      // this is about to be the 3rd trick and the announcer has won all of them - auto-solo.
      state.isHochzeit = false;
      state.hochzeitResolved = true;
      state.isSolo = true;
      state.soloPlayer = state.hochzeitAnnouncer;
      state.gameType = GAME_TYPES.SOLO_D;
      state.teams = [0, 1, 2, 3].map(i => i === state.hochzeitAnnouncer ? "RE" : "KONTRA");
      state.trumpOrder = buildTrumpOrder(GAME_TYPES.SOLO_D, null);
      state.trumpRankMap = new Map(state.trumpOrder.map((k, i) => [k, i]));
      state.revealed = state.teams.slice();
      log(`${playerName(state.hochzeitAnnouncer)} took the first three tricks alone - the Hochzeit automatically becomes a <b>Diamonds Solo</b>! (score now tripled)`, true);
    }
  }

  const trickPoints = state.trick.reduce((s, t) => s + cardValue(t.card), 0);
  const winningTeam = state.teams[winnerIdx];

  state.playerPoints[winnerIdx] += trickPoints;
  if (trickPoints >= 40) state.playerDoppelkopf[winnerIdx]++;

  if (settings.fuchs) {
    for (const play of state.trick) {
      if (play.card.suit === "D" && play.card.rank === "A" && state.teams[play.playerIndex] !== winningTeam) {
        state.playerFuchs[winnerIdx]++;
        log(`${playerName(winnerIdx)}'s team catches a <b>Fuchs</b> (Diamond Ace)!`, true);
      }
    }
  }
  if (settings.karlchen && state.trickNumber === 11) {
    const clubJackPlay = state.trick.find(t => t.card.suit === "C" && t.card.rank === "J");
    if (clubJackPlay && clubJackPlay.playerIndex === winnerIdx) {
      state.playerKarlchen[winnerIdx] = 1;
      log(`${playerName(winnerIdx)} takes the last trick with the Club Jack - <b>Karlchen!</b>`, true);
    }
  }
  recomputeTeamTotals();

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
  if (!state.roundActive || state.phase !== "playing") return;
  if (state.pendingGenschernChooser !== null) return; // waiting on a human decision
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

// Whether an Absage ("keine 90/60/30", "schwarz") - a claim that the OPPONENT's card points will
// stay under a threshold - actually held, given the opponent's real final card points.
function metAbsageLevel(level, opponentPoints) {
  return level === "90" ? opponentPoints < 90
    : level === "60" ? opponentPoints < 60
      : level === "30" ? opponentPoints < 30
        : opponentPoints === 0;
}

// The strongest (most specific) claim a team made, since each deeper level subsumes the shallower
// ones (e.g. "schwarz" implies "keine 30" implies "keine 60" implies "keine 90").
function deepestAbsageLevel(levels) {
  for (let i = ABSAGE_LEVELS.length - 1; i >= 0; i--) {
    if (levels.includes(ABSAGE_LEVELS[i])) return ABSAGE_LEVELS[i];
  }
  return null;
}

function endRound() {
  state.roundActive = false;

  // An Absage raises the bar for actually winning the round, not just for bonus points: the
  // announcing side must make good on the deepest claim they made (that the opponent stays under
  // that many points), or they lose outright even if they'd otherwise clear the base 121.
  const reDeepest = deepestAbsageLevel(state.announcements.RE.levels);
  const kontraDeepest = deepestAbsageLevel(state.announcements.KONTRA.levels);
  const reContractFailed = reDeepest !== null && !metAbsageLevel(reDeepest, state.kontraCardPoints);
  const kontraContractFailed = kontraDeepest !== null && !metAbsageLevel(kontraDeepest, state.reCardPoints);

  let reWins = state.reCardPoints >= 121;
  let contractFlip = null;
  if (reContractFailed) { reWins = false; contractFlip = "RE"; }
  else if (kontraContractFailed) { reWins = true; contractFlip = "KONTRA"; }

  const loserPoints = reWins ? state.kontraCardPoints : state.reCardPoints;
  const winnerPoints = reWins ? state.reCardPoints : state.kontraCardPoints;

  let gameValue = 1;
  if (loserPoints < 90) gameValue++;
  if (loserPoints < 60) gameValue++;
  if (loserPoints < 30) gameValue++;
  if (loserPoints === 0) gameValue++;

  let announceBonus = 0;
  if (state.announcements.RE.partnership) announceBonus += 2;
  if (state.announcements.KONTRA.partnership) announceBonus += 2;

  const winnerTeam = reWins ? "RE" : "KONTRA";
  const loserTeam = reWins ? "KONTRA" : "RE";

  const winnerAbsageBonus = state.announcements[winnerTeam].levels.reduce((sum, level) =>
    sum + (metAbsageLevel(level, loserPoints) ? 1 : 0), 0);

  // Each Absage the LOSING side announced but failed to back up ("gegen die eigene Ansage
  // gespielt") is worth an extra point to the winner too - on top of costing them the round if it
  // was their deepest claim.
  const loserBrokenAbsageBonus = state.announcements[loserTeam].levels.reduce((sum, level) =>
    sum + (metAbsageLevel(level, winnerPoints) ? 0 : 1), 0);

  gameValue += announceBonus + winnerAbsageBonus + loserBrokenAbsageBonus;

  let net = reWins ? gameValue : -gameValue;
  net += (state.reDoppelkopf - state.kontraDoppelkopf);
  if (settings.fuchs) net += (state.reFuchs - state.kontraFuchs);
  if (settings.karlchen) net += (state.reKarlchen - state.kontraKarlchen);

  const roundSwings = [0, 0, 0, 0];
  state.teams.forEach((team, idx) => {
    const swing = team === "RE" ? net : -net;
    const playerSwing = state.isSolo && idx === state.soloPlayer ? swing * 3 : swing;
    state.matchScores[idx] += playerSwing;
    roundSwings[idx] = playerSwing;
  });

  if (contractFlip) {
    const deepest = contractFlip === "RE" ? reDeepest : kontraDeepest;
    const displayLabel = deepest === "schwarz" ? "schwarz" : `keine ${deepest}`;
    const opponentPoints = contractFlip === "RE" ? state.kontraCardPoints : state.reCardPoints;
    log(`${contractFlip}'s "${displayLabel}" call failed (opponent reached ${opponentPoints} pts) - ${winnerTeam} wins the round outright regardless of card points!`, true);
  }
  log(`Round ${state.roundNumber} over (${gameTypeDisplayLabel()}). Re: ${state.reCardPoints} pts, Kontra: ${state.kontraCardPoints} pts. ${reWins ? "RE" : "KONTRA"} wins the round.`, true);

  state.revealed = state.teams.slice();

  showRoundSummary({ reWins, gameValue, net, loserPoints, announceBonus, winnerAbsageBonus, loserBrokenAbsageBonus, roundSwings });
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
  const isMyTurn = state.roundActive && state.phase === "playing" && state.currentPlayer === 0 && !state.busy && state.pendingGenschernChooser === null;
  const legal = isMyTurn ? getLegalMoves(state.hands[0], state.trick) : [];
  for (const card of state.hands[0]) {
    const legalNow = !isMyTurn ? true : legal.some(c => c.id === card.id);
    const el = makeCardEl(card, {
      illegal: isMyTurn && !legalNow,
      onClick: () => { if (isMyTurn && legalNow) playCard(0, card); }
    });
    container.appendChild(el);
  }
  const teamLabel = state.teams[0] ? (state.isSolo && state.soloPlayer === 0 ? GAME_TYPE_LABEL[state.gameType] : state.teams[0]) : "undecided";
  document.getElementById("your-team").textContent = teamLabel;
  document.getElementById("your-points-tag").innerHTML = pointsTagHtml(0);
}

function teamTagHtml(team) {
  if (!team) return "";
  return ` <span class="team-tag ${team.toLowerCase()}">${team}</span>`;
}

// Card points a player has personally captured so far this round - each player's own pile of won
// tricks is physically visible to everyone at a real table, so this is never hidden information
// the way the Re/Kontra team split is.
function pointsTagHtml(idx) {
  if (!state.roundActive || state.phase !== "playing") return "";
  return ` <span class="points-tag">${state.playerPoints[idx]}</span>`;
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
    label.innerHTML = playerName(idx) + pointsTagHtml(idx) + teamTagHtml(state.revealed[idx]);
    label.classList.toggle("active", state.roundActive && state.phase === "playing" && state.currentPlayer === idx);
  }
  const label0 = document.querySelector(".hand-area .player-label");
  if (label0) label0.classList.toggle("active", state.roundActive && state.phase === "playing" && state.currentPlayer === 0);
}

function renderAnnouncements() {
  const panel = document.getElementById("announce-panel");
  if (!panel) return;
  if (!state.roundActive || state.phase !== "playing") { panel.classList.add("hidden"); return; }
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

function renderBidding() {
  const panel = document.getElementById("bidding-panel");
  if (!panel) return;
  if (!state.roundActive || state.phase !== "bidding" || state.biddingOrder[state.biddingStep] !== 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const hand = state.hands[0];
  const actions = document.getElementById("bidding-actions");
  actions.innerHTML = "";

  const addBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.className = "announce-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    actions.appendChild(b);
  };

  addBtn("Play normal", () => submitBiddingDeclaration(0, { type: "healthy" }));

  if (settings.schmeissen && hand.filter(c => c.rank === "K").length >= 5) {
    addBtn("Schmeissen (5+ Kings)", () => submitBiddingDeclaration(0, { type: "schmeissen" }));
  }
  if (settings.solos) {
    const soloTypes = [GAME_TYPES.SOLO_C, GAME_TYPES.SOLO_S, GAME_TYPES.SOLO_H, GAME_TYPES.SOLO_D, GAME_TYPES.SOLO_Q, GAME_TYPES.SOLO_J, GAME_TYPES.SOLO_FLESHLESS];
    for (const gt of soloTypes) {
      addBtn(GAME_TYPE_LABEL[gt], () => submitBiddingDeclaration(0, { type: "solo", soloType: gt }));
    }
  }
  if (settings.hochzeit && hand.filter(c => c.suit === "C" && c.rank === "Q").length === 2) {
    addBtn("Hochzeit", () => submitBiddingDeclaration(0, { type: "hochzeit" }));
  }
  if (settings.armut && countTrumpsForGameType(hand, GAME_TYPES.NORMAL) <= 3) {
    addBtn("Armut", () => submitBiddingDeclaration(0, { type: "armut" }));
  }
}

function gameTypeDisplayLabel() {
  if (state.isHochzeit) return state.hochzeitResolved ? "Hochzeit" : "Hochzeit (partner not yet determined)";
  if (state.isArmut) return "Armut";
  return GAME_TYPE_LABEL[state.gameType];
}

function renderGameTypeBanner() {
  const el = document.getElementById("game-type-banner");
  if (!el) return;
  if (!state.roundActive || state.phase !== "playing") { el.textContent = ""; return; }
  el.textContent = state.gameType === GAME_TYPES.NORMAL && !state.isHochzeit && !state.isArmut ? "" : gameTypeDisplayLabel();
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
  if (state.roundActive && state.phase === "playing") {
    const div = document.createElement("div");
    div.className = "sb-entry";
    if (teamsFullyKnown()) {
      div.innerHTML = `Trick ${state.trickNumber + 1}/12 &nbsp; Re: <b>${state.reCardPoints}</b> · Kontra: <b>${state.kontraCardPoints}</b>`;
    } else {
      const totalPoints = state.reCardPoints + state.kontraCardPoints;
      div.innerHTML = `Trick ${state.trickNumber + 1}/12 &nbsp; Points taken so far: <b>${totalPoints}</b>`;
    }
    sb.appendChild(div);
  }
}

function renderTurnIndicator() {
  const el = document.getElementById("turn-indicator");
  if (!state.roundActive) { el.textContent = ""; return; }
  if (state.phase === "bidding") { el.textContent = "Waiting on reservations…"; return; }
  if (state.pendingGenschernChooser !== null) { el.textContent = "Choose your new partner!"; return; }
  el.textContent = state.currentPlayer === 0 ? "Your turn" : `${playerName(state.currentPlayer)} is thinking…`;
}

function renderAll() {
  renderHand();
  renderOpponents();
  renderTrick();
  renderScoreboard();
  renderTurnIndicator();
  renderAnnouncements();
  renderBidding();
  renderGameTypeBanner();
  renderGenschernModal();
}

/* ============================== MODALS ===================================== */

function showModal(html) {
  document.getElementById("modal").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function hideModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function renderGenschernModal() {
  if (state.pendingGenschernChooser === null) return;
  const chooser = state.pendingGenschernChooser;
  const options = [0, 1, 2, 3].filter(i => i !== chooser)
    .map(i => `<button class="genschern-choice" data-idx="${i}">${playerName(i)}</button>`).join("");
  showModal(`
    <h2>Genscher!</h2>
    <p>You've played your second Diamond King. Choose your partner for the rest of the round:</p>
    <div class="modal-actions">${options}</div>
  `);
  for (const btn of document.querySelectorAll(".genschern-choice")) {
    btn.addEventListener("click", () => {
      const partnerIdx = parseInt(btn.dataset.idx, 10);
      hideModal();
      state.pendingGenschernChooser = null; // clear before resolving, so its internal renderAll() doesn't re-show this modal
      resolveGenschernChoice(chooser, partnerIdx);
      continueAfterCardPlayed(chooser);
    });
  }
}

function showRoundSummary(info) {
  const reTeamPlayers = state.teams.map((t, i) => t === "RE" ? playerName(i) : null).filter(Boolean).join(", ");
  const kontraTeamPlayers = state.teams.map((t, i) => t === "KONTRA" ? playerName(i) : null).filter(Boolean).join(", ");
  const bonusBits = [];
  if (state.reDoppelkopf + state.kontraDoppelkopf > 0) bonusBits.push(`Doppelkopf bonuses (Re ${state.reDoppelkopf}, Kontra ${state.kontraDoppelkopf})`);
  if (settings.fuchs && (state.reFuchs + state.kontraFuchs) > 0) bonusBits.push(`Fuchs bonuses (Re ${state.reFuchs}, Kontra ${state.kontraFuchs})`);
  if (settings.karlchen && (state.reKarlchen + state.kontraKarlchen) > 0) bonusBits.push(`Karlchen (Re ${state.reKarlchen}, Kontra ${state.kontraKarlchen})`);
  if (info.announceBonus > 0) bonusBits.push(`${info.announceBonus} for announced Re/Kontra`);
  if (info.winnerAbsageBonus > 0) bonusBits.push(`${info.winnerAbsageBonus} for fulfilled Absage(n)`);
  if (info.loserBrokenAbsageBonus > 0) bonusBits.push(`${info.loserBrokenAbsageBonus} for the losing side's broken Absage(n)`);

  const playerRows = [0, 1, 2, 3].map(i => {
    const swing = info.roundSwings[i];
    const swingText = `${swing > 0 ? "+" : ""}${swing}`;
    return `<tr>
      <td>${playerName(i)}${teamTagHtml(state.teams[i])}</td>
      <td>${swingText}</td>
      <td><b>${state.matchScores[i]}</b></td>
    </tr>`;
  }).join("");

  showModal(`
    <h2>${info.reWins ? "RE wins the round!" : "KONTRA wins the round!"}</h2>
    <p><b>${gameTypeDisplayLabel()}</b>${state.isSolo ? " - score tripled for the solo player" : ""}</p>
    <p>Card points — Re (${reTeamPlayers}): <b>${state.reCardPoints}</b> &nbsp; Kontra (${kontraTeamPlayers}): <b>${state.kontraCardPoints}</b></p>
    <p>Game value: <b>${info.gameValue}</b> point${info.gameValue === 1 ? "" : "s"}
      (loser had ${info.loserPoints} pts)${bonusBits.length > 0 ? " + " + bonusBits.join(", ") : ""}.</p>
    <table>
      <tr><th>Player</th><th>This round</th><th>Match total</th></tr>
      ${playerRows}
    </table>
    <div class="modal-actions">
      <button id="modal-close">Continue</button>
    </div>
  `);
  document.getElementById("modal-close").addEventListener("click", hideModal);
}

/* ============================== INIT ======================================= */

function copyLogText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => copyLogTextFallback(text, onDone));
  } else {
    copyLogTextFallback(text, onDone);
  }
}

function copyLogTextFallback(text, onDone) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* clipboard unavailable - nothing more we can do */ }
  document.body.removeChild(ta);
  onDone();
}

function copyLog() {
  const lines = Array.from(document.querySelectorAll("#log .log-entry")).map(el => el.textContent);
  const btn = document.getElementById("btn-copy-log");
  const original = btn.textContent;
  copyLogText(lines.join("\n"), () => {
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

function newMatch() {
  state.matchScores = [0, 0, 0, 0];
  state.dealer = -1;
  state.roundNumber = 0;
  document.getElementById("log").innerHTML = "";
  document.getElementById("btn-new-match").classList.add("hidden");
  document.getElementById("btn-new-round").classList.add("hidden");
  document.getElementById("btn-start").classList.remove("hidden");
  document.getElementById("settings-panel").classList.remove("hidden");
  renderScoreboard();
  log("New match started. Adjust house rules below, then click \"Start Match\".", true);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-start").addEventListener("click", dealNewRound);
  document.getElementById("btn-new-round").addEventListener("click", dealNewRound);
  document.getElementById("btn-new-match").addEventListener("click", newMatch);
  document.getElementById("btn-copy-log").addEventListener("click", copyLog);
  document.getElementById("btn-announce-partnership").addEventListener("click", () => announcePartnership(0));
  for (const level of ABSAGE_LEVELS) {
    document.getElementById(`btn-absage-${level}`).addEventListener("click", () => announceAbsage(0, level));
  }
  renderScoreboard();
  log("Welcome to Doppelkopf! Adjust house rules below, then click \"Start Match\".", true);
});
