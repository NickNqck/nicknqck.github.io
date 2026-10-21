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
// uiHideIf : champ caché à l'écran (mais toujours validé et enregistré) quand le pouvoir s'affiche en blocs
const BLOCKS_VIEW = { editorView: "BLOCKS" };
function clickFields(prefix, modes) {
  return clickFieldsRaw(prefix, modes).map(function (f) { return Object.assign(f, { uiHideIf: BLOCKS_VIEW }); });
}
function clickFieldsRaw(prefix, modes) {
  const when = { kind: "ITEM", clickMode: modes };
  const act = function (actions, extra) { return Object.assign({}, when, { [prefix + "Action"]: actions }, extra || {}); };
  return [
    { type: "select", id: prefix + "Action", label: "Action du clic", default: "EFFECT_ONLY",
      options: ["EFFECT_ONLY", "TP_BEHIND", "TP_AROUND", "TP_TO_USER", "LAUNCH"],
      labels: { EFFECT_ONLY: "Donner des effets (sans téléportation)",
                TP_BEHIND: "Se téléporter derrière le joueur visé",
                TP_AROUND: "Se téléporter autour du joueur visé",
                TP_TO_USER: "Téléporter le joueur visé jusqu'à soi",
                LAUNCH: "Lancer un projectile (conséquences à l'impact)" }, showIf: when },
    { type: "toggle", id: prefix + "Aim", label: "En visant un joueur", default: false, showIf: act(["EFFECT_ONLY"]) },
    { type: "number", id: prefix + "Distance", label: "Distance maximale de visée (blocs)", default: 30, min: 1, max: 100, step: 1,
      showIf: act(["EFFECT_ONLY"], { [prefix + "Aim"]: true }) },
    { type: "number", id: prefix + "TpDistance", label: "Distance maximale de visée (blocs)", default: 30, min: 1, max: 100, step: 1,
      showIf: act(["TP_BEHIND", "TP_AROUND", "TP_TO_USER"]) },
    { type: "number", id: prefix + "Radius", label: "Distance autour de la cible (blocs)", default: 5, min: 1, max: 30, step: 1,
      showIf: act(["TP_AROUND"]) },

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
    // la zone est dessinée en particules visibles par les joueurs, à sa création puis tant qu'elle est active
    { type: "color", id: prefix + "ZoneColor", label: "Couleur de la zone (cercle de particules)", default: "c",
      showIf: act(["LAUNCH"], { [prefix + "Zone"]: true }) },

    { type: "effectlist", id: prefix + "Effects", label: "Effets de potion (facultatifs ; avec un projectile : donnés à l'utilisateur à l'impact)", default: [], max: 5,
      allowTarget: function (rec) {
        const action = rec[prefix + "Action"];
        return action === "EFFECT_ONLY" ? rec[prefix + "Aim"] === true : action !== "LAUNCH";
      }, showIf: when },

    // Cooldown propre à ce clic (seulement quand chaque clic fait une action différente) : chaque clic a son compte à rebours
    { type: "number", id: prefix + "Cooldown", label: "Cooldown de ce clic (secondes, 0 = aucun)", default: 0, min: 0, max: 3600, step: 1, optional: true,
      showIf: { kind: "ITEM", clickMode: "DIFFERENT" },
      note: "Se cumule avec le cooldown commun (plus bas) : mets-le à 0 si seuls les cooldowns de chaque clic comptent." }
  ];
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
        { type: "mymdj", id: "mdj", label: "Mode de jeu", default: "" },
        { type: "team", id: "team", label: "Équipe", default: "" },
        { type: "item", id: "item", label: "Objet dans les menus", default: "IRON_SWORD" },

        // NoFall (setNoFall de RoleBase) : permanent, ou seulement le jour / la nuit (DayEvent et NightEvent)
        { type: "select", id: "noFall", label: "Immunité aux dégâts de chute (NoFall)", default: "NONE", optional: true,
          options: ["NONE", "PERMANENT", "DAY", "NIGHT"],
          labels: { NONE: "Aucune", PERMANENT: "Permanente", DAY: "Seulement le jour", NIGHT: "Seulement la nuit" } },

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
            if (p.kind === "COMMAND_EFFECTS") {
              if (!(p.cmdEffects || []).length) return "Ajoute au moins un effet pour ce pouvoir.";
              if (RESERVED_ARGS.indexOf(p.arg) !== -1) return "L'argument « " + p.arg + " » est déjà pris (/commande me et /commande roles existent déjà).";
              return "";
            }
            if (p.kind !== "ITEM") return "";
            const groups = [];
            if (CLICK_MODES_A.indexOf(p.clickMode) !== -1) groups.push(["a", "clic gauche"]);
            if (CLICK_MODES_B.indexOf(p.clickMode) !== -1) groups.push(["b", "clic droit"]);
            for (let i = 0; i < groups.length; i++) {
              const g = groups[i][0], effects = (p[g + "Effects"] || []).length;
              if (p[g + "Action"] === "EFFECT_ONLY" && !effects)
                return "Ajoute au moins un effet pour l'action du " + groups[i][1] + ".";
              if (p[g + "Action"] === "LAUNCH" && !p[g + "ImpactTp"] && !p[g + "Zone"] && !effects)
                return "Pour le projectile du " + groups[i][1] + " : choisis au moins une conséquence (téléportation, zone de dégâts ou effet).";
            }
            return "";
          },
          // Deux pouvoirs d'un même rôle ne peuvent pas partager la même commande + le même argument
          crossCheck: function (p, others) {
            if (p.kind !== "COMMAND_EFFECTS") return "";
            const same = others.some(function (o) { return o.kind === "COMMAND_EFFECTS" && o.command === p.command && o.arg === p.arg; });
            return same ? "Un autre pouvoir de ce rôle utilise déjà /" + p.command + " " + p.arg + "." : "";
          },
          fields: [
            { type: "select", id: "kind", label: "Type de pouvoir", default: "PASSIVE",
              options: ["PASSIVE", "BLOCK_EFFECT", "BLOCK_POWER", "INFO", "ITEM", "COMMAND_EFFECTS"],
              labels: { PASSIVE: "Passif simple (description seule)",
                        BLOCK_EFFECT: "Passif : empêche les joueurs proches d'obtenir des effets",
                        BLOCK_POWER: "Passif : empêche les joueurs proches d'utiliser un pouvoir",
                        INFO: "Passif : révèle le camp des joueurs restés à proximité",
                        ITEM: "Objet à activer au clic (donne un effet)",
                        COMMAND_EFFECTS: "Commande : active / désactive des effets" } },
            { type: "mctext", id: "title", label: "Nom du pouvoir", default: "", max: 40, hint: "ex. &bMon pouvoir" },
            { type: "textarea", id: "description", label: "Description (facultative)", default: "", max: 400,
              hint: "Une phrase par ligne (6 lignes maximum). Couleurs : &a, &c... (&r pour revenir à la normale)" },

            // --- Passifs : blocage d'effets / de pouvoirs, information ---
            { type: "number", id: "radius", label: "Rayon d'action (blocs)", default: 15, min: 1, max: 100, step: 1,
              showIf: { kind: ["BLOCK_EFFECT", "BLOCK_POWER", "INFO"] } },
            // plusieurs effets au choix ; Absorption et Régénération sont absents de la liste : toujours autorisés
            { type: "multiselect", id: "blockedEffects", label: "Effets empêchés (au moins un)", default: [], min: 1,
              options: Object.keys(POTION_LABELS).filter(function (k) { return PROTECTED_EFFECTS.indexOf(k) === -1; }),
              labels: POTION_LABELS, showIf: { kind: "BLOCK_EFFECT" },
              note: "Absorption et Régénération ne peuvent jamais être empêchées." },
            // Information : temps à rester dans le rayon, puis couleur des particules selon le camp
            { type: "number", id: "needSeconds", label: "Temps à passer à proximité (secondes)", default: 240, min: 5, max: 3600, step: 1,
              showIf: { kind: "INFO" } },
            { type: "teamcolors", id: "teamColors", label: "Couleur par camp", default: {}, showIf: { kind: "INFO" } },
            { type: "color", id: "defaultColor", label: "Couleur des autres camps", default: "9", showIf: { kind: "INFO" } },

            // --- Commande : /commande <argument> active le pouvoir, la même commande le désactive ---
            { type: "mycommand", id: "command", label: "Commande", default: "", showIf: { kind: "COMMAND_EFFECTS" } },
            { type: "text", id: "arg", label: "Argument (/commande <argument>)", default: "", max: 20, pattern: ARG_PATTERN,
              hint: "ex. bonus : minuscules, chiffres et _", showIf: { kind: "COMMAND_EFFECTS" } },
            // durée 0 = l'effet reste tant que le pouvoir est activé ; sinon il dure ce nombre de secondes après l'activation
            { type: "effectlist", id: "cmdEffects", label: "Effets (donnés au joueur qui active le pouvoir)", default: [], max: MAX_COMMAND_EFFECTS,
              minSeconds: 0, secondsLabel: "durée (s, 0 = tant qu'activé)", hideWho: true, allowTarget: function () { return false; },
              note: "Durée 0 : l'effet est maintenu jusqu'à ce que le joueur retape la commande. Durée en secondes : l'effet s'arrête seul. Le cooldown ne s'applique qu'à l'activation : on peut toujours désactiver.",
              showIf: { kind: "COMMAND_EFFECTS" } },

            // --- Objet à activer : matériau, clic(s) qui l'activent, puis l'action de chaque clic (clickFields) ---
            { type: "item", id: "powerItem", label: "Objet du pouvoir", default: "IRON_SWORD", showIf: { kind: "ITEM" } },
            // Affichage : programme en blocs (façon Scratch, js/blocks.js) ou formulaire classique ; les deux modifient les mêmes réglages
            { type: "select", id: "editorView", label: "Affichage", default: "BLOCKS", optional: true,
              options: ["BLOCKS", "FORM"], labels: { BLOCKS: "Blocs (comme Scratch)", FORM: "Formulaire" }, showIf: { kind: "ITEM" } },
            { type: "itemblocks", id: "blocks", label: "Programme du pouvoir", showIf: { kind: "ITEM", editorView: "BLOCKS" } },
            { type: "select", id: "clickMode", label: "Clic(s) qui activent l'objet", default: "RIGHT_ONLY", uiHideIf: BLOCKS_VIEW,
              invalidMessage: "Ajoute au moins un bloc « si clic gauche », « si clic droit » ou « si clic gauche ou clic droit » (catégorie Contrôle).",
              options: ["LEFT_ONLY", "RIGHT_ONLY", "BOTH_SAME", "DIFFERENT"],
              labels: { LEFT_ONLY: "Clic gauche uniquement", RIGHT_ONLY: "Clic droit uniquement",
                        BOTH_SAME: "Les deux clics font la même chose", DIFFERENT: "Chaque clic fait une action différente" },
              showIf: { kind: "ITEM" } },
            { type: "heading", id: "hLeft", label: "Clic gauche", showIf: { kind: "ITEM", clickMode: ["LEFT_ONLY", "DIFFERENT"] }, uiHideIf: BLOCKS_VIEW },
            { type: "heading", id: "hBoth", label: "Clic gauche et clic droit", showIf: { kind: "ITEM", clickMode: "BOTH_SAME" }, uiHideIf: BLOCKS_VIEW }
          ].concat(clickFields("a", CLICK_MODES_A), [
            { type: "heading", id: "hRight", label: "Clic droit", showIf: { kind: "ITEM", clickMode: ["RIGHT_ONLY", "DIFFERENT"] }, uiHideIf: BLOCKS_VIEW }
          ], clickFields("b", CLICK_MODES_B), [

            // --- Communs à tous les types ---
            { type: "number", id: "cooldown", label: "Cooldown (secondes, 0 = aucun)", default: 0, min: 0, max: 3600, step: 1 },
            { type: "number", id: "maxUse", label: "Utilisations maximum (0 = illimité)", default: 0, min: 0, max: 999, step: 1 }
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
