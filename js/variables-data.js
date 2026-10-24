/*
 * Variables de l'addon (menu Variables) : règles partagées par le menu (app.js), l'éditeur à blocs et le générateur (jar-builder.js).
 *
 * Une variable a un nom (ex. "rage"), un type (INT nombre entier, DOUBLE nombre à virgule, BOOL vrai / faux), une portée
 * (PLAYER : une valeur par joueur, GLOBAL : une seule valeur pour toute la partie) et une valeur de départ, remise à chaque
 * partie. Les nombres restent entre un minimum et un maximum. Les pouvoirs la lisent et la modifient dans leurs règles
 * (blocs « variable … », conditions, et tout champ numérique d'un bloc) ; dans un message : %rage% (ma valeur) ou
 * %joueur:rage% (celle du joueur concerné). Le .jar la gère dans Variables.java.
 */
const VARIABLE_PATTERN = "^[a-z][a-z0-9_]{0,15}$";
const MAX_VARIABLES = 30;
const VARIABLE_LIMIT = 1000000; // bornes extrêmes d'un nombre
const VARIABLE_TYPES = ["INT", "DOUBLE", "BOOL"];
// noms déjà utilisés dans les textes des règles (%joueur%, %vie%, %temps%...)
const RESERVED_VARIABLES = ["joueur", "vie", "temps", "x", "y", "z", "mon_x", "mon_y", "mon_z", "fleche", "distance"];

// Vérifie une variable (others = les autres variables). Retourne un message d'erreur, ou "" si tout va bien.
function variableProblem(v, others) {
  if (!v || typeof v.name !== "string" || !new RegExp(VARIABLE_PATTERN).test(v.name))
    return "Nom de variable invalide : minuscules, chiffres et _, en commençant par une lettre (16 caractères maximum).";
  if (RESERVED_VARIABLES.indexOf(v.name) !== -1) return "« " + v.name + " » est déjà utilisé dans les textes (%" + v.name + "%) : choisis un autre nom.";
  if (VARIABLE_TYPES.indexOf(v.vtype) === -1) return "Type de variable invalide.";
  if (["PLAYER", "GLOBAL"].indexOf(v.scope) === -1) return "Portée de variable invalide.";
  if (v.vtype !== "BOOL") {
    const nums = [v.initial, v.min, v.max];
    if (nums.some(function (n) { return typeof n !== "number" || !isFinite(n) || Math.abs(n) > VARIABLE_LIMIT; }))
      return "Les valeurs de « " + v.name + " » doivent être des nombres entre -" + VARIABLE_LIMIT + " et " + VARIABLE_LIMIT + ".";
    if (v.vtype === "INT" && nums.some(function (n) { return !Number.isInteger(n); }))
      return "« " + v.name + " » est un nombre entier : valeur de départ, minimum et maximum doivent être entiers.";
    if (!(v.min <= v.initial && v.initial <= v.max)) return "Pour « " + v.name + " » : il faut minimum ≤ valeur de départ ≤ maximum.";
  } else if (typeof v.initialBool !== "boolean") return "Valeur de départ invalide pour « " + v.name + " ».";
  if ((others || []).some(function (o) { return o && o.name === v.name; })) return "Une autre variable s'appelle déjà « " + v.name + " ».";
  return "";
}

// Variables (format des règles : [{ name, type }]) d'une liste de variables du menu
function variableList(list) {
  return (list || []).filter(Boolean).map(function (v) { return { name: v.name, type: v.vtype, scope: v.scope }; });
}
