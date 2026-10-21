/*
 * Éditeur à blocs (façon Scratch) des pouvoirs « objet à activer ».
 *
 * Il ne crée AUCUNE donnée nouvelle : il lit et écrit les mêmes champs que le formulaire (clickMode, aAction, aEffects,
 * bCooldown... voir clickFields dans menu-data.js). Le .jar, le projet IntelliJ et l'import / export ne changent donc pas.
 *
 * Programme affiché :
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
    { id: "control", name: "Contrôle", color: "#FFAB19" },
    { id: "sensing", name: "Capteurs", color: "#5CB1D6" },
    { id: "motion", name: "Mouvement", color: "#4C97FF" },
    { id: "projectile", name: "Projectile", color: "#FF6680" },
    { id: "looks", name: "Effets", color: "#9966FF" },
    { id: "operators", name: "Cooldown", color: "#59C059" }
  ];

  // Blocs. zone : root (programme), cond (emplacement ⬡ d'un « si » du programme), innerCond (⬡ d'un « si » imbriqué),
  // branch (directement dans un « si » de clic), inner (dans un « si viser »), impact (dans « à l'impact »)
  const DEF = {
    if: { cat: "control", palette: "si ⬡ alors" },
    sensLeft: { cat: "sensing", zone: "cond", click: "LEFT", palette: "clic gauche" },
    sensRight: { cat: "sensing", zone: "cond", click: "RIGHT", palette: "clic droit" },
    sensAny: { cat: "sensing", zone: "cond", click: "ANY", palette: "clic gauche ou clic droit" },
    sensAim: { cat: "sensing", zone: "innerCond", palette: "viser un joueur à moins de 30 blocs" },
    tpBehind: { cat: "motion", zone: "inner", tp: true, palette: "me téléporter derrière le joueur visé" },
    tpAround: { cat: "motion", zone: "inner", tp: true, palette: "me téléporter autour du joueur visé" },
    tpToMe: { cat: "motion", zone: "inner", tp: true, palette: "téléporter le joueur visé jusqu'à moi" },
    launch: { cat: "projectile", zone: "branch", palette: "lancer un projectile · à l'impact :" },
    impactTp: { cat: "projectile", zone: "impact", palette: "me téléporter au point d'impact" },
    zone: { cat: "projectile", zone: "impact", palette: "zone de dégâts au point d'impact" },
    effect: { cat: "looks", zone: "any", palette: "donner un effet" },
    cooldown: { cat: "operators", zone: "branch", palette: "cooldown de ce clic" }
  };
  const SENSOR_OF = { LEFT: "sensLeft", RIGHT: "sensRight", ANY: "sensAny" };
  const CLICK_NAME = { LEFT: "clic gauche", RIGHT: "clic droit", ANY: "clic gauche ou clic droit" };
  const TP_TYPE = { tpBehind: "TP_BEHIND", tpAround: "TP_AROUND", tpToMe: "TP_TO_USER" };
  const FIELDS = ["Action", "Aim", "Distance", "TpDistance", "Radius", "Projectile", "ImpactTp", "Zone", "ZoneRadius",
    "ZoneDamage", "ZoneSeconds", "ZoneColor", "Effects", "Cooldown"];

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
  const effectOf = function (x, who) { return { t: "effect", effect: x.effect, level: x.level, seconds: x.seconds, who: who || x.who || "USER" }; };

  // ---------- données <-> programme ----------
  // programme = { branches: [{ click: "LEFT" | "RIGHT" | "ANY" | null, blocks }] }
  // blocs d'un clic : { t: "if", cond: { distance } | null, blocks: [tp, effets] } (un seul), launch, effect, cooldown

  function readBranch(p, pf, dflt) {
    const get = function (k) { return p[pf + k] === undefined ? dflt(pf + k) : p[pf + k]; };
    const effects = (get("Effects") || []).map(function (e) { return effectOf(e); });
    const blocks = [];
    const act = get("Action");
    if (act === "LAUNCH") {
      const impact = [];
      if (get("ImpactTp")) impact.push({ t: "impactTp" });
      if (get("Zone")) impact.push({ t: "zone", radius: get("ZoneRadius"), damage: get("ZoneDamage"), seconds: get("ZoneSeconds"), color: get("ZoneColor") });
      blocks.push({ t: "launch", projectile: get("Projectile"), impact: impact.concat(effects) });
    } else if (TP_TYPE.tpBehind === act || TP_TYPE.tpAround === act || TP_TYPE.tpToMe === act) {
      const type = Object.keys(TP_TYPE).find(function (k) { return TP_TYPE[k] === act; });
      const tp = { t: type };
      if (type === "tpAround") tp.radius = get("Radius");
      blocks.push({ t: "if", cond: { distance: get("TpDistance") }, blocks: [tp].concat(effects) });
    } else if (get("Aim")) {
      blocks.push({ t: "if", cond: { distance: get("Distance") }, blocks: effects });
    } else {
      effects.forEach(function (e) { e.who = "USER"; blocks.push(e); });
    }
    if (p.clickMode === "DIFFERENT" && get("Cooldown") > 0) blocks.push({ t: "cooldown", seconds: get("Cooldown") });
    return blocks;
  }

  function read(p, dflt) {
    const branches = [];
    if (p.clickMode === "LEFT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "LEFT", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "BOTH_SAME") branches.push({ click: "ANY", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "RIGHT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "RIGHT", blocks: readBranch(p, "b", dflt) });
    return { branches: branches };
  }

  function writeBranch(p, pf, branch, dflt) {
    FIELDS.forEach(function (k) { p[pf + k] = clone(dflt(pf + k)); });
    if (!branch) return;
    const nested = nestedOf(branch), launch = launchOf(branch);
    p[pf + "Action"] = "EFFECT_ONLY";
    branch.blocks.forEach(function (x) { if (x.t === "cooldown") p[pf + "Cooldown"] = x.seconds; });
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

  function write(p, prog, dflt) {
    const find = function (c) { return prog.branches.find(function (b) { return b.click === c; }); };
    const L = find("LEFT"), R = find("RIGHT"), A = find("ANY");
    // un « si » sans capteur (du programme ou imbriqué) rend le pouvoir invalide (clickMode vide) : la validation explique
    const incomplete = prog.branches.some(function (b) { const n = nestedOf(b); return !b.click || (n && !n.cond); });
    p.clickMode = incomplete ? "" : A ? "BOTH_SAME" : L && R ? "DIFFERENT" : L ? "LEFT_ONLY" : R ? "RIGHT_ONLY" : "";
    writeBranch(p, "a", A || L, dflt);
    writeBranch(p, "b", R, dflt);
  }

  // empreinte des réglages des clics : permet de retrouver le programme (avec ses « si » sans capteur) après un redessin
  function signature(p) {
    const keys = ["clickMode"];
    ["a", "b"].forEach(function (pf) { FIELDS.forEach(function (k) { keys.push(pf + k); }); });
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
      default: return null;
    }
  }

  // zone = "root" | { branch, cond } (⬡ du programme) | { branch, inner, cond } (⬡ imbriqué)
  //      | { branch } (directement dans le clic) | { branch, inner } (dans « si viser ») | { branch, impact }
  const zoneKind = function (zone) {
    if (!zone || zone === "root") return "root";
    if (zone.cond) return zone.inner ? "innerCond" : "cond";
    return zone.inner ? "inner" : zone.impact ? "impact" : "branch";
  };

  /** Message d'erreur si le bloc ne peut pas aller là, sinon "". ignore = bloc déplacé (non compté). */
  function refuse(prog, type, zone, ignore) {
    const kind = zoneKind(zone), def = DEF[type];
    const branch = zone && zone !== "root" ? prog.branches[zone.branch] : null;
    if (kind !== "root" && !branch) return "Ajoute d'abord un bloc « si » (catégorie Contrôle).";
    const others = branch ? branch.blocks.filter(function (x) { return x !== ignore; }) : [];
    const nested = others.find(function (x) { return x.t === "if"; });
    const launch = others.find(function (x) { return x.t === "launch"; });

    if (type === "if") {
      if (kind === "root") {
        if (ignore && ignore.t === "if") return "Ce « si » vise un joueur : il reste à l'intérieur d'un clic.";
        if (!ignore && prog.branches.length >= 3) return "3 blocs « si » au maximum dans le programme (clic gauche, clic droit, ou les deux).";
        return "";
      }
      if (kind !== "branch") return "Un seul niveau de « si » à l'intérieur d'un clic.";
      if (ignore && ignore.blocks && ignore.click !== undefined) return "Ce « si » attend un clic : il reste dans le programme principal.";
      if (nested) return "Ce clic a déjà son « si » : place les actions à l'intérieur.";
      if (launch) return "Un projectile ne vise pas : pas de « si viser un joueur » avec « lancer un projectile ».";
      return "";
    }
    if (def.zone === "cond") {
      if (kind === "innerCond") return "Dans un « si » à l'intérieur d'un clic, utilise le capteur « viser un joueur ».";
      if (kind !== "cond") return "Un capteur de clic se place dans l'emplacement ⬡ d'un « si » du programme.";
      if (branch.click && branch !== ignore) return "Ce « si » a déjà un capteur : retire-le d'abord (✕).";
      const clicks = prog.branches.filter(function (b) { return b !== branch && b !== ignore && b.click; }).map(function (b) { return b.click; });
      if (clicks.indexOf(def.click) !== -1) return "« " + CLICK_NAME[def.click] + " » est déjà utilisé dans un autre « si ».";
      if (def.click === "ANY" && clicks.length) return "« clic gauche ou clic droit » remplace les deux autres : retire d'abord les capteurs « clic gauche » / « clic droit ».";
      if (def.click !== "ANY" && clicks.indexOf("ANY") !== -1) return "Un autre « si » utilise déjà « clic gauche ou clic droit » : retire-le pour séparer les clics.";
      return "";
    }
    if (type === "sensAim") {
      if (kind === "cond") return "Le « si » du programme attend un clic. Place « viser un joueur » dans un « si » glissé à l'intérieur du clic.";
      if (kind !== "innerCond") return "Ce capteur se place dans l'emplacement ⬡ d'un « si » à l'intérieur d'un clic.";
      if (nested && nested.cond && nested !== ignore) return "Ce « si » a déjà un capteur : retire-le d'abord (✕).";
      return "";
    }
    if (kind === "root" || kind === "cond" || kind === "innerCond") return "Glisse ce bloc à l'intérieur d'un bloc « si ».";
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
      if (type === "cooldown") return "Le cooldown du clic se place directement dans le « si » du clic.";
      if (type === "effect" && inside.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
      return "";
    }
    // directement dans le « si » d'un clic
    if (def.tp) return "Une téléportation a besoin d'un joueur visé : glisse un « si » dans ce clic, avec le capteur « viser un joueur ».";
    if (type === "launch") {
      if (launch) return "Ce clic lance déjà un projectile.";
      if (nested) return "Ce clic vise un joueur : un projectile ne peut pas s'y ajouter.";
    }
    if (type === "effect") {
      if (nested) return "Ce clic vise un joueur : place les effets dans son « si viser un joueur ».";
      if (launch) return "Avec un projectile, place les effets dans « à l'impact ».";
      if (others.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
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
   * @param opts  { dflt(id) : valeur par défaut d'un champ, itemName(id) : nom affiché d'un objet,
   *                potions : { ID: libellé }, colors : [{ code, name, hex }] }
   */
  function render(obj, opts) {
    const dflt = opts.dflt;
    // le programme est gardé dans le brouillon (hors champs enregistrés) tant que les réglages n'ont pas changé ailleurs
    const kept = obj._blocks && obj._blocks.sig === signature(obj) ? obj._blocks.prog : null;
    const prog = kept || read(obj, dflt);
    let selected = prog.branches.length ? { branch: 0 } : null;

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

    // ---- palette ----
    CATS.forEach(function (cat) {
      palette.appendChild(el("p", "bk-cat", cat.name)).style.color = cat.color;
      Object.keys(DEF).filter(function (t) { return DEF[t].cat === cat.id; }).forEach(function (type) {
        const shape = type === "if" || type === "launch" ? " bk-cshape" : isSensor(type) ? " bk-hex" : "";
        const b = el("button", "bk-block bk-pal" + shape, DEF[type].palette);
        b.type = "button";
        b.style.setProperty("--c", cat.color);
        b.draggable = true;
        b.title = type === "if" ? "« si » : dans le programme (avec un capteur de clic) ou à l'intérieur d'un clic (avec « viser un joueur »)"
          : isSensor(type) ? "Capteur : glisse-le dans l'emplacement ⬡ d'un « si » (ou clique dessus)"
          : "Glisse ce bloc dans le programme, ou clique dessus pour l'ajouter à la zone sélectionnée";
        b.addEventListener("dragstart", function (e) { dragging = { mode: "new", type: type }; e.dataTransfer.setData("text/plain", type); e.dataTransfer.effectAllowed = "copyMove"; });
        b.addEventListener("dragend", function () { dragging = null; clearHints(); });
        b.addEventListener("click", function () { addByClick(type); });
        palette.appendChild(b);
      });
    });
    // relâcher un bloc du programme sur la palette = le supprimer
    palette.addEventListener("dragover", function (e) { if (dragging && dragging.mode === "move") { e.preventDefault(); palette.classList.add("bk-trash"); } });
    palette.addEventListener("dragleave", function () { palette.classList.remove("bk-trash"); });
    palette.addEventListener("drop", function (e) {
      e.preventDefault(); palette.classList.remove("bk-trash");
      if (dragging && dragging.mode === "move") { remove(dragging.ref); say("Bloc supprimé."); commit(); }
      dragging = null;
    });

    // zone sélectionnée (cible des blocs ajoutés par un simple clic) : seule la surbrillance change
    const keyOf = function (zone) { return zone.branch + ":" + (zone.inner ? "inner" : zone.impact ? "impact" : "branch"); };
    function select(zone) {
      selected = zone;
      const key = keyOf(zone);
      script.querySelectorAll("[data-zone]").forEach(function (n) { n.classList.toggle("bk-sel-zone", n.dataset.zone === key); });
    }
    function clearHints() { script.querySelectorAll(".bk-over").forEach(function (n) { n.classList.remove("bk-over"); }); }

    // ---- références et opérations ----
    // ref : { branch } (« si » du programme), { branch, cond } (son capteur), { branch, inner, cond } (capteur de visée),
    //       { branch, index } (bloc du clic, y compris le « si » imbriqué), { branch, inner, index }, { branch, index, impactIndex }
    function locate(ref) {
      const b = prog.branches[ref.branch];
      if (ref.index === undefined) return { list: prog.branches, item: b };
      if (ref.inner) { const l = nestedOf(b).blocks; return { list: l, item: l[ref.index] }; }
      if (ref.impactIndex !== undefined) { const l = b.blocks[ref.index].impact; return { list: l, item: l[ref.impactIndex] }; }
      return { list: b.blocks, item: b.blocks[ref.index] };
    }
    function typeOf(ref) {
      if (ref.cond) return ref.inner ? "sensAim" : SENSOR_OF[prog.branches[ref.branch].click];
      if (ref.index === undefined) return "if";
      return locate(ref).item.t;
    }
    // objet « ignoré » par les règles pendant un déplacement (le bloc ou le « si » d'où l'on part)
    function movedThing(ref) {
      if (!ref) return null;
      if (ref.cond) return ref.inner ? nestedOf(prog.branches[ref.branch]) : prog.branches[ref.branch];
      return locate(ref).item;
    }
    function remove(ref) {
      const b = prog.branches[ref.branch];
      if (ref.cond) { if (ref.inner) nestedOf(b).cond = null; else b.click = null; return; }
      const at = locate(ref);
      at.list.splice(at.list.indexOf(at.item), 1);
      if (ref.index === undefined) selected = prog.branches.length ? { branch: 0 } : null;
      else if (at.item.t === "if" && selected && selected.inner && selected.branch === ref.branch) selected = { branch: ref.branch };
    }
    /** Ajoute (ou déplace, si from est donné) un bloc ; retourne false avec un message si c'est impossible. */
    function insert(type, zone, before, from) {
      const why = refuse(prog, type, zone, movedThing(from));
      if (why) { say(why, true); return false; }
      const kind = zoneKind(zone);
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
      const target = kind === "inner" ? nestedOf(branch).blocks : kind === "impact" ? launchOf(branch).impact : branch.blocks;
      target.splice(before === undefined || before > target.length ? target.length : before, 0, block);
      selected = type === "launch" ? { branch: zone.branch, impact: true } : type === "if" ? { branch: zone.branch, inner: true }
        : kind === "branch" ? { branch: zone.branch } : zone;
      return true;
    }
    function addByClick(type) {
      say("");
      const sel = selected && prog.branches[selected.branch] ? selected : null;
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
          const why = refuse(prog, "if", "root") || refuse({ branches: prog.branches.concat([{ click: null, blocks: [] }]) }, type, { branch: prog.branches.length, cond: true });
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
      if (!sel) return say("Ajoute d'abord un « si » (catégorie Contrôle).", true);
      let zone = { branch: sel.branch };
      const nested = nestedOf(selBranch), launch = launchOf(selBranch);
      if (DEF[type].zone === "impact") {
        // va dans « à l'impact » du clic sélectionné, sinon du premier clic qui lance un projectile
        const i = [sel.branch].concat(prog.branches.map(function (b, k) { return k; })).find(function (k) { return launchOf(prog.branches[k]); });
        if (i === undefined) return say("Ajoute d'abord « lancer un projectile » dans un « si ».", true);
        zone = { branch: i, impact: true };
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
    function num(block, key, min, max, step) {
      const n = el("input", "bk-in");
      n.type = "number"; n.min = min; n.max = max; n.step = step || 1;
      n.value = block[key];
      n.setAttribute("aria-label", { distance: "distance en blocs", radius: "rayon en blocs", seconds: "durée en secondes",
        level: "niveau", damage: "dégâts en cœurs" }[key] || key);
      const check = function () { n.classList.toggle("bad", !(n.valueAsNumber >= min && n.valueAsNumber <= max) || (step === 1 && !Number.isInteger(n.valueAsNumber))); };
      check();
      n.addEventListener("input", function () { block[key] = n.valueAsNumber; check(); save(); });
      n.addEventListener("click", function (e) { e.stopPropagation(); });
      return n;
    }
    function choice(block, key, options) { // options : [[valeur, libellé], ...]
      const s = el("select", "bk-sel");
      options.forEach(function (o) { const op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
      s.value = block[key];
      s.addEventListener("change", function () { block[key] = s.value; save(); });
      s.addEventListener("click", function (e) { e.stopPropagation(); });
      return s;
    }
    const t = function (text) { return el("span", "bk-t", text); };
    const separateClicks = function () {
      const clicks = prog.branches.map(function (b) { return b.click; });
      return clicks.indexOf("LEFT") !== -1 && clicks.indexOf("RIGHT") !== -1;
    };

    // bloc simple (ou « lancer » avec son « à l'impact ») ; ref = où il se trouve
    function blockNode(block, ref, branch) {
      const type = block.t;
      if (type === "if") return nestedNode(block, ref, branch);
      const node = el("div", "bk-block" + (type === "launch" ? " bk-cshape" : ""));
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
        case "zone":
          add("zone de dégâts : rayon"); add(num(block, "radius", 1, 30, 1)); add("blocs,");
          add(num(block, "damage", 0.5, 10, 0.5)); add("❤ par joueur, pendant"); add(num(block, "seconds", 0, 60, 1)); add("s, couleur");
          add(choice(block, "color", opts.colors.map(function (c) { return [c.code, c.name]; })));
          break;
        case "effect": {
          add("donner"); add(choice(block, "effect", Object.keys(opts.potions).map(function (k) { return [k, opts.potions[k]]; })));
          add("niveau"); add(num(block, "level", 1, 10, 1)); add("pendant"); add(num(block, "seconds", 1, 1600, 1)); add("s à");
          // « la cible » seulement dans un « si viser un joueur »
          if (!ref.inner) block.who = "USER";
          add(ref.inner ? choice(block, "who", [["USER", "moi"], ["TARGET", "la cible"]]) : "moi");
          break;
        }
        case "cooldown":
          add("attendre"); add(num(block, "seconds", 1, 3600, 1)); add("s avant de réutiliser ce clic");
          if (!separateClicks() || branch.click === "ANY") node.appendChild(el("div", "bk-note", "Sans effet tant qu'il n'y a pas un « si clic gauche » ET un « si clic droit » : sinon, utilise le cooldown commun."));
          break;
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
      let slot;
      if (nested.cond) {
        slot = el("span", "bk-cond");
        slot.appendChild(sensorNode("sensAim", condRef, ["viser un joueur à moins de", num(nested.cond, "distance", 1, 100, 1), "blocs"],
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
      c.appendChild(el("div", "bk-foot"));
      return c;
    }

    function draw() {
      script.replaceChildren();
      const hat = el("div", "bk-block bk-hat");
      hat.style.setProperty("--c", "#FFBF00");
      hat.appendChild(el("div", "bk-line")).appendChild(t("Quand le joueur utilise : " + opts.itemName(obj.powerItem)));
      script.appendChild(hat);
      prog.branches.forEach(function (branch, i) {
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
          slot = emptySlot("clic… ?", "Glisse ici un capteur : clic gauche, clic droit, ou clic gauche ou clic droit (catégorie Capteurs)");
        }
        dropZone(slot, condRef);
        head.appendChild(slot);
        head.appendChild(t("alors"));
        head.appendChild(closeButton("Supprimer ce « si » et ses blocs", function () { remove({ branch: i }); say("Bloc « si » supprimé."); commit(); }));
        c.appendChild(head);
        draggableAs(c, { branch: i }, "si");
        const zone = { branch: i };
        const body = el("div", "bk-body");
        if (selected && keyOf(selected) === keyOf(zone)) body.classList.add("bk-sel-zone");
        branch.blocks.forEach(function (block, j) {
          const n = blockNode(block, { branch: i, index: j }, branch);
          dropZone(n, zone, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", branch.blocks.length ? "+" : "glisse ici les blocs à exécuter (ou un « si » pour viser un joueur)"));
        dropZone(body, zone);
        body.dataset.zone = keyOf(zone);
        body.addEventListener("click", function () { select(zone); });
        c.appendChild(body);
        c.appendChild(el("div", "bk-foot"));
        dropZone(c, "root", i);
        script.appendChild(c);
      });
      const end = el("div", "bk-slot bk-rootslot", prog.branches.length ? "+ « si »" : "glisse ici un bloc « si » (catégorie Contrôle), puis un capteur de clic dans son emplacement ⬡");
      dropZone(end, "root");
      script.appendChild(end);
    }

    save(); // normalise le brouillon (mêmes valeurs que le formulaire)
    draw();
    return root;
  }

  return { render: render, read: read, write: write, refuse: refuse };
})();
