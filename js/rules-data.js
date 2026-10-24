/*
 * Règles d'un pouvoir : « quand <déclencheur> : <actions> », avec des conditions (« si … alors … sinon … »), des durées
 * (« pendant N s »), des délais (« attendre N s ») et des compteurs. C'est ce qui permet de refaire les pouvoirs sur
 * mesure d'UHC-Meetup (démons de Demon Slayer : kill, mort d'un rôle, jour / nuit, coups, charges, etc.).
 *
 * Les règles sont enregistrées telles quelles dans le champ "rules" du pouvoir (même arbre que les blocs) :
 *   règle   = { on: DÉCLENCHEUR, p: { paramètres }, cd: cooldown (s, 0 = aucun), do: [nœuds] }
 *   nœud    = { a: ACTION, p: { paramètres } }                                 (action)
 *           | { a: "IF", c: { k: CONDITION, p: { … } }, do: [nœuds], else: [nœuds] }
 *           | { a: "DURING", p: { s }, do: [nœuds chaque seconde], end: [nœuds à la fin] }
 *           | { a: "WAIT", p: { s }, do: [nœuds] }
 * Le .jar reçoit ce même arbre en JSON (RuleEngine.java le lit et l'exécute).
 *
 * Paramètres : num [min, max, pas, défaut], sel [[valeur, libellé]…], bool [non, oui], role ("meetup:NezukoV2" ou
 * "addon:<constante du rôle>"), team ("meetup:Demon" ou "addon:<constante de l'équipe>"), effect (PotionEffectType), text,
 * counter (nom de compteur), barname (nom d'un affichage de la barre d'action), var (variable de l'addon : menu Variables).
 * Un paramètre num peut aussi valoir { var: "nom" } : la valeur d'une variable (nombre) de l'addon, lue au moment de l'action.
 * Libellés : {param} est remplacé par le champ du bloc.
 */
