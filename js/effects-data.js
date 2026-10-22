/*
 * Effets de potion proposés aux rôles (noms exacts de PotionEffectType dans Spigot 1.8.8) et moments où ils
 * s'appliquent (EffectWhen d'UHC-Meetup). NOW et SPECIAL ne sont pas proposés : ils ne sont pas décrits
 * automatiquement par AutomaticDesc. Pour en ajouter : copie une ligne.
 */
const POTION_LABELS = {
  SPEED: "Speed", SLOW: "Lenteur", FAST_DIGGING: "Haste", SLOW_DIGGING: "Fatigue de minage",
  INCREASE_DAMAGE: "Force", JUMP: "Saut", CONFUSION: "Nausée", REGENERATION: "Régénération",
  DAMAGE_RESISTANCE: "Résistance", FIRE_RESISTANCE: "Résistance au feu", WATER_BREATHING: "Respiration aquatique",
  INVISIBILITY: "Invisibilité", BLINDNESS: "Cécité", NIGHT_VISION: "Vision nocturne", HUNGER: "Faim",
  WEAKNESS: "Faiblesse", POISON: "Poison", WITHER: "Wither", HEALTH_BOOST: "Bonus de vie",
  ABSORPTION: "Absorption", SATURATION: "Saturation"
};
const EFFECT_WHEN_LABELS = {
  PERMANENT: "Permanent", DAY: "Jour", NIGHT: "Nuit", AT_KILL: "En tuant un joueur", MID_LIFE: "Moins de 5 cœurs"
};

// Effets qu'un passif ne peut JAMAIS empêcher (même si l'utilisateur les sélectionne : le jar les ignore aussi)
const PROTECTED_EFFECTS = ["ABSORPTION", "REGENERATION"];

// Enchantements proposés pour l'objet d'un pouvoir (noms exacts d'Enchantment dans Spigot 1.8.8)
const ENCHANT_LABELS = {
  DAMAGE_ALL: "Tranchant", DAMAGE_UNDEAD: "Châtiment", DAMAGE_ARTHROPODS: "Fléau des arthropodes", KNOCKBACK: "Recul",
  FIRE_ASPECT: "Aura de feu", LOOT_BONUS_MOBS: "Butin", DIG_SPEED: "Efficacité", SILK_TOUCH: "Toucher de soie",
  DURABILITY: "Solidité", LOOT_BONUS_BLOCKS: "Fortune", ARROW_DAMAGE: "Puissance", ARROW_KNOCKBACK: "Frappe",
  ARROW_FIRE: "Flamme", ARROW_INFINITE: "Infinité", PROTECTION_ENVIRONMENTAL: "Protection", PROTECTION_FIRE: "Protection contre le feu",
  PROTECTION_FALL: "Chute amortie", PROTECTION_EXPLOSIONS: "Protection contre les explosions",
  PROTECTION_PROJECTILE: "Protection contre les projectiles", OXYGEN: "Respiration", WATER_WORKER: "Affinité aquatique",
  THORNS: "Épines", DEPTH_STRIDER: "Agilité aquatique", LUCK: "Chance de la mer", LURE: "Appât"
};
const MAX_ITEM_ENCHANTS = 5;
