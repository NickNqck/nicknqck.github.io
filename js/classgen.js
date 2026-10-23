/*
 * Générateur de fichier .class (Java 8, version 52) pour l'enum des équipes de l'addon.
 * Aucune dépendance. Le code généré ne contient ni boucle ni branchement : pas besoin de StackMapTable.
 *
 * Classe produite (équivalent Java) :
 *   public enum AddonTeams implements ITeam {
 *       <CONSTANTE>("§c", "§cNom", "mdj"), ...;
 *       private final List<Player> players = new ArrayList<>();
 *       getList() / getColor() / getName() / getMdj() / isSolo() = false / addPlayer(Player)
 *   }
 */
const ClassGen = (function () {
  "use strict";

  const u2 = function (n) { return [(n >> 8) & 255, n & 255]; };
  const u4 = function (n) { return [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  // "Modified UTF-8" de la JVM (le signe § occupe 2 octets, le caractère nul aussi)
  function mutf8(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 1 && c <= 0x7f) out.push(c);
      else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  }

  // Table des constantes de la classe (constant pool) avec dédoublonnage
  function Pool() { this.out = []; this.n = 1; this.seen = Object.create(null); }
  Pool.prototype.entry = function (key, bytes) {
    if (this.seen[key] !== undefined) return this.seen[key];
    for (let i = 0; i < bytes.length; i++) this.out.push(bytes[i]);
    this.seen[key] = this.n;
    return this.n++;
  };
  Pool.prototype.utf8 = function (s) { const b = mutf8(s); return this.entry("U\0" + s, [1].concat(u2(b.length), b)); };
  Pool.prototype.cls = function (n) { const i = this.utf8(n); return this.entry("C\0" + n, [7].concat(u2(i))); };
  Pool.prototype.str = function (s) { const i = this.utf8(s); return this.entry("S\0" + s, [8].concat(u2(i))); };
  Pool.prototype.nat = function (n, d) {
    const a = this.utf8(n), b = this.utf8(d);
    return this.entry("N\0" + n + "\0" + d, [12].concat(u2(a), u2(b)));
  };
  Pool.prototype.ref = function (tag, c, n, d) { // 9 = champ, 10 = méthode, 11 = méthode d'interface
    const ci = this.cls(c), ni = this.nat(n, d);
    return this.entry("R" + tag + "\0" + c + "\0" + n + "\0" + d, [tag].concat(u2(ci), u2(ni)));
  };

  /**
   * @param className ex. "fr/nicknqck/addonbuilder/AddonTeams"
   * @param iface     ex. "fr/nicknqck/interfaces/ITeam"
   * @param teams     [{ constant, color, name, mdj }] : constant = nom de la constante d'enum
   */
  function teamsEnum(className, iface, teams) {
    if (!teams.length || teams.length > 100) throw new Error("Nombre d'équipes invalide.");
    const P = new Pool();
    const SELF = "L" + className + ";", ARR = "[" + SELF, STR = "Ljava/lang/String;", LIST = "Ljava/util/List;";
    const thisC = P.cls(className), superC = P.cls("java/lang/Enum"), ifaceC = P.cls(iface);
    const f = function (name, desc) { return u2(P.ref(9, className, name, desc)); };
    const m = function (owner, name, desc) { return u2(P.ref(10, owner, name, desc)); };
    const initDesc = "(Ljava/lang/String;I" + STR + STR + STR + ")V";

    // Champs
    const fields = [];
    const field = function (access, name, desc) { fields.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(0))); };
    teams.forEach(function (t) { field(0x4019, t.constant, SELF); });   // public static final enum
    field(0x101a, "$VALUES", ARR);                                       // private static final synthetic
    field(0x0012, "players", LIST);                                      // private final
    field(0x0012, "color", STR);
    field(0x0012, "teamName", STR);
    field(0x0012, "mdj", STR);

    // Méthodes
    const methods = [];
    const method = function (access, name, desc, stack, locals, code) {
      methods.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(1),
        u2(P.utf8("Code")), u4(12 + code.length), u2(stack), u2(locals), u4(code.length), code, u2(0), u2(0)));
    };
    const getter = function (name, desc, fieldName) {
      method(0x0001, name, desc, 1, 1, [0x2a, 0xb4].concat(f(fieldName, desc.substring(2)), [0xb0]));
    };

    // Constructeur privé (nom, ordinal, couleur, nom affiché, mdj)
    method(0x0002, "<init>", initDesc, 4, 6,
      [0x2a, 0x2b, 0x1c, 0xb7].concat(m("java/lang/Enum", "<init>", "(Ljava/lang/String;I)V"),
        [0x2a, 0xbb], u2(P.cls("java/util/ArrayList")), [0x59, 0xb7], m("java/util/ArrayList", "<init>", "()V"),
        [0xb5], f("players", LIST),
        [0x2a, 0x19, 3, 0xb5], f("color", STR),
        [0x2a, 0x19, 4, 0xb5], f("teamName", STR),
        [0x2a, 0x19, 5, 0xb5], f("mdj", STR),
        [0xb1]));

    // values() et valueOf(String)
    method(0x0009, "values", "()" + ARR, 1, 0,
      [0xb2].concat(f("$VALUES", ARR), [0xb6], m(ARR, "clone", "()Ljava/lang/Object;"), [0xc0], u2(P.cls(ARR)), [0xb0]));
    method(0x0009, "valueOf", "(" + STR + ")" + SELF, 2, 1,
      [0x13].concat(u2(thisC), [0x2a, 0xb8], m("java/lang/Enum", "valueOf", "(Ljava/lang/Class;Ljava/lang/String;)Ljava/lang/Enum;"),
        [0xc0], u2(thisC), [0xb0]));

    // Méthodes de ITeam
    getter("getList", "()" + LIST, "players");
    getter("getColor", "()" + STR, "color");
    getter("getName", "()" + STR, "teamName");
    getter("getMdj", "()" + STR, "mdj");
    method(0x0001, "isSolo", "()Z", 1, 1, [0x03, 0xac]);
    method(0x0001, "addPlayer", "(Lorg/bukkit/entity/Player;)V", 2, 2,
      [0x2a, 0xb4].concat(f("players", LIST), [0x2b, 0xb9], u2(P.ref(11, "java/util/List", "add", "(Ljava/lang/Object;)Z")), [2, 0, 0x57, 0xb1]));

    // Bloc static : création des constantes puis du tableau $VALUES
    let clinit = [];
    teams.forEach(function (t, i) {
      clinit = clinit.concat([0xbb], u2(thisC), [0x59, 0x13], u2(P.str(t.constant)), [0x10, i],
        [0x13], u2(P.str(t.color)), [0x13], u2(P.str(t.name)), [0x13], u2(P.str(t.mdj)),
        [0xb7], m(className, "<init>", initDesc), [0xb3], f(t.constant, SELF));
    });
    clinit = clinit.concat([0x10, teams.length, 0xbd], u2(thisC));
    teams.forEach(function (t, i) { clinit = clinit.concat([0x59, 0x10, i, 0xb2], f(t.constant, SELF), [0x53]); });
    clinit = clinit.concat([0xb3], f("$VALUES", ARR), [0xb1]);
    method(0x0008, "<clinit>", "()V", 8, 0, clinit);

    // Assemblage final
    const all = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52].concat(u2(P.n), P.out,
      u2(0x4031), u2(thisC), u2(superC), u2(1), u2(ifaceC), u2(fields.length));
    fields.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, u2(methods.length));
    methods.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, u2(0)); // aucun attribut de classe
    return new Uint8Array(all);
  }

  /**
   * Enum des rôles (équivalent de ZRoles) :
   *   Link(ITeam team, String mdj, int nmb, ItemStack itemInMenu, String gDesign)
   * L'équipe et l'objet sont obtenus par RoleSupport.team(classe, constante) et RoleSupport.item(matériau, nom),
   * deux méthodes du jar modèle : le bytecode généré reste ainsi très simple.
   * @param roles [{ constant, teamClass, teamConst, mdj, nmb, material, itemName, gDesign }]
   */
  function rolesEnum(className, iface, support, roles) {
    if (!roles.length || roles.length > 120) throw new Error("Nombre de rôles invalide.");
    const P = new Pool();
    const SELF = "L" + className + ";", ARR = "[" + SELF, STR = "Ljava/lang/String;";
    const TEAM = "Lfr/nicknqck/interfaces/ITeam;", ITEM = "Lorg/bukkit/inventory/ItemStack;";
    const thisC = P.cls(className), superC = P.cls("java/lang/Enum"), ifaceC = P.cls(iface), teamC = P.cls("fr/nicknqck/interfaces/ITeam");
    const f = function (name, desc) { return u2(P.ref(9, className, name, desc)); };
    const m = function (owner, name, desc) { return u2(P.ref(10, owner, name, desc)); };
    const initDesc = "(Ljava/lang/String;I" + TEAM + STR + "I" + ITEM + STR + ")V";
    const sig = "Ljava/lang/Enum<" + SELF + ">;L" + iface + "<" + SELF + ">;";

    const fields = [];
    const field = function (access, name, desc) { fields.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(0))); };
    roles.forEach(function (r) { field(0x4019, r.constant, SELF); });
    field(0x101a, "$VALUES", ARR);
    field(0x0012, "iTeam", TEAM);
    field(0x0012, "mdj", STR);
    field(0x0012, "nmb", "I");
    field(0x0012, "itemInMenu", ITEM);
    field(0x0012, "gDesign", STR);

    const methods = [];
    const method = function (access, name, desc, stack, locals, code) {
      methods.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(1),
        u2(P.utf8("Code")), u4(12 + code.length), u2(stack), u2(locals), u4(code.length), code, u2(0), u2(0)));
    };
    const getter = function (name, desc, fieldName) {
      const ret = desc === "()I" ? 0xac : 0xb0;
      method(0x0001, name, desc, 1, 1, [0x2a, 0xb4].concat(f(fieldName, desc.substring(2)), [ret]));
    };

    method(0x0002, "<init>", initDesc, 3, 8,
      [0x2a, 0x2b, 0x1c, 0xb7].concat(m("java/lang/Enum", "<init>", "(Ljava/lang/String;I)V"),
        [0x2a, 0x19, 3, 0xb5], f("iTeam", TEAM),
        [0x2a, 0x19, 4, 0xb5], f("mdj", STR),
        [0x2a, 0x15, 5, 0xb5], f("nmb", "I"),
        [0x2a, 0x19, 6, 0xb5], f("itemInMenu", ITEM),
        [0x2a, 0x19, 7, 0xb5], f("gDesign", STR),
        [0xb1]));
    method(0x0009, "values", "()" + ARR, 1, 0,
      [0xb2].concat(f("$VALUES", ARR), [0xb6], m(ARR, "clone", "()Ljava/lang/Object;"), [0xc0], u2(P.cls(ARR)), [0xb0]));
    method(0x0009, "valueOf", "(" + STR + ")" + SELF, 2, 1,
      [0x13].concat(u2(thisC), [0x2a, 0xb8], m("java/lang/Enum", "valueOf", "(Ljava/lang/Class;Ljava/lang/String;)Ljava/lang/Enum;"),
        [0xc0], u2(thisC), [0xb0]));
    getter("getTeam", "()" + TEAM, "iTeam");
    getter("getMdj", "()" + STR, "mdj");
    getter("getNmb", "()I", "nmb");
    getter("getItem", "()" + ITEM, "itemInMenu");
    getter("getGDesign", "()" + STR, "gDesign");

    const ldc = function (str) { return [0x13].concat(u2(P.str(str))); };
    let clinit = [];
    roles.forEach(function (r, i) {
      clinit = clinit.concat([0xbb], u2(thisC), [0x59], ldc(r.constant), [0x10, i],
        ldc(r.teamClass), ldc(r.teamConst), [0xb8], m(support, "team", "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;"), [0xc0], u2(teamC),
        ldc(r.mdj), [0x10, r.nmb],
        ldc(r.material), ldc(r.itemName), [0xb8], m(support, "item", "(Ljava/lang/String;Ljava/lang/String;)" + ITEM),
        ldc(r.gDesign),
        [0xb7], m(className, "<init>", initDesc), [0xb3], f(r.constant, SELF));
    });
    clinit = clinit.concat([0x10, roles.length, 0xbd], u2(thisC));
    roles.forEach(function (r, i) { clinit = clinit.concat([0x59, 0x10, i, 0xb2], f(r.constant, SELF), [0x53]); });
    clinit = clinit.concat([0xb3], f("$VALUES", ARR), [0xb1]);
    method(0x0008, "<clinit>", "()V", 12, 0, clinit);

    // Attribut "Signature" de la classe : Enum<AddonRoles> implements IRoles<AddonRoles>
    const sigName = P.utf8("Signature"), sigIdx = P.utf8(sig);

    const all = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52].concat(u2(P.n), P.out,
      u2(0x4031), u2(thisC), u2(superC), u2(1), u2(ifaceC), u2(fields.length));
    fields.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, u2(methods.length));
    methods.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, [].concat(u2(1), u2(sigName), u4(2), u2(sigIdx)));
    return new Uint8Array(all);
  }

  /**
   * Classe d'un rôle (équivalent de Darunia.java) : public class X extends RoleBase
   *   getName()        = nom du rôle, sans couleur
   *   getRoles()       = constante correspondante de AddonRoles
   *   getOriginTeam()  = getRoles().getTeam()
   *   getComponent()   = AutomaticDesc.createFullAutomaticDesc(this)
   *   RoleGiven(GameState) = un appel RoleSupport.effect(...) par effet (givePotionEffect via la réflexion)
   * @param spec { className, enumClass, constant, displayName, support, powers: [classe de pouvoir], effects: [{ type, ticks, amp, when }] }
   */
  function roleClass(spec) {
    const P = new Pool();
    const SUPER = "fr/nicknqck/roles/builder/RoleBase";
    const IROLES = "Lfr/nicknqck/interfaces/IRoles;", ITEAM = "Lfr/nicknqck/interfaces/ITeam;";
    const TC = "Lnet/md_5/bungee/api/chat/TextComponent;";
    const thisC = P.cls(spec.className), superC = P.cls(SUPER);
    const m = function (owner, name, desc) { return u2(P.ref(10, owner, name, desc)); };
    const methods = [];
    const method = function (access, name, desc, stack, locals, code) {
      methods.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(1),
        u2(P.utf8("Code")), u4(12 + code.length), u2(stack), u2(locals), u4(code.length), code, u2(0), u2(0)));
    };

    method(0x0001, "<init>", "(Ljava/util/UUID;)V", 2, 2,
      [0x2a, 0x2b, 0xb7].concat(m(SUPER, "<init>", "(Ljava/util/UUID;)V"), [0xb1]));
    method(0x0001, "getName", "()Ljava/lang/String;", 1, 1, [0x13].concat(u2(P.str(spec.displayName)), [0xb0]));
    method(0x0001, "getRoles", "()" + IROLES, 1, 1,
      [0xb2].concat(u2(P.ref(9, spec.enumClass, spec.constant, "L" + spec.enumClass + ";")), [0xb0]));
    method(0x0001, "getOriginTeam", "()" + ITEAM, 1, 1,
      [0x2a, 0xb6].concat(m(spec.className, "getRoles", "()" + IROLES), [0xb9],
        u2(P.ref(11, "fr/nicknqck/interfaces/IRoles", "getTeam", "()" + ITEAM)), [1, 0, 0xb0]));
    if (spec.noFall === "DAY" || spec.noFall === "NIGHT" || spec.extra) {
      // NoFall limité au jour / à la nuit (getText() d'AutomaticDesc écrirait « de manière permanente ») ou lignes en plus
      // (résurrection...) : la description est construite par RoleSupport.component(this, noFall, lignes).
      method(0x0001, "getComponent", "()" + TC, 3, 1,
        [0x2a, 0x13].concat(u2(P.str(spec.noFall || "NONE")), [0x13], u2(P.str(spec.extra || "")), [0xb8],
          m(spec.support, "component", "(Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;)" + TC), [0xb0]));
    } else {
      method(0x0001, "getComponent", "()" + TC, 1, 1,
        [0x2a, 0xb8].concat(m("fr/nicknqck/roles/builder/AutomaticDesc", "createFullAutomaticDesc",
          "(Lfr/nicknqck/interfaces/IRole;)" + TC), [0xb0]));
    }

    let code = [];
    if (spec.noFall && spec.noFall !== "NONE") { // RoleSupport.noFall(this, "PERMANENT" | "DAY" | "NIGHT") : setNoFall de RoleBase
      code = code.concat([0x2a, 0x13], u2(P.str(spec.noFall)), [0xb8], m(spec.support, "noFall", "(Ljava/lang/Object;Ljava/lang/String;)V"));
    }
    (spec.powers || []).forEach(function (pw) { // RoleSupport.addPower / addItemPower(this, "classe du pouvoir")
      const cls = typeof pw === "string" ? pw : pw.className;
      code = code.concat([0x2a, 0x13], u2(P.str(cls)), [0xb8],
        m(spec.support, pw.item ? "addItemPower" : "addPower", "(Ljava/lang/Object;Ljava/lang/String;)V"));
    });
    if (spec.revive) { // RoleSupport.revive(this, cœurs perdus, rayon)
      if (!Number.isInteger(spec.revive.hearts) || !Number.isInteger(spec.revive.radius)) throw new Error("Résurrection invalide.");
      code = code.concat([0x2a, 0x11], u2(spec.revive.hearts), [0x11], u2(spec.revive.radius), [0xb8],
        m(spec.support, "revive", "(Ljava/lang/Object;II)V"));
    }
    spec.effects.forEach(function (e) {
      if (e.ticks < 1 || e.ticks > 32767 || e.amp < 0 || e.amp > 127) throw new Error("Effet hors limites.");
      code = code.concat([0x2a, 0x13], u2(P.str(e.type)), [0x11], u2(e.ticks), [0x10, e.amp, 0x13], u2(P.str(e.when)),
        [0xb8], m(spec.support, "effect", "(Ljava/lang/Object;Ljava/lang/String;IILjava/lang/String;)V"));
    });
    code.push(0xb1);
    method(0x0001, "RoleGiven", "(Lfr/nicknqck/GameState;)V", 5, 2, code);

    const all = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52].concat(u2(P.n), P.out,
      u2(0x0021), u2(thisC), u2(superC), u2(0), u2(0), u2(methods.length));
    methods.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, u2(0));
    return new Uint8Array(all);
  }

  /**
   * Pouvoir (sous-classe de Power, d'ItemPower pour un objet à activer, ou de CommandEffectsPower pour une commande) :
   *   public class X extends Power|ItemPower {
   *     public X(RoleBase role) { super(name, cooldown, [ItemBuilder,] role, descriptions...); setMaxUse(n); ... }
   *     public boolean onUse(Player, Map) { return true;  |  return RoleSupport.itemUse(this, player, map); }
   *   }
   *   public class X extends CommandEffectsPower {   // kind COMMAND_EFFECTS : tout le comportement est dans la classe mère
   *     public X(RoleBase role) { super(name, commande, argument, cooldown, role, effets, descriptions...); setMaxUse(n); }
   *   }
   * @param spec { className, name, cooldown (secondes, 0 = aucun), maxUse (0 = illimité, laisse -1), descriptions: [ligne],
   *               kind: PASSIVE | BLOCK_EFFECT | BLOCK_POWER | INFO | ITEM, radius, param, material, itemName }
   */
  function powerClass(spec) {
    const ITEM = spec.kind === "ITEM", COMMAND = spec.kind === "COMMAND_EFFECTS";
    const POWER = "fr/nicknqck/utils/powers/Power", ITEMPOWER = "fr/nicknqck/utils/powers/ItemPower";
    const COOLDOWN = "fr/nicknqck/utils/powers/Cooldown", BUILDER = "fr/nicknqck/utils/itembuilder/ItemBuilder";
    const SUPPORT = "fr/nicknqck/addonbuilder/RoleSupport", ROLE = "Lfr/nicknqck/roles/builder/RoleBase;";
    const superName = ITEM ? ITEMPOWER : COMMAND ? "fr/nicknqck/addonbuilder/CommandEffectsPower" : POWER;
    const P = new Pool();
    const thisC = P.cls(spec.className), superC = P.cls(superName);
    const m = function (owner, name, desc) { return u2(P.ref(10, owner, name, desc)); };
    if (spec.descriptions.length > 20) throw new Error("Trop de lignes de description.");
    const methods = [];
    const method = function (access, name, desc, stack, locals, code) {
      methods.push([].concat(u2(access), u2(P.utf8(name)), u2(P.utf8(desc)), u2(1),
        u2(P.utf8("Code")), u4(12 + code.length), u2(stack), u2(locals), u4(code.length), code, u2(0), u2(0)));
    };

    const STR = "Ljava/lang/String;";
    const superDesc = COMMAND
      ? "(" + STR + STR + STR + "L" + COOLDOWN + ";" + ROLE + STR + "[" + STR + ")V" // nom, commande, argument, cooldown, rôle, effets, descriptions
      : "(Ljava/lang/String;L" + COOLDOWN + ";" + (ITEM ? "L" + BUILDER + ";" : "") + ROLE + "[Ljava/lang/String;)V";
    // ordre des arguments : nom, cooldown, [objet], rôle (aload_1), tableau de descriptions
    method(0x0001, "<init>", "(" + ROLE + ")V", 14, 2, (function () {
      let c = [0x2a, 0x13].concat(u2(P.str(spec.name)));
      if (COMMAND) c = c.concat([0x13], u2(P.str(spec.command)), [0x13], u2(P.str(spec.arg)));
      c = c.concat(spec.cooldown > 0
        ? [0xbb].concat(u2(P.cls(COOLDOWN)), [0x59, 0x11], u2(spec.cooldown), [0xb7], m(COOLDOWN, "<init>", "(I)V"))
        : [0x01]);
      if (ITEM) {
        // avec une apparence (brillant, enchantements, incassable) : itemBuilder(matériau, nom, apparence)
        c = c.concat([0x13], u2(P.str(spec.material)), [0x13], u2(P.str(spec.itemName)));
        c = spec.look
          ? c.concat([0x13], u2(P.str(spec.look)), [0xb8], m(SUPPORT, "itemBuilder", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)L" + BUILDER + ";"))
          : c.concat([0xb8], m(SUPPORT, "itemBuilder", "(Ljava/lang/String;Ljava/lang/String;)L" + BUILDER + ";"));
      }
      c.push(0x2b); // le rôle (aload_1)
      if (COMMAND) c = c.concat([0x13], u2(P.str(spec.param)));
      c = c.concat([0x11], u2(spec.descriptions.length), [0xbd], u2(P.cls("java/lang/String")));
      spec.descriptions.forEach(function (line, i) { c = c.concat([0x59, 0x11], u2(i), [0x13], u2(P.str(line)), [0x53]); });
      c = c.concat([0xb7], m(superName, "<init>", superDesc));
      if (spec.maxUse > 0) c = c.concat([0x2a, 0x11], u2(spec.maxUse), [0xb6], m(spec.className, "setMaxUse", "(I)V"));
      if (ITEM) { // RoleSupport.itemInit(this, "action gauche|action droite")
        c = c.concat([0x2a, 0x13], u2(P.str(spec.param)), [0xb8], m(SUPPORT, "itemInit", "(L" + ITEMPOWER + ";Ljava/lang/String;)V"));
      } else if (spec.kind && spec.kind !== "PASSIVE" && !COMMAND) { // RoleSupport.passive(this, kind, rayon, paramètre)
        c = c.concat([0x2a, 0x13], u2(P.str(spec.kind)), [0x10, spec.radius, 0x13], u2(P.str(spec.param || "")),
          [0xb8], m(SUPPORT, "passive", "(Ljava/lang/Object;Ljava/lang/String;ILjava/lang/String;)V"));
      }
      if (spec.rules) { // RoleSupport.rules(this, "[règles en JSON]") (voir RuleEngine)
        c = c.concat([0x2a, 0x13], u2(P.str(spec.rules)), [0xb8], m(SUPPORT, "rules", "(Ljava/lang/Object;Ljava/lang/String;)V"));
      }
      c.push(0xb1);
      return c;
    })());
    if (ITEM) {
      method(0x0001, "onUse", "(Lorg/bukkit/entity/Player;Ljava/util/Map;)Z", 3, 3,
        [0x2a, 0x2b, 0x2c, 0xb8].concat(m(SUPPORT, "itemUse", "(L" + ITEMPOWER + ";Lorg/bukkit/entity/Player;Ljava/util/Map;)Z"), [0xac]));
    } else if (!COMMAND) { // un pouvoir commande hérite de onUse (CommandEffectsPower)
      method(0x0001, "onUse", "(Lorg/bukkit/entity/Player;Ljava/util/Map;)Z", 1, 3, [0x04, 0xac]);
    }

    const all = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52].concat(u2(P.n), P.out,
      u2(0x0021), u2(thisC), u2(superC), u2(0), u2(0), u2(methods.length));
    methods.forEach(function (b) { all.push.apply(all, b); });
    all.push.apply(all, u2(0));
    return new Uint8Array(all);
  }

  // lecture du "Modified UTF-8" (inverse de mutf8)
  function unmutf8(b, from, len) {
    let s = "";
    for (let i = from, end = from + len; i < end;) {
      const c = b[i];
      if (c < 0x80) { s += String.fromCharCode(c); i += 1; }
      else if ((c & 0xe0) === 0xc0) { s += String.fromCharCode(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2; }
      else { s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)); i += 3; }
    }
    return s;
  }

  /**
   * Change le package d'une classe compilée (comme le « relocate » de Shadow) : chaque texte de la table des constantes
   * (noms de classes, descripteurs, signatures, textes du code) voit `from` remplacé par `to`, sous ses deux formes
   * ("fr/a/b" et "fr.a.b"). Le reste du fichier est recopié tel quel : seules les entrées texte changent de taille.
   */
  function relocate(bytes, from, to) {
    const b = bytes, out = [];
    const fromSlash = from.replace(/\./g, "/"), toSlash = to.replace(/\./g, "/");
    if (b[0] !== 0xca || b[1] !== 0xfe || b[2] !== 0xba || b[3] !== 0xbe) throw new Error("Fichier .class invalide.");
    for (let i = 0; i < 8; i++) out.push(b[i]);
    const count = (b[8] << 8) | b[9];
    out.push(b[8], b[9]);
    let pos = 10;
    for (let n = 1; n < count; n++) {
      const tag = b[pos];
      if (tag === 1) {
        const len = (b[pos + 1] << 8) | b[pos + 2];
        const text = unmutf8(b, pos + 3, len);
        const moved = text.split(fromSlash).join(toSlash).split(from).join(to);
        const enc = moved === text ? Array.prototype.slice.call(b, pos + 3, pos + 3 + len) : mutf8(moved);
        if (enc.length > 65535) throw new Error("Texte trop long après le changement de package.");
        out.push(1, (enc.length >> 8) & 255, enc.length & 255);
        for (let k = 0; k < enc.length; k++) out.push(enc[k]);
        pos += 3 + len;
        continue;
      }
      const size = { 3: 5, 4: 5, 5: 9, 6: 9, 7: 3, 8: 3, 9: 5, 10: 5, 11: 5, 12: 5, 15: 4, 16: 3, 17: 5, 18: 5, 19: 3, 20: 3 }[tag];
      if (!size) throw new Error("Entrée inconnue dans la table des constantes (" + tag + ").");
      for (let k = 0; k < size; k++) out.push(b[pos + k]);
      pos += size;
      if (tag === 5 || tag === 6) n++; // long et double occupent deux places
    }
    const result = new Uint8Array(out.length + (b.length - pos));
    result.set(out, 0);
    result.set(b.subarray ? b.subarray(pos) : b.slice(pos), out.length);
    return result;
  }

  return { teamsEnum: teamsEnum, rolesEnum: rolesEnum, roleClass: roleClass, powerClass: powerClass, mutf8: mutf8, relocate: relocate };
})();