const RULES = (function () {
  "use strict";

  const num = function (min, max, step, dflt) { return { type: "num", min: min, max: max, step: step, dflt: dflt }; };
  const sel = function (options, dflt) { return { type: "sel", options: options, dflt: dflt === undefined ? options[0][0] : dflt }; };
  const bool = function (no, yes) { return { type: "bool", no: no, yes: yes, dflt: false }; };
  const OPS = [["GE", "≥"], ["LE", "≤"], ["EQ", "="]];
  // variables de l'addon (menu Variables) : nombre entier, nombre à virgule, vrai / faux ; une valeur par joueur ou une seule
  const NUMVAR = ["INT", "DOUBLE"];
  const varp = function (kinds, extra) { return Object.assign({ type: "var", kinds: kinds }, extra || {}); };
  const OF = function (extra) { return Object.assign(sel([["ME", "(la mienne)"], ["SUBJECT", "(celle du joueur concerné)"]]), extra || {}); };
  // paramètres qui désignent « le joueur concerné » (refusés si le déclencheur n'en a pas)
  const WHO_KEYS = ["to", "who", "of", "of2", "hpwho"];

  // destinataire d'une action : moi, le joueur concerné (selon le déclencheur), les joueurs autour, le joueur d'un rôle
  // (ALL, TEAM, RANDOM, MARKED : jamais moi)
  const TO = {
    to: sel([["ME", "moi"], ["SUBJECT", "le joueur concerné"], ["AROUND_E", "les ennemis autour de moi"],
      ["AROUND", "tous les joueurs autour de moi"], ["ROLE", "le joueur qui a le rôle"], ["ALL", "tous les joueurs en vie"],
      ["TEAM", "les joueurs du camp"], ["RANDOM", "un joueur au hasard du camp"], ["MARKED", "les joueurs portant la marque"]]),
    r: Object.assign(num(1, 100, 1, 20), { showIf: { to: ["AROUND_E", "AROUND"] }, after: "to", prefix: "dans un rayon de", suffix: "blocs" }),
    role: { type: "role", showIf: { to: ["ROLE"] }, after: "to" },
    tteam: { type: "team", showIf: { to: ["TEAM", "RANDOM"] }, after: "to" },
    mark: { type: "barname", showIf: { to: ["MARKED"] }, after: "to" }
  };
  // titans d'UHC-Meetup (enum TitanForm, classes fr.nicknqck.titans.impl.<Nom>V2)
  const TITANS = [["ASSAILLANT", "Assaillant"], ["BESTIAL", "Bestial"], ["CHARETTE", "Charette"], ["COLOSSAL", "Colossal"],
    ["CUIRASSE", "Cuirassé"], ["MACHOIRE", "Mâchoire"], ["WARHAMMER", "Warhammer"]];
  const titanSel = function (first) {
    return sel((first || []).concat(TITANS.map(function (t) { return [t[0], "le titan " + t[1]]; })));
  };
  const withTo = function (params) { return Object.assign({}, params, TO); };

  // ---- déclencheurs : subject = libellé du « joueur concerné » (null = aucun ; fonction : selon les paramètres) ----
  const TRIGGERS = {
    START: { label: "au début de la partie", subject: null },
    EVERY: { label: "toutes les {s} s", params: { s: num(1, 3600, 1, 10) }, subject: null },
    DAY: { label: "quand le jour se lève", subject: null },
    NIGHT: { label: "quand la nuit tombe", subject: null },
    KILL: { label: "quand je tue un joueur", subject: "le joueur tué" },
    DEATH: { label: "quand un autre joueur meurt", subject: "le joueur mort" },
    GAPPLE: { label: "quand je mange une pomme d'or", subject: null },
    GAPPLE_OTHER: { label: "quand un autre joueur mange une pomme d'or", subject: "ce joueur" },
    HIT_GIVEN: { label: "quand je frappe un joueur {with}", params: { with: sel([["ANY", "(avec n'importe quoi)"], ["SWORD", "avec une épée"], ["ITEM", "avec l'objet de ce pouvoir"], ["ARROW", "avec une flèche (projectile)"]]) },
      subject: "le joueur frappé" },
    HIT_TAKEN: { label: "quand on me frappe", subject: "mon attaquant" },
    // Attaque des Titans (titans d'UHC-Meetup, équipement tridimensionnel, pouvoirs d'information)
    TRANSFORM: { label: "quand je {when}", params: { when: sel([["START", "me transforme en titan"], ["END", "redeviens humain"],
      ["ANY", "me transforme en titan ou redeviens humain"]]) }, subject: null },
    TRIDI: { label: "quand je me téléporte avec mon équipement tridimensionnel", subject: null },
    TITAN_GOT: { label: "quand je récupère un titan (/aot steal)", subject: null },
    INFO_ON_ME: { label: "quand un pouvoir cherche une information sur moi", subject: "le joueur qui la cherche" },
    HITS: { label: "tous les {n} coups donnés {per}", params: { n: num(2, 500, 1, 15), per: sel([["SAME", "au même joueur"], ["TOTAL", "au total"]]) },
      subject: "le joueur frappé" },
    // utilisation du pouvoir : clic avec l'objet (pouvoir d'objet) ou commande tapée (pouvoir de commande sans effets)
    USE: { label: "quand j'utilise ce pouvoir {click} {target}", params: {
        click: sel([["ANY", "(clic droit ou gauche)"], ["RIGHT", "(clic droit)"], ["LEFT", "(clic gauche)"]]),
        target: sel([["NONE", "sans cible"], ["AIM", "en visant un joueur"], ["ARG", "sur le joueur nommé dans la commande"],
          ["NUM", "avec un nombre dans la commande"]]),
        d: Object.assign(num(1, 100, 1, 30), { showIf: { target: ["AIM"] }, after: "target", prefix: "à moins de", suffix: "blocs" }),
        max: Object.assign(num(1, 3600, 1, 60), { showIf: { target: ["NUM"] }, after: "target", prefix: "de 1 à" }) },
      subject: function (p) { return p && (p.target === "ARG" || p.target === "AIM") ? (p.target === "ARG" ? "le joueur nommé" : "le joueur visé") : null; } }
  };
  /** « de » + un joueur, contracté : « du joueur tué », « de mon attaquant ». */
  const deOf = function (who) { return /^le /.test(who) ? "du " + who.slice(3) : /^les /.test(who) ? "des " + who.slice(4) : "de " + who; };
  /** Libellé du « joueur concerné » d'une règle (null = aucun). */
  const subjectOf = function (on, p) {
    const s = TRIGGERS[on] && TRIGGERS[on].subject;
    return typeof s === "function" ? s(p || {}) : s || null;
  };

  // ---- conditions (capteurs ⬡ d'un « si ») ----
  const CONDITIONS = {
    S_ROLE: { label: "le joueur concerné a le rôle {role}", params: { role: { type: "role" } }, needsSubject: true },
    S_TEAM: { label: "le joueur concerné est dans le camp {team}", params: { team: { type: "team" } }, needsSubject: true },
    MY_TEAM: { label: "je suis dans le camp {team}", params: { team: { type: "team" } } },
    NIGHT: { label: "c'est la nuit" },
    DAY: { label: "c'est le jour" },
    CHANCE: { label: "chance de {pct} %", params: { pct: num(1, 99, 1, 25) } },
    COUNTER: { label: "compteur {name} {op} {v}", params: { name: { type: "counter" }, op: sel(OPS), v: num(-100000, 100000, 1, 50) } },
    NEAR_ROLE: { label: "je suis à moins de {r} blocs de {role}", params: { r: num(1, 200, 1, 50), role: { type: "role" } } },
    ROLE_DEAD: { label: "{role} est mort ou absent de la partie", params: { role: { type: "role" } } },
    ROLE_ALIVE: { label: "{role} est en vie", params: { role: { type: "role" } } },
    HP: { label: "{who} {op} {hearts} ❤ de vie", params: { who: sel([["ME", "j'ai"], ["SUBJECT", "le joueur concerné a"]]), op: sel(OPS), hearts: num(0.5, 100, 0.5, 7) } },
    MAXHP: { label: "j'ai {op} {hearts} ❤ max", params: { op: sel(OPS), hearts: num(0.5, 100, 0.5, 4) } },
    SNEAK: { label: "je suis accroupi" },
    IN_WATER: { label: "je suis dans l'eau" },
    ON_FIRE: { label: "je suis en feu" },
    IN_FIRE: { label: "je suis dans la lave ou le feu" },
    S_MARKED: { label: "le joueur concerné porte la marque {name}", params: { name: { type: "barname" } }, needsSubject: true },
    S_EFFECT: { label: "le joueur concerné a l'effet {effect}", params: { effect: { type: "effect" } }, needsSubject: true },
    NO_ARMOR: { label: "je ne porte aucune armure" },
    // variables de l'addon
    VAR_CMP: { label: "la variable {var} {of} {op} {src}", params: { var: varp(NUMVAR), of: OF(),
      op: sel([["GE", "≥"], ["LE", "≤"], ["GT", ">"], ["LT", "<"], ["EQ", "="], ["NE", "≠"]]),
      src: sel([["NUM", "le nombre"], ["VAR", "la variable"]]),
      n: Object.assign(num(-1000000, 1000000, 0.01, 0), { showIf: { src: ["NUM"] }, after: "src" }),
      var2: varp(NUMVAR, { showIf: { src: ["VAR"] }, after: "src" }), of2: OF({ showIf: { src: ["VAR"] }, after: "src" }) } },
    VAR_IS: { label: "la variable {var} {of} est {state}", params: { var: varp(["BOOL"]), of: OF(), state: sel([["TRUE", "vraie"], ["FALSE", "fausse"]]) } },
    ME_MARKED: { label: "je porte la marque {name}", params: { name: { type: "barname" } } },
    S_NEAR: { label: "le joueur concerné est à moins de {r} blocs de moi", params: { r: num(1, 200, 1, 15) }, needsSubject: true },
    HIT_ZONE: { label: "la flèche a touché {zone}", params: { zone: sel([["HEAD", "la tête"], ["BODY", "le torse"], ["LEGS", "les jambes"]]) },
      needsSubject: true, arrowOnly: true },
    // titans (Attaque des Titans)
    ME_TITAN: { label: "je suis transformé en titan" },
    S_TITAN: { label: "le joueur concerné est transformé en titan", needsSubject: true },
    HAS_TITAN: { label: "{who} {titan}", params: { who: sel([["ME", "j'ai"], ["SUBJECT", "le joueur concerné a"]]),
      titan: titanSel([["ANY", "un titan"], ["MAHR", "un titan des Mahr"]]) } },
    TITAN_TAKEN: { label: "{titan} appartient à un joueur", params: { titan: titanSel() } }
  };

  // ---- actions ----
  const ACTIONS = {
    EFFECT: { label: "donner {effect} niveau {level} pendant {s} s à {to}", params: withTo({ effect: { type: "effect" }, level: num(1, 10, 1, 1), s: num(1, 1600, 1, 10) }) },
    CLEAR_EFFECT: { label: "retirer l'effet {effect} à {to}", params: withTo({ effect: { type: "effect" } }) },
    FORCE: { label: "{pct} % de force pour {to} pendant {s} s (0 = toujours)", params: withTo({ pct: num(-100, 100, 1, 10), s: num(0, 3600, 1, 0) }) },
    RESI: { label: "{pct} % de résistance pour {to} pendant {s} s (0 = toujours)", params: withTo({ pct: num(-100, 100, 1, 10), s: num(0, 3600, 1, 0) }) },
    SPEED: { label: "{pct} % de vitesse pour {to} pendant {s} s (0 = toujours)", params: withTo({ pct: num(-100, 100, 1, 10), s: num(0, 3600, 1, 0) }) },
    MAXHP: { label: "{hearts} ❤ max pour {to} (négatif pour retirer)", params: withTo({ hearts: num(-10, 10, 0.5, 1) }) },
    HEAL: { label: "soigner {to} de {hearts} ❤", params: withTo({ hearts: num(0.5, 20, 0.5, 0.5) }) },
    DAMAGE: { label: "infliger {hearts} ❤ à {to} (sans tuer)", params: withTo({ hearts: num(0.5, 20, 0.5, 1) }) },
    STUN: { label: "étourdir {to} pendant {s} s {blind}", params: withTo({ s: num(1, 30, 1, 2), blind: bool("sans l'aveugler", "en l'aveuglant") }) },
    BLOCK_POWERS: { label: "empêcher {to} d'utiliser ses pouvoirs pendant {s} s", params: withTo({ s: num(1, 300, 1, 10) }) },
    IMMUNE: { label: "rendre {to} insensible {dmg} pendant {s} s (0 = toujours)", params: withTo({ dmg: sel([["FALL", "aux chutes"], ["FIRE", "au feu et à la lave"], ["FIRE_FALL", "au feu, à la lave et aux chutes"]]), s: num(0, 3600, 1, 0) }) },
    FIRE: { label: "enflammer {to} pendant {s} s", params: withTo({ s: num(1, 30, 1, 5) }) },
    KNOCKBACK: { label: "repousser {to}, force {n}", params: withTo({ n: num(1, 10, 1, 2) }) },
    PULL: { label: "attirer {to} vers moi, force {n}", params: withTo({ n: num(1, 10, 1, 3) }) },
    UP: { label: "propulser {to} de {n} blocs vers le haut {safe}", params: withTo({ n: num(1, 100, 1, 10), safe: bool("avec dégâts de chute", "sans dégâts de chute") }) },
    LIGHTNING: { label: "faire tomber un éclair sur {to}", params: withTo({}) },
    LOOK: { label: "faire regarder {dir} à {to}", params: withTo({ dir: sel([["UP", "le ciel"], ["DOWN", "le sol"]]) }) },
    MARK: { label: "marquer {to} avec la marque {name} pendant {s} s (0 = toujours)", params: withTo({ name: { type: "barname" }, s: num(0, 3600, 1, 10) }) },
    UNMARK: { label: "retirer la marque {name} à {to}", params: withTo({ name: { type: "barname" } }) },
    ABSORB: { label: "{mode} {hearts} ❤ d'absorption à {to}", params: withTo({ mode: sel([["ADD", "ajouter"], ["SET", "mettre à"]]), hearts: num(0, 20, 0.5, 1) }) },
    GIVE_ITEM: { label: "donner {qty} × {item} « {text} » tranchant {sharp} à {to}",
      params: withTo({ qty: num(1, 64, 1, 1), item: sel(typeof ITEMS === "undefined" ? [["DIAMOND_SWORD", "épée en diamant"]] : ITEMS.map(function (i) { return [i.id, i.name]; }), "DIAMOND_SWORD"),
        text: { type: "text", max: 40, dflt: "&bÉpée" }, sharp: num(0, 10, 1, 0) }) },
    DASH: { label: "propulser {to} vers l'avant (là où il regarde), force {n}", params: withTo({ n: num(1, 10, 1, 3) }) },
    TP_TO: { label: "me téléporter {how} {to}", params: withTo({ how: sel([["BEHIND", "derrière"], ["AROUND", "à côté de"], ["ON", "sur"]]) }) },
    BRING: { label: "téléporter {to} {how} moi", params: withTo({ how: sel([["FRONT", "devant"], ["AROUND", "autour de"], ["ON", "sur"]]) }) },
    COUNT: { label: "compter {to} {filter} {team} dans le compteur {name}",
      params: withTo({ filter: sel([["ALL", "(tous les camps)"], ["IN", "du camp"], ["OUT", "hors du camp"]]),
        team: { type: "team", showIf: { filter: ["IN", "OUT"] } }, name: { type: "counter" } }) },
    INVERT: { label: "retourner {to} (il regarde derrière lui)", params: withTo({}) },
    MESSAGE: { label: "envoyer « {text} » à {to}", params: withTo({ text: { type: "text", max: 100, dflt: "&7..." } }) },
    TEAM: { label: "passer {to} dans le camp {team}", params: withTo({ team: { type: "team" } }) },
    COUNTER_ADD: { label: "ajouter {n} au compteur {name}, entre {min} et {max}", params: { name: { type: "counter" }, n: num(-100000, 100000, 1, 1), min: num(-100000, 100000, 1, 0), max: num(-100000, 100000, 1, 100) } },
    COUNTER_SET: { label: "mettre le compteur {name} à {n}", params: { name: { type: "counter" }, n: num(-100000, 100000, 1, 0) } },
    SHOW_COUNTER: { label: "afficher « {text} » + compteur {name} dans ma barre d'action", params: { text: { type: "text", max: 40, dflt: "&bCharge :&c" }, name: { type: "counter" } } },
    // barre d'action d'un joueur (GamePlayer.getActionBarManager()) : texte mis à jour chaque seconde ;
    // %temps% = temps restant, %joueur% = joueur concerné, %nom_du_compteur% = valeur d'un compteur
    BAR_SHOW: { label: "afficher « {text} » dans la barre d'action de {to} (affichage {name}) pendant {s} s (0 = jusqu'au retrait)",
      params: withTo({ text: { type: "text", max: 60, dflt: "&bTemps restant :&c %temps%" }, name: { type: "barname" }, s: num(0, 3600, 1, 10) }) },
    BAR_HIDE: { label: "retirer l'affichage {name} de la barre d'action de {to}", params: withTo({ name: { type: "barname" } }) },
    // Attaque des Titans (titans d'UHC-Meetup, lances, vol de titan) et pouvoirs d'information
    TITAN_GIVE: { label: "recevoir {titan}", params: { titan: titanSel([["RANDOM", "un titan au hasard (que personne n'a)"]]) } },
    TITAN_FLAG: { label: "me déclarer {state}", params: { state: sel([["ON", "transformé en titan (pour toujours)"], ["OFF", "redevenu humain"]]) } },
    STEAL: { label: "permettre à {to} de voler un titan (/aot steal), priorité {n} (0 = ne plus pouvoir)", params: withTo({ n: num(0, 10000, 1, 1) }) },
    LANCE: { label: "donner {n} lance(s) explosive(s) à {to}", params: withTo({ n: num(1, 10, 1, 1) }) },
    KNOW: { label: "ajouter {to} à ma description sous « {text} »", params: withTo({ text: { type: "text", max: 60, dflt: "&7Vos alliés :" } }) },
    INFO: { label: "apprendre {what} de {to}", params: withTo({ what: sel([["TEAM", "le camp"], ["ROLE", "le rôle"], ["INV", "l'inventaire (il s'ouvre)"]]) }) },
    REDIRECT: { label: "faire viser à la place un joueur au hasard du camp {team}", params: { team: { type: "team" } }, infoOnly: true },
    HIT_DAMAGE: { label: "{pct} % de dégâts pour ce coup", params: { pct: num(-90, 300, 1, 10) }, hitOnly: true },
    TP_RANDOM: { label: "téléporter moi et {to} à {d} blocs d'ici, dans une direction au hasard (au même endroit)", params: withTo({ d: num(10, 1000, 1, 150) }) },
    REWIND: { label: "me ramener là où j'étais il y a {s} s (ou le nombre tapé dans la commande)", params: { s: num(1, 60, 1, 10) } },
    GEAR: { label: "{mode} aux autres joueurs l'armure et l'objet en main de {to}", params: withTo({
      mode: sel([["HIDE", "cacher"], ["SHOW", "montrer à nouveau"]]),
      s: Object.assign(num(1, 3600, 1, 180), { showIf: { mode: ["HIDE"] }, after: "to", prefix: "pendant", suffix: "s" }) }) },
    FIREWORK: { label: "lancer un feu d'artifice {color} sur {to}", params: withTo({ color: sel([["GREEN", "vert"], ["RED", "rouge"], ["BLUE", "bleu"],
      ["YELLOW", "jaune"], ["WHITE", "blanc"], ["ORANGE", "orange"], ["PURPLE", "violet"]]) }) },
    // variables de l'addon (menu Variables)
    VAR_NUM: { label: "variable {var} {of} {op} {src}", params: { var: varp(NUMVAR), of: OF(),
      op: sel([["SET", "="], ["ADD", "+="], ["SUB", "−="], ["MUL", "×="], ["DIV", "÷="]]),
      src: sel([["NUM", "le nombre"], ["VAR", "la variable"], ["RANDOM", "un nombre au hasard entre"], ["HP", "la vie (❤) de"], ["MAXHP", "la vie max (❤) de"]]),
      n: Object.assign(num(-1000000, 1000000, 0.01, 1), { showIf: { src: ["NUM"] }, after: "src" }),
      var2: varp(NUMVAR, { showIf: { src: ["VAR"] }, after: "src" }), of2: OF({ showIf: { src: ["VAR"] }, after: "src" }),
      lo: Object.assign(num(-1000000, 1000000, 0.01, 1), { showIf: { src: ["RANDOM"] }, after: "src" }),
      hi: Object.assign(num(-1000000, 1000000, 0.01, 10), { showIf: { src: ["RANDOM"] }, after: "src", prefix: "et" }),
      hpwho: Object.assign(sel([["ME", "moi"], ["SUBJECT", "le joueur concerné"]]), { showIf: { src: ["HP", "MAXHP"] }, after: "src" }) } },
    VAR_BOOL: { label: "variable {var} {of} {state}", params: { var: varp(["BOOL"]), of: OF(),
      state: sel([["TRUE", "devient vraie"], ["FALSE", "devient fausse"], ["TOGGLE", "s'inverse"], ["COPY", "prend la valeur de"]]),
      var2: varp(["BOOL"], { showIf: { state: ["COPY"] }, after: "state" }), of2: OF({ showIf: { state: ["COPY"] }, after: "state" }) } },
    // conteneurs
    EACH: { label: "pour chaque joueur parmi {to}, dans un ordre au hasard (« le joueur concerné » = ce joueur) :",
      params: Object.assign(withTo({}), { to: Object.assign({}, TO.to, { dflt: "ALL" }) }), container: ["do"] },
    IF: { label: "si ⬡ alors", container: ["do", "else"] },
    DURING: { label: "pendant {s} s, chaque seconde :", params: { s: num(1, 3600, 1, 30) }, container: ["do", "end"] },
    WAIT: { label: "attendre {s} s, puis :", params: { s: num(1, 3600, 1, 10) }, container: ["do"] }
  };

  const MAX_RULES = 12, MAX_NODES = 120, MAX_DEPTH = 6;

  // rôle ou camp : "meetup:<constante UHC-Meetup>" ou "addon:<constante de l'addon>" (mêmes clés que le champ Équipe)
  const keyOk = function (v) { return /^(meetup|addon):[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(v); };

  /** Valeurs par défaut des paramètres d'un déclencheur / d'une condition / d'une action. */
  function defaults(spec) {
    const p = {};
    Object.keys(spec.params || {}).forEach(function (k) {
      const d = spec.params[k];
      p[k] = d.type === "num" || d.type === "sel" || d.type === "bool" ? d.dflt : d.type === "text" ? d.dflt || ""
        : d.type === "counter" ? "charge" : d.type === "barname" ? "info" : "";
    });
    return p;
  }
  const visible = function (d, p) {
    return !d || !d.showIf || Object.keys(d.showIf).every(function (k) { return d.showIf[k].indexOf(p[k]) !== -1; });
  };

  /**
   * Vérifie et nettoie les paramètres. ctx = { roles: [clés valides], teams: [clés valides], potions: { ID: libellé },
   * mcText: RegExp }. Retourne { p } ou { error }.
   */
  function cleanParams(spec, raw, ctx, where) {
    const out = {};
    const params = spec.params || {};
    raw = raw && typeof raw === "object" ? raw : {};
    for (const k of Object.keys(params)) {
      const d = params[k];
      let v = raw[k];
      if (!visible(d, Object.assign({}, defaults(spec), raw))) { out[k] = defaults(spec)[k]; continue; }
      // paramètre ajouté après coup (quantité d'objets...) : un .json plus ancien prend la valeur par défaut
      if (v === undefined && (d.type === "num" || d.type === "sel" || d.type === "bool")) v = d.dflt;
      switch (d.type) {
        case "num":
          if (v && typeof v === "object") { // valeur d'une variable (nombre) : bornée et arrondie comme le champ, au moment de l'action
            const vr = varCheck(v.var, NUMVAR, ctx);
            if (vr) return { error: where + " : " + vr };
            v = { var: v.var, min: d.min, max: d.max, step: d.step };
            break;
          }
          if (typeof v !== "number" || !isFinite(v) || v < d.min || v > d.max || Math.abs(Math.round(v / d.step) * d.step - v) > 1e-9)
            return { error: where + " : valeur invalide (" + v + ")." };
          break;
        case "var": {
          const vr = varCheck(v, d.kinds, ctx);
          if (vr) return { error: where + " : " + vr };
          break;
        }
        case "sel": if (!d.options.some(function (o) { return o[0] === v; })) return { error: where + " : choix invalide." }; break;
        case "bool": if (typeof v !== "boolean") v = false; break;
        case "role": if (typeof v !== "string" || !keyOk(v) || (ctx.roles && ctx.roles.indexOf(v) === -1)) return { error: where + " : choisis un rôle." }; break;
        case "team": if (typeof v !== "string" || !keyOk(v) || (ctx.teams && ctx.teams.indexOf(v) === -1)) return { error: where + " : choisis un camp." }; break;
        case "effect": if (!ctx.potions || !ctx.potions[v]) return { error: where + " : choisis un effet." }; break;
        case "text":
          if (typeof v !== "string" || !v.length || v.length > (d.max || 100) || (ctx.mcText && !ctx.mcText.test(v))) return { error: where + " : texte invalide." };
          break;
        case "counter": if (typeof v !== "string" || !/^[a-z][a-z0-9_]{0,15}$/.test(v)) return { error: where + " : nom de compteur invalide (minuscules, chiffres, _)." }; break;
        case "barname": if (typeof v !== "string" || !/^[a-z][a-z0-9_]{0,15}$/.test(v)) return { error: where + " : nom d'affichage invalide (minuscules, chiffres, _)." }; break;
      }
      out[k] = v;
    }
    return { p: out };
  }

  /** Variable valable ? ctx.vars = [{ name, type }] (null : seul le format est vérifié). Retourne un message ou "". */
  function varCheck(name, kinds, ctx) {
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]{0,15}$/.test(name)) return "choisis une variable.";
    if (!ctx.vars) return "";
    const v = ctx.vars.find(function (x) { return x.name === name; });
    if (!v) return "la variable « " + name + " » n'existe pas (menu Variables).";
    if (kinds && kinds.indexOf(v.type) === -1) return "la variable « " + name + " » n'est pas " + (kinds.indexOf("BOOL") !== -1 ? "vrai / faux." : "un nombre.");
    return "";
  }
  /** Ce paramètre désigne-t-il « le joueur concerné » ? */
  const usesSubject = function (p) { return WHO_KEYS.some(function (k) { return p[k] === "SUBJECT"; }); };

  /** Nettoie une liste de règles. Retourne { rules } ou { error }. */
  function clean(rules, ctx) {
    if (rules === undefined) return { rules: [] };
    if (!Array.isArray(rules) || rules.length > MAX_RULES) return { error: "Règles invalides (" + MAX_RULES + " au maximum)." };
    let count = 0;
    // rule : la règle (déclencheur) ; late : dans un « attendre » / « pendant » (plus de coup ni d'information en cours)
    function nodes(list, depth, subject, where, rule, late) {
      if (!Array.isArray(list)) return { error: where + " : blocs invalides." };
      if (depth > MAX_DEPTH) return { error: where + " : trop de blocs imbriqués." };
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const n = list[i], spec = n && ACTIONS[n.a];
        if (!spec) return { error: where + " : bloc inconnu." };
        if (++count > MAX_NODES) return { error: "Trop de blocs dans les règles (" + MAX_NODES + " au maximum)." };
        const label = "« " + spec.label.replace(/\{\w+\}/g, "…") + " »";
        const cp = cleanParams(spec, n.p, ctx, label);
        if (cp.error) return cp;
        if (usesSubject(cp.p) && !subject) return { error: label + " : ce déclencheur n'a pas de « joueur concerné »." };
        if (spec.hitOnly && (late || ["HIT_GIVEN", "HIT_TAKEN", "HITS"].indexOf(rule.on) === -1 || (rule.on === "HIT_GIVEN" && rule.p && rule.p.with === "ARROW")))
          return { error: label + " : seulement dans une règle « quand je frappe un joueur » (pas avec une flèche), « quand on me frappe » ou « tous les N coups », hors « attendre » / « pendant »." };
        if (spec.infoOnly && (late || rule.on !== "INFO_ON_ME"))
          return { error: label + " : seulement dans une règle « quand un pouvoir cherche une information sur moi », hors « attendre » / « pendant »." };
        const o = { a: n.a, p: cp.p };
        if (n.a === "IF") {
          const c = n.c, cs = c && CONDITIONS[c.k];
          if (!cs) return { error: "Un « si » des règles n'a pas de condition (catégorie Conditions)." };
          if (cs.needsSubject && !subject) return { error: "« " + cs.label.replace(/\{\w+\}/g, "…") + " » : ce déclencheur n'a pas de « joueur concerné »." };
          if (cs.arrowOnly && (late || rule.on !== "HIT_GIVEN" || !rule.p || rule.p.with !== "ARROW"))
            return { error: "« " + cs.label.replace(/\{\w+\}/g, "…") + " » : seulement dans une règle « quand je frappe un joueur avec une flèche », hors « attendre » / « pendant »." };
          const ccp = cleanParams(cs, c.p, ctx, "« " + cs.label.replace(/\{\w+\}/g, "…") + " »");
          if (ccp.error) return ccp;
          if (usesSubject(ccp.p) && !subject) return { error: "Une condition parle du « joueur concerné » mais ce déclencheur n'en a pas." };
          o.c = { k: c.k, p: ccp.p };
        }
        for (const slot of spec.container || []) {
          const r = nodes(n[slot] || [], depth + 1, n.a === "EACH" ? "ce joueur" : subject, where, rule, late || n.a === "WAIT" || n.a === "DURING");
          if (r.error) return r;
          o[slot] = r.list;
        }
        out.push(o);
      }
      return { list: out };
    }
    const out = [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i], spec = r && TRIGGERS[r.on];
      if (!spec) return { error: "Règle " + (i + 1) + " : déclencheur inconnu." };
      if (r.on === "HIT_GIVEN" && r.p && r.p.with === "ITEM" && !ctx.isItem) return { error: "« avec l'objet de ce pouvoir » demande un pouvoir d'objet." };
      if (r.on === "USE") {
        const command = ctx.kind === "COMMAND_RULES";
        if (!ctx.isItem && !command) return { error: "« quand j'utilise ce pouvoir » demande un pouvoir d'objet ou de commande (« quand le joueur tape … » sans effets)." };
        if (r.p && r.p.target === "ARG" && !command) return { error: "« sur le joueur nommé dans la commande » demande un pouvoir de commande." };
        if (r.p && r.p.target === "NUM" && !command) return { error: "« avec un nombre dans la commande » demande un pouvoir de commande." };
        if (r.p && r.p.click && r.p.click !== "ANY" && command) return { error: "Une commande n'a pas de clic : choisis « (clic droit ou gauche) »." };
      }
      const cp = cleanParams(spec, r.p, ctx, "« " + spec.label.replace(/\{\w+\}/g, "…") + " »");
      if (cp.error) return cp;
      const cd = r.cd === undefined ? 0 : r.cd;
      if (!Number.isInteger(cd) || cd < 0 || cd > 3600) return { error: "Règle " + (i + 1) + " : cooldown invalide." };
      const body = nodes(r.do || [], 1, subjectOf(r.on, cp.p), "Règle « " + spec.label.replace(/\{\w+\}/g, "…") + " »", { on: r.on, p: cp.p }, false);
      if (body.error) return body;
      if (!body.list.length) return { error: "La règle « " + spec.label.replace(/\{\w+\}/g, "…") + " » ne fait rien : ajoute-lui des actions." };
      out.push({ on: r.on, p: cp.p, cd: cd, do: body.list });
    }
    return { rules: out };
  }

  /**
   * Libellé rempli avec les valeurs : names = { role(clé), team(clé), effect(id), subject } (subject = libellé du « joueur
   * concerné » du déclencheur). Le destinataire « les joueurs autour » reçoit son rayon, « le joueur qui a le rôle » son rôle.
   */
  function fill(spec, p, names) {
    const params = spec.params || {};
    // paramètres affichés juste après un autre (rayon après « les joueurs autour », rôle après « le joueur qui a le rôle »...)
    const extras = function (key) {
      return Object.keys(params).filter(function (k) { return params[k].after === key && visible(params[k], p); }).map(function (k) {
        const v = value(k);
        return " " + (params[k].prefix ? params[k].prefix + " " : "") + v + (params[k].suffix ? " " + params[k].suffix : "");
      }).join("");
    };
    const value = function (k) {
      const d = params[k], v = p[k];
      if (!d) return "";
      if (!visible(d, p)) return "";
      if (d.type === "num" && v && typeof v === "object") return "« " + v.var + " »";
      switch (d.type) {
        case "num": return String(v).replace(".", ",");
        case "var": return "« " + (v || "…") + " »";
        case "sel": {
          if (k === "to" && v === "SUBJECT" && names.subject) return names.subject + extras(k);
          const o = d.options.find(function (x) { return x[0] === v; });
          let s = o ? o[1] : String(v);
          if (k === "who" && v === "SUBJECT" && names.subject) s = names.subject + " a";
          if ((k === "of" || k === "of2") && v === "SUBJECT" && names.subject) s = "(celle " + deOf(names.subject) + ")";
          if (k === "hpwho" && v === "SUBJECT" && names.subject) s = names.subject;
          return s + extras(k);
        }
        case "bool": return v ? d.yes : d.no;
        case "role": return names.role(v);
        case "team": return names.team(v);
        case "effect": return names.effect(v);
        default: return String(v);
      }
    };
    return spec.label.replace(/\{(\w+)\}/g, function (m, k) { return value(k); }).replace(/ +/g, " ").trim();
  }

  return { TRIGGERS: TRIGGERS, CONDITIONS: CONDITIONS, ACTIONS: ACTIONS, defaults: defaults, visible: visible, clean: clean, fill: fill,
    subjectOf: subjectOf, deOf: deOf, TITANS: TITANS, WHO_KEYS: WHO_KEYS, varCheck: varCheck,
    clamp: function (d) { return d.dflt; }, // valeur d'un champ nombre qui redevient un nombre
    MAX_RULES: MAX_RULES, MAX_NODES: MAX_NODES, MAX_DEPTH: MAX_DEPTH };
})();
