/*
 * "Compilation" : assemble le .jar de l'addon dans le navigateur, sans serveur.
 *   1. part du jar modèle précompilé (js/template-jar.js : Main, ConfigMDJ, MiniJson, plugin.yml)
 *   2. remplace __ADDON_NAME__ et __AUTHOR__ dans plugin.yml (valeurs déjà validées) et y ajoute les commandes (+ alias)
 *   3. ajoute addon-config.json (les réglages de l'utilisateur)
 *   4. ajoute AddonTeams.class, l'enum des équipes générée par classgen.js
 *
 * build(data, onStep) prévient onStep({ label, state, detail, ms }) à chaque étape :
 * state = "start" | "progress" | "done" | "error" | "info".
 */
const JarBuilder = (function () {
  "use strict";

  const ENUM_CLASS = "fr/nicknqck/addonbuilder/AddonTeams";
  const ITEAM = "fr/nicknqck/interfaces/ITeam";
  const ROLES_CLASS = "fr/nicknqck/addonbuilder/AddonRoles";
  const IROLES = "fr/nicknqck/interfaces/IRoles";
  const SUPPORT = "fr/nicknqck/addonbuilder/RoleSupport";
  const ROLE_PACKAGE = "fr/nicknqck/addonbuilder/roles/";
  const POWER_PACKAGE = "fr/nicknqck/addonbuilder/powers/";
  const WHEN = ["PERMANENT", "DAY", "NIGHT", "AT_KILL", "MID_LIFE"];

  // Nom de constante d'enum tiré du nom affiché : "Skull Kid" -> "Skull_Kid" (ASCII, identifiant Java valide)
  function constName(name) {
    let c = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/ +/g, "_").replace(/[^A-Za-z0-9_]/g, "");
    if (/^[0-9]/.test(c)) c = "_" + c;
    return c;
  }

  function teamsOf(settings) {
    const seen = Object.create(null);
    return (settings.teams || []).map(function (t) {
      const constant = constName(t.name);
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(constant)) throw new Error("Nom d'équipe inutilisable : " + t.name);
      if (seen[constant]) throw new Error("Deux équipes donneraient la même constante : " + constant);
      seen[constant] = true;
      if (!/^[0-9a-f]$/.test(t.color)) throw new Error("Couleur invalide pour l'équipe " + t.name);
      if (!/^[a-z0-9]+$/.test(t.mdj)) throw new Error("Mode de jeu invalide pour l'équipe " + t.name);
      // Même présentation que ZeldaTeams : couleur "§a", nom "§aRoyaume"
      return { constant: constant, color: "\u00a7" + t.color, name: "\u00a7" + t.color + t.name, mdj: t.mdj };
    });
  }

  // Rôles : équipe (de l'addon ou de TeamList), mode de jeu, numéro dans l'équipe, objet, concepteur (gDesign)
  function rolesOf(settings, teams) {
    const seen = Object.create(null);
    if (!/^[0-9a-f]$/.test(settings.authorColor)) throw new Error("Couleur du pseudo invalide.");
    const gDesign = "\u00a7" + settings.authorColor + settings.author;
    return (settings.roles || []).map(function (r) {
      const constant = constName(r.name);
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(constant)) throw new Error("Nom de rôle inutilisable : " + r.name);
      if (seen[constant]) throw new Error("Deux rôles donneraient la même constante : " + constant);
      seen[constant] = true;
      const ref = /^(addon|meetup):([A-Za-z_][A-Za-z0-9_]*)$/.exec(r.team);
      if (!ref) throw new Error("Équipe invalide pour le rôle " + r.name);
      let teamClass, code, bold = false;
      if (ref[1] === "addon") {
        const t = teams.find(function (x) { return x.constant === ref[2]; });
        if (!t) throw new Error("Équipe introuvable pour le rôle " + r.name + " : " + ref[2]);
        teamClass = "fr.nicknqck.addonbuilder.AddonTeams";
        code = t.color.charAt(1);
      } else {
        const t = MEETUP_TEAMS.find(function (x) { return x.id === ref[2]; });
        if (!t) throw new Error("Équipe d'UHC-Meetup inconnue pour le rôle " + r.name + " : " + ref[2]);
        teamClass = "fr.nicknqck.enums.TeamList";
        code = t.code; bold = !!t.bold;
      }
      if (!/^[a-z0-9]+$/.test(r.mdj)) throw new Error("Mode de jeu invalide pour le rôle " + r.name);
      if (!/^[A-Z0-9_]+$/.test(r.item)) throw new Error("Objet invalide pour le rôle " + r.name);
      if (!Number.isInteger(r.nmb) || r.nmb < 0 || r.nmb > 120) throw new Error("Numéro invalide pour le rôle " + r.name);
      const noFall = r.noFall === undefined ? "NONE" : r.noFall;
      if (["NONE", "PERMANENT", "DAY", "NIGHT"].indexOf(noFall) === -1) throw new Error("NoFall invalide pour le rôle " + r.name);
      // résurrection une fois par partie : cœurs max perdus et rayon de réapparition
      let revive = null;
      if (r.revive === true) {
        const hearts = r.reviveHearts === undefined ? 2 : r.reviveHearts, radius = r.reviveRadius === undefined ? 50 : r.reviveRadius;
        if (!Number.isInteger(hearts) || hearts < 0 || hearts > 9) throw new Error("Cœurs perdus invalides pour le rôle " + r.name);
        if (!Number.isInteger(radius) || radius < 0 || radius > 200) throw new Error("Rayon de réapparition invalide pour le rôle " + r.name);
        revive = { hearts: hearts, radius: radius };
      } else if (r.revive !== undefined && r.revive !== false) throw new Error("Résurrection invalide pour le rôle " + r.name);
      return { displayName: r.name, effects: r.effects || [], powers: r.powers || [], noFall: noFall, revive: revive, constant: constant, teamClass: teamClass, teamConst: ref[2], mdj: r.mdj, nmb: r.nmb, material: r.item,
        itemName: "\u00a7" + code + (bold ? "\u00a7l" : "") + r.name, gDesign: gDesign };
    });
  }

  // &a -> §a (couleurs et formats Minecraft) ; le nom d'un pouvoir doit finir par §r
  const PROTECTED = ["ABSORPTION", "REGENERATION"]; // jamais empêchés par un passif
  const mc = function (text) { return text.replace(/&([0-9a-fk-or])/g, "\u00a7$1"); };
  const stripMc = function (text) { return text.replace(/&[0-9a-fk-or]/g, "").trim(); };
  const MC_OK = /^(?:[^&\u00a7\u0000-\u001f\u007f]|&[0-9a-fk-or])*$/;

  // Pouvoirs d'un rôle : une classe par pouvoir (étend Power)
  function powersOf(role, settings) {
    const seen = Object.create(null);
    const commandArgs = Object.create(null); // "commande arg" déjà pris dans ce rôle
    if ((role.powers || []).length > 10) throw new Error("Plus de 10 pouvoirs pour le rôle " + role.constant);
    return (role.powers || []).map(function (p) {
      if (["PASSIVE", "BLOCK_EFFECT", "BLOCK_POWER", "INFO", "NO_ARMOR", "ITEM", "COMMAND_EFFECTS"].indexOf(p.kind) === -1) throw new Error("Type de pouvoir inconnu : " + p.kind);
      const blocker = ["BLOCK_EFFECT", "BLOCK_POWER", "INFO"].indexOf(p.kind) !== -1;
      if (blocker && (!Number.isInteger(p.radius) || p.radius < 1 || p.radius > 100)) throw new Error("Rayon invalide pour le pouvoir " + stripMc(p.title));
      let param = "";
      if (p.kind === "BLOCK_EFFECT") {
        const list = p.blockedEffects;
        if (!Array.isArray(list) || !list.length || list.length > 40 || !list.every(function (e) { return /^[A-Z_]{2,30}$/.test(e); }))
          throw new Error("Effets invalides pour le pouvoir " + stripMc(p.title));
        if (list.some(function (e) { return PROTECTED.indexOf(e) !== -1; }))
          throw new Error("Absorption et Régénération ne peuvent pas être empêchées (pouvoir " + stripMc(p.title) + ").");
        param = list.join(",");
      }
      if (p.kind === "INFO") { // "secondes|couleur par défaut|camp=couleur,camp=couleur" (couleurs en hexadécimal)
        const hex = function (code) {
          const c = /^[0-9a-f]$/.test(code) && COLORS.find(function (x) { return x.code === code; });
          if (!c) throw new Error("Couleur invalide pour le pouvoir " + stripMc(p.title));
          return c.hex.slice(1);
        };
        if (!Number.isInteger(p.needSeconds) || p.needSeconds < 5 || p.needSeconds > 3600) throw new Error("Temps invalide pour le pouvoir " + stripMc(p.title));
        const map = Object.keys(p.teamColors || {}).map(function (ref) {
          if (!/^(addon|meetup):[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error("Camp invalide pour le pouvoir " + stripMc(p.title));
          return ref + "=" + hex(p.teamColors[ref]);
        });
        param = p.needSeconds + "|" + hex(p.defaultColor) + "|" + map.join(",");
      }
      // Sans armure : param = "nofall(0|1)|EFFET:amplificateur+..." ; une ligne de description automatique résume le bonus
      let armorLine = null;
      if (p.kind === "NO_ARMOR") {
        const title = stripMc(p.title);
        const list = p.armorEffects || [];
        const noFall = p.armorNoFall === true;
        if (!Array.isArray(list) || list.length > 5 || (!list.length && !noFall)) throw new Error("Bonus sans armure invalide pour le pouvoir " + title);
        const parts = list.map(function (e) {
          if (!e || !/^[A-Z_]{2,30}$/.test(e.effect)) throw new Error("Effet invalide pour le pouvoir " + title);
          if (!Number.isInteger(e.level) || e.level < 1 || e.level > 10) throw new Error("Niveau invalide pour le pouvoir " + title);
          return e;
        });
        param = (noFall ? "1" : "0") + "|" + parts.map(function (e) { return e.effect + ":" + (e.level - 1); }).join("+");
        const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
        const bonus = parts.map(function (e) { return "\u00a7a" + (POTION_LABELS[e.effect] || e.effect) + " " + ROMAN[e.level] + "\u00a77"; });
        if (noFall) bonus.push("\u00a7aNo Fall\u00a77");
        armorLine = "\u00a77Quand vous ne portez aucune\u00a7c armure\u00a77 : " +
          (bonus.length > 1 ? bonus.slice(0, -1).join(", ") + " et " + bonus[bonus.length - 1] : bonus[0]) + ".";
      }

      // Commande : /commande <argument> active le pouvoir (effets maintenus ou limités dans le temps), la même commande le désactive.
      // param = "EFFET:ticks:amplificateur+..." (ticks 0 = tant que le pouvoir est activé)
      let command = "", arg = "", autoLine = null;
      if (p.kind === "COMMAND_EFFECTS") {
        const title = stripMc(p.title);
        const known = (settings.commands || []).some(function (c) { return c && c.name === p.command; });
        if (typeof p.command !== "string" || !/^[a-z][a-z0-9_]{0,15}$/.test(p.command) || !known) throw new Error("Commande inconnue pour le pouvoir " + title);
        if (typeof p.arg !== "string" || !/^[a-z][a-z0-9_]{0,19}$/.test(p.arg) || RESERVED_ARGS.indexOf(p.arg) !== -1) throw new Error("Argument de commande invalide pour le pouvoir " + title);
        if (commandArgs[p.command + " " + p.arg]) throw new Error("Deux pouvoirs du rôle " + role.constant + " utilisent /" + p.command + " " + p.arg);
        commandArgs[p.command + " " + p.arg] = true;
        const list = p.cmdEffects;
        if (!Array.isArray(list) || !list.length || list.length > MAX_COMMAND_EFFECTS) throw new Error("Effets invalides pour le pouvoir " + title);
        param = list.map(function (e) {
          if (!e || !/^[A-Z_]{2,30}$/.test(e.effect)) throw new Error("Effet invalide pour le pouvoir " + title);
          if (!Number.isInteger(e.level) || e.level < 1 || e.level > 10) throw new Error("Niveau invalide pour le pouvoir " + title);
          if (!Number.isInteger(e.seconds) || e.seconds < 0 || e.seconds > 1600) throw new Error("Durée invalide pour le pouvoir " + title);
          return e.effect + ":" + (e.seconds * 20) + ":" + (e.level - 1);
        }).join("+");
        command = p.command; arg = p.arg;
        autoLine = "\u00a77Commande : \u00a7a/" + command + " " + arg + "\u00a77 (l'activer, puis la retaper pour la d\u00e9sactiver)";
      }

      // Objet à activer : param = "action du clic gauche|action du clic droit|cooldownGauche;cooldownDroit[|action de la frappe|cooldown]"
      // ("-" = ce clic ne fait rien),
      // une action = "EFFET,ticks,amplificateur,distanceDeVisée" (distance 0 = sans visée, l'effet va à l'utilisateur)
      let material = "", itemName = "", look = "";
      if (p.kind === "ITEM") {
        const title = stripMc(p.title);
        if (typeof p.powerItem !== "string" || !/^[A-Z0-9_]{2,40}$/.test(p.powerItem)) throw new Error("Objet invalide pour le pouvoir " + title);
        if (["LEFT_ONLY", "RIGHT_ONLY", "BOTH_SAME", "DIFFERENT", "NONE"].indexOf(p.clickMode) === -1) throw new Error("Clic invalide pour le pouvoir " + title);
        const onHit = p.onHit === true;
        if (p.clickMode === "NONE" && !onHit) throw new Error("Le pouvoir " + title + " n'a ni clic ni frappe.");
        const TYPES = ["EFFECT_ONLY", "TP_BEHIND", "TP_AROUND", "TP_TO_USER", "LAUNCH", "AREA"];
        // action = "TYPE,distanceDeVisée,distanceAutour,effets,projectile" ; effets = "U|T:EFFET:ticks:amplificateur" séparés par "+" ;
        // projectile (LAUNCH seulement) = "PROJECTILE;tp;zone;rayon;dégâtsEnDemiCœurs;secondes;couleurHex"
        // hit : action « en frappant un joueur » (la cible est le joueur frappé : pas de visée, distance 0)
        const action = function (prefix, hit) {
          const type = p[prefix + "Action"];
          if (TYPES.indexOf(type) === -1 || (hit && TYPES.indexOf(type) > 3)) throw new Error("Action invalide pour le pouvoir " + title);
          const tp = type.indexOf("TP_") === 0;
          const aim = hit || tp || (type === "EFFECT_ONLY" && p[prefix + "Aim"] === true);
          const dist = hit ? 0 : aim ? p[prefix + (tp ? "TpDistance" : "Distance")] : 0;
          if (aim && !hit && (!Number.isInteger(dist) || dist < 1 || dist > 100)) throw new Error("Visée invalide pour le pouvoir " + title);
          const radius = type === "TP_AROUND" ? p[prefix + "Radius"] : 0;
          if (type === "TP_AROUND" && (!Number.isInteger(radius) || radius < 1 || radius > 30)) throw new Error("Distance autour de la cible invalide pour le pouvoir " + title);
          const list = p[prefix + "Effects"];
          if (!Array.isArray(list) || list.length > 5) throw new Error("Effets invalides pour le pouvoir " + title);
          const effects = list.map(function (e) {
            if (!/^[A-Z_]{2,30}$/.test(e.effect)) throw new Error("Effet invalide pour le pouvoir " + title);
            if (!Number.isInteger(e.level) || e.level < 1 || e.level > 10) throw new Error("Niveau invalide pour le pouvoir " + title);
            if (!Number.isInteger(e.seconds) || e.seconds < 1 || e.seconds > 1600) throw new Error("Durée invalide pour le pouvoir " + title);
            if (e.who !== "USER" && e.who !== "TARGET") throw new Error("Destinataire invalide pour le pouvoir " + title);
            if (e.who === "TARGET" && !aim && type !== "AREA") throw new Error("Un effet pour la cible demande de viser un joueur (pouvoir " + title + ").");
            return (e.who === "TARGET" ? "T" : "U") + ":" + e.effect + ":" + (e.seconds * 20) + ":" + (e.level - 1);
          });
          // actions sur la cible : "DAMAGE:demi-cœurs+FIRE:ticks+KNOCKBACK:force+UP:blocs:sansChute+LIGHTNING+STUN:ticks:aveuglé"
          const targetList = p[prefix + "Target"] || [];
          if (!Array.isArray(targetList) || targetList.length > 6) throw new Error("Actions sur la cible invalides pour le pouvoir " + title);
          if (targetList.length && !aim) throw new Error("Une action sur la cible demande de viser ou de frapper un joueur (pouvoir " + title + ").");
          const seenTarget = {};
          const targets = targetList.map(function (t) {
            const def = t && TARGET_ACTIONS[t.type];
            if (!def || seenTarget[t.type]) throw new Error("Action sur la cible invalide pour le pouvoir " + title);
            seenTarget[t.type] = true;
            if (def.amount && (typeof t.amount !== "number" || t.amount < def.amount[0] || t.amount > def.amount[1])) throw new Error("Valeur invalide (" + t.type + ") pour le pouvoir " + title);
            switch (t.type) {
              case "DAMAGE": if (!Number.isInteger(t.amount * 2)) throw new Error("Dégâts invalides pour le pouvoir " + title); return "DAMAGE:" + (t.amount * 2);
              case "FIRE": return "FIRE:" + (t.amount * 20);
              case "KNOCKBACK": return "KNOCKBACK:" + t.amount;
              case "UP": return "UP:" + t.amount + ":" + (t.flag ? 1 : 0);
              case "LIGHTNING": return "LIGHTNING";
              default: return "STUN:" + (t.amount * 20) + ":" + (t.flag ? 1 : 0);
            }
          });
          if (type === "EFFECT_ONLY" && !effects.length && !targets.length) throw new Error("Aucun effet pour le pouvoir " + title);
          let launch = "";
          if (type === "LAUNCH") {
            const projectile = p[prefix + "Projectile"];
            if (["ARROW", "SNOWBALL"].indexOf(projectile) === -1) throw new Error("Projectile invalide pour le pouvoir " + title);
            const impactTp = p[prefix + "ImpactTp"] === true, zone = p[prefix + "Zone"] === true;
            const zr = zone ? p[prefix + "ZoneRadius"] : 0, zs = zone ? p[prefix + "ZoneSeconds"] : 0;
            const hearts = zone ? p[prefix + "ZoneDamage"] : 0;
            if (zone && (!Number.isInteger(zr) || zr < 1 || zr > 30)) throw new Error("Rayon de zone invalide pour le pouvoir " + title);
            if (zone && (typeof hearts !== "number" || !Number.isInteger(hearts * 2) || hearts < 0.5 || hearts > 10)) throw new Error("Dégâts de zone invalides pour le pouvoir " + title);
            if (zone && (!Number.isInteger(zs) || zs < 0 || zs > 60)) throw new Error("Durée de zone invalide pour le pouvoir " + title);
            if (!impactTp && !zone && !effects.length) throw new Error("Le projectile du pouvoir " + title + " n'a aucune conséquence.");
            const zoneColor = zone ? p[prefix + "ZoneColor"] : "c";
            const swatch = /^[0-9a-f]$/.test(zoneColor) && COLORS.find(function (x) { return x.code === zoneColor; });
            if (!swatch) throw new Error("Couleur de zone invalide pour le pouvoir " + title);
            launch = [projectile, impactTp ? 1 : 0, zone ? 1 : 0, zr, zone ? hearts * 2 : 0, zs, swatch.hex.slice(1)].join(";");
          }
          if (type === "AREA") { // zone : "rayon;ENEMIES|ALL;demi-cœurs;éclair;hauteur;sansDégâtsDeChute"
            const g = function (k, d) { return p[prefix + k] === undefined ? d : p[prefix + k]; };
            const ar = g("AreaRadius", 50), filter = g("AreaFilter", "ENEMIES"), dmg = g("AreaDamage", 0), up = g("AreaUp", 0);
            const light = g("AreaLightning", false) === true;
            if (!Number.isInteger(ar) || ar < 1 || ar > 100) throw new Error("Rayon de zone invalide pour le pouvoir " + title);
            if (["ENEMIES", "ALL"].indexOf(filter) === -1) throw new Error("Joueurs touchés invalides pour le pouvoir " + title);
            if (typeof dmg !== "number" || !Number.isInteger(dmg * 2) || dmg < 0 || dmg > 10) throw new Error("Dégâts de zone invalides pour le pouvoir " + title);
            if (!Number.isInteger(up) || up < 0 || up > 100) throw new Error("Propulsion invalide pour le pouvoir " + title);
            if (!(dmg > 0) && !(up > 0) && !effects.length) throw new Error("La zone du pouvoir " + title + " n'a aucune conséquence.");
            const safeFall = up > 0 && g("AreaUpNoFall", false) === true;
            launch = [ar, filter, dmg * 2, light ? 1 : 0, up, safeFall ? 1 : 0].join(";");
          }
          return type + "," + dist + "," + radius + "," + effects.join("+") + "," + launch + (targets.length ? "," + targets.join("+") : "");
        };
        const none = p.clickMode === "NONE";
        const first = p.clickMode === "RIGHT_ONLY" || none ? null : action("a");
        const second = p.clickMode === "RIGHT_ONLY" || p.clickMode === "DIFFERENT" ? action("b") : null;
        const left = p.clickMode === "RIGHT_ONLY" || none ? "-" : first;
        const right = p.clickMode === "LEFT_ONLY" || none ? "-" : p.clickMode === "BOTH_SAME" ? first : second;
        // cooldown propre à chaque clic (seulement quand les deux clics sont différents), en secondes, 0 = aucun : "gauche;droit"
        let cdLeft = 0, cdRight = 0;
        if (p.clickMode === "DIFFERENT") {
          cdLeft = p.aCooldown === undefined ? 0 : p.aCooldown;
          cdRight = p.bCooldown === undefined ? 0 : p.bCooldown;
          [cdLeft, cdRight].forEach(function (cd) {
            if (!Number.isInteger(cd) || cd < 0 || cd > 3600) throw new Error("Cooldown de clic invalide pour le pouvoir " + title);
          });
        }
        param = left + "|" + right + "|" + cdLeft + ";" + cdRight;
        if (onHit) { // « en frappant un joueur » : "|action de la frappe|cooldown de la frappe"
          const cdHit = p.cCooldown === undefined ? 0 : p.cCooldown;
          if (!Number.isInteger(cdHit) || cdHit < 0 || cdHit > 3600) throw new Error("Cooldown de frappe invalide pour le pouvoir " + title);
          param += "|" + action("c", true) + "|" + cdHit;
        }
        material = p.powerItem;
        itemName = mc(p.title);
        // apparence de l'objet : "brillant;cachés;incassable;ENCHANT:niveau,ENCHANT:niveau" (vide = objet simple)
        const enchants = p.itemEnchants || [];
        if (!Array.isArray(enchants) || enchants.length > MAX_ITEM_ENCHANTS) throw new Error("Enchantements invalides pour le pouvoir " + title);
        const seenEnchant = {};
        enchants.forEach(function (e) {
          if (!e || !ENCHANT_LABELS[e.enchant] || seenEnchant[e.enchant] || !Number.isInteger(e.level) || e.level < 1 || e.level > 10)
            throw new Error("Enchantement invalide pour le pouvoir " + title);
          seenEnchant[e.enchant] = true;
        });
        if (p.itemGlint || p.itemHideEnchants || p.itemUnbreakable || enchants.length) {
          look = [p.itemGlint ? 1 : 0, p.itemHideEnchants ? 1 : 0, p.itemUnbreakable ? 1 : 0].join(";") + ";" +
            enchants.map(function (e) { return e.enchant + ":" + e.level; }).join(",");
        }
      }
      if (typeof p.title !== "string" || p.title.length > 40 || !MC_OK.test(p.title) || !stripMc(p.title))
        throw new Error("Nom de pouvoir invalide pour le rôle " + role.constant);
      const lines = String(p.description || "").split("\n");
      if (lines.length > 6 || !lines.every(function (l) { return l.length <= 100 && MC_OK.test(l); }))
        throw new Error("Description invalide pour le pouvoir " + stripMc(p.title));
      if (!Number.isInteger(p.cooldown) || p.cooldown < 0 || p.cooldown > 3600) throw new Error("Cooldown invalide pour le pouvoir " + stripMc(p.title));
      if (!Number.isInteger(p.maxUse) || p.maxUse < 0 || p.maxUse > 999) throw new Error("Utilisations maximum invalides pour le pouvoir " + stripMc(p.title));
      // règles « quand … » : revérifiées (rôles et camps qui existent vraiment), puis passées au .jar en JSON (RuleEngine)
      let rules = "";
      if (p.rules !== undefined && !(Array.isArray(p.rules) && !p.rules.length)) {
        const res = RULES.clean(p.rules, {
          roles: MEETUP_ROLES.map(function (x) { return "meetup:" + x.id; })
            .concat((settings.roles || []).map(function (x) { return "addon:" + constName(x.name); })),
          teams: MEETUP_TEAMS.map(function (x) { return "meetup:" + x.id; })
            .concat((settings.teams || []).map(function (x) { return "addon:" + constName(x.name); })),
          potions: POTION_LABELS, mcText: MC_OK, isItem: p.kind === "ITEM" });
        if (res.error) throw new Error("Règles du pouvoir " + stripMc(p.title) + " : " + res.error);
        if (res.rules.length) rules = JSON.stringify(res.rules);
      }
      const id = constName(stripMc(p.title));
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(id)) throw new Error("Nom de pouvoir inutilisable : " + stripMc(p.title));
      if (seen[id]) throw new Error("Deux pouvoirs donneraient la même classe : " + id);
      seen[id] = true;
      const name = mc(p.title);
      return { className: POWER_PACKAGE + role.constant + "_" + id, name: /\u00a7r$/.test(name) ? name : name + "\u00a7r",
        cooldown: p.cooldown, maxUse: p.maxUse, kind: p.kind, radius: blocker ? p.radius : 0,
        param: param, material: material, itemName: itemName, look: look, command: command, arg: arg, rules: rules,
        descriptions: (autoLine ? [autoLine] : armorLine ? [armorLine] : []).concat(String(p.description || "") === "" ? [] : lines.map(mc)) };
    });
  }

  // Une classe par rôle : { constant, effects: [{ type, ticks, amp, when }] }
  function roleClassesOf(settings, roles) {
    return roles.map(function (r) {
      const effects = (r.effects || []).map(function (e) {
        if (!/^[A-Z_]{2,30}$/.test(e.effect)) throw new Error("Effet invalide pour le rôle " + r.constant);
        if (WHEN.indexOf(e.when) === -1) throw new Error("Moment invalide pour le rôle " + r.constant);
        if (!Number.isInteger(e.level) || e.level < 1 || e.level > 10) throw new Error("Niveau invalide pour le rôle " + r.constant);
        if (!Number.isInteger(e.seconds) || e.seconds < 1 || e.seconds > 1600) throw new Error("Durée invalide pour le rôle " + r.constant);
        // durée réglable uniquement en tuant un joueur ; sinon 60 ticks par défaut (comme Darunia)
        return { type: e.effect, ticks: e.when === "AT_KILL" ? e.seconds * 20 : 60, amp: e.level - 1, when: e.when };
      });
      if (effects.length > 15) throw new Error("Plus de 15 effets pour le rôle " + r.constant);
      // lignes ajoutées à la description du rôle (AutomaticDesc.addCustomLine)
      const extra = [];
      if (r.revive) {
        extra.push("\u00a77Une fois par partie, \u00e0 votre mort, vous\u00a7a ressuscitez\u00a77" +
          (r.revive.radius > 0 ? " \u00e0\u00a7c " + r.revive.radius + " blocs\u00a77 de l\u00e0" : " sur place") +
          (r.revive.hearts > 0 ? " en perdant\u00a7c " + r.revive.hearts + "\u2764 permanent" + (r.revive.hearts > 1 ? "s" : "") + "\u00a77." : "."));
      }
      return { constant: r.constant, displayName: r.displayName, effects: effects, powers: powersOf(r, settings), noFall: r.noFall,
        revive: r.revive, extra: extra.join("\n") };
    });
  }

  // Commandes personnalisées : { name, aliases: [alias] }, revérifiées ici (elles sont écrites dans le plugin.yml)
  function commandsOf(settings) {
    const list = settings.commands || [];
    if (!Array.isArray(list) || list.length > MAX_COMMANDS) throw new Error("Trop de commandes (" + MAX_COMMANDS + " maximum).");
    const done = [];
    return list.map(function (c) {
      if (!c || typeof c !== "object" || !Array.isArray(c.aliases) || c.aliases.length > MAX_ALIASES) throw new Error("Commande invalide.");
      const entry = { name: c.name, aliases: c.aliases.map(function (a) { return { alias: a && a.alias }; }) };
      const problem = commandProblem(entry, done); // format, noms réservés, doublons
      if (problem) throw new Error(problem);
      done.push(entry);
      return { name: entry.name, aliases: entry.aliases.map(function (a) { return a.alias; }) };
    });
  }

  // Bloc "commands:" du plugin.yml. Tout est entre guillemets : "no", "on" ou "y" seraient sinon lus comme des booléens par YAML.
  // Les noms ont déjà été limités à [a-z0-9_] : aucun caractère spécial ne peut passer.
  function commandsYaml(commands) {
    if (!commands.length) return "";
    const q = function (v) {
      if (!/^[a-z][a-z0-9_]{0,15}$/.test(v)) throw new Error("Nom de commande invalide pour le plugin.yml : " + v);
      return '"' + v + '"';
    };
    let yml = "commands:\n";
    commands.forEach(function (c) {
      yml += "  " + q(c.name) + ":\n    description: \"Commande de l'addon\"\n    usage: \"/<command> [me|roles]\"\n";
      if (c.aliases.length) yml += "    aliases: [" + c.aliases.map(q).join(", ") + "]\n";
    });
    return yml;
  }

  const kb = function (n) { return (n / 1024).toFixed(1) + " Ko"; };
  const pause = function () { return new Promise(function (r) { setTimeout(r, 60); }); }; // laisse l'écran se rafraîchir

  // Exécute une étape en prévenant onStep (début, fin avec durée, ou erreur)
  function run(onStep, label, fn) {
    const t = performance.now();
    onStep({ label: label, state: "start" });
    return pause().then(fn).then(function (detail) {
      onStep({ label: label, state: "done", detail: detail || "", ms: Math.round(performance.now() - t) });
    }, function (e) {
      onStep({ label: label, state: "error", detail: e.message });
      throw e;
    });
  }

  function build(data, onStep) {
    onStep = onStep || function () {};
    const s = data.settings, ctx = {};

    return run(onStep, "Chargement du modèle de jar", function () {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(s.author) || !/^[A-Za-z0-9_-]{1,32}$/.test(s.addonName))
        throw new Error("Pseudo ou nom du projet invalide.");
      return JSZip.loadAsync(TEMPLATE_JAR_B64, { base64: true }).then(function (zip) {
        ctx.zip = zip;
        const n = Object.keys(zip.files).filter(function (f) { return !zip.files[f].dir; }).length;
        return n + " fichiers, modèle de " + kb(TEMPLATE_JAR_B64.length * 0.75);
      });

    }).then(function () {
      return run(onStep, "Configuration de plugin.yml", function () {
        const yml = ctx.zip.file("plugin.yml");
        if (!yml) throw new Error("Modèle de jar invalide : plugin.yml manquant.");
        return yml.async("string").then(function (text) {
          const commands = commandsOf(s);
          const base = text.split("__ADDON_NAME__").join(s.addonName).split("__AUTHOR__").join(s.author);
          ctx.zip.file("plugin.yml", base.replace(/\s*$/, "\n") + commandsYaml(commands));
          return "name = " + s.addonName + ", authors = " + s.author + ", " + commands.length + " commande(s)"
            + commands.map(function (c) { return " /" + c.name + (c.aliases.length ? " (alias : " + c.aliases.join(", ") + ")" : ""); }).join(",");
        });
      });

    }).then(function () {
      return run(onStep, "Ajout de addon-config.json", function () {
        const json = JSON.stringify(data, null, 2);
        ctx.zip.file("addon-config.json", json);
        return (s.modes || []).length + " mode(s) de jeu, " + (s.teams || []).length + " équipe(s), " + kb(json.length);
      });

    }).then(function () {
      return run(onStep, "Génération de l'enum des équipes", function () {
        const teams = ctx.teams = teamsOf(s);
        if (!teams.length) return "aucune équipe : étape ignorée";
        const bytes = ClassGen.teamsEnum(ENUM_CLASS, ITEAM, teams);
        ctx.zip.file(ENUM_CLASS + ".class", bytes, { binary: true });
        return teams.map(function (t) { return t.constant; }).join(", ") + " (AddonTeams.class, " + bytes.length + " octets)";
      });

    }).then(function () {
      return run(onStep, "Génération de l'enum des rôles", function () {
        const roles = rolesOf(s, ctx.teams);
        if (!roles.length) return "aucun rôle : étape ignorée";
        const bytes = ClassGen.rolesEnum(ROLES_CLASS, IROLES, SUPPORT, roles);
        ctx.zip.file(ROLES_CLASS + ".class", bytes, { binary: true });
        ctx.roles = roles;
        return roles.map(function (r) { return r.constant + "#" + r.nmb; }).join(", ") + " (AddonRoles.class, " + bytes.length + " octets)";
      });

    }).then(function () {
      return run(onStep, "Génération des classes de rôles", function () {
        if (!ctx.roles) return "aucun rôle : étape ignorée";
        const classes = roleClassesOf(s, ctx.roles);
        classes.forEach(function (c) {
          ctx.zip.file(ROLE_PACKAGE + c.constant + ".class", ClassGen.roleClass({
            className: ROLE_PACKAGE + c.constant, enumClass: ROLES_CLASS, constant: c.constant,
            displayName: c.displayName, support: SUPPORT, effects: c.effects, noFall: c.noFall, revive: c.revive, extra: c.extra,
            powers: c.powers.map(function (p) { return { className: p.className.replace(/\//g, "."), item: p.kind === "ITEM" }; }) }), { binary: true });
          c.powers.forEach(function (p) { ctx.zip.file(p.className + ".class", ClassGen.powerClass(p), { binary: true }); });
        });
        return classes.map(function (c) {
          return c.constant + " (" + c.effects.length + " effet" + (c.effects.length > 1 ? "s" : "") + ", " + c.powers.length + " pouvoir" + (c.powers.length > 1 ? "s" : "") + ")";
        }).join(", ");
      });

    }).then(function () {
      return run(onStep, "Assemblage du .jar", function () {
        return ctx.zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/java-archive" },
          function (meta) { onStep({ label: "Assemblage du .jar", state: "progress", detail: Math.round(meta.percent) + " %" }); })
          .then(function (blob) { ctx.blob = blob; return kb(blob.size); });
      });

    }).then(function () {
      const names = Object.keys(ctx.zip.files).filter(function (f) { return !ctx.zip.files[f].dir; });
      onStep({ label: "Contenu du jar", state: "info", detail: names.join(" · ") });
      return ctx.blob;
    });
  }

  // ---------- Projet pour IDE (IntelliJ IDEA, Eclipse...) : le même addon, en code source Java + Gradle ----------

  function gradleFiles(name) {
    const build = [
      "// Projet généré par le Créateur d'addon UHC-Meetup.",
      "// Place ton jar UHC-Meetup et ton spigot.jar (1.8.8) dans le dossier libs/ : tous les .jar de libs/ servent à compiler.",
      "plugins {",
      "    id 'java'",
      "}",
      "",
      "group = 'fr.nicknqck.addonbuilder'",
      "version = '1.0'",
      "",
      "java {",
      "    sourceCompatibility = JavaVersion.VERSION_1_8",
      "    targetCompatibility = JavaVersion.VERSION_1_8",
      "}",
      "",
      "tasks.withType(JavaCompile).configureEach {",
      "    options.encoding = 'UTF-8'",
      "}",
      "",
      "dependencies {",
      "    compileOnly fileTree(dir: 'libs', include: ['*.jar'])",
      "}",
      "",
      "jar {",
      "    archiveFileName = '" + name + ".jar'",
      "}",
      ""].join("\n");
    const readme = [
      "# " + name,
      "",
      "Addon UHC-Meetup généré par le Créateur d'addon UHC-Meetup, sous forme de projet Gradle à ouvrir dans un IDE.",
      "",
      "## Ouvrir le projet dans IntelliJ IDEA",
      "",
      "1. Décompresse ce .zip.",
      "2. Copie ton jar **UHC-Meetup** et ton **spigot.jar** (Spigot 1.8.8) dans le dossier `libs/` (ils ne sont pas fournis).",
      "3. Dans IntelliJ : **File → Open…**, choisis le dossier `" + name + "`, puis **Trust Project**.",
      "   IntelliJ reconnaît le projet Gradle et télécharge Gradle tout seul (version indiquée dans `gradle/wrapper/gradle-wrapper.properties`).",
      "4. Vérifie le JDK : **File → Project Structure → Project → SDK** (Java 8 ou plus récent ; le code est compilé pour Java 8).",
      "",
      "## Compiler le .jar",
      "",
      "Fenêtre **Gradle** (à droite) → `" + name + "` → **Tasks → build → jar**.",
      "Le fichier est créé dans `build/libs/" + name + ".jar` : place-le dans le dossier `plugins` du serveur, à côté d'UHC-Meetup.",
      "",
      "## Où est quoi",
      "",
      "- `src/main/java/fr/nicknqck/addonbuilder/` : le code commun de l'addon (Main, menus, pouvoirs...).",
      "- `AddonTeams.java`, `AddonRoles.java` : tes équipes et tes rôles.",
      "- `roles/` : une classe par rôle ; `powers/` : une classe par pouvoir.",
      "- `src/main/resources/plugin.yml` : nom, auteur et commandes ; `addon-config.json` : tes réglages.",
      "",
      "Ce projet est une copie : le modifier ne change pas le site. Pour repartir du site, réimporte ton .json et réexporte.",
      ""].join("\n");
    return {
      "build.gradle": build,
      "settings.gradle": "rootProject.name = '" + name + "'\n",
      "gradle/wrapper/gradle-wrapper.properties": [
        "distributionBase=GRADLE_USER_HOME",
        "distributionPath=wrapper/dists",
        "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip",
        "zipStoreBase=GRADLE_USER_HOME",
        "zipStorePath=wrapper/dists",
        ""].join("\n"),
      ".gitignore": "build/\n.gradle/\n.idea/\n*.iml\nout/\nlibs/*.jar\n",
      "libs/LISEZ-MOI.txt": "Copie ici ton jar UHC-Meetup et ton spigot.jar (Spigot 1.8.8).\nIls servent seulement à compiler : ils ne sont pas inclus dans le .jar de l'addon.\n",
      "README.md": readme
    };
  }

  /** Projet Gradle complet (code source) dans un .zip : buildProject(data, onStep) -> Promise<Blob> */
  function buildProject(data, onStep) {
    onStep = onStep || function () {};
    const s = data.settings, ctx = { files: {} };
    const root = function (path) { return s.addonName + "/" + path; };
    const JAVA = "src/main/java/fr/nicknqck/addonbuilder/";

    return run(onStep, "Préparation du projet", function () {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(s.author) || !/^[A-Za-z0-9_-]{1,32}$/.test(s.addonName))
        throw new Error("Pseudo ou nom du projet invalide.");
      if (typeof TEMPLATE_SOURCES === "undefined" || !TEMPLATE_SOURCES["src/main/resources/plugin.yml"])
        throw new Error("Code source du modèle introuvable (js/template-sources.js).");
      let n = 0;
      Object.keys(TEMPLATE_SOURCES).forEach(function (path) {
        if (path.indexOf(JAVA) === 0) { ctx.files[path] = TEMPLATE_SOURCES[path]; n++; }
      });
      return n + " fichiers du code commun";

    }).then(function () {
      return run(onStep, "Configuration de plugin.yml", function () {
        const commands = commandsOf(s);
        const base = TEMPLATE_SOURCES["src/main/resources/plugin.yml"].split("__ADDON_NAME__").join(s.addonName).split("__AUTHOR__").join(s.author);
        ctx.files["src/main/resources/plugin.yml"] = base.replace(/\s*$/, "\n") + commandsYaml(commands);
        return "name = " + s.addonName + ", authors = " + s.author + ", " + commands.length + " commande(s)";
      });

    }).then(function () {
      return run(onStep, "Ajout de addon-config.json", function () {
        const json = JSON.stringify(data, null, 2);
        ctx.files["src/main/resources/addon-config.json"] = json;
        return kb(json.length);
      });

    }).then(function () {
      return run(onStep, "Code des équipes", function () {
        const teams = ctx.teams = teamsOf(s);
        if (!teams.length) return "aucune équipe : étape ignorée";
        ctx.files[JAVA + "AddonTeams.java"] = JavaGen.teamsEnum(teams);
        return "AddonTeams.java (" + teams.map(function (t) { return t.constant; }).join(", ") + ")";
      });

    }).then(function () {
      return run(onStep, "Code des rôles et des pouvoirs", function () {
        const roles = rolesOf(s, ctx.teams);
        if (!roles.length) return "aucun rôle : étape ignorée";
        ctx.files[JAVA + "AddonRoles.java"] = JavaGen.rolesEnum(roles);
        let powers = 0;
        roleClassesOf(s, roles).forEach(function (c) {
          ctx.files[JAVA + "roles/" + c.constant + ".java"] = JavaGen.roleClass({
            constant: c.constant, displayName: c.displayName, noFall: c.noFall, effects: c.effects, revive: c.revive, extra: c.extra,
            powers: c.powers.map(function (p) { return { className: p.className, item: p.kind === "ITEM" }; }) });
          c.powers.forEach(function (p) {
            ctx.files[JAVA + "powers/" + p.className.split("/").pop() + ".java"] = JavaGen.powerClass(p);
            powers++;
          });
        });
        return roles.length + " rôle(s), " + powers + " pouvoir(s) : AddonRoles.java, roles/, powers/";
      });

    }).then(function () {
      return run(onStep, "Fichiers Gradle et mode d'emploi", function () {
        const g = gradleFiles(s.addonName);
        Object.keys(g).forEach(function (path) { ctx.files[path] = g[path]; });
        return Object.keys(g).join(", ");
      });

    }).then(function () {
      return run(onStep, "Assemblage du .zip", function () {
        const zip = new JSZip();
        Object.keys(ctx.files).sort().forEach(function (path) { zip.file(root(path), ctx.files[path]); });
        ctx.count = Object.keys(ctx.files).length;
        return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" },
          function (meta) { onStep({ label: "Assemblage du .zip", state: "progress", detail: Math.round(meta.percent) + " %" }); })
          .then(function (blob) { ctx.blob = blob; return ctx.count + " fichiers, " + kb(blob.size); });
      });

    }).then(function () {
      onStep({ label: "Contenu du projet", state: "info", detail: Object.keys(ctx.files).sort().join(" · ") });
      return ctx.blob;
    });
  }

  return { build: build, buildProject: buildProject, constName: constName, commandsYaml: commandsYaml };
})();
