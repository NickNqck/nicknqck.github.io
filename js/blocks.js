/*
 * Éditeur à blocs (façon Scratch) des pouvoirs « objet à activer ».
 *
 * Il ne crée AUCUNE donnée nouvelle : il lit et écrit les mêmes champs que le formulaire (clickMode, aAction, aEffects,
 * bCooldown... voir clickFields dans menu-data.js). Le .jar, le projet IntelliJ et l'import / export ne changent donc pas.
 *
 * Programme affiché :
 *   Quand le joueur utilise <objet>
 *     si ⬡ alors            (bloc « Contrôle » ; l'emplacement ⬡ reçoit un capteur de clic)
 *       ⬡ clic gauche | ⬡ clic droit | ⬡ clic gauche ou clic droit      (capteurs, catégorie « Capteurs »)
 *       viser un joueur, téléportations, lancer un projectile (+ à l'impact), effets, cooldown du clic
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

  // Blocs. zone = où ils vont : root (script principal), cond (emplacement ⬡ d'un « si »), branch (dans un « si »),
  // impact (dans « à l'impact » d'un projectile), both (branch ou impact)
  const DEF = {
    if: { cat: "control", zone: "root", palette: "si ⬡ alors" },
    sensLeft: { cat: "sensing", zone: "cond", click: "LEFT", palette: "clic gauche" },
    sensRight: { cat: "sensing", zone: "cond", click: "RIGHT", palette: "clic droit" },
    sensAny: { cat: "sensing", zone: "cond", click: "ANY", palette: "clic gauche ou clic droit" },
    aim: { cat: "sensing", zone: "branch", palette: "viser un joueur à 30 blocs max" },
    tpBehind: { cat: "motion", zone: "branch", main: true, palette: "me téléporter derrière le joueur visé" },
    tpAround: { cat: "motion", zone: "branch", main: true, palette: "me téléporter autour du joueur visé" },
    tpToMe: { cat: "motion", zone: "branch", main: true, palette: "téléporter le joueur visé jusqu'à moi" },
    launch: { cat: "projectile", zone: "branch", main: true, palette: "lancer un projectile · à l'impact :" },
    impactTp: { cat: "projectile", zone: "impact", palette: "me téléporter au point d'impact" },
    zone: { cat: "projectile", zone: "impact", palette: "zone de dégâts au point d'impact" },
    effect: { cat: "looks", zone: "both", palette: "donner un effet" },
    cooldown: { cat: "operators", zone: "branch", palette: "cooldown de ce clic" }
  };
  const SENSOR_OF = { LEFT: "sensLeft", RIGHT: "sensRight", ANY: "sensAny" };
  const CLICK_NAME = { LEFT: "clic gauche", RIGHT: "clic droit", ANY: "clic gauche ou clic droit" };
  const MAIN_TYPE = { tpBehind: "TP_BEHIND", tpAround: "TP_AROUND", tpToMe: "TP_TO_USER", launch: "LAUNCH" };
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
  const isSensor = function (type) { return DEF[type].zone === "cond"; };

  // ---------- données <-> programme ----------

  function readBranch(p, pf, dflt) {
    const get = function (k) { return p[pf + k] === undefined ? dflt(pf + k) : p[pf + k]; };
    const effects = (get("Effects") || []).map(function (e) {
      return { t: "effect", effect: e.effect, level: e.level, seconds: e.seconds, who: e.who || "USER" };
    });
    const blocks = [];
    const act = get("Action");
    if (act === "LAUNCH") {
      const impact = [];
      if (get("ImpactTp")) impact.push({ t: "impactTp" });
      if (get("Zone")) impact.push({ t: "zone", radius: get("ZoneRadius"), damage: get("ZoneDamage"), seconds: get("ZoneSeconds"), color: get("ZoneColor") });
      blocks.push({ t: "launch", projectile: get("Projectile"), impact: impact.concat(effects) });
    } else {
      if (act === "EFFECT_ONLY" && get("Aim")) blocks.push({ t: "aim", distance: get("Distance") });
      if (act === "TP_BEHIND") blocks.push({ t: "tpBehind", distance: get("TpDistance") });
      if (act === "TP_AROUND") blocks.push({ t: "tpAround", distance: get("TpDistance"), radius: get("Radius") });
      if (act === "TP_TO_USER") blocks.push({ t: "tpToMe", distance: get("TpDistance") });
      effects.forEach(function (e) { blocks.push(e); });
    }
    if (p.clickMode === "DIFFERENT" && get("Cooldown") > 0) blocks.push({ t: "cooldown", seconds: get("Cooldown") });
    return blocks;
  }

  /** Programme : { branches: [{ click: "LEFT" | "RIGHT" | "ANY" | null (« si » sans capteur), blocks }] } */
  function read(p, dflt) {
    const branches = [];
    if (p.clickMode === "LEFT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "LEFT", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "BOTH_SAME") branches.push({ click: "ANY", blocks: readBranch(p, "a", dflt) });
    if (p.clickMode === "RIGHT_ONLY" || p.clickMode === "DIFFERENT") branches.push({ click: "RIGHT", blocks: readBranch(p, "b", dflt) });
    return { branches: branches };
  }

  const mainOf = function (b) { return b.blocks.find(function (x) { return DEF[x.t].main; }); };
  const aimOf = function (b) { return b.blocks.find(function (x) { return x.t === "aim"; }); };
  // un effet peut viser la cible quand le clic vise un joueur (bloc « viser » ou téléportation), pas avec un projectile
  const targetOk = function (b) { const m = mainOf(b); return m ? m.t !== "launch" : !!aimOf(b); };

  function writeBranch(p, pf, branch, dflt) {
    FIELDS.forEach(function (k) { p[pf + k] = clone(dflt(pf + k)); });
    if (!branch) return;
    const main = mainOf(branch), canTarget = targetOk(branch);
    const effect = function (x) { return { effect: x.effect, level: x.level, seconds: x.seconds, who: canTarget ? x.who : "USER" }; };
    p[pf + "Action"] = main ? MAIN_TYPE[main.t] : "EFFECT_ONLY";
    branch.blocks.forEach(function (x) {
      if (x.t === "aim") { p[pf + "Aim"] = true; p[pf + "Distance"] = x.distance; }
      if (x.t === "tpBehind" || x.t === "tpAround" || x.t === "tpToMe") p[pf + "TpDistance"] = x.distance;
      if (x.t === "tpAround") p[pf + "Radius"] = x.radius;
      if (x.t === "cooldown") p[pf + "Cooldown"] = x.seconds;
    });
    if (main && main.t === "launch") {
      p[pf + "Projectile"] = main.projectile;
      p[pf + "Effects"] = [];
      main.impact.forEach(function (x) {
        if (x.t === "impactTp") p[pf + "ImpactTp"] = true;
        if (x.t === "zone") {
          p[pf + "Zone"] = true; p[pf + "ZoneRadius"] = x.radius; p[pf + "ZoneDamage"] = x.damage;
          p[pf + "ZoneSeconds"] = x.seconds; p[pf + "ZoneColor"] = x.color;
        }
        if (x.t === "effect") p[pf + "Effects"].push({ effect: x.effect, level: x.level, seconds: x.seconds, who: "USER" });
      });
    } else {
      p[pf + "Effects"] = branch.blocks.filter(function (x) { return x.t === "effect"; }).map(effect);
    }
  }

  function write(p, prog, dflt) {
    const find = function (c) { return prog.branches.find(function (b) { return b.click === c; }); };
    const L = find("LEFT"), R = find("RIGHT"), A = find("ANY");
    // un « si » sans capteur rend le pouvoir invalide (clickMode vide) : la validation explique quoi faire
    const incomplete = prog.branches.some(function (b) { return !b.click; });
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
      case "aim": return { t: "aim", distance: d("Distance") };
      case "tpBehind": case "tpToMe": return { t: type, distance: d("TpDistance") };
      case "tpAround": return { t: type, distance: d("TpDistance"), radius: d("Radius") };
      case "launch": return { t: "launch", projectile: d("Projectile"), impact: [] };
      case "impactTp": return { t: "impactTp" };
      case "zone": return { t: "zone", radius: d("ZoneRadius"), damage: d("ZoneDamage"), seconds: d("ZoneSeconds"), color: d("ZoneColor") };
      case "effect": return { t: "effect", effect: "SPEED", level: 1, seconds: 10, who: "USER" };
      case "cooldown": return { t: "cooldown", seconds: 30 };
      default: return null;
    }
  }

  /**
   * Message d'erreur si le bloc ne peut pas aller là, sinon "".
   * zone = "root" | { branch, cond: true } | { branch, impact: bool } ; ignore = bloc déplacé (ou « si » dont on retire le capteur)
   */
  function refuse(prog, type, zone, ignore) {
    const def = DEF[type];
    if (def.zone === "root") {
      if (zone !== "root") return "Un bloc « si » se place directement dans le programme, sous « Quand le joueur utilise ».";
      if (!ignore && prog.branches.length >= 3) return "3 blocs « si » au maximum (clic gauche, clic droit, ou les deux à la fois).";
      return "";
    }
    if (isSensor(type)) {
      if (!zone || zone === "root" || !zone.cond) return "Un capteur de clic se place dans l'emplacement ⬡ d'un bloc « si ».";
      const branch = prog.branches[zone.branch];
      if (!branch) return "Ajoute d'abord un bloc « si » (catégorie Contrôle).";
      if (branch.click && branch !== ignore) return "Ce « si » a déjà un capteur : retire-le d'abord (✕).";
      const others = prog.branches.filter(function (b) { return b !== branch && b !== ignore && b.click; }).map(function (b) { return b.click; });
      if (others.indexOf(def.click) !== -1) return "« " + CLICK_NAME[def.click] + " » est déjà utilisé dans un autre « si ».";
      if (def.click === "ANY" && others.length) return "« clic gauche ou clic droit » remplace les deux autres : retire d'abord les capteurs « clic gauche » / « clic droit ».";
      if (def.click !== "ANY" && others.indexOf("ANY") !== -1) return "Un autre « si » utilise déjà « clic gauche ou clic droit » : retire-le pour séparer les clics.";
      return "";
    }
    if (!zone || zone === "root" || zone.cond) return "Glisse ce bloc à l'intérieur d'un bloc « si » (ou ajoute d'abord un « si » dans « Contrôle »).";
    const branch = prog.branches[zone.branch];
    if (!branch) return "Ajoute d'abord un bloc « si » (catégorie Contrôle).";
    const others = branch.blocks.filter(function (x) { return x !== ignore; });
    const main = others.find(function (x) { return DEF[x.t].main; });
    if (zone.impact) {
      if (def.zone !== "impact" && type !== "effect") return "Seuls la téléportation à l'impact, la zone de dégâts et les effets vont dans « à l'impact ».";
      const impact = main ? main.impact.filter(function (x) { return x !== ignore; }) : [];
      if (type !== "effect" && impact.some(function (x) { return x.t === type; })) return "Ce bloc est déjà dans « à l'impact ».";
      if (type === "effect" && impact.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
      return "";
    }
    if (def.zone === "impact") return "Ce bloc va dans « à l'impact » d'un bloc « lancer un projectile ».";
    if (def.main && main) return "Un clic ne fait qu'une seule action principale (une téléportation OU un projectile).";
    if (type === "aim" && main) return "Inutile : " + (main.t === "launch" ? "un projectile n'a pas besoin de viser." : "la téléportation vise déjà un joueur.");
    if (type === "aim" && others.some(function (x) { return x.t === "aim"; })) return "Ce clic vise déjà un joueur.";
    if ((def.main && type !== "launch") && others.some(function (x) { return x.t === "aim"; }))
      return "Retire d'abord « viser un joueur » : la téléportation vise déjà un joueur (sa distance se règle dans le bloc).";
    if (type === "launch" && others.some(function (x) { return x.t === "aim"; })) return "Retire d'abord « viser un joueur » : un projectile ne vise pas.";
    if (type === "effect" && main && main.t === "launch") return "Avec un projectile, place les effets dans « à l'impact ».";
    if (type === "effect" && others.filter(function (x) { return x.t === "effect"; }).length >= 5) return "5 effets maximum par clic.";
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
    let selected = prog.branches.length ? { branch: 0, impact: false } : null;

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
        b.title = isSensor(type) ? "Capteur : glisse-le dans l'emplacement ⬡ d'un « si » (ou clique dessus)"
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
    function select(zone) {
      selected = zone;
      const key = zone.branch + (zone.impact ? ":impact" : ":branch");
      script.querySelectorAll("[data-zone]").forEach(function (n) { n.classList.toggle("bk-sel-zone", n.dataset.zone === key); });
    }
    function clearHints() { script.querySelectorAll(".bk-over").forEach(function (n) { n.classList.remove("bk-over"); }); }

    // ---- opérations ----
    // ref = { branch } (le « si »), { branch, cond: true } (son capteur), { branch, index } ou { branch, index, impactIndex }
    function typeOf(ref) {
      if (ref.cond) return SENSOR_OF[prog.branches[ref.branch].click];
      if (ref.index === undefined) return "if";
      return locate(ref).item.t;
    }
    function locate(ref) {
      const b = prog.branches[ref.branch];
      if (ref.index === undefined) return { list: prog.branches, item: b };
      if (ref.impactIndex !== undefined) { const l = mainOf(b).impact; return { list: l, item: l[ref.impactIndex] }; }
      return { list: b.blocks, item: b.blocks[ref.index] };
    }
    function remove(ref) {
      if (ref.cond) { prog.branches[ref.branch].click = null; return; }
      const at = locate(ref);
      at.list.splice(at.list.indexOf(at.item), 1);
      if (ref.index === undefined) selected = prog.branches.length ? { branch: 0, impact: false } : null;
    }
    /** Ajoute (ou déplace, si from est donné) un bloc ; retourne false avec un message si c'est impossible. */
    function insert(type, zone, before, from) {
      const ignore = from ? (from.cond || from.index === undefined ? prog.branches[from.branch] : locate(from).item) : null;
      const why = refuse(prog, type, zone, ignore);
      if (why) { say(why, true); return false; }
      if (type === "if") {
        const branch = from ? prog.branches.splice(from.branch, 1)[0] : { click: null, blocks: [] };
        let at = before === undefined ? prog.branches.length : before;
        if (from && from.branch < at) at--;
        prog.branches.splice(at, 0, branch);
        selected = { branch: at, impact: false };
        if (!from) say("Place maintenant un capteur de clic (catégorie Capteurs) dans l'emplacement ⬡ du « si ».");
        return true;
      }
      if (isSensor(type)) {
        if (from) prog.branches[from.branch].click = null;
        prog.branches[zone.branch].click = DEF[type].click;
        selected = { branch: zone.branch, impact: false };
        return true;
      }
      const branch = prog.branches[zone.branch];
      const block = from ? locate(from).item : newBlock(type, dflt);
      if (from) { const at = locate(from); at.list.splice(at.list.indexOf(at.item), 1); }
      // un projectile ajouté à un clic qui donnait des effets : les effets passent « à l'impact »
      if (type === "launch" && !from) {
        const effects = branch.blocks.filter(function (x) { return x.t === "effect"; });
        if (effects.length) {
          branch.blocks = branch.blocks.filter(function (x) { return x.t !== "effect"; });
          effects.forEach(function (x) { x.who = "USER"; block.impact.push(x); });
          say("Les effets de ce clic ont été placés dans « à l'impact ».");
        }
      }
      const target = zone.impact ? mainOf(branch).impact : branch.blocks;
      target.splice(before === undefined || before > target.length ? target.length : before, 0, block);
      selected = { branch: zone.branch, impact: type === "launch" ? true : zone.impact };
      return true;
    }
    function addByClick(type) {
      say("");
      if (type === "if") { if (insert("if", "root")) commit(); return; }
      if (isSensor(type)) {
        // dans le « si » sélectionné s'il est vide, sinon le premier « si » vide, sinon un nouveau « si »
        let i = selected && prog.branches[selected.branch] && !prog.branches[selected.branch].click ? selected.branch
          : prog.branches.findIndex(function (b) { return !b.click; });
        if (i === -1) {
          const why = refuse(prog, "if", "root") || refuse({ branches: prog.branches.concat([{ click: null, blocks: [] }]) }, type, { branch: prog.branches.length, cond: true });
          if (why) return say(why, true);
          prog.branches.push({ click: null, blocks: [] });
          i = prog.branches.length - 1;
        }
        if (insert(type, { branch: i, cond: true })) commit();
        return;
      }
      let zone = selected;
      if (DEF[type].zone === "impact") {
        // va dans « à l'impact » du clic sélectionné, sinon du premier clic qui lance un projectile
        const order = (selected ? [selected.branch] : []).concat(prog.branches.map(function (b, i) { return i; }));
        const i = order.find(function (k) { const m = prog.branches[k] && mainOf(prog.branches[k]); return m && m.t === "launch"; });
        zone = i === undefined ? null : { branch: i, impact: true };
        if (!zone) return say("Ajoute d'abord « lancer un projectile » dans un « si ».", true);
      } else if (type === "effect" && zone && !zone.impact && prog.branches[zone.branch]) {
        const m = mainOf(prog.branches[zone.branch]);
        if (m && m.t === "launch") zone = { branch: zone.branch, impact: true };
      } else if (zone && zone.impact && type !== "effect") {
        zone = { branch: zone.branch, impact: false };
      }
      if (insert(type, zone)) commit();
    }

    // zone de dépôt : "root" (liste des « si »), { branch, cond } (emplacement ⬡), corps d'un « si » ou « à l'impact »
    // un « si » ne se dépose que dans le programme ; tout autre bloc est accepté partout et, s'il n'a rien à faire là,
    // refusé avec un message qui explique où le mettre (ex. un capteur lâché dans le corps d'un « si »)
    function accepts(zone, type) {
      return type === "if" ? zone === "root" : true;
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
      return n;
    }
    function choice(block, key, options) { // options : [[valeur, libellé], ...]
      const s = el("select", "bk-sel");
      options.forEach(function (o) { const op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
      s.value = block[key];
      s.addEventListener("change", function () { block[key] = s.value; save(); });
      return s;
    }
    const t = function (text) { return el("span", "bk-t", text); };
    const separateClicks = function () {
      const clicks = prog.branches.map(function (b) { return b.click; });
      return clicks.indexOf("LEFT") !== -1 && clicks.indexOf("RIGHT") !== -1;
    };

    function blockNode(block, ref, branch) {
      const type = block.t;
      const node = el("div", "bk-block" + (type === "launch" ? " bk-cshape" : ""));
      node.style.setProperty("--c", catOf(type).color);
      const line = el("div", "bk-line");
      node.appendChild(line);
      const add = function (x) { line.appendChild(typeof x === "string" ? t(x) : x); };
      switch (type) {
        case "aim":
          add("viser un joueur à"); add(num(block, "distance", 1, 100, 1)); add("blocs max");
          break;
        case "tpBehind":
          add("me téléporter derrière le joueur visé (à"); add(num(block, "distance", 1, 100, 1)); add("blocs max)");
          break;
        case "tpAround":
          add("me téléporter à"); add(num(block, "radius", 1, 30, 1)); add("blocs autour du joueur visé (à");
          add(num(block, "distance", 1, 100, 1)); add("blocs max)");
          break;
        case "tpToMe":
          add("téléporter jusqu'à moi le joueur visé (à"); add(num(block, "distance", 1, 100, 1)); add("blocs max)");
          break;
        case "launch":
          add("lancer"); add(choice(block, "projectile", [["ARROW", "une flèche"], ["SNOWBALL", "une boule de neige"]]));
          break;
        case "impactTp":
          add("me téléporter au point d'impact");
          break;
        case "zone":
          add("zone de dégâts : rayon"); add(num(block, "radius", 1, 30, 1)); add("blocs,");
          add(num(block, "damage", 0.5, 10, 0.5)); add("❤ par joueur, pendant"); add(num(block, "seconds", 0, 60, 1)); add("s, couleur");
          add(choice(block, "color", opts.colors.map(function (c) { return [c.code, c.name]; })));
          break;
        case "effect": {
          add("donner"); add(choice(block, "effect", Object.keys(opts.potions).map(function (k) { return [k, opts.potions[k]]; })));
          add("niveau"); add(num(block, "level", 1, 10, 1)); add("pendant"); add(num(block, "seconds", 1, 1600, 1)); add("s à");
          const can = ref.impactIndex === undefined && targetOk(branch);
          if (!can) block.who = "USER";
          add(can ? choice(block, "who", [["USER", "moi"], ["TARGET", "la cible"]]) : "moi");
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
        if (selected && selected.branch === ref.branch && selected.impact) body.classList.add("bk-sel-zone");
        body.appendChild(el("div", "bk-label", "à l'impact :"));
        block.impact.forEach(function (child, j) {
          const n = blockNode(child, { branch: ref.branch, index: ref.index, impactIndex: j }, branch);
          dropZone(n, { branch: ref.branch, impact: true }, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", block.impact.length ? "+" : "glisse ici : téléportation à l'impact, zone de dégâts, effets"));
        dropZone(body, { branch: ref.branch, impact: true });
        body.dataset.zone = ref.branch + ":impact";
        body.addEventListener("click", function (e) { e.stopPropagation(); select({ branch: ref.branch, impact: true }); });
        node.appendChild(body);
        node.appendChild(el("div", "bk-foot"));
      }
      return node;
    }

    // emplacement ⬡ d'un « si » : vide (à remplir) ou contenant son capteur de clic
    function condNode(branch, i) {
      const slot = el("span", "bk-cond");
      if (branch.click) {
        const sensor = el("span", "bk-block bk-hex bk-sensor");
        sensor.style.setProperty("--c", catOf(SENSOR_OF[branch.click]).color);
        sensor.appendChild(t(CLICK_NAME[branch.click]));
        sensor.appendChild(closeButton("Retirer ce capteur", function () { remove({ branch: i, cond: true }); say("Capteur retiré : place un autre capteur dans le « si »."); commit(); }));
        draggableAs(sensor, { branch: i, cond: true }, "capteur");
        slot.appendChild(sensor);
      } else {
        slot.classList.add("bk-cond-empty");
        slot.title = "Glisse ici un capteur : clic gauche, clic droit, ou clic gauche ou clic droit (catégorie Capteurs)";
        slot.appendChild(t("capteur ?"));
      }
      dropZone(slot, { branch: i, cond: true });
      return slot;
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
        head.appendChild(condNode(branch, i));
        head.appendChild(t("alors"));
        head.appendChild(closeButton("Supprimer ce « si » et ses blocs", function () { remove({ branch: i }); say("Bloc « si » supprimé."); commit(); }));
        c.appendChild(head);
        draggableAs(c, { branch: i }, "si");
        const body = el("div", "bk-body");
        if (selected && selected.branch === i && !selected.impact) body.classList.add("bk-sel-zone");
        branch.blocks.forEach(function (block, j) {
          const n = blockNode(block, { branch: i, index: j }, branch);
          dropZone(n, { branch: i, impact: false }, j);
          body.appendChild(n);
        });
        body.appendChild(el("div", "bk-slot", branch.blocks.length ? "+" : "glisse ici les blocs à exécuter"));
        dropZone(body, { branch: i, impact: false });
        body.dataset.zone = i + ":branch";
        body.addEventListener("click", function () { select({ branch: i, impact: false }); });
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
