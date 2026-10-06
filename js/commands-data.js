/*
 * Commandes personnalisées de l'addon : règles de validation partagées par le menu (app.js) et le générateur (jar-builder.js).
 *
 * Chaque commande a un nom (ex. "zelda" -> /zelda) et jusqu'à MAX_ALIASES alias (autres noms de la même commande, ex. "zl").
 * Le nom et les alias sont écrits dans le plugin.yml du jar : ils sont donc limités à des minuscules, chiffres et _
 * (aucun caractère spécial YAML), et ne doivent jamais entrer en conflit avec une commande déjà existante.
 */
const COMMAND_PATTERN = "^[a-z][a-z0-9_]{0,15}$"; // 1 à 16 caractères, commence par une lettre
const MAX_COMMANDS = 10;
const MAX_ALIASES = 5;

// Commandes déjà utilisées : celles d'UHC-Meetup (plugin.yml : noms + alias, types de CommandPower.CommandType) et les
// commandes de base de Minecraft / Bukkit / Spigot. Un addon qui les reprendrait serait ignoré ou casserait l'existant.
const RESERVED_COMMANDS = [
  // UHC-Meetup (plugin.yml)
  "ds", "admindsuhc", "a", "cr", "discord", "aot", "ns", "mc", "drop", "claim", "mumble", "say", "gamemode", "gm", "wl",
  "whitelist", "me", "color", "pack", "setting", "settings", "info", "inv",
  // Minecraft / Bukkit / Spigot
  "help", "op", "deop", "kick", "ban", "ban_ip", "banip", "pardon", "pardon_ip", "banlist", "stop", "reload", "rl", "restart",
  "plugins", "pl", "version", "ver", "about", "tell", "msg", "w", "r", "list", "kill", "tp", "teleport", "give", "clear",
  "time", "weather", "toggledownfall", "difficulty", "seed", "spawnpoint", "setworldspawn", "xp", "effect", "enchant",
  "defaultgamemode", "gamerule", "save_all", "save_off", "save_on", "scoreboard", "spreadplayers", "summon", "tellraw",
  "title", "trigger", "testfor", "testforblock", "worldborder", "publish", "achievement", "stats", "playsound", "particle",
  "fill", "clone", "setblock", "execute", "entitydata", "blockdata", "replaceitem", "timings", "minecraft", "bukkit", "spigot",
  "paper", "debug", "tps", "ping", "home", "spawn", "back"
];

// Pouvoir à base de commande : /nom <argument>. L'argument ne peut pas reprendre les sous-commandes de base (me, roles).
const ARG_PATTERN = "^[a-z][a-z0-9_]{0,19}$"; // 1 à 20 caractères, commence par une lettre
const RESERVED_ARGS = ["me", "roles"];
const MAX_COMMAND_EFFECTS = 8;

// Tous les noms d'une commande : son nom puis ses alias
function commandWords(entry) {
  return [entry.name].concat((entry.aliases || []).map(function (a) { return a.alias; }));
}

// Vérifie une commande par rapport aux autres (others = les autres commandes de l'addon).
// Retourne un message d'erreur, ou "" si tout va bien.
function commandProblem(entry, others) {
  const re = new RegExp(COMMAND_PATTERN);
  const words = commandWords(entry);
  for (let i = 0; i < words.length; i++) {
    if (typeof words[i] !== "string" || !re.test(words[i])) return "« " + words[i] + " » n'est pas un nom de commande valide.";
  }
  for (let i = 0; i < words.length; i++) {
    if (RESERVED_COMMANDS.indexOf(words[i]) !== -1) return "« /" + words[i] + " » existe déjà (UHC-Meetup ou Minecraft) : choisis un autre nom.";
    if (words.indexOf(words[i]) !== i) return "« /" + words[i] + " » est utilisé deux fois dans cette commande.";
  }
  for (let n = 0; n < others.length; n++) {
    const taken = commandWords(others[n]);
    for (let i = 0; i < words.length; i++) {
      if (taken.indexOf(words[i]) !== -1) return "« /" + words[i] + " » est déjà utilisé par la commande « /" + others[n].name + " ».";
    }
  }
  return "";
}
