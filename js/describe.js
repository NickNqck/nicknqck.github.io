/*
 * Description automatique d'un pouvoir (bouton « Générer automatiquement » sous la description).
 * Elle se lit à partir des réglages enregistrés du pouvoir (ceux que l'éditeur à blocs écrit) et respecte les règles du
 * champ : 6 lignes maximum, 100 caractères par ligne, 400 au total, couleurs &a, &c...
 * Ce qu'UHC-Meetup ou le .jar affichent déjà ne se répète pas : cooldown et utilisations (AutomaticDesc), ligne
 * « Commande : /… » et ligne « Quand vous ne portez aucune armure » (ajoutées par le site au .jar).
 */
const PowerDescriber = (function () {
  "use strict";

  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const MAX_LINES = 6, MAX_LINE = 100, MAX_TOTAL = 400;

  const hearts = function (n) { return String(n).replace(".", ",") + "❤"; };
  const list = function (parts) { return parts.length > 1 ? parts.slice(0, -1).join("&7, ") + "&7 et " + parts[parts.length - 1] : parts[0] || ""; };

  function effectName(e, potions, withTime) {
    let s = "&a" + (potions[e.effect] || e.effect) + " " + ROMAN[e.level];
    if (withTime) s += "&7 (" + (e.seconds === 0 ? "tant qu'il est actif" : e.seconds + " s") + ")";
    return s + "&7";
  }

  // actions sur la cible (catégorie Cible)
  function targetParts(targets) {
    return (targets || []).map(function (t) {
      switch (t.type) {
        case "DAMAGE": return "lui inflige&c " + hearts(t.amount) + "&7 de plus";
        case "FIRE": return "l'enflamme&c " + t.amount + " s&7";
        case "KNOCKBACK": return "le repousse";
        case "UP": return "le propulse de&c " + t.amount + " blocs&7 vers le haut" + (t.flag ? " (sans dégâts de chute)" : "");
        case "LIGHTNING": return "fait tomber un éclair sur lui";
        case "STUN": return "l'étourdit&c " + t.amount + " s&7" + (t.flag ? " en l'aveuglant" : "");
        default: return "";
      }
    }).filter(Boolean);
  }

  // une action de clic (groupe a, b ou c) -> une phrase
  function actionText(p, g, potions, hit) {
    const get = function (k) { return p[g + k]; };
    const effects = get("Effects") || [];
    const mine = effects.filter(function (e) { return e.who !== "TARGET"; }).map(function (e) { return effectName(e, potions, true); });
    const theirs = effects.filter(function (e) { return e.who === "TARGET"; }).map(function (e) { return effectName(e, potions, true); });
    const parts = [];
    const action = get("Action");
    const who = hit ? "le joueur frappé" : "le joueur visé", toWho = hit ? "au joueur frappé" : "au joueur visé";
    if (action === "TP_BEHIND") parts.push("vous téléporte derrière " + who);
    if (action === "TP_AROUND") parts.push("vous téléporte à&c " + get("Radius") + " blocs&7 autour de " + who);
    if (action === "TP_TO_USER") parts.push("attire " + who + " jusqu'à vous");
    if (action === "LAUNCH") {
      const impact = [];
      if (get("ImpactTp")) impact.push("vous y téléporte");
      if (get("Zone")) impact.push("crée une zone de&c " + hearts(get("ZoneDamage")) + "&7 (rayon " + get("ZoneRadius") + ")" +
        (get("ZoneSeconds") > 0 ? " pendant " + get("ZoneSeconds") + " s" : ""));
      if (mine.length) impact.push("vous donne " + list(mine));
      parts.push("lance " + (get("Projectile") === "SNOWBALL" ? "une boule de neige" : "une flèche") + (impact.length ? " qui, à l'impact, " + list(impact) : ""));
    } else if (action === "AREA") {
      const each = [];
      if (get("AreaDamage") > 0) each.push("inflige&c " + hearts(get("AreaDamage")) + "&7 (sans tuer)");
      if (get("AreaLightning")) each.push("fait tomber un éclair");
      if (get("AreaUp") > 0) each.push("propulse de&c " + get("AreaUp") + " blocs&7" + (get("AreaUpNoFall") ? " (sans dégâts de chute)" : ""));
      if (theirs.length) each.push("donne " + list(theirs));
      parts.push("touche " + (get("AreaFilter") === "ALL" ? "tous les joueurs" : "les ennemis") + " à moins de&c " + get("AreaRadius") + " blocs&7" +
        (each.length ? " : " + list(each) : ""));
      if (mine.length) parts.push("vous donne " + list(mine));
    } else {
      if (mine.length) parts.push("vous donne " + list(mine));
      if (theirs.length) parts.push("donne " + list(theirs) + " " + toWho);
    }
    if (action !== "AREA" && action !== "LAUNCH") {
      targetParts(get("Target")).forEach(function (t) { parts.push(t); }); // « lui », « le » : le joueur visé / frappé
    }
    let text = action === "AREA" ? parts.join("&7 ; ") : list(parts);
    const aim = !hit && (action.indexOf("TP_") === 0 || (action === "EFFECT_ONLY" && get("Aim")));
    if (aim) text = "en visant un joueur (" + get(action === "EFFECT_ONLY" ? "Distance" : "TpDistance") + " blocs max), " + text;
    const cd = get("Cooldown");
    if (cd > 0 && (hit || p.clickMode === "DIFFERENT")) text += " (cooldown " + cd + " s)";
    return text;
  }

  function sentences(p, potions) {
    switch (p.kind) {
      case "ITEM": {
        const out = [];
        const side = function (label, g, hit) { out.push("&e" + label + "&7 : " + actionText(p, g, potions, hit) + "."); };
        if (p.clickMode === "LEFT_ONLY" || p.clickMode === "DIFFERENT") side("Clic gauche", "a");
        if (p.clickMode === "BOTH_SAME") side("Clic gauche ou droit", "a");
        if (p.clickMode === "RIGHT_ONLY" || p.clickMode === "DIFFERENT") side("Clic droit", "b");
        if (p.onHit) side("En frappant un joueur", "c", true);
        return out;
      }
      case "COMMAND_EFFECTS": // la ligne « Commande : /… » est déjà ajoutée par le site
        return ["&7Une fois activé, vous donne " + list((p.cmdEffects || []).map(function (e) { return effectName(e, potions, true); })) + "."];
      case "BLOCK_EFFECT":
        return ["&7Les joueurs à moins de&c " + p.radius + " blocs&7 de vous ne peuvent pas obtenir " +
          list((p.blockedEffects || []).map(function (e) { return "&c" + (potions[e] || e) + "&7"; })) + "."];
      case "BLOCK_POWER":
        return ["&7Les joueurs à moins de&c " + p.radius + " blocs&7 de vous ne peuvent pas utiliser leurs pouvoirs."];
      case "INFO":
        return ["&7Rester&c " + p.needSeconds + " s&7 à moins de&c " + p.radius + " blocs&7 d'un joueur vous révèle son camp."];
      default: // PASSIVE (rien à décrire) ; NO_ARMOR : la ligne « Quand vous ne portez aucune armure » est déjà ajoutée
        return [];
    }
  }

  // règles « quand … » : une phrase par règle (« Quand je tue un joueur : … »), les blocs dans l'ordre
  function ruleSentences(rules, potions) {
    const keyName = function (list) {
      return function (k) {
        const id = String(k || "").replace(/^\w+:/, ""), x = String(k).indexOf("meetup:") === 0 && list.find(function (r) { return r.id === id; });
        return x ? x.name : id.replace(/_/g, " ");
      };
    };
    const names = { role: keyName(typeof MEETUP_ROLES === "undefined" ? [] : MEETUP_ROLES),
      team: keyName(typeof MEETUP_TEAMS === "undefined" ? [] : MEETUP_TEAMS),
      effect: function (v) { return potions[v] || v; } };
    const SILENT = ["SHOW_COUNTER", "MESSAGE", "BAR_SHOW", "BAR_HIDE", "MARK", "UNMARK", "FIREWORK", "KNOW"]; // rien à expliquer au joueur
    function nodes(list) {
      return (list || []).map(function (n) {
        const spec = RULES.ACTIONS[n.a];
        if (!spec || SILENT.indexOf(n.a) !== -1) return "";
        if (n.a === "IF") {
          const c = n.c && RULES.CONDITIONS[n.c.k];
          const yes = nodes(n.do), no = nodes(n.else);
          return c && (yes || no) ? "si " + RULES.fill(c, n.c.p, names) + ", " + (yes || "rien") + (no ? ", sinon " + no : "") : "";
        }
        const secs = n.p && n.p.s && typeof n.p.s === "object" ? "« " + n.p.s.var + " »" : n.p && n.p.s; // nombre ou variable
        if (n.a === "DURING") { const each = nodes(n.do), end = nodes(n.end); return "pendant " + secs + " s : " + (each || "rien") + (end ? ", puis " + end : ""); }
        if (n.a === "WAIT") { const then = nodes(n.do); return then ? secs + " s plus tard, " + then : ""; }
        if (n.a === "EACH") {
          const before = names.subject;
          names.subject = "ce joueur";
          const each = nodes(n.do);
          names.subject = before;
          return each ? "pour chaque joueur parmi " + RULES.fill({ label: "{to}", params: spec.params }, n.p, names) + " : " + each : "";
        }
        return RULES.fill(spec, n.p, names).replace(/ \(0 = [^)]*\)| \(négatif pour retirer\)/g, "").replace(/ pendant 0 s$/, "");
      }).filter(Boolean).join("&7, ");
    }
    return (rules || []).map(function (r) {
      const spec = RULES.TRIGGERS[r.on];
      const body = nodes(r.do);
      if (!spec || !body) return "";
      names.subject = RULES.subjectOf(r.on, r.p);
      const when = RULES.fill(spec, r.p, names);
      return "&e" + when.charAt(0).toUpperCase() + when.slice(1) + "&7 : " + nodes(r.do) + (r.cd > 0 ? " (cooldown " + r.cd + " s)" : "") + ".";
    }).filter(Boolean);
  }

  // retire les codes de couleur inutiles (un code suivi immédiatement d'un autre)
  const tidy = function (text) {
    let current = "";
    return text.replace(/(?:&[0-9a-fk-or])+(?=&[0-9a-f])/g, "").replace(/&[0-9a-f]/g, function (code) {
      if (code === current) return ""; // déjà de cette couleur
      current = code;
      return code;
    });
  };

  // découpe une phrase en lignes de 100 caractères maximum, aux espaces, en gardant la couleur en cours
  function wrap(text) {
    const lines = [];
    let rest = text;
    while (rest.length > MAX_LINE) {
      let cut = rest.lastIndexOf(" ", MAX_LINE);
      // ne sépare pas un nombre de son unité (« 8 s) », « 10 blocs »)
      while (cut > MAX_LINE / 2 && /^(?:&[0-9a-f])*(?:s\b|blocs\b|❤)/.test(rest.slice(cut + 1))) cut = rest.lastIndexOf(" ", cut - 1);
      if (cut < MAX_LINE / 2) cut = MAX_LINE;
      const line = rest.slice(0, cut);
      lines.push(line);
      const colors = line.match(/&[0-9a-f]/g);
      rest = (colors ? colors[colors.length - 1] : "") + rest.slice(cut).replace(/^ /, "");
    }
    lines.push(rest);
    return lines;
  }

  /** { text, truncated } ou { text: "", reason } si le site décrit déjà tout (ou s'il n'y a rien à décrire). */
  function describe(p, potions) {
    if (!p || (!p.kind && !(p.rules || []).length)) return { text: "", reason: "Commence par le programme du pouvoir (bloc de départ), puis génère sa description." };
    const all = [];
    const rules = typeof RULES === "undefined" ? [] : ruleSentences(p.rules, potions || {});
    sentences(p, potions || {}).concat(rules).forEach(function (s) { wrap(tidy(s)).forEach(function (l) { all.push(tidy(l)); }); });
    if (!all.length) {
      return { text: "", reason: p.kind === "NO_ARMOR"
        ? "Rien à ajouter : le bonus sans armure est déjà décrit automatiquement dans le jeu."
        : "Rien à décrire automatiquement pour un passif simple : écris sa description toi-même." };
    }
    const kept = [];
    let total = 0;
    for (let i = 0; i < all.length && kept.length < MAX_LINES; i++) {
      if (total + all[i].length + (kept.length ? 1 : 0) > MAX_TOTAL) break;
      total += all[i].length + (kept.length ? 1 : 0);
      kept.push(all[i]);
    }
    return { text: kept.join("\n"), truncated: kept.length < all.length };
  }

  return { describe: describe };
})();
