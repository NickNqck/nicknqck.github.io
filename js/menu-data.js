/*
 * ===== C'EST ICI QUE TU CRÉES TES BOUTONS =====
 * Chaque élément : { type, id, label, ... }. L'id doit être UNIQUE dans tout le fichier.
 *
 * "folder"     : bouton qui ouvre un sous-menu (éléments dans "children", imbrication libre)
 * "collection" : liste d'éléments créés par l'utilisateur, avec bouton de création (formulaire à un seul
 *                élément à la fois, boutons "Valider" et "Retour" qui n'enregistre rien).
 *                -> { createLabel: "Créer ...", max, fields: [ champs du formulaire ] }
 *                Le champ "name" (obligatoire, en premier) doit être unique dans la collection.
 *                idFrom: "name" -> l'élément reçoit un identifiant tiré de son nom (utilisé par les équipes).
 *
 * Champs : "toggle" | "number" { default, min, max, step } | "text" { default, max, pattern }
 *          "select" { options: [...] } | "item" (sélecteur d'objet, items-data.js)
 *          "color" (couleur Minecraft 1.8.8, colors-data.js) | "mdj" (mode de jeu créé ici ou d'UHC-Meetup,
 *          meetup-modes.js : CRYSTAL et Aucun sont exclus)
 *
 * Le pseudo et le nom du projet sont gérés par app.js (écran de démarrage) : ne les mets pas ici.
 * Mets les modes de jeu AVANT les équipes qui peuvent les utiliser.
 */
