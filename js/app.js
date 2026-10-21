(function () {
  "use strict";

  // ---------- Contrôle de démarrage ----------
  // Si un fichier du dossier js est absent (ou plante au chargement), on l'indique clairement au lieu d'une page vide.
  // Un fichier qui plante au milieu de son chargement laisse ses "const" inutilisables : même typeof lève alors une erreur,
  // d'où le try/catch.
  const has = function (read) {
    try { return typeof read() !== "undefined"; } catch (e) { return false; }
  };
  const REQUIRED = [
    ["js/items-data.js", has(function () { return ITEMS; })],
    ["js/colors-data.js", has(function () { return COLORS; })],
    ["js/meetup-modes.js", has(function () { return MEETUP_MODES; })],
    ["js/effects-data.js", has(function () { return POTION_LABELS; }) && has(function () { return PROTECTED_EFFECTS; })],
    ["js/meetup-teams.js", has(function () { return MEETUP_TEAMS; })],
    ["js/commands-data.js", has(function () { return commandProblem; }) && has(function () { return COMMAND_PATTERN; })],
    ["js/blocks.js", has(function () { return BlockEditor; })],
    ["js/menu-data.js", has(function () { return MENU; })],
    ["js/vendor/jszip.min.js", has(function () { return JSZip; })],
    ["js/spigot-check.js", has(function () { return SpigotCheck; })]
  ];
  const absent = REQUIRED.filter(function (r) { return !r[1]; }).map(function (r) { return r[0]; });
  if (absent.length) {
    const box = document.querySelector("#menu");
    box.replaceChildren();
    const title = document.createElement("h2");
    title.className = "q";
    title.textContent = "Des fichiers du site sont introuvables ou en erreur";
    const list = document.createElement("p");
    list.className = "err";
    list.textContent = absent.join("  ·  ");
    const help = document.createElement("p");
    help.className = "intro";
    help.textContent = "Remplace tout le dossier du site par la version complète (tous les fichiers du dossier js, y compris le dossier vendor), " +
      "puis recharge la page avec Ctrl+F5. Si le message reste affiché, ouvre la console (touche F12) : elle indique le fichier et la ligne en cause.";
    box.appendChild(title);
    box.appendChild(list);
    box.appendChild(help);
    return;
  }

  const MAX_IMPORT_BYTES = 100 * 1024; // un .json plus gros est refusé
  const FORMAT = "uhc-meetup-addon";

  // Objets sans prototype : protège contre les clés piégées comme "__proto__"
  const items = Object.create(null); // id -> définition
  const state = Object.create(null); // id -> valeur choisie
  const path = [];                   // ids des sous-menus ouverts
  let phase = "start";               // start -> spigot -> pseudo -> name -> color -> menu
  let spigotOk = false;              // spigot.jar 1.8.8 vérifié dans cette session (jamais enregistré)
  let afterSpigot = "pseudo";        // étape suivante une fois le spigot.jar vérifié
  let editing = null;                // éditeur ouvert : { col, index, draft, pick }
  const TEAMS_ID = "teams", ROLES_ID = "roles"; // autres collections (voir menu-data.js)
  const MODES_ID = "modes";          // collection des modes de jeu créés (voir menu-data.js)
  const COMMANDS_ID = "commands";    // collection des commandes personnalisées (voir menu-data.js)

  // Identité obligatoire : définie ici (et non dans menu-data.js) pour ne jamais casser le démarrage
  const IDENTITY = [
    { type: "text", id: "author", label: "Ton pseudo Minecraft", default: "", max: 16,
      pattern: "^[A-Za-z0-9_]{3,16}$", hint: "3 à 16 caractères : lettres, chiffres et _ (comme un pseudo Minecraft)." },
    { type: "text", id: "addonName", label: "Nom du projet", default: "", max: 32,
      pattern: "^[A-Za-z0-9_-]{1,32}$", hint: "Lettres, chiffres, _ et - uniquement (pas d'espace), 32 caractères maximum." },
    { type: "color", id: "authorColor", label: "Couleur de ton pseudo", default: "b" }
  ];
  const SUMMARY = { id: "__summary", type: "summary", label: "Récapitulatif", icon: "☰" };
  // Thème du site (bouton de l'en-tête) : un réglage comme les autres, donc enregistré dans le .json exporté et repris à l'import
  const THEME = { type: "select", id: "theme", label: "Thème du site", default: "dark", options: ["dark", "light"] };
  const isIdentity = function (c) { return IDENTITY.some(function (i) { return i.id === c.id; }); };

  (function index(node) {
    (node.children || []).forEach(function (c) {
      items[c.id] = c;
      if (c.type !== "folder") state[c.id] = c.type === "collection" ? [] : c.default;
      index(c);
    });
  })(MENU);
  IDENTITY.forEach(function (c) { items[c.id] = c; state[c.id] = c.default; });
  items[THEME.id] = THEME;
  state[THEME.id] = THEME.default;
  items[SUMMARY.id] = SUMMARY;

  const $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text; // jamais innerHTML : pas d'injection possible
    return e;
  }
  function button(cls, text, onClick) {
    const b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // Valide une valeur (saisie ou importée). Retourne la valeur propre, ou undefined si invalide.
  function clean(it, v, rec) { // rec = élément en cours de construction (pour les champs qui dépendent des autres)
    switch (it.type) {
      case "toggle": return typeof v === "boolean" ? v : undefined;
      case "number":
        if (typeof v !== "number" || !isFinite(v)) return undefined;
        return Math.min(it.max === undefined ? Infinity : it.max,
               Math.max(it.min === undefined ? -Infinity : it.min, v));
      case "text":
        return typeof v === "string" && v.length <= (it.max || 32) &&
               new RegExp(it.pattern || "^[A-Za-z0-9_-]*$").test(v) ? v : undefined;
      case "select": return it.options.indexOf(v) !== -1 ? v : undefined;
      case "item": return ITEMS.some(function (i) { return i.id === v; }) ? v : undefined;
      case "color": return COLORS.some(function (c) { return c.code === v; }) ? v : undefined;
      case "mdj": return modeIds().indexOf(v) !== -1 ? v : undefined;
      case "mymdj": return (state[MODES_ID] || []).some(function (m) { return normKey(m.name) === v; }) ? v : undefined;
      case "team": return teamOptions().some(function (t) { return t.id === v; }) ? v : undefined;
      case "mycommand": return (state[COMMANDS_ID] || []).some(function (c) { return c.name === v; }) ? v : undefined;
      case "multiselect": { // plusieurs choix cochés parmi it.options
        if (!Array.isArray(v) || (it.min && v.length < it.min)) return undefined;
        const seen = Object.create(null);
        for (let n = 0; n < v.length; n++) {
          if (it.options.indexOf(v[n]) === -1 || seen[v[n]]) return undefined;
          seen[v[n]] = true;
        }
        return v.slice();
      }
      case "teamcolors": { // { "addon:Royaume": "a", "meetup:Solo": "e" } : couleur par équipe (les entrées périmées sont ignorées)
        if (v === undefined) return {};
        if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
        const known = teamOptions().map(function (t) { return t.id; });
        const out = {};
        Object.keys(v).forEach(function (k) {
          if (known.indexOf(k) !== -1 && /^[0-9a-f]$/.test(v[k])) out[k] = v[k];
        });
        return out;
      }
      case "effectlist": { // effets de potion donnés à l'utilisateur ("USER") ou à la cible ("TARGET")
        if (v === undefined) return [];
        if (!Array.isArray(v) || v.length > (it.max || 5)) return undefined;
        const targetOk = !it.allowTarget || it.allowTarget(rec || {});
        const out = [];
        for (let n = 0; n < v.length; n++) {
          const e = v[n];
          if (!e || typeof e !== "object" || !POTION_LABELS[e.effect]) return undefined;
          if (!Number.isInteger(e.level) || e.level < 1 || e.level > 10) return undefined;
          // minSeconds : 0 permis quand « 0 = tant que le pouvoir est activé » (pouvoirs à base de commande)
          if (!Number.isInteger(e.seconds) || e.seconds < (it.minSeconds === undefined ? 1 : it.minSeconds) || e.seconds > 1600) return undefined;
          if (e.who !== "USER" && !(e.who === "TARGET" && targetOk)) return undefined;
          out.push({ effect: e.effect, level: e.level, seconds: e.seconds, who: e.who });
        }
        return out;
      }
      case "mctext": { // texte avec codes de couleur &a, &l... (le site les convertit en §)
        if (typeof v !== "string" || v.length > (it.max || 40) || !MC_TEXT.test(v)) return undefined;
        return v.replace(/&[0-9a-fk-or]/g, "").trim().length ? v : undefined;
      }
      case "textarea": { // plusieurs lignes, couleurs possibles
        if (typeof v !== "string" || v.length > (it.max || 400)) return undefined;
        const lines = v.split("\n");
        return lines.length <= 6 && lines.every(function (l) { return l.length <= 100 && MC_TEXT.test(l); }) ? v : undefined;
      }
      case "list": { // liste d'éléments dans un élément (ex. effets d'un rôle)
        if (v === undefined) return [];
        if (!Array.isArray(v) || v.length > (it.max || 15)) return undefined;
        const names = Object.create(null);
        const done = [];
        let good = true;
        const out = v.map(function (e) {
          const o = {};
          it.fields.forEach(function (f) {
            if (f.type === "heading" || f.type === "itemblocks") return; // titre / éditeur à blocs : aucune valeur propre
            // optional : un champ ajouté après coup prend sa valeur par défaut dans un .json plus ancien
            const raw = e && typeof e === "object" ? e[f.id] : undefined;
            const x = !visible(f, o) || (raw === undefined && f.optional) ? copyDefault(f) : e && typeof e === "object" ? clean(f, raw, o) : undefined;
            if (x === undefined) good = false;
            o[f.id] = x;
          });
          o.name = autoNameOf(it, o);
          if (it.validate && it.validate(o)) good = false;
          if (it.crossCheck && it.crossCheck(o, done)) good = false; // ex. deux pouvoirs sur la même commande + argument
          done.push(o);
          if (names[o.name]) good = false;
          names[o.name] = true;
          return o;
        });
        return good ? out : undefined;
      }
      case "collection": {
        if (!Array.isArray(v) || v.length > (it.max || 10)) return undefined;
        const seen = Object.create(null);
        const done = []; // entrées déjà vérifiées (pour crossCheck)
        let ok = true;
        const out = v.map(function (e) {
          const o = {};
          it.fields.forEach(function (f) {
            // optional : un champ ajouté après coup prend sa valeur par défaut dans un .json plus ancien
            const raw = e && typeof e === "object" ? e[f.id] : undefined;
            const x = e && typeof e === "object" ? clean(f, raw === undefined && f.optional ? copyDefault(f) : raw) : undefined;
            if (x === undefined) ok = false;
            o[f.id] = x;
          });
          if (it.nameTemplate) o.name = autoNameOf(it, o);
          const k = normKey(String(o.name));
          // nom unique, non vide, et jamais identique à un mode déjà présent dans UHC-Meetup
          if (!k || seen[k] || (it.idFrom && MEETUP_MODES.some(function (m) { return m.id === k; }))) ok = false;
          seen[k] = true;
          if (it.idFrom) o.id = k;
          if (it.id === ROLES_ID && roleProblem(o)) ok = false;
          // vérification croisée facultative d'une collection (ex. commandes : noms et alias uniques, jamais réservés)
          if (it.crossCheck && it.crossCheck(o, done)) ok = false;
          done.push(o);
          return o;
        });
        return ok ? out : undefined;
      }
    }
    return undefined;
  }

  // "Mon Mode é!" -> "mon_mode_e" : identifiant stable d'un mode/équipe (écrit dans le champ mdj des équipes)
  function normKey(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function allModes() {
    return MEETUP_MODES.map(function (m) { return { id: m.id, name: m.name, source: "uhc" }; })
      .concat((state[MODES_ID] || []).map(function (m) { return { id: normKey(m.name), name: m.name, source: "addon" }; }));
  }
  function modeIds() { return allModes().map(function (m) { return m.id; }); }
  function modeLabel(id) {
    const m = allModes().find(function (x) { return x.id === id; });
    return m ? m.name : id;
  }
  // "Skull Kid" -> "Skull_Kid" : nom de constante d'enum (même règle que jar-builder.js)
  function constName(name) {
    const c = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ +/g, "_").replace(/[^A-Za-z0-9_]/g, "");
    return /^[0-9]/.test(c) ? "_" + c : c;
  }
  // Équipes proposées à un rôle : celles de l'addon, puis celles d'UHC-Meetup (TeamList)
  function teamOptions() {
    return (state[TEAMS_ID] || []).map(function (t) {
      return { id: "addon:" + constName(t.name), name: t.name, code: t.color, mdj: t.mdj, source: "addon" };
    }).concat(MEETUP_TEAMS.map(function (t) {
      return { id: "meetup:" + t.id, name: t.name, code: t.code, mdj: t.mdj, source: "uhc" };
    }));
  }
  function teamOf(id) { return teamOptions().find(function (t) { return t.id === id; }); }
  function teamLabel(id) { const t = teamOf(id); return t ? t.name : id; }
  // Une équipe n'est utilisable que dans son propre mode de jeu (ou "all" = tous)
  function roleProblem(r) {
    const t = teamOf(r.team);
    if (!t || !r.mdj || t.mdj === "all" || t.mdj === r.mdj) return "";
    return "L'équipe « " + t.name + " » appartient au mode « " + modeLabel(t.mdj) + " » : choisis une équipe de ton mode ou « Solo ».";
  }
  // nmb = numéro du rôle dans son équipe, dans l'ordre de création : 0, 1, 2... (comme ZRoles)
  function renumber() {
    const next = Object.create(null);
    (state[ROLES_ID] || []).forEach(function (r) {
      const k = r.mdj + "|" + r.team;
      r.nmb = next[k] || 0;
      next[k] = r.nmb + 1;
    });
  }
  // Rôles : l'identifiant d'un rôle est le nom de sa classe/constante (ex. "Skull_Kid")
  function roleName(id) {
    const r = (state[ROLES_ID] || []).find(function (x) { return constName(x.name) === id; });
    return r ? r.name : id;
  }
  function pickLabel(type, id) {
    return type === "team" ? teamLabel(id) : modeLabel(id);
  }
  // Texte autorisé : tout sauf § et caractères de contrôle ; un & doit être suivi d'un code de couleur/format valide
  const MC_TEXT = /^(?:[^&\u00a7\u0000-\u001f\u007f]|&[0-9a-fk-or])*$/;
  // Aperçu coloré d'un texte à codes & (couleurs de colors-data.js, formats l/o/n/m, r = retour à la normale)
  function paintMc(box, text) {
    box.replaceChildren();
    let color = "", bold = false, italic = false, under = false, strike = false, buf = "";
    const flush = function () {
      if (!buf) return;
      const sp = el("span", "", buf);
      if (color) sp.style.color = color;
      if (bold) sp.style.fontWeight = "800";
      if (italic) sp.style.fontStyle = "italic";
      if (under || strike) sp.style.textDecoration = (under ? "underline " : "") + (strike ? "line-through" : "");
      box.appendChild(sp);
      buf = "";
    };
    for (let i = 0; i < text.length; i++) {
      const code = text[i] === "&" ? text[i + 1] : null;
      if (code && /[0-9a-fk-or]/.test(code)) {
        flush(); i++;
        const c = COLORS.find(function (x) { return x.code === code; });
        if (c) { color = c.hex; bold = italic = under = strike = false; }
        else if (code === "r") { color = ""; bold = italic = under = strike = false; }
        else if (code === "l") bold = true;
        else if (code === "o") italic = true;
        else if (code === "n") under = true;
        else if (code === "m") strike = true;
      } else buf += text[i];
    }
    flush();
  }
  function copyDefault(f) {
    return f.default && typeof f.default === "object" ? JSON.parse(JSON.stringify(f.default)) : f.default;
  }
  // Équipes en jeu dans un mode : celles de l'addon, "Solo"-like (mode "all"), celles utilisées par ses rôles
  function modeTeams(mode) {
    const seen = Object.create(null), out = [];
    const add = function (id) {
      const t = !seen[id] && teamOf(id);
      if (t) { seen[id] = true; out.push(t); }
    };
    (state[TEAMS_ID] || []).filter(function (t) { return t.mdj === mode; }).forEach(function (t) { add("addon:" + constName(t.name)); });
    MEETUP_TEAMS.filter(function (t) { return t.mdj === "all"; }).forEach(function (t) { add("meetup:" + t.id); });
    (state[ROLES_ID] || []).filter(function (r) { return r.mdj === mode; }).forEach(function (r) { add(r.team); });
    if (editing && editing.draft && editing.draft.team) add(editing.draft.team);
    return out;
  }
  // Champ conditionnel : showIf { champ: valeur } = affiché (et pris en compte) seulement si le brouillon correspond
  function visible(f, rec) {
    return !f.showIf || Object.keys(f.showIf).every(function (k) {
      const want = f.showIf[k];
      return Array.isArray(want) ? want.indexOf(rec[k]) !== -1 : rec[k] === want;
    });
  }
  // Collections sans champ "nom" (nameTemplate) : "{role} · {effect}" -> texte lisible, utilisé comme nom unique
  function autoNameOf(col, rec) {
    return col.nameTemplate.replace(/\{(\w+)\}/g, function (all, id) {
      const f = col.fields.find(function (x) { return x.id === id; });
      if (!f) return all;
      if (!visible(f, rec)) return "";
      return f.inName ? f.inName.replace("{value}", fieldText(f, rec[id])) : fieldText(f, rec[id]);
    });
  }
  function colorNote(code) {
    const c = COLORS.find(function (x) { return x.code === code; });
    return c ? "§" + c.code + " — " + c.name : "";
  }
  function identityOk() {
    return IDENTITY.every(function (i) { return clean(i, state[i.id]) !== undefined; });
  }
  function invalid() {
    return Object.keys(state).filter(function (id) { return clean(items[id], state[id]) === undefined; })
      .map(function (id) { return items[id].label; });
  }
  function syncExport() { $("#btn-export").disabled = !identityOk(); }

  // ---------- Sélecteur d'objets (fenêtre modale) ----------
  const dlg = el("dialog", "picker");
  const search = el("input");
  search.type = "search"; search.maxLength = 30; search.placeholder = "Rechercher un objet…";
  search.setAttribute("aria-label", "Rechercher un objet");
  const grid = el("div", "grid");
  dlg.appendChild(search); dlg.appendChild(grid);
  dlg.appendChild(button("btn blue", "Fermer", function () { dlg.close(); }));
  document.body.appendChild(dlg);
  let onPick = null;
  function fillPicker() {
    const q = search.value.trim().toLowerCase();
    grid.replaceChildren();
    ITEMS.forEach(function (i) {
      if (q && i.name.toLowerCase().indexOf(q) === -1) return;
      const b = button("cell", "", function () { onPick(i.id); dlg.close(); });
      b.title = i.name;
      b.appendChild(el("span", "glyph", i.name.charAt(0)));
      b.appendChild(el("span", "cap", i.name));
      grid.appendChild(b);
    });
  }
  search.addEventListener("input", fillPicker);
  function openPicker(cb) { onPick = cb; search.value = ""; fillPicker(); dlg.showModal(); search.focus(); }

  // ---------- Contrôles des menus ----------
  // Liste imbriquée (ex. effets d'un rôle) : une ligne par élément (Modifier / Supprimer) et un bouton d'ajout
  function listControl(it, obj) {
    const list = obj[it.id];
    const box = el("div", "subcoll");
    box.appendChild(el("h3", "coll-title", it.label + " (" + list.length + "/" + it.max + ")"));
    list.forEach(function (e, i) {
      const row = el("div", "row entry");
      row.appendChild(el("span", "name", e.name));
      const acts = el("div", "acts");
      acts.appendChild(button("btn dark small", "Modifier", function () {
        editing.sub = { field: it, index: i, draft: JSON.parse(JSON.stringify(e)) }; render();
      }));
      acts.appendChild(button("btn red small", "Supprimer", function () { list.splice(i, 1); render(); }));
      row.appendChild(acts);
      box.appendChild(row);
    });
    const add = button("btn gold", it.createLabel || "Ajouter", function () {
      editing.sub = { field: it, index: -1, draft: defaults(it) }; render();
    });
    add.disabled = list.length >= it.max;
    box.appendChild(add);
    return box;
  }

  function control(it, obj) {
    if (it.type === "heading") return el("h3", "subhead", it.label);
    if (it.type === "itemblocks") { // éditeur à blocs : il modifie directement les champs des clics du brouillon
      const siblings = editing && editing.sub ? editing.sub.field.fields : [];
      return BlockEditor.render(obj, {
        dflt: function (id) { const f = siblings.find(function (x) { return x.id === id; }); return f ? copyDefault(f) : undefined; },
        itemName: function (id) { const i = ITEMS.find(function (x) { return x.id === id; }); return i ? i.name : id; },
        potions: POTION_LABELS, colors: COLORS
      });
    }
    if (it.type === "list") return listControl(it, obj);
    const color = it.type === "color";
    const multi = it.type === "multiselect" || it.type === "teamcolors" || it.type === "effectlist";
    const row = el(color || multi ? "div" : "label", color ? "row colorrow" : "row");
    let note = null;
    row.appendChild(el("span", "name", it.label));
    let input;
    if (it.type === "toggle") {
      input = el("input"); input.type = "checkbox"; input.checked = obj[it.id];
      input.addEventListener("change", function () { obj[it.id] = input.checked; });
    } else if (it.type === "multiselect") {
      input = el("div", "checks");
      row.classList.add("wrap");
      const boxes = [];
      const sync = function () { obj[it.id] = it.options.filter(function (o, i) { return boxes[i].checked; }); };
      it.options.forEach(function (o) {
        const lab = el("label", "chk");
        const cb = el("input"); cb.type = "checkbox"; cb.checked = (obj[it.id] || []).indexOf(o) !== -1;
        cb.addEventListener("change", sync);
        boxes.push(cb);
        lab.appendChild(cb);
        lab.appendChild(el("span", "", it.labels && it.labels[o] ? it.labels[o] : o));
        input.appendChild(lab);
      });
      const all = el("div", "chkbar");
      all.appendChild(button("btn dark small", "Tout sélectionner", function () { boxes.forEach(function (b) { b.checked = true; }); sync(); }));
      all.appendChild(button("btn dark small", "Tout désélectionner", function () { boxes.forEach(function (b) { b.checked = false; }); sync(); }));
      row.appendChild(all);
      if (it.note) note = el("span", "note", it.note);
    } else if (it.type === "effectlist") {
      input = el("div", "efl");
      row.classList.add("wrap");
      const draw = function () {
        input.replaceChildren();
        const targetOk = !it.allowTarget || it.allowTarget(obj);
        const list = (obj[it.id] || []).map(function (e) { return Object.assign({}, e, targetOk ? {} : { who: "USER" }); });
        obj[it.id] = list;
        list.forEach(function (e, i) {
          const line = el("div", "efline");
          const sel = el("select");
          Object.keys(POTION_LABELS).forEach(function (k) { const op = el("option", "", POTION_LABELS[k]); op.value = k; sel.appendChild(op); });
          sel.value = e.effect;
          sel.addEventListener("change", function () { e.effect = sel.value; });
          const num = function (key, min, max) {
            const n = el("input"); n.type = "number"; n.min = min; n.max = max; n.value = e[key];
            n.addEventListener("input", function () { e[key] = n.valueAsNumber; n.classList.toggle("bad", !(n.valueAsNumber >= min && n.valueAsNumber <= max)); });
            return n;
          };
          const who = el("select");
          [["USER", "à l'utilisateur"], ["TARGET", "à la cible"]].forEach(function (w) {
            if (w[0] === "TARGET" && !targetOk) return;
            const op = el("option", "", w[1]); op.value = w[0]; who.appendChild(op);
          });
          who.value = e.who;
          who.addEventListener("change", function () { e.who = who.value; });
          line.appendChild(sel);
          line.appendChild(el("span", "tiny", "niv."));
          line.appendChild(num("level", 1, 10));
          line.appendChild(el("span", "tiny", it.secondsLabel || "durée (s)"));
          line.appendChild(num("seconds", it.minSeconds === undefined ? 1 : it.minSeconds, 1600));
          if (!it.hideWho) line.appendChild(who);
          line.appendChild(button("btn red small", "✕", function () { list.splice(i, 1); draw(); }));
          input.appendChild(line);
        });
        const add = button("btn dark small", "Ajouter un effet", function () {
          list.push({ effect: "SPEED", level: 1, seconds: it.minSeconds === 0 ? 0 : 10, who: "USER" }); draw();
        });
        add.disabled = list.length >= (it.max || 5);
        input.appendChild(add);
        if (!targetOk && !it.hideWho) input.appendChild(el("span", "note", "Sans joueur visé, les effets sont donnés à l'utilisateur."));
        if (it.note) input.appendChild(el("span", "note", it.note));
      };
      draw();
    } else if (it.type === "teamcolors") {
      input = el("div", "tcolors");
      row.classList.add("wrap");
      const mode = editing && editing.draft ? editing.draft.mdj : "";
      const teams = mode ? modeTeams(mode) : [];
      if (!teams.length) input.appendChild(el("span", "note", "Choisis d'abord le mode de jeu du rôle : ses camps apparaîtront ici."));
      teams.forEach(function (t) {
        const line = el("div", "tcline");
        const c = COLORS.find(function (x) { return x.code === t.code; });
        const sw = el("span", "mini");
        if (c) sw.style.background = c.hex;
        line.appendChild(sw);
        line.appendChild(el("span", "tname", t.name));
        const sel = el("select");
        const none = el("option", "", "couleur par défaut"); none.value = ""; sel.appendChild(none);
        COLORS.forEach(function (x) { const op = el("option", "", x.name); op.value = x.code; sel.appendChild(op); });
        sel.value = (obj[it.id] || {})[t.id] || "";
        sel.addEventListener("change", function () {
          const next = Object.assign({}, obj[it.id]);
          if (sel.value) next[t.id] = sel.value; else delete next[t.id];
          obj[it.id] = next;
        });
        line.appendChild(sel);
        input.appendChild(line);
      });
    } else if (it.type === "mctext") {
      input = el("input"); input.type = "text"; input.maxLength = it.max || 40; input.value = obj[it.id];
      if (it.hint) input.placeholder = it.hint;
      note = el("span", "mcprev");
      paintMc(note, input.value);
      row.classList.add("wrap");
      input.addEventListener("input", function () {
        obj[it.id] = input.value;
        input.classList.toggle("bad", clean(it, input.value) === undefined);
        paintMc(note, input.value);
        syncExport();
      });
    } else if (it.type === "textarea") {
      input = el("textarea"); input.rows = 4; input.maxLength = it.max || 400; input.value = obj[it.id];
      if (it.hint) input.placeholder = it.hint;
      row.classList.add("wrap");
      input.addEventListener("input", function () {
        obj[it.id] = input.value.replace(/\r/g, "");
        input.classList.toggle("bad", clean(it, obj[it.id]) === undefined);
      });
    } else if (it.type === "item") {
      input = el("button", "pick");
      input.type = "button";
      const show = function () {
        const f = ITEMS.find(function (i) { return i.id === obj[it.id]; });
        input.textContent = f ? f.name : "Choisir…";
      };
      show();
      input.addEventListener("click", function (e) {
        e.preventDefault();
        openPicker(function (id) { obj[it.id] = id; show(); });
      });
    } else if (it.type === "color") {
      input = el("div", "swatches");
      note = el("span", "note", colorNote(obj[it.id]));
      COLORS.forEach(function (col) {
        const b = button("swatch" + (obj[it.id] === col.code ? " on" : ""), "", function () {
          obj[it.id] = col.code;
          Array.prototype.forEach.call(input.children, function (x) { x.classList.toggle("on", x === b); });
          note.textContent = colorNote(col.code);
        });
        b.style.background = col.hex; b.title = col.name; b.setAttribute("aria-label", col.name);
        input.appendChild(b);
      });
    } else if (it.type === "mdj" || it.type === "mymdj" || it.type === "team") {
      input = el("button", "pick");
      input.type = "button";
      input.textContent = obj[it.id] ? pickLabel(it.type, obj[it.id]) : "Choisir…";
      input.addEventListener("click", function (e) { e.preventDefault(); editing.pick = it.id; render(); });
    } else if (it.type === "mycommand") { // liste déroulante des commandes créées dans cet addon
      input = el("select");
      const names = (state[COMMANDS_ID] || []).map(function (c) { return c.name; });
      names.forEach(function (n) { const op = el("option", "", "/" + n); op.value = n; input.appendChild(op); });
      if (names.indexOf(obj[it.id]) === -1) obj[it.id] = names.length ? names[0] : "";
      input.value = obj[it.id];
      input.addEventListener("change", function () { obj[it.id] = input.value; });
      if (!names.length) note = el("span", "note", "Crée d'abord une commande dans le menu « Commandes ».");
    } else if (it.type === "select") {
      input = el("select");
      it.options.forEach(function (o) { const op = el("option", "", it.labels && it.labels[o] ? it.labels[o] : o); op.value = o; input.appendChild(op); });
      input.value = obj[it.id];
      input.addEventListener("change", function () { obj[it.id] = clean(it, input.value); });
    } else {
      input = el("input");
      input.type = it.type === "number" ? "number" : "text";
      if (it.type === "number") { input.min = it.min; input.max = it.max; input.step = it.step || 1; }
      else { input.maxLength = it.max || 32; if (it.hint) input.placeholder = it.hint; }
      input.value = obj[it.id];
      input.addEventListener("input", function () {
        const raw = it.type === "number" ? input.valueAsNumber : input.value;
        obj[it.id] = raw;
        input.classList.toggle("bad", clean(it, raw) === undefined);
        syncExport();
      });
    }
    row.appendChild(input);
    if (!note && it.note && it.type === "number") note = el("span", "note", it.note);
    if (note) row.appendChild(note);
    return row;
  }

  // ---------- Écrans ----------
  function currentNode() {
    let n = MENU;
    path.forEach(function (id) {
      n = id === SUMMARY.id ? SUMMARY : n.children.find(function (c) { return c.id === id; });
    });
    return n;
  }

  // Journal des contrôles du spigot.jar (⏳ en cours, ✔ réussi, ⚠ avertissement, ✖ échec)
  function createCheckLog(area) {
    const list = el("ol", "steps");
    area.appendChild(list);
    const rows = Object.create(null);
    const icons = { start: "⏳", ok: "✔", warn: "⚠", fail: "✖" };
    const classes = { start: "st-start", ok: "st-done", warn: "st-warn", fail: "st-error" };
    return function (ev) {
      let li = rows[ev.label];
      if (!li) {
        li = el("li");
        ["ico", "lbl", "det"].forEach(function (c) { li.appendChild(el("span", c)); });
        li.children[1].textContent = ev.label;
        rows[ev.label] = li;
        list.appendChild(li);
      }
      li.className = classes[ev.state];
      li.children[0].textContent = icons[ev.state];
      if (ev.detail !== undefined) li.children[2].textContent = ev.detail;
    };
  }

  // ---------- Vérification du spigot.jar : glisser-déposer, choix manuel ou détection à la racine du site ----------
  // État partagé (jamais enregistré) : les évènements des contrôles sont gardés pour pouvoir réafficher le rapport.
  const spigot = { token: 0, events: [], status: "idle", source: "", warnings: 0, auto: "idle" };
  let spigotLive = null; // journal affiché à l'écran (null si l'étape n'est pas affichée)

  // Lance la vérification d'un fichier (source : "racine" ou le nom du fichier choisi/déposé)
  function runSpigotCheck(file, source) {
    const token = ++spigot.token; // un résultat périmé (un autre fichier a été choisi entre-temps) est ignoré
    spigot.events = [];
    spigot.status = "running";
    spigot.source = source;
    spigotOk = false;
    if (phase === "spigot") render();
    say("Vérification de " + source + " en cours…");
    return SpigotCheck.verify(file, function (ev) {
      if (token !== spigot.token) return;
      spigot.events.push(ev);
      if (spigotLive) spigotLive(ev);
    }).then(function (res) {
      if (token !== spigot.token) return;
      spigotOk = res.ok;
      spigot.status = res.ok ? "ok" : "fail";
      spigot.warnings = res.warnings;
      say(res.ok ? "spigot.jar vérifié" + (res.warnings ? " (avec " + res.warnings + " avertissement(s) : voir le rapport)" : " : tout est conforme.")
                 : "Ce fichier n'est pas un spigot.jar 1.8.8 valide : corrige le point en échec (✖) ou choisis un autre fichier.", !res.ok);
      // détecté à la racine et conforme : on n'a rien à demander, on passe à la suite
      const before = phase;
      if (res.ok && source === "racine" && before === "spigot") phase = afterSpigot;
      if (before === "start" || before === "spigot") render();
    }).catch(function (e) {
      if (token !== spigot.token) return;
      spigot.status = "fail";
      say("Vérification impossible : " + e.message, true);
      if (phase === "spigot") render();
    });
  }

  // Cherche spigot.jar à côté de index.html. Possible seulement quand le site est servi (http://localhost:8000) : ouvert en
  // double-clic (file://), le navigateur interdit de lire un fichier local, il faut alors le glisser-déposer.
  function detectRootSpigot() {
    if (location.protocol !== "http:" && location.protocol !== "https:") { spigot.auto = "unsupported"; return; }
    spigot.auto = "searching";
    fetch("spigot.jar", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("absent");
      return response.blob();
    }).then(function (blob) {
      return blob.slice(0, 2).arrayBuffer().then(function (head) {
        const b = new Uint8Array(head);
        if (b[0] !== 0x50 || b[1] !== 0x4b) throw new Error("pas une archive"); // ex. page d'accueil renvoyée à la place du fichier
        spigot.auto = "found";
        return runSpigotCheck(new File([blob], "spigot.jar"), "racine");
      });
    }).catch(function () {
      if (spigot.auto !== "found") spigot.auto = "absent";
      if (phase === "start") render();
    });
  }

  // Ligne d'état affichée sur l'écran d'accueil
  function spigotNote() {
    const p = el("p", "hint spignote");
    if (spigotOk && spigot.source === "racine") {
      p.textContent = "✔ spigot.jar détecté à la racine du site et vérifié (Spigot 1.8.8) : l'étape de vérification est ignorée.";
      p.classList.add("good");
    } else if (spigot.status === "fail" && spigot.source === "racine") {
      p.textContent = "⚠ Un spigot.jar a été trouvé à la racine du site, mais il n'est pas conforme : tu pourras le remplacer à l'étape suivante.";
      p.classList.add("warnnote");
    } else if (spigot.auto === "searching" || (spigot.status === "running" && spigot.source === "racine")) {
      p.textContent = "Recherche d'un spigot.jar à la racine du site…";
    } else {
      p.textContent = "";
    }
    return p;
  }

  // Étape de vérification : le spigot.jar 1.8.8 est analysé dans le navigateur (jamais envoyé, jamais conservé ni copié dans l'addon)
  function renderSpigotStep(menu) {
    const box = el("div", "stepbox wide");
    box.appendChild(el("p", "step", "Avant de commencer"));
    box.appendChild(el("h2", "q", "Vérification de ton spigot.jar (Minecraft 1.8.8)"));
    box.appendChild(el("p", "hint", "Glisse ici le jar de ton serveur Spigot 1.8.8 (spigot-1.8.8.jar, généré par BuildTools), ou choisis-le. " +
      "Le site vérifie qu'il s'agit bien de Spigot 1.8.8 pour éviter les incompatibilités avec ton addon. " +
      "Le fichier est analysé dans ton navigateur : il n'est ni envoyé, ni enregistré, et il n'est pas copié dans l'addon. " +
      "Astuce : placé à la racine du site (à côté de index.html) sous le nom spigot.jar, il est détecté automatiquement quand le site est lancé avec le serveur local."));
    const input = el("input");
    input.type = "file"; input.accept = ".jar,application/java-archive"; input.hidden = true;
    input.addEventListener("change", function () {
      const file = input.files[0];
      input.value = "";
      if (file) runSpigotCheck(file, file.name);
    });
    const drop = el("div", "dropzone");
    drop.tabIndex = 0;
    drop.setAttribute("role", "button");
    drop.appendChild(el("strong", "", spigot.status === "running" && spigot.source === "racine" ? "Recherche de spigot.jar à la racine…" : "Glisse ton spigot.jar ici"));
    drop.appendChild(el("span", "", "ou clique pour le choisir"));
    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function () { drop.classList.remove("over"); });
    });
    const area = el("div", "buildlog");
    spigotLive = createCheckLog(area);
    spigot.events.forEach(spigotLive); // réaffiche le rapport déjà obtenu (ex. détection à la racine)
    const next = button("btn gold", "Continuer", function () { phase = afterSpigot; render(); });
    next.disabled = !spigotOk;
    const bar = el("div", "stepbar");
    bar.appendChild(button("btn dark", "Retour", function () { phase = "start"; render(); }));
    bar.appendChild(next);
    box.appendChild(input);
    box.appendChild(drop);
    box.appendChild(area);
    box.appendChild(bar);
    menu.appendChild(box);
  }

  // Un fichier lâché n'importe où dans la page ne doit jamais faire quitter le site ; pendant l'étape de vérification, il est analysé
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && phase === "spigot") runSpigotCheck(file, file.name);
  });

  function renderStart(menu) {
    const box = el("div", "start");
    box.appendChild(el("p", "intro",
      "Crée ton addon pour UHC-Meetup sans écrire une ligne de code. Tu as déjà un fichier .json ? Utilise le bouton Import."));
    box.appendChild(spigotNote());
    box.appendChild(button("btn big gold", "Commencer le développement", function () { afterSpigot = "pseudo"; phase = spigotOk ? "pseudo" : "spigot"; render(); }));
    menu.appendChild(box);
  }

  // Étape 3 : couleur du pseudo (devient le gDesign de chaque rôle : "§b" + pseudo)
  function renderColorStep(menu) {
    const it = IDENTITY[2];
    const box = el("div", "stepbox");
    box.appendChild(el("p", "step", "Étape 3 sur 3"));
    box.appendChild(el("h2", "q", it.label));
    const preview = el("p", "preview", state.author);
    const paint = function () {
      const c = COLORS.find(function (x) { return x.code === state[it.id]; });
      preview.style.color = c ? c.hex : "";
    };
    paint();
    box.appendChild(preview);
    const row = control(it, state);
    row.addEventListener("click", paint);
    box.appendChild(row);
    box.appendChild(el("p", "hint", "Ton pseudo apparaîtra avec cette couleur comme concepteur de chaque rôle."));
    const bar = el("div", "stepbar");
    bar.appendChild(button("btn dark", "Retour", function () { phase = "name"; render(); }));
    bar.appendChild(button("btn blue", "Terminer", function () { phase = "menu"; render(); }));
    box.appendChild(bar);
    menu.appendChild(box);
  }

  function renderStep(menu, it, n, onNext, onBack) {
    const box = el("div", "stepbox");
    box.appendChild(el("p", "step", "Étape " + n + " sur 3"));
    box.appendChild(el("h2", "q", it.label));
    const input = el("input");
    input.type = "text"; input.maxLength = it.max; input.autocomplete = "off";
    input.value = state[it.id]; input.setAttribute("aria-label", it.label);
    const err = el("p", "err");
    const next = button("btn blue", "Suivant", function () { if (check()) onNext(); });
    function check() {
      state[it.id] = input.value;
      const ok = clean(it, input.value) !== undefined;
      err.textContent = input.value && !ok ? "Valeur invalide. " + it.hint : "";
      next.disabled = !ok;
      return ok;
    }
    input.addEventListener("input", check);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && check()) onNext(); });
    box.appendChild(input);
    box.appendChild(el("p", "hint", it.hint));
    box.appendChild(err);
    const bar = el("div", "stepbar");
    bar.appendChild(button("btn dark", "Retour", onBack));
    bar.appendChild(next);
    box.appendChild(bar);
    menu.appendChild(box);
    check();
    input.focus();
  }

  function defaults(col) {
    const o = {};
    col.fields.forEach(function (f) { if (f.type !== "heading" && f.type !== "itemblocks") o[f.id] = f.type === "list" ? [] : copyDefault(f); });
    return o;
  }

  function renderCollection(menu, it) {
    const list = state[it.id];
    const box = el("div", "coll");
    box.appendChild(el("h3", "coll-title", it.label + " (" + list.length + "/" + it.max + ")"));
    list.forEach(function (e, i) {
      const row = el("div", "row entry");
      const isRole = it.id === ROLES_ID;
      const nm = el("span", "name", isRole ? e.name + "  ·  " + teamLabel(e.team) + " nº " + e.nmb + " · " + (e.effects || []).length + " effet(s) · " + (e.powers || []).length + " pouvoir(s)" : e.name);
      const code = e.color || (isRole && teamOf(e.team) ? teamOf(e.team).code : null);
      const col = code && COLORS.find(function (c) { return c.code === code; });
      if (col) { nm.style.color = col.hex; nm.classList.add("mc-text"); }
      row.appendChild(nm);
      const acts = el("div", "acts");
      acts.appendChild(button("btn dark small", "Modifier", function () {
        editing = { col: it, index: i, draft: JSON.parse(JSON.stringify(e)), pick: null }; render();
      }));
      acts.appendChild(button("btn red small", "Supprimer", function () { removeEntry(it, i); }));
      row.appendChild(acts);
      box.appendChild(row);
    });
    const add = button("btn gold", it.createLabel, function () {
      editing = { col: it, index: -1, draft: defaults(it), pick: null }; render();
    });
    add.disabled = list.length >= it.max;
    box.appendChild(add);
    menu.appendChild(box);
  }

  function removeEntry(col, i) {
    if (col.id === MODES_ID) {
      const key = normKey(state[col.id][i].name);
      const team = (state[TEAMS_ID] || []).find(function (t) { return t.mdj === key; });
      if (team) return say("Impossible : ce mode de jeu est utilisé par l'équipe « " + team.name + " ».", true);
      const role = (state[ROLES_ID] || []).find(function (r) { return r.mdj === key; });
      if (role) return say("Impossible : ce mode de jeu est utilisé par le rôle « " + role.name + " ».", true);
    }
    if (col.id === TEAMS_ID) {
      const ref = "addon:" + constName(state[col.id][i].name);
      const role = (state[ROLES_ID] || []).find(function (r) { return r.team === ref; });
      if (role) return say("Impossible : cette équipe est utilisée par le rôle « " + role.name + " ».", true);
    }
    if (col.id === COMMANDS_ID) {
      const name = state[col.id][i].name;
      const used = (state[ROLES_ID] || []).find(function (r) { return (r.powers || []).some(function (p) { return p.kind === "COMMAND_EFFECTS" && p.command === name; }); });
      if (used) return say("Impossible : la commande /" + name + " est utilisée par un pouvoir du rôle « " + used.name + " ».", true);
    }
    state[col.id].splice(i, 1);
    renumber();
    say("");
    render();
  }

  // Valider : vérifie le brouillon puis l'enregistre. Retourne un message d'erreur, ou "" si c'est bon.
  function commit() {
    const ed = editing, col = ed.col, list = state[col.id], out = {};
    for (let n = 0; n < col.fields.length; n++) {
      const f = col.fields[n], v = clean(f, ed.draft[f.id]);
      if (v === undefined) return "Valeur invalide ou manquante : " + f.label + ".";
      out[f.id] = v;
    }
    if (col.nameTemplate) out.name = autoNameOf(col, out);
    const key = normKey(out.name);
    if (!key) return "Ce nom est invalide.";
    if (list.some(function (e, i) { return i !== ed.index && normKey(e.name) === key; })) return "Ce nom est déjà utilisé.";
    if (col.idFrom && MEETUP_MODES.some(function (m) { return m.id === key; })) return "Ce nom est déjà utilisé par un mode d'UHC-Meetup.";
    if (col.id === ROLES_ID) { const rp = roleProblem(out); if (rp) return rp; }
    if (col.crossCheck) {
      const cp = col.crossCheck(out, list.filter(function (e, i) { return i !== ed.index; }));
      if (cp) return cp;
    }
    if (ed.index < 0 && list.length >= col.max) return "Maximum atteint (" + col.max + ").";
    if (ed.index >= 0) {
      const old = normKey(list[ed.index].name);
      // renommer un mode de jeu : les équipes qui l'utilisent suivent
      if (col.id === MODES_ID && old !== key) {
        (state[TEAMS_ID] || []).forEach(function (t) { if (t.mdj === old) t.mdj = key; });
        (state[ROLES_ID] || []).forEach(function (r) { if (r.mdj === old) r.mdj = key; });
      }
      // renommer une équipe : les rôles qui l'utilisent suivent
      if (col.id === TEAMS_ID && constName(list[ed.index].name) !== constName(out.name)) {
        const was = "addon:" + constName(list[ed.index].name), now = "addon:" + constName(out.name);
        (state[ROLES_ID] || []).forEach(function (r) {
          if (r.team === was) r.team = now;
          // les couleurs par camp des passifs d'information suivent aussi (sinon la couleur choisie serait perdue)
          (r.powers || []).forEach(function (p) {
            if (p.teamColors && Object.prototype.hasOwnProperty.call(p.teamColors, was)) {
              p.teamColors[now] = p.teamColors[was];
              delete p.teamColors[was];
            }
          });
        });
      }
      // renommer une commande : les pouvoirs qui l'utilisent suivent
      if (col.id === COMMANDS_ID && list[ed.index].name !== out.name) {
        const was = list[ed.index].name;
        (state[ROLES_ID] || []).forEach(function (r) {
          (r.powers || []).forEach(function (p) { if (p.kind === "COMMAND_EFFECTS" && p.command === was) p.command = out.name; });
        });
      }
      list[ed.index] = out;
    } else {
      list.push(out);
    }
    if (col.idFrom) out.id = key;
    renumber();
    return "";
  }

  // Écran de choix plein cadre pour les champs mdj / mymdj / team
  function renderModePick(menu) {
    const ed = editing;
    const f = ed.col.fields.find(function (x) { return x.id === ed.pick; });
    const isTeam = f.type === "team";
    menu.appendChild(el("h2", "q", isTeam ? "Choisis l'équipe" : "Choisis le mode de jeu"));
    menu.appendChild(el("p", "hint", isTeam
      ? "Équipes créées dans cet addon et équipes déjà présentes dans UHC-Meetup. Celles d'un autre mode de jeu sont grisées. Fais défiler la liste."
      : f.type === "mymdj" ? "Uniquement les modes de jeu créés dans cet addon. Fais défiler la liste."
      : "Modes créés dans cet addon et modes déjà présents dans UHC-Meetup. Fais défiler la liste."));
    const options = isTeam ? teamOptions()
      : allModes().filter(function (m) { return f.type !== "mymdj" || m.source === "addon"; });
    const scroll = el("div", "scroll");
    if (!options.length) scroll.appendChild(el("p", "hint", "Aucun mode de jeu pour l'instant : crée-en un dans « Modes de jeu »."));
    options.forEach(function (o) {
      const off = isTeam && ed.draft.mdj && o.mdj !== "all" && o.mdj !== ed.draft.mdj;
      const b = button("modeopt" + (ed.draft[ed.pick] === o.id ? " on" : "") + (off ? " off" : ""), "", function () {
        ed.draft[ed.pick] = o.id; ed.pick = null; render();
      });
      b.disabled = !!off;
      if (isTeam) {
        const c = COLORS.find(function (x) { return x.code === o.code; });
        const sw = el("span", "mini");
        if (c) sw.style.background = c.hex;
        b.appendChild(sw);
      }
      b.appendChild(el("span", "mname", o.name));
      const from = o.source === "uhc" ? "UHC-Meetup" : "Créé dans cet addon";
      b.appendChild(el("span", "tag " + o.source, isTeam ? from + " · mode : " + (o.mdj === "all" ? "tous" : modeLabel(o.mdj)) : from));
      scroll.appendChild(b);
    });
    menu.appendChild(scroll);
    menu.appendChild(button("btn dark", "Retour", function () { ed.pick = null; render(); }));
  }

  // Formulaire d'un élément de liste imbriquée : Retour n'enregistre rien, Valider l'ajoute au brouillon du parent
  function renderSubEditor(menu) {
    const ed = editing, sub = ed.sub, f = sub.field;
    menu.appendChild(el("h2", "q", sub.index < 0 ? (f.createLabel || "Ajouter") : "Modifier : " + ed.draft[f.id][sub.index].name));
    const rows = el("div", "rows");
    // uiHideIf : caché à l'écran seulement (ex. champs des clics quand le pouvoir s'affiche en blocs), toujours validé
    const shown = function () {
      return f.fields.filter(function (x) { return visible(x, sub.draft) && !(x.uiHideIf && visible({ showIf: x.uiHideIf }, sub.draft)); });
    };
    const before = shown().map(function (x) { return x.id; }).join();
    shown().forEach(function (x) { rows.appendChild(control(x, sub.draft)); });
    // un choix qui fait apparaître/disparaître un champ (ex. « Quand » -> durée) redessine le formulaire
    let redrawn = false; // un seul redessin : le retrait d'un champ actif déclenche lui-même un évènement "change"
    rows.addEventListener("change", function () {
      if (redrawn || shown().map(function (x) { return x.id; }).join() === before) return;
      redrawn = true;
      render();
    });
    menu.appendChild(rows);
    const err = el("p", "err");
    menu.appendChild(err);
    rows.addEventListener("input", function () { err.textContent = ""; }); // le message disparaît dès qu'on corrige
    const bar = el("div", "stepbar");
    bar.appendChild(button("btn dark", "Retour", function () { ed.sub = null; render(); }));
    bar.appendChild(button("btn gold", "Valider", function () {
      const out = {};
      for (let n = 0; n < f.fields.length; n++) {
        const x = f.fields[n];
        if (x.type === "heading" || x.type === "itemblocks") continue;
        if (!visible(x, out)) { out[x.id] = copyDefault(x); continue; }
        const raw = sub.draft[x.id] === undefined && x.optional ? copyDefault(x) : sub.draft[x.id];
        const v = clean(x, raw, out);
        if (v === undefined) { err.textContent = x.invalidMessage || "Valeur invalide ou manquante : " + x.label + "."; return; }
        out[x.id] = v;
      }
      out.name = autoNameOf(f, out);
      const problem = f.validate ? f.validate(out) : "";
      if (problem) { err.textContent = problem; return; }
      const list = ed.draft[f.id];
      const cross = f.crossCheck ? f.crossCheck(out, list.filter(function (e, i) { return i !== sub.index; })) : "";
      if (cross) { err.textContent = cross; return; }
      if (list.some(function (e, i) { return i !== sub.index && e.name === out.name; })) {
        err.textContent = "Cette entrée existe déjà : « " + out.name + " »."; return;
      }
      if (sub.index < 0 && list.length >= f.max) { err.textContent = "Maximum atteint (" + f.max + ")."; return; }
      if (sub.index >= 0) list[sub.index] = out; else list.push(out);
      ed.sub = null;
      render();
    }));
    menu.appendChild(bar);
  }

  function renderEditor(menu) {
    const ed = editing, col = ed.col;
    if (ed.pick) return renderModePick(menu);
    if (ed.sub) return renderSubEditor(menu);
    menu.appendChild(el("h2", "q", ed.index < 0 ? col.createLabel : "Modifier : " + state[col.id][ed.index].name));
    const rows = el("div", "rows");
    // champs conditionnels (showIf, ex. réglages de la résurrection) : affichés seulement quand ils servent
    const shown = function () { return col.fields.filter(function (f) { return visible(f, ed.draft); }); };
    const before = shown().map(function (f) { return f.id; }).join();
    shown().forEach(function (f) { rows.appendChild(control(f, ed.draft)); });
    let redrawn = false;
    rows.addEventListener("change", function () {
      if (redrawn || shown().map(function (f) { return f.id; }).join() === before) return;
      redrawn = true;
      render();
    });
    menu.appendChild(rows);
    const err = el("p", "err");
    menu.appendChild(err);
    const bar = el("div", "stepbar");
    // Retour : abandonne le brouillon, rien n'est enregistré
    bar.appendChild(button("btn dark", "Retour", function () { editing = null; render(); }));
    bar.appendChild(button("btn gold", "Valider", function () {
      const e = commit();
      if (e) err.textContent = e; else { editing = null; say(""); render(); }
    }));
    menu.appendChild(bar);
  }

  function collectionsOf(node) {
    let out = [];
    (node.children || []).forEach(function (c) {
      if (c.type === "collection") out.push(c); else out = out.concat(collectionsOf(c));
    });
    return out;
  }
  function fieldText(f, v) {
    if (f.type === "item") { const i = ITEMS.find(function (x) { return x.id === v; }); return i ? i.name : v; }
    if (f.type === "mdj" || f.type === "mymdj") return modeLabel(v);
    if (f.type === "effectlist") return (v || []).length + " effet(s)";
    if (f.type === "multiselect") return (v || []).map(function (x) { return f.labels && f.labels[x] ? f.labels[x] : x; }).join(", ");
    if (f.type === "teamcolors") return Object.keys(v || {}).length + " camp(s) coloré(s)";
    if (f.type === "mctext") return String(v).replace(/&[0-9a-fk-or]/g, "").trim();
    if (f.type === "textarea") return String(v).split("\n")[0] + (String(v).indexOf("\n") >= 0 ? "…" : "");
    if (f.type === "list") return (v || []).map(function (x) { return x.name; }).join(" ; ") || "aucun";
    if (f.type === "select" && f.labels) return f.labels[v] || v;
    if (f.type === "team") return teamLabel(v);
    if (f.type === "toggle") return v ? "Oui" : "Non";
    return String(v);
  }
  function renderSummary(menu) {
    menu.appendChild(el("h2", "q", "Récapitulatif"));
    menu.appendChild(el("p", "hint", "Tout ce qui a été configuré jusqu'ici. Fais défiler la liste."));
    const box = el("div", "scroll big");
    function section(title, rows) {
      box.appendChild(el("h3", "coll-title", title));
      if (!rows.length) box.appendChild(el("p", "hint", "Rien pour l'instant."));
      rows.forEach(function (r) { box.appendChild(r); });
    }
    function line(label, value) {
      const r = el("div", "sumrow");
      r.appendChild(el("strong", "", label));
      r.appendChild(document.createTextNode(" : " + value));
      return r;
    }
    section("Projet", [line("Pseudo", state.author || "—"), line("Nom du projet", state.addonName || "—")]);
    collectionsOf(MENU).forEach(function (col) {
      section(col.label + " (" + state[col.id].length + "/" + col.max + ")", state[col.id].map(function (e) {
        const r = el("div", "sumrow");
        r.appendChild(el("strong", "", e.name));
        (col.nameTemplate ? [] : col.fields.slice(1).filter(function (f) { return visible(f, e); })).forEach(function (f) {
          r.appendChild(document.createTextNode(" · "));
          if (f.type === "color") {
            const c = COLORS.find(function (x) { return x.code === e[f.id]; });
            const sw = el("span", "mini");
            if (c) sw.style.background = c.hex;
            r.appendChild(sw);
            r.appendChild(document.createTextNode(c ? c.name : ""));
          } else {
            r.appendChild(document.createTextNode(f.label + " : " + fieldText(f, e[f.id])));
          }
        });
        if (col.id === ROLES_ID) r.appendChild(document.createTextNode(" · nº " + e.nmb));
        if (col.id === "teams" && has(function () { return JarBuilder; })) r.appendChild(document.createTextNode(" · Constante : " + JarBuilder.constName(e.name)));
        return r;
      }));
    });
    const flat = Object.keys(state).filter(function (id) { return !isIdentity(items[id]) && id !== THEME.id && !Array.isArray(state[id]); });
    if (flat.length) section("Autres réglages", flat.map(function (id) { return line(items[id].label, fieldText(items[id], state[id])); }));
    menu.appendChild(box);
    const area = el("div", "buildlog");
    const go = button("btn gold", "Compilation", function () { compile(go, ide, area); });
    const ide = button("btn blue", "Projet IntelliJ", function () { exportProject(go, ide, area); });
    ide.title = "Code source Java de ton addon (projet Gradle) à ouvrir dans IntelliJ IDEA ou un autre IDE";
    menu.appendChild(el("p", "hint", "Compilation : le .jar de ton addon, à placer dans le dossier plugins du serveur. " +
      "Projet IntelliJ : le même addon en code source Java (projet Gradle), à ouvrir et modifier dans un IDE."));
    const bar = el("div", "buildbar");
    bar.appendChild(go);
    bar.appendChild(ide);
    menu.appendChild(bar);
    menu.appendChild(area);
  }

  function renderMenu(crumbs, menu) {
    const node = currentNode();
    crumbs.appendChild(button("crumb", MENU.title, function () { path.length = 0; editing = null; render(); }));
    path.forEach(function (id, i) {
      crumbs.appendChild(el("span", "sep", "/"));
      crumbs.appendChild(button("crumb", items[id].label, function () { path.length = i + 1; editing = null; render(); }));
    });
    if (editing) {
      crumbs.appendChild(el("span", "sep", "/"));
      crumbs.appendChild(el("span", "crumb cur", editing.index < 0 ? "Nouveau" : "Modifier"));
      return renderEditor(menu);
    }
    if (node.type === "collection") return renderCollection(menu, node);
    if (node.type === "summary") return renderSummary(menu);
    const list = path.length > 0 ? node.children
      : IDENTITY.concat(node.children.filter(function (c) { return !isIdentity(c); }));
    const slots = el("div", "slots");
    const rows = el("div", "rows");
    list.forEach(function (it) {
      if (it.type === "folder" || it.type === "collection") {
        const b = button("slot", "", function () { path.push(it.id); render(); }); // ouvre le sous-menu
        b.appendChild(el("span", "icon", it.icon || "▣"));
        b.appendChild(el("span", "label", it.label));
        if (it.type === "collection") b.appendChild(el("span", "count", state[it.id].length + " / " + it.max));
        slots.appendChild(b);
      } else {
        rows.appendChild(control(it, state));
      }
    });
    if (path.length === 0) { // récapitulatif : toujours dans le menu principal
      const b = button("slot", "", function () { path.push(SUMMARY.id); render(); });
      b.appendChild(el("span", "icon", SUMMARY.icon));
      b.appendChild(el("span", "label", SUMMARY.label));
      slots.appendChild(b);
    }
    if (slots.children.length) menu.appendChild(slots);
    if (rows.children.length) menu.appendChild(rows);
  }

  function render() {
    spigotLive = null;
    const crumbs = $("#crumbs"), menu = $("#menu");
    crumbs.replaceChildren();
    menu.replaceChildren();
    $("#warn").hidden = phase !== "menu"; // avertissement snapshot 17 : menus et sous-menus uniquement
    syncExport();
    if (phase === "start") return renderStart(menu);
    if (phase === "spigot") return renderSpigotStep(menu);
    if (phase === "pseudo") return renderStep(menu, IDENTITY[0], 1,
      function () { phase = "name"; render(); }, function () { phase = "start"; render(); });
    if (phase === "name") return renderStep(menu, IDENTITY[1], 2,
      function () { phase = "color"; render(); }, function () { phase = "pseudo"; render(); });
    if (phase === "color") return renderColorStep(menu);
    renderMenu(crumbs, menu);
  }

  function say(msg, bad) {
    const s = $("#status");
    s.textContent = msg;
    s.className = bad ? "bad" : "";
  }

  // ---------- Export / Import du .json ----------
  function today() { return new Date().toISOString().slice(0, 10); }

  // Valide tout puis retourne le contenu du .json (ou null après avoir affiché l'erreur)
  function makeData() {
    if (!identityOk()) { say("Renseigne d'abord ton pseudo et le nom du projet.", true); return null; }
    const bad = invalid();
    if (bad.length) { say("Réglage(s) invalide(s) : " + bad.join(", "), true); return null; }
    Object.keys(state).forEach(function (id) { state[id] = clean(items[id], state[id]); });
    renumber();
    return { format: FORMAT, version: 1, settings: Object.assign({}, state) };
  }

  function download(blob, name) {
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $("#btn-export").addEventListener("click", function () {
    const data = makeData();
    if (!data) return;
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), state.addonName + "_" + today() + ".json");
    say("Fichier .json exporté.");
  });

  // ---------- Bouton "Compilation" : journal des étapes ----------
  const BUILD_STEPS = 10; // pour la barre de progression

  // Bouton "Projet IntelliJ" : même vérification que la compilation, puis un .zip du projet Gradle (code source)
  function exportProject(other, btn, area) {
    area.replaceChildren();
    const log = createBuildLog(area);
    if (!spigotOk) { say("Vérifie d'abord ton spigot.jar 1.8.8 (retour à l'accueil).", true); return; }
    const t0 = performance.now();
    btn.disabled = true; other.disabled = true;
    const finish = function () { btn.disabled = false; other.disabled = false; };
    const fail = function (label, msg) {
      log({ label: label, state: "error", detail: msg });
      say("Échec de l'export du projet : " + msg, true);
      finish();
    };
    log({ label: "Vérification du projet", state: "start" });
    const data = makeData();
    if (!data) return fail("Vérification du projet", $("#status").textContent);
    log({ label: "Vérification du projet", state: "done", detail: "pseudo et nom du projet valides, réglages valides" });
    const missing = missingFiles().concat(has(function () { return JavaGen; }) ? [] : ["js/javagen.js"])
      .concat(has(function () { return TEMPLATE_SOURCES; }) ? [] : ["js/template-sources.js"]);
    if (missing.length) {
      return fail("Vérification des fichiers du site",
        "fichier(s) non chargé(s) : " + missing.join(", ") + ". Vérifie qu'ils sont bien dans le dossier du site, puis recharge avec Ctrl+F5.");
    }
    say("Création du projet en cours…");
    JarBuilder.buildProject(data, log).then(function (blob) {
      const name = state.addonName + "_" + today() + "_projet.zip";
      log({ label: "Téléchargement", state: "start" });
      download(blob, name);
      const link = el("a", "btn blue", "Télécharger " + name);
      link.href = URL.createObjectURL(blob);
      link.download = name;
      area.appendChild(link);
      log({ label: "Téléchargement", state: "done", detail: name + " : décompresse-le, copie ton jar UHC-Meetup et ton spigot.jar dans libs/, puis ouvre le dossier dans IntelliJ (README.md du projet)" });
      say("Projet créé en " + Math.round(performance.now() - t0) + " ms : " + name);
    }).catch(function (e) {
      say("Échec de l'export du projet : " + e.message, true);
    }).then(finish);
  }

  function missingFiles() {
    const out = [];
    if (!has(function () { return JSZip; })) out.push("js/vendor/jszip.min.js");
    if (!has(function () { return TEMPLATE_JAR_B64; })) out.push("js/template-jar.js");
    if (!has(function () { return ClassGen; })) out.push("js/classgen.js");
    if (!has(function () { return JarBuilder; })) out.push("js/jar-builder.js");
    return out;
  }

  function createBuildLog(area) {
    const bar = el("progress"); bar.max = BUILD_STEPS; bar.value = 0;
    const list = el("ol", "steps");
    area.appendChild(bar); area.appendChild(list);
    const rows = Object.create(null);
    const icons = { start: "⏳", progress: "⏳", done: "✔", error: "✖", info: "ℹ" };
    let done = 0;
    return function (ev) {
      let li = rows[ev.label];
      if (!li) {
        li = el("li");
        ["ico", "lbl", "det", "ms"].forEach(function (c) { li.appendChild(el("span", c)); });
        li.children[1].textContent = ev.label;
        rows[ev.label] = li;
        list.appendChild(li);
      }
      li.className = "st-" + (ev.state === "progress" ? "start" : ev.state);
      li.children[0].textContent = icons[ev.state];
      if (ev.detail !== undefined) li.children[2].textContent = ev.detail;
      if (ev.ms !== undefined) li.children[3].textContent = ev.ms + " ms";
      if (ev.state === "done") bar.value = ++done;
    };
  }

  function compile(btn, other, area) {
    area.replaceChildren();
    const log = createBuildLog(area);
    if (!spigotOk) { say("Vérifie d'abord ton spigot.jar 1.8.8 (retour à l'accueil).", true); return; }
    const t0 = performance.now();
    btn.disabled = true; other.disabled = true;
    const finish = function () { btn.disabled = false; other.disabled = false; };
    const fail = function (label, msg) {
      log({ label: label, state: "error", detail: msg });
      say("Échec de la compilation : " + msg, true);
      finish();
    };

    log({ label: "Vérification du projet", state: "start" });
    const data = makeData();
    if (!data) return fail("Vérification du projet", $("#status").textContent);
    log({ label: "Vérification du projet", state: "done", detail: "pseudo et nom du projet valides, réglages valides" });

    log({ label: "Vérification des fichiers du site", state: "start" });
    const missing = missingFiles();
    if (missing.length) {
      return fail("Vérification des fichiers du site",
        "fichier(s) non chargé(s) : " + missing.join(", ") + ". Vérifie qu'ils sont bien dans le dossier du site, puis recharge avec Ctrl+F5.");
    }
    log({ label: "Vérification des fichiers du site", state: "done", detail: "JSZip " + JSZip.version + ", classgen, jar-builder, modèle de jar" });
    say("Compilation en cours…");

    JarBuilder.build(data, log).then(function (blob) {
      const name = state.addonName + "_" + today() + "_addon.jar";
      log({ label: "Téléchargement", state: "start" });
      download(blob, name);
      const link = el("a", "btn blue", "Télécharger " + name);
      link.href = URL.createObjectURL(blob);
      link.download = name;
      area.appendChild(link);
      log({ label: "Téléchargement", state: "done", detail: name + " : si rien n'apparaît, clique sur le bouton bleu ci-dessous (vérifie aussi les téléchargements bloqués par le navigateur)" });
      say("Compilation terminée en " + Math.round(performance.now() - t0) + " ms : " + name);
    }).catch(function (e) {
      say("Échec de la compilation : " + e.message, true);
    }).then(finish);
  }

  // ---------- Thème clair / sombre ----------
  function applyTheme() {
    const light = state[THEME.id] === "light";
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    const b = $("#btn-theme");
    if (!b) return;
    b.textContent = light ? "☾" : "☀";
    b.setAttribute("aria-pressed", light ? "true" : "false");
    b.title = light ? "Passer le site en mode sombre" : "Passer le site en mode clair";
    b.setAttribute("aria-label", b.title);
  }
  if ($("#btn-theme")) $("#btn-theme").addEventListener("click", function () {
    state[THEME.id] = state[THEME.id] === "light" ? "dark" : "light";
    applyTheme();
  });
  applyTheme();

  $("#btn-import").addEventListener("click", function () { $("#file-import").click(); });

  $("#file-import").addEventListener("change", function (e) {
    const file = e.target.files[0];
    e.target.value = ""; // permet de réimporter le même fichier
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return say("Fichier trop volumineux (100 Ko maximum).", true);
    const reader = new FileReader();
    reader.onload = function () {
      let data;
      try { data = JSON.parse(reader.result); } catch (err) { return say("Ce fichier n'est pas un .json valide.", true); }
      if (!data || data.format !== FORMAT || typeof data.settings !== "object" || data.settings === null)
        return say("Ce fichier n'a pas été créé par ce site.", true);
      let ok = 0, ignored = 0;
      // les équipes dépendent des modes, les rôles des modes et des équipes : on importe dans cet ordre
      const rank = function (k) { return k === MODES_ID ? 0 : k === TEAMS_ID || k === COMMANDS_ID ? 1 : k === ROLES_ID ? 2 : -1; };
      const keys = Object.keys(data.settings).sort(function (a, b) { return rank(a) - rank(b); });
      keys.forEach(function (key) {
        const it = items[key];
        const v = it && it.type !== "folder" ? clean(it, data.settings[key]) : undefined;
        if (v === undefined) ignored++; else { state[key] = v; ok++; }
      });
      renumber();
      applyTheme();
      path.length = 0;
      editing = null;
      // L'import remplace l'écran de démarrage ; on redemande seulement ce qui manque
      const target = clean(IDENTITY[0], state.author) === undefined ? "pseudo"
            : clean(IDENTITY[1], state.addonName) === undefined ? "name" : "menu";
      afterSpigot = target; // l'import ne dispense pas de vérifier le spigot.jar
      phase = spigotOk ? target : "spigot";
      render();
      say(ok + " réglage(s) importé(s)" + (ignored ? ", " + ignored + " ignoré(s) car invalide(s)." : "."), ok === 0);
    };
    reader.readAsText(file);
  });

  render();
  detectRootSpigot();
})();
