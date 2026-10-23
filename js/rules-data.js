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
 * counter.
 * Libellés : {param} est remplacé par le champ du bloc.
 */
const RULES = (function () {
  "use strict";

  const num = function (min, max, step, dflt) { return { type: "num", min: min, max: max, step: step, dflt: dflt }; };
  const sel = function (options, dflt) { return { type: "sel", options: options, dflt: dflt === undefined ? options[0][0] : dflt }; };
  const bool = function (no, yes) { return { type: "bool", no: no, yes: yes, dflt: false }; };
  const OPS = [["GE", "≥"], ["LE", "≤"], ["EQ", "="]];

  // destinataire d'une action : moi, le joueur concerné (selon le déclencheur), les joueurs autour, le joueur d'un rôle
  const TO = {
    to: sel([["ME", "moi"], ["SUBJECT", "le joueur concerné"], ["AROUND_E", "les ennemis autour de moi"],
      ["AROUND", "tous les joueurs autour de moi"], ["ROLE", "le joueur qui a le rôle"]]),
    r: Object.assign(num(1, 100, 1, 20), { showIf: { to: ["AROUND_E", "AROUND"] }, suffix: "blocs" }),
    role: { type: "role", showIf: { to: ["ROLE"] } }
  };
  const withTo = function (params) { return Object.assign({}, params, TO); };

  // ---- déclencheurs : subject = libellé du « joueur concerné » (null = aucun) ----
  const TRIGGERS = {
    START: { label: "au début de la partie", subject: null },
    EVERY: { label: "toutes les {s} s", params: { s: num(1, 3600, 1, 10) }, subject: null },
    DAY: { label: "quand le jour se lève", subject: null },
    NIGHT: { label: "quand la nuit tombe", subject: null },
    KILL: { label: "quand je tue un joueur", subject: "le joueur tué" },
    DEATH: { label: "quand un autre joueur meurt", subject: "le joueur mort" },
    GAPPLE: { label: "quand je mange une pomme d'or", subject: null },
    HIT_GIVEN: { label: "quand je frappe un joueur {with}", params: { with: sel([["ANY", "(avec n'importe quoi)"], ["SWORD", "avec une épée"], ["ITEM", "avec l'objet de ce pouvoir"]]) },
      subject: "le joueur frappé" },
    HIT_TAKEN: { label: "quand on me frappe", subject: "mon attaquant" },
    HITS: { label: "tous les {n} coups donnés {per}", params: { n: num(2, 500, 1, 15), per: sel([["SAME", "au même joueur"], ["TOTAL", "au total"]]) },
      subject: "le joueur frappé" }
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
    NO_ARMOR: { label: "je ne porte aucune armure" }
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
    INVERT: { label: "retourner {to} (il regarde derrière lui)", params: withTo({}) },
    MESSAGE: { label: "envoyer « {text} » à {to}", params: withTo({ text: { type: "text", max: 100, dflt: "&7..." } }) },
    TEAM: { label: "passer {to} dans le camp {team}", params: withTo({ team: { type: "team" } }) },
    COUNTER_ADD: { label: "ajouter {n} au compteur {name}, entre {min} et {max}", params: { name: { type: "counter" }, n: num(-100000, 100000, 1, 1), min: num(-100000, 100000, 1, 0), max: num(-100000, 100000, 1, 100) } },
    COUNTER_SET: { label: "mettre le compteur {name} à {n}", params: { name: { type: "counter" }, n: num(-100000, 100000, 1, 0) } },
    SHOW_COUNTER: { label: "afficher « {text} » + compteur {name} dans ma barre d'action", params: { text: { type: "text", max: 40, dflt: "&bCharge :&c" }, name: { type: "counter" } } },
    // conteneurs
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
      p[k] = d.type === "num" || d.type === "sel" || d.type === "bool" ? d.dflt : d.type === "text" ? d.dflt || "" : "";
    });
    return p;
  }
  const visible = function (d, p) {
    return !d.showIf || Object.keys(d.showIf).every(function (k) { return d.showIf[k].indexOf(p[k]) !== -1; });
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
      switch (d.type) {
        case "num":
          if (typeof v !== "number" || !isFinite(v) || v < d.min || v > d.max || Math.abs(Math.round(v / d.step) * d.step - v) > 1e-9)
            return { error: where + " : valeur invalide (" + v + ")." };
          break;
        case "sel": if (!d.options.some(function (o) { return o[0] === v; })) return { error: where + " : choix invalide." }; break;
        case "bool": if (typeof v !== "boolean") v = false; break;
        case "role": if (typeof v !== "string" || !keyOk(v) || (ctx.roles && ctx.roles.indexOf(v) === -1)) return { error: where + " : choisis un rôle." }; break;
        case "team": if (typeof v !== "string" || !keyOk(v) || (ctx.teams && ctx.teams.indexOf(v) === -1)) return { error: where + " : choisis un camp." }; break;
        case "effect": if (!ctx.potions || !ctx.potions[v]) return { error: where + " : choisis un effet." }; break;
        case "text":
          if (typeof v !== "string" || !v.length || v.length > (d.max || 100) || (ctx.mcText && !ctx.mcText.test(v))) return { error: where + " : texte invalide." };
          break;
        case "counter": if (typeof v !== "string" || !/^[a-z][a-z0-9_]{0,15}$/.test(v)) return { error: where + " : nom de compteur invalide (minuscules, chiffres, _)." }; break;
      }
      out[k] = v;
    }
    return { p: out };
  }

  /** Nettoie une liste de règles. Retourne { rules } ou { error }. */
  function clean(rules, ctx) {
    if (rules === undefined) return { rules: [] };
    if (!Array.isArray(rules) || rules.length > MAX_RULES) return { error: "Règles invalides (" + MAX_RULES + " au maximum)." };
    let count = 0;
    function nodes(list, depth, subject, where) {
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
        if (cp.p.to === "SUBJECT" && !subject) return { error: label + " : ce déclencheur n'a pas de « joueur concerné »." };
        const o = { a: n.a, p: cp.p };
        if (n.a === "IF") {
          const c = n.c, cs = c && CONDITIONS[c.k];
          if (!cs) return { error: "Un « si » des règles n'a pas de condition (catégorie Conditions)." };
          if (cs.needsSubject && !subject) return { error: "« " + cs.label.replace(/\{\w+\}/g, "…") + " » : ce déclencheur n'a pas de « joueur concerné »." };
          const ccp = cleanParams(cs, c.p, ctx, "« " + cs.label.replace(/\{\w+\}/g, "…") + " »");
          if (ccp.error) return ccp;
          if (ccp.p.who === "SUBJECT" && !subject) return { error: "Une condition parle du « joueur concerné » mais ce déclencheur n'en a pas." };
          o.c = { k: c.k, p: ccp.p };
        }
        for (const slot of spec.container || []) {
          const r = nodes(n[slot] || [], depth + 1, subject, where);
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
      const cp = cleanParams(spec, r.p, ctx, "« " + spec.label.replace(/\{\w+\}/g, "…") + " »");
      if (cp.error) return cp;
      const cd = r.cd === undefined ? 0 : r.cd;
      if (!Number.isInteger(cd) || cd < 0 || cd > 3600) return { error: "Règle " + (i + 1) + " : cooldown invalide." };
      const body = nodes(r.do || [], 1, spec.subject, "Règle « " + spec.label.replace(/\{\w+\}/g, "…") + " »");
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
    const value = function (k) {
      const d = params[k], v = p[k];
      if (!d) return "";
      switch (d.type) {
        case "num": return String(v).replace(".", ",");
        case "sel": {
          if (k === "to" && v === "SUBJECT" && names.subject) return names.subject;
          const o = d.options.find(function (x) { return x[0] === v; });
          let s = o ? o[1] : String(v);
          if (k === "to" && (v === "AROUND" || v === "AROUND_E")) s += " (" + p.r + " blocs)";
          if (k === "to" && v === "ROLE") s += " " + names.role(p.role);
          if (k === "who" && v === "SUBJECT" && names.subject) s = names.subject + " a";
          return s;
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
    MAX_RULES: MAX_RULES, MAX_NODES: MAX_NODES, MAX_DEPTH: MAX_DEPTH };
})();