// Champs des actions d'un objet selon le clic : donner des effets, ou se téléporter derrière / autour d'un joueur visé,
// ou téléporter le joueur visé jusqu'à soi ; dans tous les cas, des effets facultatifs pour l'utilisateur et/ou la cible.
// Le groupe "a" sert au clic gauche (ou aux deux clics), le groupe "b" au clic droit.
const CLICK_MODES_A = ["LEFT_ONLY", "BOTH_SAME", "DIFFERENT"];
const CLICK_MODES_B = ["RIGHT_ONLY", "DIFFERENT"];
// inBlocks : réglage modifié uniquement par l'éditeur à blocs (js/blocks.js), jamais affiché comme champ de formulaire,
// mais toujours validé, enregistré, exporté et importé comme avant
function clickFields(prefix, modes) {
  return clickFieldsRaw(prefix, { kind: "ITEM", clickMode: modes }, false).map(function (f) { return Object.assign(f, { inBlocks: true }); });
}
// Groupe "c" : « en frappant un joueur » (la cible est le joueur frappé : pas de visée, ni projectile, ni zone)
function hitFields() {
  return clickFieldsRaw("c", { kind: "ITEM", onHit: true }, true).map(function (f) { return Object.assign(f, { inBlocks: true, optional: true }); });
}
function clickFieldsRaw(prefix, when, hit) {
  const act = function (actions, extra) { return Object.assign({}, when, { [prefix + "Action"]: actions }, extra || {}); };
  const notHit = function (f) { return hit ? null : f; };
  return [
    { type: "select", id: prefix + "Action", label: "Action du clic", default: "EFFECT_ONLY",
      options: hit ? ["EFFECT_ONLY", "TP_BEHIND", "TP_AROUND", "TP_TO_USER"] : ["EFFECT_ONLY", "TP_BEHIND", "TP_AROUND", "TP_TO_USER", "LAUNCH", "AREA"],
      labels: { EFFECT_ONLY: "Donner des effets (sans téléportation)",
                TP_BEHIND: "Se téléporter derrière le joueur visé",
                TP_AROUND: "Se téléporter autour du joueur visé",
                TP_TO_USER: "Téléporter le joueur visé jusqu'à soi",
                LAUNCH: "Lancer un projectile (conséquences à l'impact)",
                AREA: "Toucher tous les joueurs autour de moi (zone)" }, showIf: when },
    notHit({ type: "toggle", id: prefix + "Aim", label: "En visant un joueur", default: false, showIf: act(["EFFECT_ONLY"]) }),
    notHit({ type: "number", id: prefix + "Distance", label: "Distance maximale de visée (blocs)", default: 30, min: 1, max: 100, step: 1,
      showIf: act(["EFFECT_ONLY"], { [prefix + "Aim"]: true }) }),
    notHit({ type: "number", id: prefix + "TpDistance", label: "Distance maximale de visée (blocs)", default: 30, min: 1, max: 100, step: 1,
      showIf: act(["TP_BEHIND", "TP_AROUND", "TP_TO_USER"]) }),
    { type: "number", id: prefix + "Radius", label: "Distance autour de la cible (blocs)", default: 5, min: 1, max: 30, step: 1,
      showIf: act(["TP_AROUND"]) },

  ].concat(hit ? [] : [
    // Projectile : à l'impact (atterrissage ou joueur touché), téléportation de l'utilisateur et/ou zone de dégâts
    { type: "select", id: prefix + "Projectile", label: "Projectile lancé", default: "ARROW",
      options: ["ARROW", "SNOWBALL"], labels: { ARROW: "Flèche", SNOWBALL: "Boule de neige" }, showIf: act(["LAUNCH"]) },
    { type: "toggle", id: prefix + "ImpactTp", label: "Téléporter l'utilisateur au point d'impact", default: false, showIf: act(["LAUNCH"]) },
    { type: "toggle", id: prefix + "Zone", label: "Créer une zone de dégâts au point d'impact", default: false, showIf: act(["LAUNCH"]) },
    { type: "number", id: prefix + "ZoneRadius", label: "Rayon de la zone (blocs)", default: 5, min: 1, max: 30, step: 1,
      showIf: act(["LAUNCH"], { [prefix + "Zone"]: true }) },
    { type: "number", id: prefix + "ZoneDamage", label: "Dégâts à chaque joueur touché (en cœurs, par pas de 0,5)", default: 1, min: 0.5, max: 10, step: 0.5,
      showIf: act(["LAUNCH"], { [prefix + "Zone"]: true }) },
    { type: "number", id: prefix + "ZoneSeconds", label: "Durée de la zone (secondes) : 0 = une seule explosion, sinon dégâts chaque seconde", default: 0, min: 0, max: 60, step: 1,
      showIf: act(["LAUNCH"], { [prefix + "Zone"]: true }) },
    // Zone autour de l'utilisateur (comme Khakkhara / Uchiwa / Affaiblissement de Hantengu)
    { type: "number", id: prefix + "AreaRadius", label: "Rayon de la zone autour de moi (blocs)", default: 50, min: 1, max: 100, step: 1,
      optional: true, showIf: act(["AREA"]) },
    { type: "select", id: prefix + "AreaFilter", label: "Joueurs touchés", default: "ENEMIES", optional: true,
      options: ["ENEMIES", "ALL"], labels: { ENEMIES: "Tous sauf ceux de mon camp", ALL: "Tous les joueurs" }, showIf: act(["AREA"]) },
    { type: "number", id: prefix + "AreaDamage", label: "Dégâts à chaque joueur touché (cœurs, ne tue jamais ; 0 = aucun)", default: 0, min: 0, max: 10, step: 0.5,
      optional: true, showIf: act(["AREA"]) },
    { type: "toggle", id: prefix + "AreaLightning", label: "Faire tomber un éclair sur chaque joueur touché", default: false, optional: true,
      showIf: act(["AREA"]) },
    { type: "number", id: prefix + "AreaUp", label: "Propulser chaque joueur touché vers le haut (blocs, 0 = non)", default: 0, min: 0, max: 100, step: 1,
      optional: true, showIf: act(["AREA"]) },
    // false : il prend les dégâts de chute en retombant (comme Uchiwa) ; true : sa prochaine chute est sans dégâts (PotionUtils.addTempNoFall)
    { type: "toggle", id: prefix + "AreaUpNoFall", label: "Sans dégâts de chute en retombant", default: false, optional: true,
      showIf: act(["AREA"]) },

    // la zone est dessinée en particules visibles par les joueurs, à sa création puis tant qu'elle est active
    { type: "color", id: prefix + "ZoneColor", label: "Couleur de la zone (cercle de particules)", default: "c",
      showIf: act(["LAUNCH"], { [prefix + "Zone"]: true }) }
  ], [

    { type: "effectlist", id: prefix + "Effects", label: "Effets de potion (facultatifs ; avec un projectile : donnés à l'utilisateur à l'impact)", default: [], max: 5,
      allowTarget: function (rec) {
        const action = rec[prefix + "Action"];
        return hit || (action === "EFFECT_ONLY" ? rec[prefix + "Aim"] === true : action !== "LAUNCH");
      },
      targetLabel: function (rec) { return rec[prefix + "Action"] === "AREA" ? "aux joueurs touchés" : "à la cible"; },
      showIf: when },

    // Actions sur le joueur visé / frappé (catégorie « Cible ») : [{ type, amount, flag }]
    { type: "targetlist", id: prefix + "Target", label: "Actions sur la cible", default: [], optional: true,
      showIf: hit ? when : act(["EFFECT_ONLY", "TP_BEHIND", "TP_AROUND", "TP_TO_USER"]) },

    // Cooldown propre à ce clic (quand chaque clic fait une action différente, ou pour la frappe) : chaque clic a son compte à rebours
    { type: "number", id: prefix + "Cooldown", label: "Cooldown de ce clic (secondes, 0 = aucun)", default: 0, min: 0, max: 3600, step: 1, optional: true,
      showIf: hit ? when : { kind: "ITEM", clickMode: "DIFFERENT" },
      note: "Se cumule avec le cooldown commun (plus bas) : mets-le à 0 si seuls les cooldowns de chaque clic comptent." }
  ]).filter(Boolean);
}

