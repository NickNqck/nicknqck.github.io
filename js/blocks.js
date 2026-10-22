/*
 * Éditeur à blocs (façon Scratch) : la SEULE façon de créer un pouvoir (le type, l'objet, la commande, les passifs, le
 * cooldown et les utilisations sont tous des blocs ; seuls le nom et la description restent des champs).
 *
 * Il ne crée AUCUNE donnée nouvelle : il lit et écrit les champs enregistrés du pouvoir (kind, powerItem, clickMode,
 * aAction, aEffects, command, arg, cmdEffects, blockedEffects, teamColors, armorEffects, cooldown, maxUse... voir
 * menu-data.js). Le .jar, le projet IntelliJ et l'import / export ne changent donc pas, et un ancien .json se relit
 * entièrement en blocs.
 *
 * Bloc de départ (catégorie Événements) :
 *   quand le joueur utilise <objet>     -> pouvoir d'objet (kind ITEM), programme ci-dessous ; juste sous le départ,
 *                                          l'apparence de l'objet (catégorie Objet : brillant, enchanté ; UHC-Meetup le rend
 *                                          déjà incassable)
 *   quand le joueur tape /<cmd> <arg>   -> pouvoir de commande (COMMAND_EFFECTS) : des blocs « donner un effet »
 *   en permanence (passif)              -> passif : un seul comportement (catégorie Passifs), ou aucun (PASSIVE)
 *   + sous n'importe quel départ : « cooldown du pouvoir », « utilisable N fois maximum »
 *
 * Programme d'un objet :
 *   Quand le joueur utilise <objet>
 *     si ⬡clic droit⬡ alors                                   (« si » du programme : capteur de clic)
 *       si ⬡viser un joueur à moins de [30] blocs⬡ alors       (« si » imbriqué, facultatif : capteur de visée)
 *         téléportation, effets (à moi ou à la cible)
 *       ... ou, sans visée : effets sur moi, ou lancer un projectile (+ à l'impact), cooldown du clic
 *
 * Règles qui suivent le plugin : un clic qui vise un joueur ne fait rien s'il n'en trouve pas (ni action, ni cooldown).
 * Toutes les actions d'un clic qui vise vont donc dans son « si viser » ; une téléportation a toujours besoin de ce
 * « si » (sa distance est celle du capteur) ; un projectile ne vise pas.
 *
 * Ajout : glisser un bloc de la palette vers le script, ou cliquer dessus (il va dans la zone sélectionnée, utile au doigt).
 * Suppression : bouton ✕ du bloc, ou le glisser vers la palette. Bouton « Plein écran » pour coder plus à l'aise.
 */
