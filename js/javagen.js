/*
 * Générateur de CODE SOURCE Java (pour le bouton « Projet IntelliJ ») : mêmes classes que classgen.js, mais en .java
 * lisibles et modifiables. Chaque fonction reçoit exactement les mêmes données que son équivalent de classgen.js, pour
 * que le projet ouvert dans l'IDE donne le même plugin que le .jar compilé par le site.
 *
 * Toutes les chaînes passent par lit() : guillemets et barres obliques échappés, caractères hors ASCII (dont §) écrits
 * en \uXXXX, ce qui rend les fichiers indépendants de l'encodage choisi dans l'IDE.
 */
const JavaGen = (function () {
  "use strict";

  const PKG = "fr.nicknqck.addonbuilder";

  // Littéral de chaîne Java
  function lit(s) {
    let out = '"';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (ch === '"' || ch === "\\") out += "\\" + ch;
      // retours à la ligne / tabulations : jamais en \\uXXXX (Java traduit ces séquences AVANT de lire le code)
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (c >= 0x20 && c < 0x7f) out += ch;
      else if (c <= 0xffff) out += "\\u" + c.toString(16).padStart(4, "0");
      else { // hors BMP : paire de substitution
        const v = c - 0x10000;
        out += "\\u" + (0xd800 + (v >> 10)).toString(16) + "\\u" + (0xdc00 + (v & 0x3ff)).toString(16);
      }
    }
    return out + '"';
  }

  // Identifiant Java déjà validé par jar-builder.js : on revérifie (rien d'autre ne doit entrer dans le code)
  function id(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(name)) throw new Error("Identifiant Java invalide : " + name);
    return name;
  }
  const simple = function (className) { return id(className.split(/[./]/).pop()); };
  const header = function (pkg, imports) {
    return "package " + pkg + ";\n\n" + imports.slice().sort().map(function (i) { return "import " + i + ";\n"; }).join("") + "\n";
  };
  const GENERATED = "// Fichier généré par le Créateur d'addon UHC-Meetup : tu peux le modifier librement.\n";

  /** Enum des équipes (équivalent de ZeldaTeams) : teams [{ constant, color, name, mdj }] */
  function teamsEnum(teams) {
    const constants = teams.map(function (t) {
      return "    " + id(t.constant) + "(" + lit(t.color) + ", " + lit(t.name) + ", " + lit(t.mdj) + ")";
    }).join(",\n") + ";";
    return header(PKG, ["fr.nicknqck.interfaces.ITeam", "org.bukkit.entity.Player", "java.util.ArrayList", "java.util.List"]) + GENERATED +
      "/** Équipes de l'addon (enregistrées par Main avec InfoManager.registerITeamImplementation). */\n" +
      "public enum AddonTeams implements ITeam {\n\n" + constants + "\n\n" +
      "    private final List<Player> players = new ArrayList<>();\n" +
      "    private final String color;\n    private final String teamName;\n    private final String mdj;\n\n" +
      "    AddonTeams(String color, String teamName, String mdj) {\n" +
      "        this.color = color;\n        this.teamName = teamName;\n        this.mdj = mdj;\n    }\n\n" +
      "    @Override\n    public List<Player> getList() {\n        return this.players;\n    }\n\n" +
      "    @Override\n    public String getColor() {\n        return this.color;\n    }\n\n" +
      "    @Override\n    public String getName() {\n        return this.teamName;\n    }\n\n" +
      "    @Override\n    public String getMdj() {\n        return this.mdj;\n    }\n\n" +
      "    @Override\n    public boolean isSolo() {\n        return false;\n    }\n\n" +
      "    @Override\n    public void addPlayer(Player player) {\n        this.players.add(player);\n    }\n}\n";
  }

  /** Enum des rôles (équivalent de ZRoles) : roles [{ constant, teamClass, teamConst, mdj, nmb, material, itemName, gDesign }] */
  function rolesEnum(roles) {
    const imports = ["fr.nicknqck.interfaces.IRoles", "fr.nicknqck.interfaces.ITeam", "org.bukkit.inventory.ItemStack"];
    const constants = roles.map(function (r) {
      let team;
      if (r.teamClass === PKG + ".AddonTeams") team = "AddonTeams." + id(r.teamConst);
      else if (r.teamClass === "fr.nicknqck.enums.TeamList") {
        team = "TeamList." + id(r.teamConst);
        if (imports.indexOf("fr.nicknqck.enums.TeamList") === -1) imports.push("fr.nicknqck.enums.TeamList");
      } else throw new Error("Classe d'équipes inconnue : " + r.teamClass);
      if (!Number.isInteger(r.nmb)) throw new Error("Numéro invalide pour " + r.constant);
      return "    " + id(r.constant) + "(" + team + ", " + lit(r.mdj) + ", " + r.nmb + ", RoleSupport.item(" + lit(r.material) + ", " +
        lit(r.itemName) + "), " + lit(r.gDesign) + ")";
    }).join(",\n") + ";";
    return header(PKG, imports) + GENERATED +
      "/** Rôles de l'addon (enregistrés par RegisterRoleListener) : équipe, mode de jeu, numéro, objet du menu, concepteur. */\n" +
      "public enum AddonRoles implements IRoles<AddonRoles> {\n\n" + constants + "\n\n" +
      "    private final ITeam iTeam;\n    private final String mdj;\n    private final int nmb;\n" +
      "    private final ItemStack itemInMenu;\n    private final String gDesign;\n\n" +
      "    AddonRoles(ITeam iTeam, String mdj, int nmb, ItemStack itemInMenu, String gDesign) {\n" +
      "        this.iTeam = iTeam;\n        this.mdj = mdj;\n        this.nmb = nmb;\n        this.itemInMenu = itemInMenu;\n        this.gDesign = gDesign;\n    }\n\n" +
      "    @Override\n    public ITeam getTeam() {\n        return this.iTeam;\n    }\n\n" +
      "    @Override\n    public String getMdj() {\n        return this.mdj;\n    }\n\n" +
      "    @Override\n    public int getNmb() {\n        return this.nmb;\n    }\n\n" +
      "    @Override\n    public ItemStack getItem() {\n        return this.itemInMenu;\n    }\n\n" +
      "    @Override\n    public String getGDesign() {\n        return this.gDesign;\n    }\n}\n";
  }

  /**
   * Classe d'un rôle (équivalent de Darunia.java).
   * @param spec { constant, displayName, noFall, effects: [{ type, ticks, amp, when }], powers: [{ className, item }] }
   */
  function roleClass(spec) {
    const name = id(spec.constant);
    const imports = ["fr.nicknqck.GameState", "fr.nicknqck.interfaces.IRoles", "fr.nicknqck.interfaces.ITeam",
      "fr.nicknqck.roles.builder.RoleBase", "net.md_5.bungee.api.chat.TextComponent", "java.util.UUID",
      PKG + ".AddonRoles", PKG + ".RoleSupport"];
    const timed = spec.noFall === "DAY" || spec.noFall === "NIGHT";
    const custom = timed || !!spec.extra;
    if (!custom) imports.push("fr.nicknqck.roles.builder.AutomaticDesc");
    const body = [];
    if (spec.noFall && spec.noFall !== "NONE") {
      body.push("        // NoFall " + (spec.noFall === "PERMANENT" ? "permanent" : spec.noFall === "DAY" ? "le jour seulement" : "la nuit seulement"));
      body.push("        RoleSupport.noFall(this, " + lit(spec.noFall) + ");");
    }
    if (spec.revive) {
      body.push("        // une fois par partie, la mort est annulée : réapparition, " + spec.revive.hearts + " cœur(s) max en moins");
      body.push("        RoleSupport.revive(this, " + spec.revive.hearts + ", " + spec.revive.radius + ");");
    }
    (spec.powers || []).forEach(function (p) {
      const cls = simple(p.className);
      imports.push(PKG + ".powers." + cls);
      body.push("        addPower(new " + cls + "(this)" + (p.item ? ", true" : "") + ");" + (p.item ? " // true : l'objet est donné au joueur" : ""));
    });
    if ((spec.effects || []).length) {
      imports.push("fr.nicknqck.enums.EffectWhen", "org.bukkit.potion.PotionEffect", "org.bukkit.potion.PotionEffectType");
      spec.effects.forEach(function (e) {
        if (!/^[A-Z_]{2,30}$/.test(e.type) || !/^[A-Z_]{2,20}$/.test(e.when)) throw new Error("Effet invalide pour " + name);
        body.push("        givePotionEffect(new PotionEffect(PotionEffectType.getByName(" + lit(e.type) + "), " + e.ticks + ", " + e.amp +
          ", false, false), EffectWhen." + e.when + ");");
      });
    }
    const component = custom
      ? "        // description automatique + précisions (NoFall le jour / la nuit, résurrection...), voir RoleSupport.component\n" +
        "        return RoleSupport.component(this, " + lit(spec.noFall || "NONE") + ", " + lit(spec.extra || "") + ");\n"
      : "        return AutomaticDesc.createFullAutomaticDesc(this);\n";
    return header(PKG + ".roles", imports) + GENERATED +
      "public class " + name + " extends RoleBase {\n\n" +
      "    public " + name + "(UUID player) {\n        super(player);\n    }\n\n" +
      "    @Override\n    public String getName() {\n        return " + lit(spec.displayName) + ";\n    }\n\n" +
      "    @Override\n    public IRoles<?> getRoles() {\n        return AddonRoles." + name + ";\n    }\n\n" +
      "    @Override\n    public ITeam getOriginTeam() {\n        return getRoles().getTeam();\n    }\n\n" +
      "    @Override\n    public TextComponent getComponent() {\n" + component + "    }\n\n" +
      "    @Override\n    public void RoleGiven(GameState gameState) {\n" + (body.length ? body.join("\n") + "\n" : "") + "    }\n}\n";
  }

  /**
   * Pouvoir (équivalent de PatiencePower, d'un ItemPower comme celui de Gyomei, ou d'un pouvoir commande).
   * @param spec mêmes données que ClassGen.powerClass : { className, name, cooldown, maxUse, descriptions, kind, radius,
   *             param, material, itemName, command, arg }
   */
  function powerClass(spec) {
    const name = simple(spec.className);
    const ITEM = spec.kind === "ITEM", COMMAND = spec.kind === "COMMAND_EFFECTS" || spec.kind === "COMMAND_RULES";
    const CMD_CLASS = spec.kind === "COMMAND_RULES" ? "CommandRulesPower" : "CommandEffectsPower";
    const imports = ["fr.nicknqck.roles.builder.RoleBase"];
    if (spec.cooldown > 0) imports.push("fr.nicknqck.utils.powers.Cooldown");
    let parent;
    if (ITEM) { parent = "ItemPower"; imports.push("fr.nicknqck.utils.powers.ItemPower", PKG + ".RoleSupport"); }
    else if (COMMAND) { parent = CMD_CLASS; imports.push(PKG + "." + CMD_CLASS); }
    else { parent = "Power"; imports.push("fr.nicknqck.utils.powers.Power"); }
    if (!ITEM && ((!COMMAND && spec.kind && spec.kind !== "PASSIVE") || spec.rules)) imports.push(PKG + ".RoleSupport");
    if (!COMMAND) imports.push("org.bukkit.entity.Player", "java.util.Map");
    if (!Number.isInteger(spec.cooldown) || !Number.isInteger(spec.maxUse) || !Number.isInteger(spec.radius || 0)) throw new Error("Nombre invalide pour " + name);

    const cooldown = spec.cooldown > 0 ? "new Cooldown(" + spec.cooldown + ")" : "null";
    const args = [lit(spec.name)];
    if (COMMAND) args.push(lit(spec.command), lit(spec.arg));
    args.push(cooldown);
    if (ITEM) args.push("RoleSupport.itemBuilder(" + lit(spec.material) + ", " + lit(spec.itemName) + (spec.look ? ", " + lit(spec.look) : "") + ")");
    args.push("role");
    if (COMMAND) args.push(lit(spec.param));
    spec.descriptions.forEach(function (d) { args.push(lit(d)); });

    const ctor = ["        super(" + args.join(",\n                ") + ");"];
    if (spec.maxUse > 0) ctor.push("        setMaxUse(" + spec.maxUse + ");");
    if (ITEM) {
      ctor.push("        // action de chaque clic : \"gauche|droit|cooldownGauche;cooldownDroit\" (voir ItemPowerSupport)");
      ctor.push("        RoleSupport.itemInit(this, " + lit(spec.param) + ");");
    } else if (!COMMAND && spec.kind && spec.kind !== "PASSIVE") {
      ctor.push("        RoleSupport.passive(this, " + lit(spec.kind) + ", " + (spec.radius || 0) + ", " + lit(spec.param || "") + ");");
    }
    if (spec.rules) {
      ctor.push("        // règles « quand … » du pouvoir, en JSON (voir RuleEngine)");
      ctor.push("        RoleSupport.rules(this, " + lit(spec.rules) + ");");
    }
    let onUse = "";
    if (ITEM) onUse = "\n    @Override\n    public boolean onUse(Player player, Map<String, Object> map) {\n        return RoleSupport.itemUse(this, player, map);\n    }\n";
    else if (!COMMAND) onUse = "\n    @Override\n    public boolean onUse(Player player, Map<String, Object> map) {\n        return true;\n    }\n";
    const comment = COMMAND ? "/** /" + spec.command + " " + spec.arg + (spec.kind === "COMMAND_RULES"
        ? " : lance les règles « quand j'utilise ce pouvoir » (voir CommandRulesPower). */\n"
        : " : active / désactive des effets (voir CommandEffectsPower). */\n")
      : ITEM ? "/** Objet à activer au clic (voir ItemPowerSupport). */\n"
      : spec.kind && spec.kind !== "PASSIVE" ? "/** Passif " + spec.kind + " (voir RoleSupport.passive). */\n" : "/** Passif : description seule. */\n";
    return header(PKG + ".powers", imports) + GENERATED + comment +
      "public class " + name + " extends " + parent + " {\n\n" +
      "    public " + name + "(RoleBase role) {\n" + ctor.join("\n") + "\n    }\n" + onUse + "}\n";
  }

  return { teamsEnum: teamsEnum, rolesEnum: rolesEnum, roleClass: roleClass, powerClass: powerClass, lit: lit };
})();