const MENU = {
  id: "root",
  title: "Mon addon",
  children: [
    { type: "collection", id: "modes", label: "Modes de jeu", icon: "⚔", createLabel: "Créer un mode de jeu",
      max: 10, idFrom: "name",
      fields: [
        // Ce nom sert d'identifiant (écrit en minuscules dans le champ mdj des équipes) : lettres et chiffres seulement
        { type: "text", id: "name", label: "Nom du mode de jeu", default: "", max: 32,
          pattern: "^[A-Za-z0-9]{1,32}$", hint: "Lettres et chiffres uniquement" },
        { type: "item", id: "item", label: "Objet qui le représente", default: "IRON_SWORD" }
      ] },

    { type: "collection", id: "teams", label: "Équipes", icon: "⚑", createLabel: "Créer une équipe", max: 20,
      fields: [
        { type: "text", id: "name", label: "Nom de l'équipe", default: "", max: 24,
          pattern: "^[A-Za-z0-9\u00C0-\u00FF _'-]{1,24}$" },
        { type: "color", id: "color", label: "Couleur", default: "a" },
        { type: "mdj", id: "mdj", label: "Mode de jeu", default: "" }
      ] },

    // Rôles : nmb (numéro dans l'équipe, 0, 1, 2...) et gDesign (ton pseudo coloré) sont calculés par le site.
    // Mets le mode de jeu AVANT l'équipe : les équipes d'un autre mode sont alors grisées.
    { type: "collection", id: "roles", label: "Rôles", icon: "♞", createLabel: "Créer un rôle", max: 60,
      fields: [
        { type: "text", id: "name", label: "Nom du rôle", default: "", max: 24,
          pattern: "^[A-Za-z0-9\u00C0-\u00FF _'-]{1,24}$" },
        // mode de l'addon, ou mode d'UHC-Meetup (le rôle apparaît alors dans le menu des rôles de ce mode, dans son équipe)
        { type: "rolemdj", id: "mdj", label: "Mode de jeu", default: "" },
        { type: "team", id: "team", label: "Équipe", default: "" },
        { type: "item", id: "item", label: "Objet dans les menus", default: "IRON_SWORD" },

        // NoFall (setNoFall de RoleBase) : permanent, ou seulement le jour / la nuit (DayEvent et NightEvent)
        { type: "select", id: "noFall", label: "Immunité aux dégâts de chute (NoFall)", default: "NONE", optional: true,
          options: ["NONE", "PERMANENT", "DAY", "NIGHT"],
          labels: { NONE: "Aucune", PERMANENT: "Permanente", DAY: "Seulement le jour", NIGHT: "Seulement la nuit" } },

        // Résurrection (comme Urami de Hantengu) : une fois par partie, la mort est annulée et le joueur réapparaît
        { type: "toggle", id: "revive", label: "Ressuscite une fois par partie à sa mort", default: false, optional: true },
        { type: "number", id: "reviveHearts", label: "Cœurs maximum perdus en ressuscitant (permanents)", default: 2, min: 0, max: 9, step: 1,
          optional: true, showIf: { revive: true } },
        { type: "number", id: "reviveRadius", label: "Réapparition à cette distance, direction au hasard (blocs, 0 = sur place)",
          note: "Comme Urami de Hantengu : le déplacement ne se fait que dans le monde de jeu « arena » d'UHC-Meetup ; ailleurs, le joueur réapparaît sur place.", default: 50, min: 0, max: 200, step: 1,
          optional: true, showIf: { revive: true } },

        // Effets de potion donnés au propriétaire du rôle (givePotionEffect dans RoleGiven), 15 au maximum.
        // Le même effet peut revenir avec une autre intensité (niveau) ou un autre moment.
        { type: "list", id: "effects", label: "Effets", max: 15, createLabel: "Ajouter un effet",
          nameTemplate: "{effect} {level} · {when}{seconds}",
          fields: [
            { type: "select", id: "effect", label: "Effet", default: "SPEED",
              options: Object.keys(POTION_LABELS), labels: POTION_LABELS },
            { type: "number", id: "level", label: "Niveau (1 = I)", default: 1, min: 1, max: 10, step: 1 },
            { type: "select", id: "when", label: "Quand", default: "PERMANENT",
              options: Object.keys(EFFECT_WHEN_LABELS), labels: EFFECT_WHEN_LABELS },
            // La durée ne se règle que pour AT_KILL ; sinon 60 ticks (3 s) par défaut, comme dans Darunia
            { type: "number", id: "seconds", label: "Durée après le kill (secondes)", default: 3, min: 1, max: 1600, step: 1,
              showIf: { when: "AT_KILL" }, inName: " (pendant {value} s)" }
          ] },

        // Pouvoirs du rôle : chacun devient une classe (Power, ou ItemPower pour les objets) d'UHC-Meetup.
        // Le nom accepte les couleurs (&a, &l...) ; le site ajoute §r à la fin s'il manque.
        { type: "list", id: "powers", label: "Pouvoirs", max: 10, createLabel: "Ajouter un pouvoir",
          nameTemplate: "{title}",
          // Un clic qui ne téléporte pas doit donner au moins un effet (sinon il ne fait rien)
          validate: function (p) {
            if (p.kind === "NO_ARMOR" && !(p.armorEffects || []).length && !p.armorNoFall)
              return "Dans « si je ne porte aucune armure », ajoute au moins un effet ou « insensible aux dégâts de chute ».";
            if (p.kind === "COMMAND_EFFECTS") {
              if (!(p.cmdEffects || []).length) return "Ajoute au moins un bloc « donner un effet » sous « quand le joueur tape … ».";
              if (RESERVED_ARGS.indexOf(p.arg) !== -1) return "L'argument « " + p.arg + " » est déjà pris (/commande me et /commande roles existent déjà).";
              if (p.command === "aot" && AOT_RESERVED_ARGS.indexOf(p.arg) !== -1) return "L'argument « " + p.arg + " » est déjà pris par /aot d'UHC-Meetup.";
              return "";
            }
            const uses = (p.rules || []).some(function (r) { return r.on === "USE"; });
            if (p.kind === "COMMAND_RULES") {
              if (!uses) return "Sans bloc « donner un effet », la commande lance les règles « quand j'utilise ce pouvoir » : ajoute-en une (catégorie Règles).";
              if (RESERVED_ARGS.indexOf(p.arg) !== -1) return "L'argument « " + p.arg + " » est déjà pris (/commande me et /commande roles existent déjà).";
              if (p.command === "aot" && AOT_RESERVED_ARGS.indexOf(p.arg) !== -1) return "L'argument « " + p.arg + " » est déjà pris par /aot d'UHC-Meetup.";
              return "";
            }
            if (p.kind !== "ITEM") return "";
            if (p.clickMode === "NONE" && !p.onHit && !(p.rules || []).length) return "L'objet ne fait rien : ajoute un « si » avec un capteur (clic ou frapper un joueur), ou une règle (« quand j'utilise ce pouvoir »...).";
            const groups = [];
            if (CLICK_MODES_A.indexOf(p.clickMode) !== -1) groups.push(["a", "clic gauche"]);
            if (CLICK_MODES_B.indexOf(p.clickMode) !== -1) groups.push(["b", "clic droit"]);
            if (p.onHit) groups.push(["c", "frapper un joueur"]);
            for (let i = 0; i < groups.length; i++) {
              const g = groups[i][0], effects = (p[g + "Effects"] || []).length + (p[g + "Target"] || []).length;
              if (p[g + "Action"] === "EFFECT_ONLY" && !effects)
                return "Le « si " + groups[i][1] + " » ne fait rien : ajoute-lui au moins un bloc (effet, téléportation, projectile ou zone).";
              if (p[g + "Action"] === "AREA" && !(p[g + "AreaDamage"] > 0) && !(p[g + "AreaUp"] > 0) && !effects)
                return "Pour la zone du " + groups[i][1] + " : choisis au moins des dégâts, une propulsion ou un effet.";
              if (p[g + "Action"] === "LAUNCH" && !p[g + "ImpactTp"] && !p[g + "Zone"] && !effects)
                return "Pour le projectile du " + groups[i][1] + " : choisis au moins une conséquence (téléportation, zone de dégâts ou effet).";
            }
            return "";
          },
          // Deux pouvoirs d'un même rôle ne peuvent pas partager la même commande + le même argument
          crossCheck: function (p, others) {
            const isCmd = function (x) { return x.kind === "COMMAND_EFFECTS" || x.kind === "COMMAND_RULES"; };
            if (!isCmd(p)) return "";
            const same = others.some(function (o) { return isCmd(o) && o.command === p.command && o.arg === p.arg; });
            return same ? "Un autre pouvoir de ce rôle utilise déjà /" + p.command + " " + p.arg + "." : "";
          },
          fields: [
            // Le type n'est plus choisi dans une liste : il vient du bloc de départ et du comportement passif du programme
            { type: "select", id: "kind", label: "Type de pouvoir", default: "", inBlocks: true,
              invalidMessage: "Le programme doit commencer par un bloc de départ (catégorie Événements) : quand le joueur utilise un objet, tape une commande, ou en permanence.",
              options: ["PASSIVE", "BLOCK_EFFECT", "BLOCK_POWER", "INFO", "NO_ARMOR", "ITEM", "COMMAND_EFFECTS", "COMMAND_RULES"],
              labels: { PASSIVE: "Passif simple (description seule)",
                        BLOCK_EFFECT: "Passif : empêche les joueurs proches d'obtenir des effets",
                        BLOCK_POWER: "Passif : empêche les joueurs proches d'utiliser un pouvoir",
                        INFO: "Passif : révèle le camp des joueurs restés à proximité",
                        NO_ARMOR: "Passif : bonus quand le joueur ne porte aucune armure",
                        ITEM: "Objet à activer au clic",
                        COMMAND_EFFECTS: "Commande : active / désactive des effets",
                        COMMAND_RULES: "Commande : lance les règles « quand j'utilise ce pouvoir »" } },
            { type: "mctext", id: "title", label: "Nom du pouvoir", default: "", max: 40, hint: "ex. &bMon pouvoir" },
            // autoDescribe : bouton « Générer automatiquement » (js/describe.js), à partir du programme en blocs
            { type: "textarea", id: "description", label: "Description (facultative)", default: "", max: 400, autoDescribe: true,
              hint: "Une phrase par ligne (6 lignes maximum). Couleurs : &a, &c... (&r pour revenir à la normale)" },

            // Programme en blocs : la seule façon de régler ce que fait le pouvoir (tous les champs inBlocks ci-dessous)
            { type: "itemblocks", id: "blocks", label: "Programme du pouvoir" },
            // Règles « quand … » (js/rules-data.js) : s'ajoutent à n'importe quel pouvoir (kill, mort d'un rôle, nuit, coups...)
            { type: "rules", id: "rules", label: "Règles", default: [], optional: true, inBlocks: true },

            // --- Passifs : blocage d'effets / de pouvoirs, information ---
            { type: "number", id: "radius", label: "Rayon d'action (blocs)", default: 15, min: 1, max: 100, step: 1, inBlocks: true,
              showIf: { kind: ["BLOCK_EFFECT", "BLOCK_POWER", "INFO"] } },
            // plusieurs effets au choix ; Absorption et Régénération sont absents de la liste : toujours autorisés
            { type: "multiselect", id: "blockedEffects", label: "Effets empêchés (au moins un)", default: [], min: 1, inBlocks: true,
              invalidMessage: "Dans « empêcher les joueurs proches d'obtenir des effets », ajoute au moins un bloc « l'effet … », chaque effet une seule fois.",
              options: Object.keys(POTION_LABELS).filter(function (k) { return PROTECTED_EFFECTS.indexOf(k) === -1; }),
              labels: POTION_LABELS, showIf: { kind: "BLOCK_EFFECT" } },
            // Information : temps à rester dans le rayon, puis couleur des particules selon le camp
            { type: "number", id: "needSeconds", label: "Temps à passer à proximité (secondes)", default: 240, min: 5, max: 3600, step: 1, inBlocks: true,
              showIf: { kind: "INFO" } },
            { type: "teamcolors", id: "teamColors", label: "Couleur par camp", default: {}, inBlocks: true, showIf: { kind: "INFO" } },
            { type: "color", id: "defaultColor", label: "Couleur des autres camps", default: "9", inBlocks: true, showIf: { kind: "INFO" } },
            // Sans armure (comme l'invisibilité de Hantengu) : effets maintenus et / ou NoFall tant qu'aucune pièce d'armure n'est portée
            { type: "effectlist", id: "armorEffects", label: "Effets tant qu'aucune armure n'est portée", default: [], max: 5, inBlocks: true,
              hideWho: true, hideSeconds: true, allowTarget: function () { return false; }, optional: true, showIf: { kind: "NO_ARMOR" } },
            { type: "toggle", id: "armorNoFall", label: "Insensible aux dégâts de chute sans armure", default: false, optional: true, inBlocks: true,
              showIf: { kind: "NO_ARMOR" } },

            // --- Commande : /commande <argument> active le pouvoir, la même commande le désactive ---
            { type: "mycommand", id: "command", label: "Commande", default: "", inBlocks: true, showIf: { kind: ["COMMAND_EFFECTS", "COMMAND_RULES"] },
              invalidMessage: "Choisis une commande dans « quand le joueur tape … » (crée-la d'abord dans le menu Commandes de l'addon)." },
            { type: "text", id: "arg", label: "Argument (/commande <argument>)", default: "", max: 20, pattern: ARG_PATTERN, inBlocks: true,
              invalidMessage: "Argument invalide dans « quand le joueur tape … » : 1 à 20 caractères, minuscules, chiffres et _, en commençant par une lettre.",
              showIf: { kind: ["COMMAND_EFFECTS", "COMMAND_RULES"] } },
            // durée 0 = l'effet reste tant que le pouvoir est activé ; sinon il dure ce nombre de secondes après l'activation
            { type: "effectlist", id: "cmdEffects", label: "Effets (donnés au joueur qui active le pouvoir)", default: [], max: MAX_COMMAND_EFFECTS,
              minSeconds: 0, hideWho: true, allowTarget: function () { return false; }, inBlocks: true,
              invalidMessage: "Un bloc « donner un effet » est invalide : niveau de 1 à 10, durée de 0 à 1600 s.",
              showIf: { kind: "COMMAND_EFFECTS" } },

            // --- Objet à activer : matériau (dans le bloc de départ), clic(s) qui l'activent, puis l'action de chaque clic ---
            { type: "item", id: "powerItem", label: "Objet du pouvoir", default: "IRON_SWORD", inBlocks: true, showIf: { kind: "ITEM" } },
            // Apparence de l'objet (ItemBuilder d'UHC-Meetup) : brillance seule, vrais enchantements (visibles ou cachés), incassable
            { type: "toggle", id: "itemGlint", label: "Objet brillant (comme enchanté)", default: false, optional: true, inBlocks: true, showIf: { kind: "ITEM" } },
            { type: "enchantlist", id: "itemEnchants", label: "Enchantements de l'objet", default: [], max: MAX_ITEM_ENCHANTS, optional: true, inBlocks: true,
              invalidMessage: "Un bloc « enchanter l'objet » est invalide : niveau de 1 à 10, chaque enchantement une seule fois.",
              showIf: { kind: "ITEM" } },
            { type: "toggle", id: "itemHideEnchants", label: "Enchantements cachés", default: false, optional: true, inBlocks: true, showIf: { kind: "ITEM" } },
            // plus de bloc : UHC-Meetup rend déjà incassable tout objet de pouvoir (ItemPower) ; gardé pour relire les anciens .json
            { type: "toggle", id: "itemUnbreakable", label: "Objet incassable", default: false, optional: true, inBlocks: true, showIf: { kind: "ITEM" } },
            { type: "select", id: "clickMode", label: "Clic(s) qui activent l'objet", default: "RIGHT_ONLY", inBlocks: true,
              invalidMessage: "Chaque bloc « si » doit contenir son capteur (catégorie Capteurs) : un clic pour les « si » du programme, « viser un joueur » pour un « si » placé dans un clic. Il faut au moins un « si », ou une règle « quand j'utilise ce pouvoir ».",
              options: ["LEFT_ONLY", "RIGHT_ONLY", "BOTH_SAME", "DIFFERENT", "NONE"],
              labels: { LEFT_ONLY: "Clic gauche uniquement", RIGHT_ONLY: "Clic droit uniquement",
                        BOTH_SAME: "Les deux clics font la même chose", DIFFERENT: "Chaque clic fait une action différente",
                        NONE: "Aucun clic (seulement en frappant un joueur)" },
              showIf: { kind: "ITEM" } },
            // « si frapper un joueur » : l'objet agit quand on frappe un joueur avec (groupe de champs "c")
            { type: "toggle", id: "onHit", label: "En frappant un joueur", default: false, optional: true, inBlocks: true, showIf: { kind: "ITEM" } }
          ].concat(clickFields("a", CLICK_MODES_A), clickFields("b", CLICK_MODES_B), hitFields(), [

            // --- Communs à tous les types ---
            { type: "number", id: "cooldown", label: "Cooldown du pouvoir (secondes, 0 = aucun)", default: 0, min: 0, max: 3600, step: 1, inBlocks: true },
            { type: "number", id: "maxUse", label: "Utilisations maximum (0 = illimité)", default: 0, min: 0, max: 999, step: 1, inBlocks: true }
          ]) }
      ] },

    // Commandes personnalisées (/nom + alias). Chacune a /nom me, /nom roles et sa propre complétion (voir commands-data.js).
    { type: "collection", id: "commands", label: "Commandes", icon: "⌨", createLabel: "Créer une commande", max: MAX_COMMANDS,
      crossCheck: commandProblem,
      fields: [
        { type: "text", id: "name", label: "Nom de la commande (sans le /)", default: "", max: 16,
          pattern: COMMAND_PATTERN, hint: "ex. zelda : minuscules, chiffres et _ (16 caractères maximum)" },
        { type: "list", id: "aliases", label: "Alias (autres noms de la commande)", max: MAX_ALIASES, createLabel: "Ajouter un alias",
          nameTemplate: "/{alias}",
          fields: [
            { type: "text", id: "alias", label: "Alias (sans le /)", default: "", max: 16,
              pattern: COMMAND_PATTERN, hint: "ex. zl : minuscules, chiffres et _" }
          ] }
      ] }
  ]
};