const BlockEditor = (function () {
  "use strict";

  // Catégories (couleurs de Scratch)
  const CATS = [
    { id: "events", name: "Événements", color: "#FFBF00" },
    { id: "look", name: "Objet", color: "#FF8C1A" },
    { id: "control", name: "Contrôle", color: "#FFAB19" },
    { id: "sensing", name: "Capteurs", color: "#5CB1D6" },
    { id: "motion", name: "Mouvement", color: "#4C97FF" },
    { id: "projectile", name: "Projectile", color: "#FF6680" },
    { id: "area", name: "Zone", color: "#0FBD8C" },
    { id: "target", name: "Cible", color: "#E6503C" },
    { id: "passive", name: "Passifs", color: "#CF63CF" },
    { id: "looks", name: "Effets", color: "#9966FF" },
    { id: "operators", name: "Cooldown et limites", color: "#59C059" }
  ];
  // catégories proposées selon le bloc de départ
  const CATS_OF = {
    none: ["events"],
    evItem: ["events", "look", "control", "sensing", "motion", "projectile", "area", "target", "looks", "operators"],
    evCommand: ["events", "looks", "operators"],
    evPassive: ["events", "passive", "looks", "operators"]
  };

  // Blocs. zone : root (programme), cond (emplacement ⬡ d'un « si » du programme), innerCond (⬡ d'un « si » imbriqué),
  // branch (directement dans un « si » de clic), inner (dans un « si viser »), impact (dans « à l'impact »)
  const DEF = {
    evItem: { cat: "events", zone: "event", palette: "quand le joueur utilise un objet" },
    evCommand: { cat: "events", zone: "event", palette: "quand le joueur tape une commande" },
    evPassive: { cat: "events", zone: "event", palette: "en permanence (passif)" },
    itemGlint: { cat: "look", zone: "root", look: true, palette: "faire briller l'objet (comme enchanté)" },
    itemEnchant: { cat: "look", zone: "root", look: true, palette: "enchanter l'objet" },
    itemHide: { cat: "look", zone: "root", look: true, palette: "cacher les enchantements" },
    if: { cat: "control", palette: "si ⬡ alors" },
    sensLeft: { cat: "sensing", zone: "cond", click: "LEFT", palette: "clic gauche" },
    sensRight: { cat: "sensing", zone: "cond", click: "RIGHT", palette: "clic droit" },
    sensAny: { cat: "sensing", zone: "cond", click: "ANY", palette: "clic gauche ou clic droit" },
    sensHit: { cat: "sensing", zone: "cond", click: "HIT", palette: "frapper un joueur" },
    sensAim: { cat: "sensing", zone: "innerCond", palette: "viser un joueur à moins de 30 blocs" },
    tpBehind: { cat: "motion", zone: "inner", tp: true, palette: "me téléporter derrière le joueur visé" },
    tpAround: { cat: "motion", zone: "inner", tp: true, palette: "me téléporter autour du joueur visé" },
    tpToMe: { cat: "motion", zone: "inner", tp: true, palette: "téléporter le joueur visé jusqu'à moi" },
    launch: { cat: "projectile", zone: "branch", palette: "lancer un projectile · à l'impact :" },
    impactTp: { cat: "projectile", zone: "impact", palette: "me téléporter au point d'impact" },
    zone: { cat: "projectile", zone: "impact", palette: "zone de dégâts au point d'impact" },
    effect: { cat: "looks", zone: "any", palette: "donner un effet" },
    area: { cat: "area", zone: "branch", palette: "pour chaque joueur à moins de 50 blocs :" },
    areaDamage: { cat: "area", zone: "area", palette: "infliger 1 ❤ (sans tuer)" },
    areaLightning: { cat: "area", zone: "area", palette: "faire tomber un éclair" },
    areaUp: { cat: "area", zone: "area", palette: "propulser de 50 blocs vers le haut" },
    // actions sur la cible (le joueur frappé, ou visé) : TARGET_ACTIONS de effects-data.js ; Player ou GamePlayer de la cible
    tgt_DAMAGE: { cat: "target", zone: "target", target: "DAMAGE", palette: "infliger 1 ❤ de plus à la cible (sans tuer)" },
    tgt_FIRE: { cat: "target", zone: "target", target: "FIRE", palette: "enflammer la cible 3 s" },
    tgt_KNOCKBACK: { cat: "target", zone: "target", target: "KNOCKBACK", palette: "repousser la cible" },
    tgt_UP: { cat: "target", zone: "target", target: "UP", palette: "propulser la cible vers le haut" },
    tgt_LIGHTNING: { cat: "target", zone: "target", target: "LIGHTNING", palette: "faire tomber un éclair sur la cible" },
    tgt_STUN: { cat: "target", zone: "target", target: "STUN", palette: "étourdir la cible 2 s" },
    blockFx: { cat: "passive", zone: "root", passive: "BLOCK_EFFECT", palette: "empêcher les joueurs proches d'obtenir des effets :" },
    fxPick: { cat: "passive", zone: "child", parent: "blockFx", palette: "l'effet … (à empêcher)" },
    blockPow: { cat: "passive", zone: "root", passive: "BLOCK_POWER", palette: "empêcher les joueurs proches d'utiliser leurs pouvoirs" },
    info: { cat: "passive", zone: "root", passive: "INFO", palette: "révéler le camp des joueurs restés à proximité :" },
    teamColor: { cat: "passive", zone: "child", parent: "info", palette: "couleur d'un camp" },
    noArmor: { cat: "passive", zone: "root", passive: "NO_ARMOR", palette: "si je ne porte aucune armure :" },
    noFall: { cat: "passive", zone: "child", parent: "noArmor", palette: "insensible aux dégâts de chute" },
    cooldown: { cat: "operators", zone: "branch", palette: "cooldown de ce clic" },
    powerCooldown: { cat: "operators", zone: "root", limit: true, palette: "cooldown du pouvoir" },
    maxUse: { cat: "operators", zone: "root", limit: true, palette: "utilisable N fois maximum" }
  };
  const EVENT_KIND = { evItem: "ITEM", evCommand: "COMMAND_EFFECTS" };
  const PASSIVE_KINDS = ["PASSIVE", "BLOCK_EFFECT", "BLOCK_POWER", "INFO", "NO_ARMOR"];
  const CSHAPES = ["if", "launch", "area", "blockFx", "info", "noArmor"];
  // champs du pouvoir écrits par l'éditeur (en plus des champs des clics, préfixes a et b)
  const POWER_FIELDS = ["kind", "powerItem", "clickMode", "onHit", "radius", "blockedEffects", "needSeconds", "teamColors", "defaultColor",
    "armorEffects", "armorNoFall", "command", "arg", "cmdEffects", "cooldown", "maxUse",
    "itemGlint", "itemEnchants", "itemHideEnchants", "itemUnbreakable"];
  const SENSOR_OF = { LEFT: "sensLeft", RIGHT: "sensRight", ANY: "sensAny", HIT: "sensHit" };
  const CLICK_NAME = { LEFT: "clic gauche", RIGHT: "clic droit", ANY: "clic gauche ou clic droit", HIT: "frapper un joueur" };
  const TARGET_DEFAULT = { DAMAGE: 1, FIRE: 3, KNOCKBACK: 2, UP: 10, STUN: 2 };
  const TP_TYPE = { tpBehind: "TP_BEHIND", tpAround: "TP_AROUND", tpToMe: "TP_TO_USER" };
  const FIELDS = ["Action", "Aim", "Distance", "TpDistance", "Radius", "Projectile", "ImpactTp", "Zone", "ZoneRadius",
    "ZoneDamage", "ZoneSeconds", "ZoneColor", "Effects", "Cooldown", "AreaRadius", "AreaFilter", "AreaDamage", "AreaLightning", "AreaUp", "AreaUpNoFall", "Target"];
  const isTarget = function (x) { return !!DEF[x.t].target; };
  const targetsOf = function (list) {
    return list.filter(isTarget).map(function (x) { const o = { type: DEF[x.t].target }; if (x.amount !== undefined) o.amount = x.amount; if (x.flag !== undefined) o.flag = x.flag; return o; });
  };

  let dragging = null; // bloc en cours de glisser-déposer : { mode: "new", type } ou { mode: "move", ref }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const catOf = function (type) { return CATS.find(function (c) { return c.id === DEF[type].cat; }); };
  const clone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  const isSensor = function (type) { return DEF[type].zone === "cond" || DEF[type].zone === "innerCond"; };
  const nestedOf = function (b) { return b.blocks.find(function (x) { return x.t === "if"; }); };
  const launchOf = function (b) { return b.blocks.find(function (x) { return x.t === "launch"; }); };
  const areaOf = function (b) { return b.blocks.find(function (x) { return x.t === "area"; }); };
  const effectCount = function (list) { return list.filter(function (x) { return x.t === "effect"; }).length; };
  const effectOf = function (x, who) { return { t: "effect", effect: x.effect, level: x.level, seconds: x.seconds, who: who || x.who || "USER" }; };

  // ---------- données <-> programme ----------
  // programme = { branches: [{ click: "LEFT" | "RIGHT" | "ANY" | null, blocks }] }
  // blocs d'un clic : { t: "if", cond: { distance } | null, blocks: [tp, effets] } (un seul), launch, effect, cooldown

  function readBranch(p, pf, dflt, hit) {
    const get = function (k) { return p[pf + k] === undefined ? dflt(pf + k) : p[pf + k]; };
    const effects = (get("Effects") || []).map(function (e) { return effectOf(e); });
    const targets = (get("Target") || []).map(function (x) {
      const b = { t: "tgt_" + x.type }; if (x.amount !== undefined) b.amount = x.amount; if (x.flag !== undefined) b.flag = x.flag; return b;
    });
    const blocks = [];
    const act = get("Action");
    const tpType = Object.keys(TP_TYPE).find(function (k) { return TP_TYPE[k] === act; });
    if (hit) { // « si frapper un joueur » : la cible est le joueur frappé, tout va directement dans le « si »
      if (tpType) blocks.push(tpType === "tpAround" ? { t: tpType, radius: get("Radius") } : { t: tpType });
      effects.concat(targets).forEach(function (x) { blocks.push(x); });
      if (get("Cooldown") > 0) blocks.push({ t: "cooldown", seconds: get("Cooldown") });
      return blocks;
    }
    if (act === "AREA") {
      // zone : dégâts, éclair, propulsion et effets « à la cible » vont dans « pour chaque joueur », les effets « à moi » à côté
      const inner = [];
      if (get("AreaDamage") > 0) inner.push({ t: "areaDamage", hearts: get("AreaDamage") });
      if (get("AreaLightning")) inner.push({ t: "areaLightning" });
      if (get("AreaUp") > 0) inner.push({ t: "areaUp", height: get("AreaUp"), fall: get("AreaUpNoFall") ? "SAFE" : "DAMAGE" });
      effects.forEach(function (e) { if (e.who === "TARGET") inner.push(e); });
      blocks.push({ t: "area", radius: get("AreaRadius"), filter: get("AreaFilter"), blocks: inner });
      effects.forEach(function (e) { if (e.who !== "TARGET") { e.who = "USER"; blocks.push(e); } });
    } else if (act === "LAUNCH") {
      const impact = [];
      if (get("ImpactTp")) impact.push({ t: "impactTp" });
      if (get("Zone")) impact.push({ t: "zone", radius: get("ZoneRadius"), damage: get("ZoneDamage"), seconds: get("ZoneSeconds"), color: get("ZoneColor") });
      blocks.push({ t: "launch", projectile: get("Projectile"), impact: impact.concat(effects) });
    } else if (TP_TYPE.tpBehind === act || TP_TYPE.tpAround === act || TP_TYPE.tpToMe === act) {
      const type = Object.keys(TP_TYPE).find(function (k) { return TP_TYPE[k] === act; });
      const tp = { t: type };
      if (type === "tpAround") tp.radius = get("Radius");
      blocks.push({ t: "if", cond: { distance: get("TpDistance") }, blocks: [tp].concat(effects, targets) });
    } else if (get("Aim")) {
      blocks.push({ t: "if", cond: { distance: get("Distance") }, blocks: effects.concat(targets) });
    } else {
      effects.forEach(function (e) { e.who = "USER"; blocks.push(e); });
    }
    if (p.clickMode === "DIFFERENT" && get("Cooldown") > 0) blocks.push({ t: "cooldown", seconds: get("Cooldown") });
    return blocks;
  }

  function readClicks(p, dflt) {
    const branches = [];
    if (p.clickMode === "LEFT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "LEFT", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "BOTH_SAME") branches.push({ click: "ANY", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "RIGHT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "RIGHT", blocks: readBranch(p, "b", dflt) });
    if (p.onHit) branches.push({ click: "HIT", blocks: readBranch(p, "c", dflt, true) });
    return branches;
  }

  // programme = { event: null | { t: "evItem", item } | { t: "evCommand", command, arg } | { t: "evPassive" },
  //               branches (objet), body (commande : effets ; passif : un comportement), limits (cooldown, utilisations) }
  function read(p, dflt) {
    const prog = { event: null, branches: [], body: [], limits: [], look: [] };
    const k = p.kind;
    if (k === "ITEM") {
      prog.event = { t: "evItem", item: p.powerItem || dflt("powerItem") };
      prog.branches = readClicks(p, dflt);
      prog.keepUnbreakable = !!p.itemUnbreakable; // ancien réglage sans bloc (UHC-Meetup le fait déjà) : conservé tel quel
      if (p.itemGlint) prog.look.push({ t: "itemGlint" });
      (p.itemEnchants || []).forEach(function (e) { prog.look.push({ t: "itemEnchant", enchant: e.enchant, level: e.level }); });
      if (p.itemHideEnchants) prog.look.push({ t: "itemHide" });
    } else if (k === "COMMAND_EFFECTS") {
      prog.event = { t: "evCommand", command: p.command || "", arg: p.arg || "" };
      prog.body = (p.cmdEffects || []).map(function (e) { return effectOf(e, "USER"); });
    } else if (PASSIVE_KINDS.indexOf(k) !== -1) {
      prog.event = { t: "evPassive" };
      const radius = p.radius === undefined ? dflt("radius") : p.radius;
      if (k === "BLOCK_EFFECT") prog.body.push({ t: "blockFx", radius: radius, blocks: (p.blockedEffects || []).map(function (e) { return { t: "fxPick", effect: e }; }) });
      if (k === "BLOCK_POWER") prog.body.push({ t: "blockPow", radius: radius });
      if (k === "INFO") {
        const colors = p.teamColors || {};
        prog.body.push({ t: "info", seconds: p.needSeconds === undefined ? dflt("needSeconds") : p.needSeconds, radius: radius,
          other: p.defaultColor || dflt("defaultColor"),
          blocks: Object.keys(colors).map(function (team) { return { t: "teamColor", team: team, color: colors[team] }; }) });
      }
      if (k === "NO_ARMOR") {
        const inner = (p.armorEffects || []).map(function (e) { return effectOf(e, "USER"); });
        if (p.armorNoFall) inner.push({ t: "noFall" });
        prog.body.push({ t: "noArmor", blocks: inner });
      }
    }
    if (p.cooldown > 0) prog.limits.push({ t: "powerCooldown", seconds: p.cooldown });
    if (p.maxUse > 0) prog.limits.push({ t: "maxUse", count: p.maxUse });
    return prog;
  }

  function writeBranch(p, pf, branch, dflt, hit) {
    FIELDS.forEach(function (k) { const d = dflt(pf + k); if (d !== undefined) p[pf + k] = clone(d); });
    if (!branch) return;
    const nested = nestedOf(branch), launch = launchOf(branch), area = areaOf(branch);
    p[pf + "Action"] = "EFFECT_ONLY";
    branch.blocks.forEach(function (x) { if (x.t === "cooldown") p[pf + "Cooldown"] = x.seconds; });
    if (hit) {
      const tp = branch.blocks.find(function (x) { return DEF[x.t].tp; });
      if (tp) { p[pf + "Action"] = TP_TYPE[tp.t]; if (tp.t === "tpAround") p[pf + "Radius"] = tp.radius; }
      p[pf + "Effects"] = branch.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) {
        return { effect: x.effect, level: x.level, seconds: x.seconds, who: x.who };
      });
      p[pf + "Target"] = targetsOf(branch.blocks);
      return;
    }
    if (nested) {
      const tp = nested.blocks.find(function (x) { return DEF[x.t].tp; });
      const distance = nested.cond ? nested.cond.distance : dflt(pf + "Distance");
      if (tp) {
        p[pf + "Action"] = TP_TYPE[tp.t];
        p[pf + "TpDistance"] = distance;
        if (tp.t === "tpAround") p[pf + "Radius"] = tp.radius;
      } else {
        p[pf + "Aim"] = true;
        p[pf + "Distance"] = distance;
      }
      p[pf + "Effects"] = nested.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) {
        return { effect: x.effect, level: x.level, seconds: x.seconds, who: x.who };
      });
      p[pf + "Target"] = targetsOf(nested.blocks);
    } else if (area) {
      p[pf + "Action"] = "AREA";
      p[pf + "AreaRadius"] = area.radius;
      p[pf + "AreaFilter"] = area.filter;
      area.blocks.forEach(function (x) {
        if (x.t === "areaDamage") p[pf + "AreaDamage"] = x.hearts;
        if (x.t === "areaLightning") p[pf + "AreaLightning"] = true;
        if (x.t === "areaUp") { p[pf + "AreaUp"] = x.height; p[pf + "AreaUpNoFall"] = x.fall === "SAFE"; }
      });
      const mine = branch.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) {
        return { effect: x.effect, level: x.level, seconds: x.seconds, who: "USER" };
      });
      const theirs = area.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) {
        return { effect: x.effect, level: x.level, seconds: x.seconds, who: "TARGET" };
      });
      p[pf + "Effects"] = mine.concat(theirs);
    } else if (launch) {
      p[pf + "Action"] = "LAUNCH";
      p[pf + "Projectile"] = launch.projectile;
      p[pf + "Effects"] = [];
      launch.impact.forEach(function (x) {
        if (x.t === "impactTp") p[pf + "ImpactTp"] = true;
        if (x.t === "zone") {
          p[pf + "Zone"] = true; p[pf + "ZoneRadius"] = x.radius; p[pf + "ZoneDamage"] = x.damage;
          p[pf + "ZoneSeconds"] = x.seconds; p[pf + "ZoneColor"] = x.color;
        }
        if (x.t === "effect") p[pf + "Effects"].push({ effect: x.effect, level: x.level, seconds: x.seconds, who: "USER" });
      });
    } else {
      p[pf + "Effects"] = branch.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) {
        return { effect: x.effect, level: x.level, seconds: x.seconds, who: "USER" };
      });
    }
  }

  function writeClicks(p, prog, dflt) {
    const find = function (c) { return prog.branches.find(function (b) { return b.click === c; }); };
    const L = find("LEFT"), R = find("RIGHT"), A = find("ANY"), H = find("HIT");
    // un « si » sans capteur (du programme ou imbriqué) rend le pouvoir invalide (clickMode vide) : la validation explique
    const incomplete = prog.branches.some(function (b) { const n = nestedOf(b); return !b.click || (n && !n.cond); });
    p.clickMode = incomplete ? "" : A ? "BOTH_SAME" : L && R ? "DIFFERENT" : L ? "LEFT_ONLY" : R ? "RIGHT_ONLY" : H ? "NONE" : "";
    p.onHit = !!H;
    writeBranch(p, "a", A || L, dflt);
    writeBranch(p, "b", R, dflt);
    writeBranch(p, "c", H, dflt, true);
  }

  const effectData = function (x, who) { return { effect: x.effect, level: x.level, seconds: x.seconds, who: who }; };

  function write(p, prog, dflt) {
    // tout repart des valeurs par défaut : seul ce que le programme contient est enregistré
    POWER_FIELDS.forEach(function (k) { p[k] = clone(dflt(k)); });
    writeClicks(p, { branches: [] }, dflt);
    const ev = prog.event;
    p.kind = "";
    if (ev && ev.t === "evItem") {
      p.kind = "ITEM";
      p.powerItem = ev.item;
      writeClicks(p, prog, dflt);
      p.itemUnbreakable = !!prog.keepUnbreakable;
      prog.look.forEach(function (x) {
        if (x.t === "itemGlint") p.itemGlint = true;
        if (x.t === "itemEnchant") p.itemEnchants.push({ enchant: x.enchant, level: x.level });
        if (x.t === "itemHide") p.itemHideEnchants = true;
      });
    } else if (ev && ev.t === "evCommand") {
      p.kind = "COMMAND_EFFECTS";
      p.command = ev.command;
      p.arg = ev.arg;
      p.cmdEffects = prog.body.filter(function (x) { return x.t === "effect"; }).map(function (x) { return effectData(x, "USER"); });
    } else if (ev && ev.t === "evPassive") {
      const b = prog.body[0];
      p.kind = b ? DEF[b.t].passive : "PASSIVE";
      if (b && b.radius !== undefined) p.radius = b.radius;
      if (b && b.t === "blockFx") p.blockedEffects = b.blocks.map(function (x) { return x.effect; });
      if (b && b.t === "info") {
        p.needSeconds = b.seconds;
        p.defaultColor = b.other;
        p.teamColors = {};
        b.blocks.forEach(function (x) { p.teamColors[x.team] = x.color; });
      }
      if (b && b.t === "noArmor") {
        p.armorEffects = b.blocks.filter(function (x) { return x.t === "effect"; }).map(function (x) { return effectData(x, "USER"); });
        p.armorNoFall = b.blocks.some(function (x) { return x.t === "noFall"; });
      }
    }
    prog.limits.forEach(function (x) {
      if (x.t === "powerCooldown") p.cooldown = x.seconds;
      if (x.t === "maxUse") p.maxUse = x.count;
    });
  }

  // empreinte des réglages des clics : permet de retrouver le programme (avec ses « si » sans capteur) après un redessin
  function signature(p) {
    const keys = POWER_FIELDS.slice();
    ["a", "b", "c"].forEach(function (pf) { FIELDS.forEach(function (k) { keys.push(pf + k); }); });
    return JSON.stringify(keys.map(function (k) { return p[k]; }));
  }

  // ---------- règles d'ajout ----------

  function newBlock(type, dflt) {
    const d = function (k) { return dflt("a" + k); };
    switch (type) {
      case "if": return { t: "if", cond: null, blocks: [] };
      case "tpBehind": case "tpToMe": return { t: type };
      case "tpAround": return { t: type, radius: d("Radius") };
      case "launch": return { t: "launch", projectile: d("Projectile"), impact: [] };
      case "impactTp": return { t: "impactTp" };
      case "zone": return { t: "zone", radius: d("ZoneRadius"), damage: d("ZoneDamage"), seconds: d("ZoneSeconds"), color: d("ZoneColor") };
      case "effect": return { t: "effect", effect: "SPEED", level: 1, seconds: 10, who: "USER" };
      case "cooldown": return { t: "cooldown", seconds: 30 };
      case "area": return { t: "area", radius: d("AreaRadius"), filter: d("AreaFilter"), blocks: [] };
      case "areaDamage": return { t: "areaDamage", hearts: 1 };
      case "areaLightning": return { t: "areaLightning" };
      case "areaUp": return { t: "areaUp", height: 50, fall: "DAMAGE" };
      case "blockFx": return { t: "blockFx", radius: dflt("radius"), blocks: [] };
      case "fxPick": return { t: "fxPick", effect: "" };
      case "blockPow": return { t: "blockPow", radius: dflt("radius") };
      case "info": return { t: "info", seconds: dflt("needSeconds"), radius: dflt("radius"), other: dflt("defaultColor"), blocks: [] };
      case "teamColor": return { t: "teamColor", team: "", color: "a" };
      case "noArmor": return { t: "noArmor", blocks: [] };
      case "noFall": return { t: "noFall" };
      case "powerCooldown": return { t: "powerCooldown", seconds: 30 };
      case "maxUse": return { t: "maxUse", count: 1 };
      case "itemGlint": case "itemHide": return { t: type };
      case "tgt_DAMAGE": case "tgt_FIRE": case "tgt_KNOCKBACK": return { t: type, amount: TARGET_DEFAULT[DEF[type].target] };
      case "tgt_UP": case "tgt_STUN": return { t: type, amount: TARGET_DEFAULT[DEF[type].target], flag: false };
      case "tgt_LIGHTNING": return { t: type };
      case "itemEnchant": return { t: "itemEnchant", enchant: "", level: 1 };
      default: return null;
    }
  }

  // zone = "root" | { branch, cond } (⬡ du programme) | { branch, inner, cond } (⬡ imbriqué)
  //      | { branch } (directement dans le clic) | { branch, inner } (dans « si viser ») | { branch, impact }
  // | { event } (emplacement du bloc de départ) | { pb } (dans le comportement passif n° pb)
  const zoneKind = function (zone) {
    if (!zone || zone === "root") return "root";
    if (zone.event) return "event";
    if (zone.pb !== undefined) return "child";
    if (zone.cond) return zone.inner ? "innerCond" : "cond";
    return zone.inner ? "inner" : zone.impact ? "impact" : zone.area ? "area" : "branch";
  };

  const PARENT_HINT = {
    blockFx: "Ce bloc va dans « empêcher les joueurs proches d'obtenir des effets ».",
    info: "Ce bloc va dans « révéler le camp des joueurs restés à proximité ».",
    noArmor: "Ce bloc va dans « si je ne porte aucune armure »."
  };

  /**
   * Message d'erreur si le bloc ne peut pas aller là, sinon "". ignore = bloc déplacé (non compté).
   * ctx = { maxCommandEffects, blockable: [effets qu'on peut empêcher], teams: [{ id, name }] }
   */
  function refuse(prog, type, zone, ignore, ctx) {
    const kind = zoneKind(zone), def = DEF[type];
    const ev = prog.event ? prog.event.t : null;
    ctx = ctx || {};
    // bloc de départ
    if (def.zone === "event") {
      if (kind !== "event" && kind !== "root") return "Un bloc de départ se place tout en haut du programme.";
      if (ev === type) return "Le programme commence déjà par ce bloc.";
      if (ev && (prog.branches.length || prog.body.length)) return "Le programme a déjà un bloc de départ : supprime-le (✕) pour en changer.";
      return "";
    }
    if (!ev) return "Commence par un bloc de départ (catégorie Événements) : utiliser un objet, taper une commande, ou en permanence.";
    if (kind === "event") return "Seul un bloc de départ (catégorie Événements) va à cet endroit.";
    // cooldown du pouvoir, utilisations maximum : directement sous le départ, une fois chacun
    if (def.limit) {
      if (kind !== "root") return "Ce bloc se place directement sous le bloc de départ.";
      if (prog.limits.some(function (x) { return x.t === type && x !== ignore; })) return "Le programme a déjà ce bloc.";
      return "";
    }
    // apparence de l'objet : directement sous « quand le joueur utilise … »
    if (def.look) {
      if (ev !== "evItem") return "Ce bloc change l'objet du pouvoir : il sert avec « quand le joueur utilise un objet ».";
      if (kind !== "root") return "Ce bloc se place directement sous « quand le joueur utilise … ».";
      const look = prog.look.filter(function (x) { return x !== ignore; });
      if (type !== "itemEnchant" && look.some(function (x) { return x.t === type; })) return "L'objet a déjà ce bloc.";
      if (type === "itemEnchant" && look.filter(function (x) { return x.t === type; }).length >= (ctx.maxEnchants || 5))
        return (ctx.maxEnchants || 5) + " enchantements maximum.";
      return "";
    }
    if (ev === "evCommand") {
      if (type !== "effect") return "Avec une commande, le programme donne des effets : utilise « donner un effet » (catégorie Effets).";
      if (kind !== "root") return "Glisse ce bloc sous « quand le joueur tape … ».";
      const n = prog.body.filter(function (x) { return x !== ignore && x.t === "effect"; }).length;
      if (n >= (ctx.maxCommandEffects || 8)) return (ctx.maxCommandEffects || 8) + " effets maximum pour une commande.";
      return "";
    }
    if (ev === "evPassive") {
      if (def.passive) {
        if (kind !== "root") return "Ce bloc se place directement sous « en permanence ».";
        if (prog.body.some(function (x) { return x !== ignore; })) return "Un pouvoir passif n'a qu'un seul comportement : crée un autre pouvoir pour en ajouter un.";
        return "";
      }
      if (def.parent || type === "effect") {
        const parentType = def.parent || "noArmor";
        const hint = type === "effect" ? "En passif, les effets vont dans « si je ne porte aucune armure » (catégorie Passifs)." : PARENT_HINT[parentType];
        const parent = kind === "child" ? prog.body[zone.pb] : null;
        if (!parent || parent.t !== parentType) return hint;
        const inside = parent.blocks.filter(function (x) { return x !== ignore; });
        if (type === "noFall" && inside.some(function (x) { return x.t === "noFall"; })) return "Ce bloc y est déjà.";
        if (type === "effect" && effectCount(inside) >= 5) return "5 effets maximum sans armure.";
        if (type === "fxPick" && inside.length >= (ctx.blockable || []).length) return "Tous les effets possibles sont déjà empêchés.";
        if (type === "teamColor") {
          if (!(ctx.teams || []).length) return "Choisis d'abord le mode de jeu du rôle : ses camps pourront alors recevoir une couleur.";
          if (inside.length >= ctx.teams.length) return "Chaque camp a déjà sa couleur.";
        }
        return "";
      }
      return "Ce bloc sert aux pouvoirs d'objet (« quand le joueur utilise un objet »).";
    }
    // pouvoir d'objet
    if (def.passive || def.parent) return "Ce bloc sert aux pouvoirs « en permanence (passif) ».";
    const branch = zone && zone !== "root" ? prog.branches[zone.branch] : null;
    if (kind !== "root" && !branch) return "Ajoute d'abord un bloc « si » (catégorie Contrôle).";
    const others = branch ? branch.blocks.filter(function (x) { return x !== ignore; }) : [];
    const nested = others.find(function (x) { return x.t === "if"; });
    const launch = others.find(function (x) { return x.t === "launch"; });
    const area = others.find(function (x) { return x.t === "area"; });
    // 5 effets au maximum par clic, à moi et aux joueurs touchés réunis
    const clickEffects = effectCount(others) + (area ? effectCount(area.blocks.filter(function (x) { return x !== ignore; })) : 0);

    if (type === "if") {
      if (kind === "root") {
        if (ignore && ignore.t === "if") return "Ce « si » vise un joueur : il reste à l'intérieur d'un clic.";
        if (!ignore && prog.branches.length >= 3) return "3 blocs « si » au maximum dans le programme (clic gauche, clic droit, ou les deux).";
        return "";
      }
      if (kind !== "branch") return "Un seul niveau de « si » à l'intérieur d'un clic.";
      if (branch.click === "HIT") return "En frappant, la cible est déjà le joueur frappé : pas besoin de « si viser un joueur ».";
      if (ignore && ignore.blocks && ignore.click !== undefined) return "Ce « si » attend un clic : il reste dans le programme principal.";
      if (nested) return "Ce clic a déjà son « si » : place les actions à l'intérieur.";
      if (launch) return "Un projectile ne vise pas : pas de « si viser un joueur » avec « lancer un projectile ».";
      if (area) return "Une zone touche tous les joueurs proches : pas de « si viser un joueur » avec « pour chaque joueur ».";
      return "";
    }
    if (def.zone === "cond") {
      if (kind === "innerCond") return "Dans un « si » à l'intérieur d'un clic, utilise le capteur « viser un joueur ».";
      if (kind !== "cond") return "Un capteur de clic se place dans l'emplacement ⬡ d'un « si » du programme.";
      if (branch.click && branch !== ignore) return "Ce « si » a déjà un capteur : retire-le d'abord (✕).";
      const clicks = prog.branches.filter(function (b) { return b !== branch && b !== ignore && b.click; }).map(function (b) { return b.click; });
      if (clicks.indexOf(def.click) !== -1) return "« " + CLICK_NAME[def.click] + " » est déjà utilisé dans un autre « si ».";
      const realClicks = clicks.filter(function (c) { return c !== "HIT"; }); // « frapper » se combine avec tous les clics
      if (def.click === "ANY" && realClicks.length) return "« clic gauche ou clic droit » remplace les deux autres : retire d'abord les capteurs « clic gauche » / « clic droit ».";
      if (def.click !== "ANY" && def.click !== "HIT" && clicks.indexOf("ANY") !== -1) return "Un autre « si » utilise déjà « clic gauche ou clic droit » : retire-le pour séparer les clics.";
      return "";
    }
    if (type === "sensAim") {
      if (kind === "cond") return "Le « si » du programme attend un clic. Place « viser un joueur » dans un « si » glissé à l'intérieur du clic.";
      if (kind !== "innerCond") return "Ce capteur se place dans l'emplacement ⬡ d'un « si » à l'intérieur d'un clic.";
      if (nested && nested.cond && nested !== ignore) return "Ce « si » a déjà un capteur : retire-le d'abord (✕).";
      return "";
    }
    if (kind === "root" || kind === "cond" || kind === "innerCond") return "Glisse ce bloc à l'intérieur d'un bloc « si ».";
    const hitBranch = branch && branch.click === "HIT";
    // catégorie Cible : sur le joueur visé (« si viser un joueur ») ou frappé (« si frapper un joueur »)
    if (def.target) {
      let list;
      if (kind === "inner") list = nested ? nested.blocks : [];
      else if (kind === "branch" && hitBranch) list = others;
      else return "Ce bloc agit sur un joueur précis : place-le dans un « si viser un joueur » ou dans un « si frapper un joueur ».";
      if (list.some(function (x) { return x !== ignore && x.t === type; })) return "Ce bloc y est déjà.";
      return "";
    }
    if (kind === "area") {
      if (!area) return "Ce clic n'a pas de bloc « pour chaque joueur à moins de … ».";
      if (def.zone !== "area" && type !== "effect") return "Seuls les dégâts, l'éclair, la propulsion et les effets vont dans « pour chaque joueur ».";
      const inside = area ? area.blocks.filter(function (x) { return x !== ignore; }) : [];
      if (type !== "effect" && inside.some(function (x) { return x.t === type; })) return "Ce bloc est déjà dans la zone.";
      if (type === "effect" && clickEffects >= 5) return "5 effets maximum par clic.";
      return "";
    }
    if (def.zone === "area") return "Ce bloc va dans un bloc « pour chaque joueur à moins de … » (catégorie Zone).";
    if (kind === "impact") {
      if (def.zone !== "impact" && type !== "effect") return "Seuls la téléportation à l'impact, la zone de dégâts et les effets vont dans « à l'impact ».";
      const impact = launch ? launch.impact.filter(function (x) { return x !== ignore; }) : [];
      if (type !== "effect" && impact.some(function (x) { return x.t === type; })) return "Ce bloc est déjà dans « à l'impact ».";
      if (type === "effect" && impact.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
      return "";
    }
    if (def.zone === "impact") return "Ce bloc va dans « à l'impact » d'un bloc « lancer un projectile ».";
    if (kind === "inner") {
      const inside = nested ? nested.blocks.filter(function (x) { return x !== ignore; }) : [];
      if (def.tp && inside.some(function (x) { return DEF[x.t].tp; })) return "Une seule téléportation par clic.";
      if (type === "launch") return "Un projectile ne vise pas : place « lancer un projectile » directement dans le « si » du clic.";
      if (type === "area") return "Une zone touche tous les joueurs proches : place-la directement dans le « si » du clic.";
      if (type === "cooldown") return "Le cooldown du clic se place directement dans le « si » du clic.";
      if (type === "effect" && inside.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
      return "";
    }
    // directement dans « si frapper un joueur » : la cible est le joueur frappé
    if (hitBranch) {
      if (type === "launch") return "« frapper un joueur » agit sur le joueur frappé : pas de projectile.";
      if (type === "area") return "« frapper un joueur » agit sur le joueur frappé : pas de zone.";
      if (def.tp && others.some(function (x) { return DEF[x.t].tp; })) return "Une seule téléportation par clic.";
      if (type === "effect" && effectCount(others) >= 5) return "5 effets maximum par clic.";
      if (type === "cooldown" && others.some(function (x) { return x.t === "cooldown"; })) return "Ce « si » a déjà son cooldown.";
      return "";
    }
    // directement dans le « si » d'un clic
    if (def.tp) return "Une téléportation a besoin d'un joueur visé : glisse un « si » dans ce clic, avec le capteur « viser un joueur ».";
    if (type === "launch") {
      if (launch) return "Ce clic lance déjà un projectile.";
      if (nested) return "Ce clic vise un joueur : un projectile ne peut pas s'y ajouter.";
      if (area) return "Ce clic a une zone : un projectile ne peut pas s'y ajouter.";
    }
    if (type === "area") {
      if (area) return "Ce clic a déjà sa zone.";
      if (nested) return "Ce clic vise un joueur : une zone ne peut pas s'y ajouter.";
      if (launch) return "Ce clic lance un projectile : une zone ne peut pas s'y ajouter.";
    }
    if (type === "effect") {
      if (nested) return "Ce clic vise un joueur : place les effets dans son « si viser un joueur ».";
      if (launch) return "Avec un projectile, place les effets dans « à l'impact ».";
      if (clickEffects >= 5) return "5 effets maximum par clic.";
    }
    if (type === "cooldown") {
      if (others.some(function (x) { return x.t === "cooldown"; })) return "Ce clic a déjà son cooldown.";
      if (branch.click === "ANY") return "Avec « clic gauche ou clic droit », utilise le cooldown commun (sous le programme).";
    }
    return "";
  }

  // ---------- rendu ----------

  /**
   * @param obj   brouillon du pouvoir (modifié en place)
   * @param opts  { dflt(id) : valeur par défaut d'un champ du pouvoir, items : [{ id, name }], commands : [noms],
   *                argPattern, reserved : [arguments interdits], maxCommandEffects, blockable : [effets qu'on peut empêcher],
   *                teams : [{ id, name }] (camps du mode du rôle), teamName(id), potions : { ID: libellé },
   *                colors : [{ code, name, hex }] }
   */
  function render(obj, opts) {
    const dflt = opts.dflt;
    // le programme est gardé dans le brouillon (hors champs enregistrés) tant que les réglages n'ont pas changé ailleurs
    const kept = obj._blocks && obj._blocks.sig === signature(obj) ? obj._blocks.prog : null;
    const prog = kept || read(obj, dflt);
    // zone sélectionnée : "root" (sous le départ), un clic { branch }, ou une zone intérieure
    let selected = prog.event && prog.event.t === "evItem" && prog.branches.length ? { branch: 0 } : "root";
    const ctx = { maxCommandEffects: opts.maxCommandEffects || 8, blockable: opts.blockable || [], teams: opts.teams || [],
      maxEnchants: opts.maxEnchants || 5 };
    const evType = function () { return prog.event ? prog.event.t : null; };

    const root = el("div", "row wrap bk-row");
    const top = el("div", "bk-top");
    top.appendChild(el("span", "name", "Programme du pouvoir"));
    const full = el("button", "btn dark small bk-fullbtn", "⛶ Plein écran");
    full.type = "button";
    full.title = "Afficher le code par blocs en plein écran (Échap pour revenir)";
    top.appendChild(full);
    root.appendChild(top);
    const box = el("div", "bk");
    const palette = el("div", "bk-palette");
    const script = el("div", "bk-script");
    const msg = el("p", "bk-msg");
    msg.setAttribute("role", "status");
    box.appendChild(palette);
    box.appendChild(script);
    root.appendChild(box);
    root.appendChild(msg);

    const say = function (text, bad) { msg.textContent = text || ""; msg.classList.toggle("bad", !!bad); };
    const save = function () { write(obj, prog, dflt); obj._blocks = { sig: signature(obj), prog: prog }; };
    const commit = function () { save(); draw(); };

    // ---- plein écran : vrai plein écran du navigateur si possible, sinon le bloc recouvre toute la fenêtre ----
    function setFull(on) {
      root.classList.toggle("bk-full", on);
      full.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
      document.body.classList.toggle("bk-noscroll", on);
    }
    full.addEventListener("click", function () {
      const on = !root.classList.contains("bk-full");
      setFull(on);
      if (on && root.requestFullscreen) root.requestFullscreen().catch(function () { /* refusé : la fenêtre entière suffit */ });
      if (!on && document.fullscreenElement === root && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    });
    const onFsChange = function () {
      if (!root.isConnected) { document.removeEventListener("fullscreenchange", onFsChange); return; }
      if (!document.fullscreenElement && root.classList.contains("bk-full")) setFull(false); // Échap du navigateur
    };
    document.addEventListener("fullscreenchange", onFsChange);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("bk-full") && !document.fullscreenElement) setFull(false);
    });

    // ---- palette : seulement les catégories utiles au bloc de départ choisi ----
    function drawPalette() {
     palette.replaceChildren();
     const ev = evType();
     if (!ev) palette.appendChild(el("p", "bk-note bk-palhint", "Commence par choisir ce qui déclenche le pouvoir :"));
     CATS.filter(function (cat) { return CATS_OF[ev || "none"].indexOf(cat.id) !== -1; }).forEach(function (cat) {
      palette.appendChild(el("p", "bk-cat", cat.name)).style.color = cat.color;
      Object.keys(DEF).filter(function (t) {
        return DEF[t].cat === cat.id && !(t === "cooldown" && ev !== "evItem");
      }).forEach(function (type) {
        const shape = CSHAPES.indexOf(type) !== -1 ? " bk-cshape" : isSensor(type) ? " bk-hex" : DEF[type].zone === "event" ? " bk-hat" : "";
        const b = el("button", "bk-block bk-pal" + shape, DEF[type].palette);
        b.type = "button";
        b.style.setProperty("--c", cat.color);
        b.draggable = true;
        b.title = type === "if" ? "« si » : dans le programme (avec un capteur de clic) ou à l'intérieur d'un clic (avec « viser un joueur »)"
          : DEF[type].zone === "event" ? "Bloc de départ : glisse-le tout en haut du programme (ou clique dessus)"
          : isSensor(type) ? "Capteur : glisse-le dans l'emplacement ⬡ d'un « si » (ou clique dessus)"
          : "Glisse ce bloc dans le programme, ou clique dessus pour l'ajouter à la zone sélectionnée";
        b.addEventListener("dragstart", function (e) { dragging = { mode: "new", type: type }; e.dataTransfer.setData("text/plain", type); e.dataTransfer.effectAllowed = "copyMove"; });
        b.addEventListener("dragend", function () { dragging = null; clearHints(); });
        b.addEventListener("click", function () { addByClick(type); });
        palette.appendChild(b);
      });
     });
    }
    // relâcher un bloc du programme sur la palette = le supprimer
    palette.addEventListener("dragover", function (e) { if (dragging && dragging.mode === "move") { e.preventDefault(); palette.classList.add("bk-trash"); } });
    palette.addEventListener("dragleave", function () { palette.classList.remove("bk-trash"); });
    palette.addEventListener("drop", function (e) {
      e.preventDefault(); palette.classList.remove("bk-trash");
      if (dragging && dragging.mode === "move") { remove(dragging.ref); say("Bloc supprimé."); commit(); }
      dragging = null;
    });

    // zone sélectionnée (cible des blocs ajoutés par un simple clic) : seule la surbrillance change
    const keyOf = function (zone) {
      if (!zone || zone === "root") return "root";
      if (zone.event) return "event";
      if (zone.pb !== undefined) return "pb" + zone.pb;
      return zone.branch + ":" + (zone.inner ? "inner" : zone.impact ? "impact" : zone.area ? "area" : "branch");
    };
    function select(zone) {
      selected = zone;
      const key = keyOf(zone);
      script.querySelectorAll("[data-zone]").forEach(function (n) { n.classList.toggle("bk-sel-zone", n.dataset.zone === key); });
    }
    function clearHints() { script.querySelectorAll(".bk-over").forEach(function (n) { n.classList.remove("bk-over"); }); }

    // ---- références et opérations ----
    // ref : { branch } (« si » du programme), { branch, cond } (son capteur), { branch, inner, cond } (capteur de visée),
    //       { branch, index } (bloc du clic, y compris le « si » imbriqué), { branch, inner, index }, { branch, index, impactIndex }
    // refs du départ : { event }, { body: i } (commande / passif), { body: i, child: j }, { limit: i }
    function locate(ref) {
      if (ref.limit !== undefined) return { list: prog.limits, item: prog.limits[ref.limit] };
      if (ref.look !== undefined) return { list: prog.look, item: prog.look[ref.look] };
      if (ref.body !== undefined) {
        if (ref.child !== undefined) { const l = prog.body[ref.body].blocks; return { list: l, item: l[ref.child] }; }
        return { list: prog.body, item: prog.body[ref.body] };
      }
      const b = prog.branches[ref.branch];
      if (ref.index === undefined) return { list: prog.branches, item: b };
      if (ref.inner) { const l = nestedOf(b).blocks; return { list: l, item: l[ref.index] }; }
      if (ref.impactIndex !== undefined) { const l = b.blocks[ref.index].impact; return { list: l, item: l[ref.impactIndex] }; }
      if (ref.areaIndex !== undefined) { const l = b.blocks[ref.index].blocks; return { list: l, item: l[ref.areaIndex] }; }
      return { list: b.blocks, item: b.blocks[ref.index] };
    }
    function typeOf(ref) {
      if (ref.event) return prog.event.t;
      if (ref.limit !== undefined || ref.look !== undefined || ref.body !== undefined) return locate(ref).item.t;
      if (ref.cond) return ref.inner ? "sensAim" : SENSOR_OF[prog.branches[ref.branch].click];
      if (ref.index === undefined) return "if";
      return locate(ref).item.t;
    }
    // objet « ignoré » par les règles pendant un déplacement (le bloc ou le « si » d'où l'on part)
    function movedThing(ref) {
      if (!ref) return null;
      if (ref.event) return prog.event;
      if (ref.limit !== undefined || ref.look !== undefined || ref.body !== undefined) return locate(ref).item;
      if (ref.cond) return ref.inner ? nestedOf(prog.branches[ref.branch]) : prog.branches[ref.branch];
      return locate(ref).item;
    }
    function remove(ref) {
      if (ref.event) { // le départ emporte tout son programme (sauf cooldown et utilisations)
        prog.event = null; prog.branches = []; prog.body = []; prog.look = []; selected = "root"; return;
      }
      if (ref.limit !== undefined || ref.look !== undefined || ref.body !== undefined) {
        const at = locate(ref);
        at.list.splice(at.list.indexOf(at.item), 1);
        if (ref.body !== undefined && ref.child === undefined) selected = "root";
        return;
      }
      const b = prog.branches[ref.branch];
      if (ref.cond) { if (ref.inner) nestedOf(b).cond = null; else b.click = null; return; }
      const at = locate(ref);
      at.list.splice(at.list.indexOf(at.item), 1);
      if (ref.index === undefined) selected = prog.branches.length ? { branch: 0 } : "root";
      else if (at.item.t === "if" && selected && selected.inner && selected.branch === ref.branch) selected = { branch: ref.branch };
      else if (at.item.t === "area" && selected && selected.area && selected.branch === ref.branch) selected = { branch: ref.branch };
    }
    /** Ajoute (ou déplace, si from est donné) un bloc ; retourne false avec un message si c'est impossible. */
    const EVENT_HELP = {
      evItem: "Un « si clic droit » est prêt : glisse-lui des blocs (ou change son capteur, ou ajoute un autre « si »).",
      evCommand: "Ajoute les effets que la commande active ou désactive (catégorie Effets).",
      evPassive: "Ajoute un comportement (catégorie Passifs), ou laisse vide pour un passif décrit seulement par sa description."
    };
    // valeur pas encore prise dans le bloc parent (effet empêché, camp coloré)
    function freeValue(parent, key, values) {
      const used = parent.blocks.map(function (x) { return x[key]; });
      return values.find(function (v) { return used.indexOf(v) === -1; });
    }
    function insert(type, zone, before, from) {
      const why = refuse(prog, type, zone, movedThing(from), ctx);
      if (why) { say(why, true); return false; }
      const kind = zoneKind(zone);
      const def = DEF[type];
      if (def.zone === "event") {
        prog.event = type === "evItem" ? { t: type, item: dflt("powerItem") }
          : type === "evCommand" ? { t: type, command: (opts.commands || [])[0] || "", arg: "" } : { t: type };
        selected = "root";
        if (type === "evItem") { // comme avant : un objet commence avec « si clic droit alors »
          prog.branches = [{ click: "RIGHT", blocks: [] }];
          selected = { branch: 0 };
        }
        say(EVENT_HELP[type]);
        return true;
      }
      if (def.limit || def.look || (kind === "root" && evType() !== "evItem") || kind === "child") {
        const block = from ? locate(from).item : newBlock(type, dflt);
        if (from) { const at = locate(from); at.list.splice(at.list.indexOf(at.item), 1); }
        let list;
        if (def.limit) list = prog.limits;
        else if (def.look) {
          list = prog.look;
          if (!from && type === "itemEnchant") block.enchant = freeValue({ blocks: prog.look }, "enchant", Object.keys(opts.enchants));
        } else if (kind === "child") {
          const parent = prog.body[zone.pb];
          list = parent.blocks;
          if (!from && type === "fxPick") block.effect = freeValue(parent, "effect", ctx.blockable);
          if (!from && type === "teamColor") block.team = freeValue(parent, "team", ctx.teams.map(function (x) { return x.id; }));
          if (!from && type === "effect") block.seconds = 10;
        } else {
          list = prog.body;
          if (!from && type === "effect") block.seconds = 0; // commande : effet maintenu tant que le pouvoir est activé
        }
        list.splice(before === undefined || before > list.length ? list.length : before, 0, block);
        // l'apparence de l'objet ne change pas la zone sélectionnée (les blocs suivants vont toujours dans le clic choisi)
        if (!def.look) selected = def.passive && CSHAPES.indexOf(type) !== -1 ? { pb: prog.body.indexOf(block) } : kind === "child" ? zone : "root";
        return true;
      }
      if (type === "if" && kind === "root") {
        const branch = from ? prog.branches.splice(from.branch, 1)[0] : { click: null, blocks: [] };
        let at = before === undefined ? prog.branches.length : before;
        if (from && from.branch < at) at--;
        prog.branches.splice(at, 0, branch);
        selected = { branch: at };
        if (!from) say("Place maintenant un capteur de clic (catégorie Capteurs) dans l'emplacement ⬡ du « si ».");
        return true;
      }
      if (kind === "cond") {
        if (from) prog.branches[from.branch].click = null;
        prog.branches[zone.branch].click = DEF[type].click;
        selected = { branch: zone.branch };
        return true;
      }
      if (kind === "innerCond") {
        let distance = dflt("aDistance");
        if (from) { const src = nestedOf(prog.branches[from.branch]); distance = src.cond.distance; src.cond = null; }
        nestedOf(prog.branches[zone.branch]).cond = { distance: distance };
        selected = { branch: zone.branch, inner: true };
        return true;
      }
      const branch = prog.branches[zone.branch];
      const block = from ? locate(from).item : newBlock(type, dflt);
      if (from) { const at = locate(from); at.list.splice(at.list.indexOf(at.item), 1); }
      if (!from && (type === "launch" || type === "if")) {
        // les effets déjà dans le clic suivent : dans « à l'impact » d'un projectile, ou dans le nouveau « si viser »
        const effects = branch.blocks.filter(function (x) { return x.t === "effect"; });
        if (effects.length) {
          branch.blocks = branch.blocks.filter(function (x) { return x.t !== "effect"; });
          effects.forEach(function (x) { x.who = "USER"; (type === "launch" ? block.impact : block.blocks).push(x); });
          say(type === "launch" ? "Les effets de ce clic ont été placés dans « à l'impact »." : "Les effets de ce clic ont été placés dans le nouveau « si ».");
        } else if (type === "if") {
          say("Place maintenant le capteur « viser un joueur » (catégorie Capteurs) dans l'emplacement ⬡ de ce « si ».");
        }
      }
      const target = kind === "inner" ? nestedOf(branch).blocks : kind === "impact" ? launchOf(branch).impact
        : kind === "area" ? areaOf(branch).blocks : branch.blocks;
      target.splice(before === undefined || before > target.length ? target.length : before, 0, block);
      selected = type === "launch" ? { branch: zone.branch, impact: true } : type === "if" ? { branch: zone.branch, inner: true }
        : type === "area" ? { branch: zone.branch, area: true }
        : kind === "branch" ? { branch: zone.branch } : zone;
      return true;
    }
    function addByClick(type) {
      say("");
      const def = DEF[type], ev = evType();
      if (def.zone === "event") { if (insert(type, { event: true })) commit(); return; }
      if (!ev) return say(refuse(prog, type, "root", null, ctx), true);
      if (def.limit || def.look) { if (insert(type, "root")) commit(); return; }
      if (ev === "evPassive" && (def.parent || type === "effect")) {
        const parentType = def.parent || "noArmor";
        const i = prog.body.findIndex(function (x) { return x.t === parentType; });
        if (insert(type, i === -1 ? "root" : { pb: i })) commit();
        return;
      }
      if (ev !== "evItem") { if (insert(type, "root")) commit(); return; }
      const sel = selected && selected.branch !== undefined && prog.branches[selected.branch] ? selected : null;
      const selBranch = sel ? prog.branches[sel.branch] : null;
      if (type === "if") {
        // dans le clic sélectionné s'il peut viser, sinon un nouveau « si » de programme
        if (selBranch && selBranch.click && !refuse(prog, "if", { branch: sel.branch })) { if (insert("if", { branch: sel.branch })) commit(); return; }
        if (insert("if", "root")) commit();
        return;
      }
      if (DEF[type].zone === "cond") {
        // dans le « si » sélectionné s'il est vide, sinon le premier « si » vide, sinon un nouveau « si »
        let i = selBranch && !selBranch.click ? sel.branch : prog.branches.findIndex(function (b) { return !b.click; });
        if (i === -1) {
          const why = refuse(prog, "if", "root") || refuse(Object.assign({}, prog, { branches: prog.branches.concat([{ click: null, blocks: [] }]) }), type, { branch: prog.branches.length, cond: true });
          if (why) return say(why, true);
          prog.branches.push({ click: null, blocks: [] });
          i = prog.branches.length - 1;
        }
        if (insert(type, { branch: i, cond: true })) commit();
        return;
      }
      if (type === "sensAim") {
        // dans le « si viser » vide du clic sélectionné, sinon le premier vide, sinon un nouveau « si » dans le clic sélectionné
        const order = (sel ? [sel.branch] : []).concat(prog.branches.map(function (b, k) { return k; }));
        let i = order.find(function (k) { const n = nestedOf(prog.branches[k]); return n && !n.cond; });
        if (i === undefined) {
          if (!sel) return say("Ajoute d'abord un « si » avec un capteur de clic.", true);
          const why = refuse(prog, "if", { branch: sel.branch });
          if (why) return say(why, true);
          insert("if", { branch: sel.branch });
          i = sel.branch;
        }
        if (insert(type, { branch: i, inner: true, cond: true })) { commit(); say("Capteur placé : le « si » s'exécute seulement si un joueur est visé."); }
        return;
      }
      if (DEF[type].target) {
        // dans le « si frapper » sélectionné, sinon le « si viser » du clic sélectionné, sinon le premier « si frapper » ou « si viser »
        const order = (sel ? [sel.branch] : []).concat(prog.branches.map(function (b, k) { return k; }));
        const k = order.find(function (j) { return prog.branches[j].click === "HIT" || nestedOf(prog.branches[j]); });
        if (k === undefined) return say("Ajoute d'abord un « si » avec le capteur « frapper un joueur », ou un « si viser un joueur » dans un clic.", true);
        if (insert(type, prog.branches[k].click === "HIT" ? { branch: k } : { branch: k, inner: true })) commit();
        return;
      }
      if (!sel) return say("Ajoute d'abord un « si » (catégorie Contrôle).", true);
      let zone = { branch: sel.branch };
      const nested = nestedOf(selBranch), launch = launchOf(selBranch);
      if (DEF[type].zone === "impact") {
        // va dans « à l'impact » du clic sélectionné, sinon du premier clic qui lance un projectile
        const i = [sel.branch].concat(prog.branches.map(function (b, k) { return k; })).find(function (k) { return launchOf(prog.branches[k]); });
        if (i === undefined) return say("Ajoute d'abord « lancer un projectile » dans un « si ».", true);
        zone = { branch: i, impact: true };
      } else if (DEF[type].zone === "area") {
        // va dans « pour chaque joueur » du clic sélectionné, sinon du premier clic qui a une zone
        const i = [sel.branch].concat(prog.branches.map(function (b, k) { return k; })).find(function (k) { return areaOf(prog.branches[k]); });
        if (i === undefined) return say("Ajoute d'abord « pour chaque joueur à moins de … » (catégorie Zone) dans un « si ».", true);
        zone = { branch: i, area: true };
      } else if (type === "effect" && sel.area && areaOf(selBranch)) {
        zone = { branch: sel.branch, area: true };
      } else if (DEF[type].tp || (type === "effect" && nested)) {
        if (nested) zone = { branch: sel.branch, inner: true };
      } else if (type === "effect" && launch) {
        zone = { branch: sel.branch, impact: true };
      }
      if (insert(type, zone)) commit();
    }

    // zone de dépôt. Un « si » se dépose dans le programme ou directement dans un clic ; les autres blocs sont acceptés
    // partout et, s'ils n'ont rien à faire là, refusés avec un message qui explique où les mettre.
    function accepts(zone, type) {
      if (type !== "if") return true;
      const kind = zoneKind(zone);
      return kind === "root" || kind === "branch";
    }
    function dropZone(node, zone, before) {
      node.addEventListener("dragover", function (e) {
        if (!dragging) return;
        const type = dragging.mode === "new" ? dragging.type : typeOf(dragging.ref);
        if (!accepts(zone, type)) return;
        e.preventDefault(); e.stopPropagation();
        clearHints(); node.classList.add("bk-over");
      });
      node.addEventListener("dragleave", function () { node.classList.remove("bk-over"); });
      node.addEventListener("drop", function (e) {
        if (!dragging) return;
        const type = dragging.mode === "new" ? dragging.type : typeOf(dragging.ref);
        if (!accepts(zone, type)) return;
        e.preventDefault(); e.stopPropagation(); clearHints();
        say("");
        if (insert(type, zone, before, dragging.mode === "move" ? dragging.ref : null)) commit();
        dragging = null;
      });
    }
    function draggableAs(node, ref, label) {
      node.draggable = true;
      node.addEventListener("dragstart", function (e) {
        if (e.target !== node) return;
        e.stopPropagation(); dragging = { mode: "move", ref: ref }; e.dataTransfer.setData("text/plain", label); e.dataTransfer.effectAllowed = "move";
      });
      node.addEventListener("dragend", function () { dragging = null; clearHints(); });
    }
    function closeButton(title, onClick) {
      const x = el("button", "bk-x", "✕");
      x.type = "button"; x.title = title; x.setAttribute("aria-label", title);
      x.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
      return x;
    }

    // ---- champs dans les blocs ----
    function num(block, key, min, max, step, onInput) {
      const n = el("input", "bk-in");
      n.type = "number"; n.min = min; n.max = max; n.step = step || 1;
      n.value = block[key];
      n.setAttribute("aria-label", { distance: "distance en blocs", radius: "rayon en blocs", seconds: "durée en secondes",
        level: "niveau", damage: "dégâts en cœurs", hearts: "dégâts en cœurs", height: "hauteur en blocs", count: "nombre d'utilisations", amount: "valeur" }[key] || key);
      const check = function () { n.classList.toggle("bad", !(n.valueAsNumber >= min && n.valueAsNumber <= max) || (step === 1 && !Number.isInteger(n.valueAsNumber))); };
      check();
      n.addEventListener("input", function () { block[key] = n.valueAsNumber; check(); save(); if (onInput) onInput(); });
      n.addEventListener("click", function (e) { e.stopPropagation(); });
      return n;
    }
    // options : [[valeur, libellé], ...] ; accept(valeur) : message si le choix est refusé (la liste revient en arrière)
    function choice(block, key, options, accept) {
      const s = el("select", "bk-sel");
      options.forEach(function (o) { const op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
      s.value = block[key];
      s.addEventListener("change", function () {
        const no = accept ? accept(s.value) : "";
        if (no) { s.value = block[key]; say(no, true); return; }
        block[key] = s.value; save();
      });
      s.addEventListener("click", function (e) { e.stopPropagation(); });
      return s;
    }
    const t = function (text) { return el("span", "bk-t", text); };
    // option oui / non d'un bloc (block.flag) sous forme de liste : [non, oui]
    function flagChoice(block, no, yes) {
      const s = el("select", "bk-sel");
      [["0", no], ["1", yes]].forEach(function (o) { const op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
      s.value = block.flag ? "1" : "0";
      s.addEventListener("change", function () { block.flag = s.value === "1"; save(); });
      s.addEventListener("click", function (e) { e.stopPropagation(); });
      return s;
    }
    const separateClicks = function () {
      const clicks = prog.branches.map(function (b) { return b.click; });
      return clicks.indexOf("LEFT") !== -1 && clicks.indexOf("RIGHT") !== -1;
    };

    // bloc simple (ou « lancer » avec son « à l'impact ») ; ref = où il se trouve
    function blockNode(block, ref, branch) {
      const type = block.t;
      if (type === "if") return nestedNode(block, ref, branch);
      const node = el("div", "bk-block" + (CSHAPES.indexOf(type) !== -1 ? " bk-cshape" : ""));
      node.style.setProperty("--c", catOf(type).color);
      const line = el("div", "bk-line");
      node.appendChild(line);
      const add = function (x) { line.appendChild(typeof x === "string" ? t(x) : x); };
      switch (type) {
        case "tpBehind": add("me téléporter derrière le joueur visé"); break;
        case "tpAround": add("me téléporter à"); add(num(block, "radius", 1, 30, 1)); add("blocs autour du joueur visé"); break;
        case "tpToMe": add("téléporter le joueur visé jusqu'à moi"); break;
        case "launch":
          add("lancer"); add(choice(block, "projectile", [["ARROW", "une flèche"], ["SNOWBALL", "une boule de neige"]]));
          break;
        case "impactTp": add("me téléporter au point d'impact"); break;
        case "area":
          add("pour chaque"); add(choice(block, "filter", [["ENEMIES", "ennemi"], ["ALL", "joueur"]]));
          add("à moins de"); add(num(block, "radius", 1, 100, 1)); add("blocs :");
          break;
        case "areaDamage": add("infliger"); add(num(block, "hearts", 0.5, 10, 0.5)); add("❤ (sans tuer)"); break;
        case "areaLightning": add("faire tomber un éclair (sans dégâts)"); break;
        case "areaUp":
          add("propulser de"); add(num(block, "height", 1, 100, 1)); add("blocs vers le haut,");
          add(choice(block, "fall", [["DAMAGE", "avec dégâts de chute"], ["SAFE", "sans dégâts de chute"]]));
          node.appendChild(el("div", "bk-note", "Avec dégâts de chute : comme Uchiwa, la retombée peut tuer. Sans : la prochaine chute du joueur est annulée."));
          break;
        case "zone":
          add("zone de dégâts : rayon"); add(num(block, "radius", 1, 30, 1)); add("blocs,");
          add(num(block, "damage", 0.5, 10, 0.5)); add("❤ par joueur, pendant"); add(num(block, "seconds", 0, 60, 1)); add("s, couleur");
          add(choice(block, "color", opts.colors.map(function (c) { return [c.code, c.name]; })));
          break;
        case "effect": {
          add("donner"); add(choice(block, "effect", Object.keys(opts.potions).map(function (k) { return [k, opts.potions[k]]; })));
          add("niveau"); add(num(block, "level", 1, 10, 1));
          if (ref.child !== undefined) { block.who = "USER"; add("tant que je ne porte aucune armure"); break; } // durée gardée telle quelle
          if (ref.body !== undefined) { // commande : 0 s = tant que le pouvoir est activé
            block.who = "USER";
            add("pendant"); add(num(block, "seconds", 0, 1600, 1)); add("s à moi");
            break;
          }
          add("pendant"); add(num(block, "seconds", 1, 1600, 1)); add("s à");
          // « la cible » seulement dans un « si viser un joueur » ; dans une zone, l'effet va au joueur touché
          if (ref.areaIndex !== undefined) { block.who = "TARGET"; add("ce joueur"); break; }
          const hitHere = ref.branch !== undefined && ref.index !== undefined && prog.branches[ref.branch] && prog.branches[ref.branch].click === "HIT";
          if (!ref.inner && !hitHere) block.who = "USER";
          add(ref.inner || hitHere ? choice(block, "who", [["USER", "moi"], ["TARGET", hitHere ? "le joueur frappé" : "la cible"]]) : "moi");
          break;
        }
        case "cooldown":
          add("attendre"); add(num(block, "seconds", 1, 3600, 1));
          add(branch.click === "HIT" ? "s avant que frapper refasse effet" : "s avant de réutiliser ce clic");
          if (branch.click !== "HIT" && (!separateClicks() || branch.click === "ANY")) node.appendChild(el("div", "bk-note", "Sans effet tant qu'il n'y a pas un « si clic gauche » ET un « si clic droit » : sinon, utilise « cooldown du pouvoir »."));
          break;
        case "powerCooldown":
          add("cooldown du pouvoir :"); add(num(block, "seconds", 1, 3600, 1)); add("s");
          if (separateClicks()) node.appendChild(el("div", "bk-note", "S'ajoute au cooldown de chaque clic."));
          break;
        case "maxUse": add("utilisable"); add(num(block, "count", 1, 999, 1)); add("fois maximum"); break;
        case "tgt_DAMAGE": add("infliger"); add(num(block, "amount", 0.5, 10, 0.5)); add("❤ de plus à la cible (sans tuer)"); break;
        case "tgt_FIRE": add("enflammer la cible pendant"); add(num(block, "amount", 1, 30, 1)); add("s"); break;
        case "tgt_KNOCKBACK": add("repousser la cible, force"); add(num(block, "amount", 1, 5, 1)); break;
        case "tgt_UP":
          add("propulser la cible de"); add(num(block, "amount", 1, 100, 1)); add("blocs vers le haut,");
          add(flagChoice(block, "avec dégâts de chute", "sans dégâts de chute"));
          break;
        case "tgt_LIGHTNING": add("faire tomber un éclair sur la cible (sans dégâts)"); break;
        case "tgt_STUN":
          add("étourdir la cible pendant"); add(num(block, "amount", 1, 10, 1)); add("s,");
          add(flagChoice(block, "sans l'aveugler", "en l'aveuglant"));
          node.appendChild(el("div", "bk-note", "Étourdissement d'UHC-Meetup (GamePlayer.stun) : la cible ne peut plus bouger."));
          break;
        case "itemGlint":
          add("faire briller l'objet (comme enchanté)");
          if (prog.look.some(function (x) { return x.t === "itemEnchant"; })) node.appendChild(el("div", "bk-note", "Un objet enchanté brille déjà : ce bloc ne change rien avec « enchanter l'objet »."));
          break;
        case "itemEnchant":
          add("enchanter l'objet :");
          add(choice(block, "enchant", Object.keys(opts.enchants).map(function (k) { return [k, opts.enchants[k]]; }), function (v) {
            return prog.look.some(function (x) { return x !== block && x.t === "itemEnchant" && x.enchant === v; }) ? "L'objet a déjà cet enchantement." : "";
          }));
          add("niveau"); add(num(block, "level", 1, 10, 1));
          break;
        case "itemHide":
          add("cacher les enchantements");
          if (!prog.look.some(function (x) { return x.t === "itemEnchant"; })) node.appendChild(el("div", "bk-note", "Sans effet sans « enchanter l'objet » : il n'y a aucun enchantement à cacher (« faire briller » cache déjà le sien)."));
          break;
        case "blockFx":
          add("empêcher les joueurs à moins de"); add(num(block, "radius", 1, 100, 1)); add("blocs d'obtenir :");
          break;
        case "fxPick": {
          const parent = prog.body[ref.body];
          add("l'effet");
          add(choice(block, "effect", ctx.blockable.map(function (k) { return [k, opts.potions[k]]; }), function (v) {
            return parent.blocks.some(function (x) { return x !== block && x.effect === v; }) ? "Cet effet est déjà empêché." : "";
          }));
          break;
        }
        case "blockPow": add("empêcher les joueurs à moins de"); add(num(block, "radius", 1, 100, 1)); add("blocs d'utiliser leurs pouvoirs"); break;
        case "info":
          add("révéler le camp des joueurs restés"); add(num(block, "seconds", 5, 3600, 1)); add("s à moins de");
          add(num(block, "radius", 1, 100, 1)); add("blocs, en couleur :");
          break;
        case "teamColor": {
          const parent = prog.body[ref.body];
          const teams = ctx.teams.map(function (x) { return [x.id, x.name]; });
          if (!ctx.teams.some(function (x) { return x.id === block.team; })) teams.push([block.team, opts.teamName(block.team)]); // camp d'un autre mode : gardé
          add("camp"); add(choice(block, "team", teams, function (v) {
            return parent.blocks.some(function (x) { return x !== block && x.team === v; }) ? "Ce camp a déjà sa couleur." : "";
          }));
          add("en"); add(choice(block, "color", opts.colors.map(function (c) { return [c.code, c.name]; })));
          break;
        }
        case "noArmor": add("si je ne porte aucune armure :"); break;
        case "noFall": add("insensible aux dégâts de chute"); break;
      }
      line.appendChild(closeButton("Supprimer ce bloc", function () { remove(ref); say("Bloc supprimé."); commit(); }));
      draggableAs(node, ref, type);
      if (type === "launch") {
        const body = el("div", "bk-body bk-impact");
        const zone = { branch: ref.branch, impact: true };
        if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
        body.appendChild(el("div", "bk-label", "à l'impact :"));
        block.impact.forEach(function (child, j) {
          const n = blockNode(child, { branch: ref.branch, index: ref.index, impactIndex: j }, branch);
          dropZone(n, zone, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", block.impact.length ? "+" : "glisse ici : téléportation à l'impact, zone de dégâts, effets"));
        dropZone(body, zone);
        body.dataset.zone = keyOf(zone);
        body.addEventListener("click", function (e) { e.stopPropagation(); select(zone); });
        node.appendChild(body);
        node.appendChild(el("div", "bk-foot"));
      }
      if (type === "blockFx" || type === "info" || type === "noArmor") {
        const body = el("div", "bk-body bk-impact");
        const zone = { pb: ref.body };
        if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
        block.blocks.forEach(function (child, j) {
          const n = blockNode(child, { body: ref.body, child: j }, null);
          dropZone(n, zone, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", block.blocks.length ? "+" : {
          blockFx: "glisse ici « l'effet … » (un par effet à empêcher)",
          info: "glisse ici « couleur d'un camp » (sinon : couleur des autres camps)",
          noArmor: "glisse ici des effets et/ou « insensible aux dégâts de chute »"
        }[type]));
        dropZone(body, zone);
        body.dataset.zone = keyOf(zone);
        body.addEventListener("click", function (e) { e.stopPropagation(); select(zone); });
        node.appendChild(body);
        if (type === "info") {
          const other = el("div", "bk-line bk-otherline");
          other.appendChild(t("autres camps en"));
          other.appendChild(choice(block, "other", opts.colors.map(function (c) { return [c.code, c.name]; })));
          node.appendChild(other);
        } else node.appendChild(el("div", "bk-foot"));
        if (type === "blockFx") node.appendChild(el("div", "bk-note", "Absorption et Régénération ne peuvent jamais être empêchées."));
      }
      if (type === "area") {
        const body = el("div", "bk-body bk-impact");
        const zone = { branch: ref.branch, area: true };
        if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
        block.blocks.forEach(function (child, j) {
          const n = blockNode(child, { branch: ref.branch, index: ref.index, areaIndex: j }, branch);
          dropZone(n, zone, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", block.blocks.length ? "+" : "glisse ici : dégâts, éclair, propulsion, effets"));
        dropZone(body, zone);
        body.dataset.zone = keyOf(zone);
        body.addEventListener("click", function (e) { e.stopPropagation(); select(zone); });
        node.appendChild(body);
        node.appendChild(el("div", "bk-foot"));
      }
      return node;
    }

    // capteur hexagonal placé dans un « si »
    function sensorNode(type, ref, content, onRemove) {
      const sensor = el("span", "bk-block bk-hex bk-sensor");
      sensor.style.setProperty("--c", catOf(type).color);
      content.forEach(function (x) { sensor.appendChild(typeof x === "string" ? t(x) : x); });
      sensor.appendChild(closeButton("Retirer ce capteur", onRemove));
      draggableAs(sensor, ref, "capteur");
      return sensor;
    }
    function emptySlot(text, title) {
      const slot = el("span", "bk-cond bk-cond-empty");
      slot.title = title;
      slot.appendChild(t(text));
      return slot;
    }

    // « si » imbriqué dans un clic : son capteur de visée, puis les blocs qui ont besoin du joueur visé
    function nestedNode(nested, ref, branch) {
      const c = el("div", "bk-block bk-cshape bk-if bk-nested" + (nested.cond ? "" : " bk-incomplete"));
      c.style.setProperty("--c", "#FFAB19");
      const head = el("div", "bk-line");
      head.appendChild(t("si"));
      const condRef = { branch: ref.branch, inner: true, cond: true };
      // « sinon » fixe du plugin : personne n'est visé -> un message, ni action ni cooldown
      const otherwise = el("div", "bk-else");
      const showElse = function () {
        otherwise.textContent = "sinon : message « Il faut viser un joueur à moins de " +
          (nested.cond && nested.cond.distance >= 1 ? nested.cond.distance : "x") + " blocs ! » (aucune action, pas de cooldown)";
      };
      showElse();
      let slot;
      if (nested.cond) {
        slot = el("span", "bk-cond");
        slot.appendChild(sensorNode("sensAim", condRef, ["viser un joueur à moins de", num(nested.cond, "distance", 1, 100, 1, showElse), "blocs"],
          function () { remove(condRef); say("Capteur retiré : place « viser un joueur » dans le « si »."); commit(); }));
      } else {
        slot = emptySlot("viser… ?", "Glisse ici le capteur « viser un joueur à moins de … blocs » (catégorie Capteurs)");
      }
      dropZone(slot, condRef);
      head.appendChild(slot);
      head.appendChild(t("alors"));
      head.appendChild(closeButton("Supprimer ce « si » et ses blocs", function () { remove(ref); say("Bloc « si » supprimé."); commit(); }));
      c.appendChild(head);
      draggableAs(c, ref, "si");
      const zone = { branch: ref.branch, inner: true };
      const body = el("div", "bk-body");
      if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
      nested.blocks.forEach(function (block, j) {
        const n = blockNode(block, { branch: ref.branch, inner: true, index: j }, branch);
        dropZone(n, zone, j);
        body.appendChild(n);
      });
      body.appendChild(el("div", "bk-slot", nested.blocks.length ? "+" : "glisse ici : téléportation, effets (à moi ou à la cible)"));
      dropZone(body, zone);
      body.dataset.zone = keyOf(zone);
      body.addEventListener("click", function (e) { e.stopPropagation(); select(zone); });
      c.appendChild(body);
      c.appendChild(otherwise);
      return c;
    }

    // bloc de départ : son emplacement (vide) ou le départ choisi, avec ses réglages
    function hatNode() {
      const ev = prog.event;
      const hat = el("div", "bk-block bk-hat" + (ev ? "" : " bk-incomplete"));
      hat.style.setProperty("--c", "#FFBF00");
      const line = el("div", "bk-line");
      hat.appendChild(line);
      const evZone = { event: true };
      if (!ev) {
        const slot = emptySlot("quand… ?", "Glisse ici un bloc de départ (catégorie Événements)");
        dropZone(slot, evZone);
        line.appendChild(slot);
        line.appendChild(t("← choisis ce qui déclenche le pouvoir (catégorie Événements)"));
        return hat;
      }
      if (ev.t === "evItem") {
        line.appendChild(t("quand le joueur utilise"));
        line.appendChild(choice(ev, "item", opts.items.map(function (i) { return [i.id, i.name]; })));
      } else if (ev.t === "evCommand") {
        line.appendChild(t("quand le joueur tape /"));
        const cmds = (opts.commands || []).map(function (c) { return [c, c]; });
        if (cmds.every(function (c) { return c[0] !== ev.command; })) cmds.unshift([ev.command, ev.command ? ev.command + " (introuvable)" : "— commande ? —"]);
        line.appendChild(choice(ev, "command", cmds));
        const arg = el("input", "bk-in bk-arg");
        arg.type = "text"; arg.maxLength = 20; arg.value = ev.arg; arg.placeholder = "argument";
        arg.setAttribute("aria-label", "argument de la commande");
        const check = function () {
          arg.classList.toggle("bad", !new RegExp(opts.argPattern || "^[a-z][a-z0-9_]{0,19}$").test(arg.value) || (opts.reserved || []).indexOf(arg.value) !== -1);
        };
        check();
        arg.addEventListener("input", function () { ev.arg = arg.value; check(); save(); });
        arg.addEventListener("click", function (e) { e.stopPropagation(); });
        line.appendChild(arg);
        hat.appendChild(el("div", "bk-note", (opts.commands || []).length
          ? "La même commande désactive le pouvoir. Durée d'un effet : 0 s = tant que le pouvoir est activé. Argument : minuscules, chiffres et _ (pas « me » ni « roles »)."
          : "Crée d'abord une commande (menu Commandes de l'addon) pour pouvoir la choisir ici."));
      } else {
        line.appendChild(t("en permanence (pouvoir passif)"));
      }
      line.appendChild(closeButton("Supprimer le bloc de départ et les blocs du programme", function () {
        remove({ event: true }); say("Bloc de départ supprimé avec les blocs du programme."); commit();
      }));
      dropZone(line, evZone);
      return hat;
    }

    function draw() {
      drawPalette();
      script.replaceChildren();
      script.appendChild(hatNode());
      const ev = evType();
      if (ev === "evItem") prog.look.forEach(function (block, j) { // apparence de l'objet, juste sous le départ
        const n = blockNode(block, { look: j }, null);
        dropZone(n, "root");
        script.appendChild(n);
      });
      if (ev && ev !== "evItem") { // commande ou passif : blocs directement sous le départ
        prog.body.forEach(function (block, j) {
          const n = blockNode(block, { body: j }, null);
          dropZone(n, "root", j);
          script.appendChild(n);
        });
      }
      if (ev === "evItem") prog.branches.forEach(function (branch, i) {
        const c = el("div", "bk-block bk-cshape bk-if" + (branch.click ? "" : " bk-incomplete"));
        c.style.setProperty("--c", "#FFAB19");
        const head = el("div", "bk-line");
        head.appendChild(t("si"));
        const condRef = { branch: i, cond: true };
        let slot;
        if (branch.click) {
          slot = el("span", "bk-cond");
          slot.appendChild(sensorNode(SENSOR_OF[branch.click], condRef, [CLICK_NAME[branch.click]],
            function () { remove(condRef); say("Capteur retiré : place un autre capteur de clic dans le « si »."); commit(); }));
        } else {
          slot = emptySlot("clic… ?", "Glisse ici un capteur : clic gauche, clic droit, clic gauche ou clic droit, ou frapper un joueur (catégorie Capteurs)");
        }
        dropZone(slot, condRef);
        head.appendChild(slot);
        head.appendChild(t("alors"));
        head.appendChild(closeButton("Supprimer ce « si » et ses blocs", function () { remove({ branch: i }); say("Bloc « si » supprimé."); commit(); }));
        c.appendChild(head);
        if (branch.click === "HIT" && prog.branches.some(function (b) { return b.click === "LEFT" || b.click === "ANY"; }))
          c.appendChild(el("div", "bk-note", "Attention : frapper est aussi un clic gauche, le « si » du clic gauche se déclenche donc aussi en frappant."));
        draggableAs(c, { branch: i }, "si");
        const zone = { branch: i };
        const body = el("div", "bk-body");
        if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
        branch.blocks.forEach(function (block, j) {
          const n = blockNode(block, { branch: i, index: j }, branch);
          dropZone(n, zone, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", branch.blocks.length ? "+" : branch.click === "HIT"
          ? "glisse ici ce qui arrive au joueur frappé (catégorie Cible), des effets ou une téléportation"
          : "glisse ici les blocs à exécuter (ou un « si » pour viser un joueur)"));
        dropZone(body, zone);
        body.dataset.zone = keyOf(zone);
        body.addEventListener("click", function () { select(zone); });
        c.appendChild(body);
        c.appendChild(el("div", "bk-foot"));
        dropZone(c, "root", i);
        script.appendChild(c);
      });
      prog.limits.forEach(function (block, j) {
        const n = blockNode(block, { limit: j }, null);
        dropZone(n, "root");
        script.appendChild(n);
      });
      const end = el("div", "bk-slot bk-rootslot", !ev ? "glisse d'abord un bloc de départ dans l'emplacement ci-dessus"
        : ev === "evItem" ? (prog.branches.length ? "+ « si »" : "glisse ici un bloc « si » (catégorie Contrôle), puis un capteur de clic dans son emplacement ⬡")
        : ev === "evCommand" ? (prog.body.length ? "+" : "glisse ici « donner un effet » (catégorie Effets) : la commande active / désactive ces effets")
        : (prog.body.length ? "+" : "glisse ici un comportement (catégorie Passifs), ou laisse vide : passif décrit seulement par sa description"));
      dropZone(end, ev ? "root" : { event: true });
      end.dataset.zone = "root";
      end.addEventListener("click", function () { select("root"); });
      if (selected === "root") end.classList.add("bk-sel-zone");
      script.appendChild(end);
    }

    save(); // normalise le brouillon (mêmes valeurs que le formulaire)
    draw();
    return root;
  }

  return { render: render, read: read, write: write, refuse: refuse };
})();
