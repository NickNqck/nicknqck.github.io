/*
 * Vérification d'un spigot.jar (Minecraft 1.8.8), entièrement dans le navigateur : le fichier n'est ni envoyé ni conservé.
 * verify(file, onStep) lit le jar avec JSZip et prévient onStep({ label, state, detail }) à chaque contrôle
 * (state : "start" | "ok" | "warn" | "fail"). Il retourne une promesse { ok, warnings } : ok = aucun contrôle bloquant en échec.
 *
 * Un contrôle ne bloque (fail) que sur une preuve contraire (autre version, autre jar, fork...). Sans preuve, il avertit (warn).
 */
const SpigotCheck = (function () {
  "use strict";

  const MAX_BYTES = 100 * 1024 * 1024;
  const ACC_INTERFACE = 0x0200, ACC_ENUM = 0x4000;

  // Type de chaque classe Bukkit appelée par le jar modèle : un appel d'interface (invokeinterface) sur une classe,
  // ou l'inverse, plante le serveur (IncompatibleClassChangeError).
  const KINDS = {
    interface: ["org/bukkit/World", "org/bukkit/block/Block", "org/bukkit/entity/Entity", "org/bukkit/entity/Damageable",
      "org/bukkit/entity/LivingEntity", "org/bukkit/entity/HumanEntity", "org/bukkit/entity/Player", "org/bukkit/entity/Projectile",
      "org/bukkit/projectiles/ProjectileSource", "org/bukkit/plugin/Plugin", "org/bukkit/plugin/PluginManager",
      "org/bukkit/inventory/meta/ItemMeta", "org/bukkit/inventory/Inventory", "org/bukkit/metadata/MetadataValue",
      "org/bukkit/command/CommandExecutor", "org/bukkit/command/TabCompleter",
      "org/bukkit/inventory/PlayerInventory", "org/bukkit/scheduler/BukkitScheduler",
      "org/bukkit/metadata/Metadatable", "org/bukkit/event/Listener", "org/bukkit/command/CommandSender"],
    class: ["org/bukkit/Location", "org/bukkit/Bukkit", "org/bukkit/inventory/ItemStack", "org/bukkit/potion/PotionEffect",
      "org/bukkit/potion/PotionEffectType", "org/bukkit/scheduler/BukkitRunnable", "org/bukkit/metadata/FixedMetadataValue",
      "org/bukkit/event/Event", "org/bukkit/plugin/java/JavaPlugin", "org/bukkit/World$Spigot", "org/bukkit/entity/Player$Spigot",
      "org/bukkit/event/inventory/InventoryClickEvent", "org/bukkit/event/player/PlayerInteractEvent",
      "org/bukkit/event/entity/ProjectileHitEvent",
      "org/bukkit/command/Command", "org/bukkit/command/PluginCommand", "org/bukkit/event/entity/EntityDamageEvent",
      "org/bukkit/enchantments/Enchantment"],
    enum: ["org/bukkit/Material", "org/bukkit/Effect", "org/bukkit/Sound", "org/bukkit/GameMode", "org/bukkit/event/EventPriority",
      "org/bukkit/event/block/Action", "org/bukkit/event/entity/EntityDamageEvent$DamageCause"]
  };

  const pause = function () { return new Promise(function (r) { setTimeout(r, 40); }); };

  // Lit le début d'un fichier .class : indicateurs d'accès (interface, enum...) et constantes texte.
  function parseClass(b) {
    if (b.length < 10 || b[0] !== 0xca || b[1] !== 0xfe || b[2] !== 0xba || b[3] !== 0xbe) return null;
    let i = 8;
    const count = (b[i] << 8) | b[i + 1];
    i += 2;
    const texts = [];
    for (let k = 1; k < count; k++) {
      const tag = b[i++];
      if (tag === 1) {
        const len = (b[i] << 8) | b[i + 1];
        i += 2;
        let s = "";
        for (let j = 0; j < len && len < 300; j++) s += String.fromCharCode(b[i + j]);
        if (len < 300) texts.push(s);
        i += len;
      } else if (tag === 3 || tag === 4 || tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) i += 4;
      else if (tag === 5 || tag === 6) { i += 8; k++; }
      else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) i += 2;
      else if (tag === 15) i += 3;
      else return null;
    }
    return { flags: (b[i] << 8) | b[i + 1], texts: texts };
  }

  function readBytes(zip, path) {
    const f = zip.file(path);
    return f ? f.async("uint8array") : Promise.resolve(null);
  }

  function verify(file, onStep) {
    onStep = onStep || function () {};
    const result = { ok: true, warnings: 0 };
    let zip = null, craftTag = null;

    // Exécute un contrôle : fn retourne { state: "ok" | "warn" | "fail", detail } ou lève une erreur (= fail)
    function check(label, fn) {
      if (!zip && label !== "Lecture du fichier") return Promise.resolve(); // fichier illisible : inutile de continuer
      onStep({ label: label, state: "start" });
      return pause().then(fn).then(function (r) { return r; }, function (e) { return { state: "fail", detail: e.message }; })
        .then(function (r) {
          if (r.state === "fail") result.ok = false;
          if (r.state === "warn") result.warnings++;
          onStep({ label: label, state: r.state, detail: r.detail });
        });
    }

    return check("Lecture du fichier", function () {
      if (!file) throw new Error("aucun fichier");
      if (file.size > MAX_BYTES) throw new Error("fichier trop volumineux (" + Math.round(file.size / 1048576) + " Mo, 100 Mo maximum)");
      return file.arrayBuffer().then(function (buffer) { return JSZip.loadAsync(buffer); }).then(function (z) {
        zip = z;
        const n = Object.keys(z.files).length;
        return { state: "ok", detail: file.name + " : " + (file.size / 1048576).toFixed(1) + " Mo, " + n + " entrées" };
      }, function () { throw new Error("ce n'est pas un fichier .jar (archive zip) valide"); });

    }).then(function () {
      return check("Jar de serveur (pas l'API seule)", function () {
        if (!zip) throw new Error("fichier illisible");
        const found = zip.file(/^org\/bukkit\/craftbukkit\/(v[0-9]+_[0-9]+_R[0-9]+)\/CraftServer\.class$/);
        if (!found.length) throw new Error("aucun CraftServer : c'est l'API seule (spigot-api) ou un autre jar, il faut le jar du serveur");
        craftTag = /\/(v[0-9]+_[0-9]+_R[0-9]+)\//.exec(found[0].name)[1];
        return { state: "ok", detail: "serveur CraftBukkit " + craftTag };
      });

    }).then(function () {
      return check("Version de Minecraft (1.8.8)", function () {
        if (!craftTag) throw new Error("version illisible");
        if (craftTag !== "v1_8_R3") throw new Error("version " + craftTag + " détectée : il faut la 1.8.8 (v1_8_R3)");
        return { state: "ok", detail: "v1_8_R3 (Minecraft 1.8.4 à 1.8.8)" };
      });

    }).then(function () {
      return check("Version exacte : 1.8.8", function () {
        const poms = zip ? zip.file(/^META-INF\/maven\/.+\/pom\.properties$/) : [];
        return Promise.all(poms.map(function (f) { return f.async("string"); })).then(function (texts) {
          const versions = [];
          texts.forEach(function (t) {
            const group = /^groupId=(.*)$/m.exec(t), version = /^version=(.*)$/m.exec(t);
            if (group && version && /^(org\.spigotmc|org\.bukkit)$/.test(group[1].trim())) versions.push(version[1].trim());
          });
          if (versions.some(function (v) { return /^1\.8\.8(-|$)/.test(v); })) return { state: "ok", detail: "API " + versions[0] };
          if (versions.length) throw new Error("version lue dans le jar : " + versions[0] + " (il faut 1.8.8)");
          return readBytes(zip, "net/minecraft/server/" + craftTag + "/MinecraftServer.class").then(function (bytes) {
            const parsed = bytes && parseClass(bytes);
            if (parsed && parsed.texts.indexOf("1.8.8") !== -1) return { state: "ok", detail: "version lue dans MinecraftServer : 1.8.8" };
            return { state: "warn", detail: "version exacte non confirmée par le fichier (v1_8_R3 couvre 1.8.4 à 1.8.8)" };
          });
        });
      });

    }).then(function () {
      return check("Spigot (ni CraftBukkit seul, ni fork)", function () {
        if (!zip.file("org/spigotmc/SpigotConfig.class")) throw new Error("org/spigotmc est absent : ce n'est pas Spigot");
        return readBytes(zip, "META-INF/MANIFEST.MF").then(function (bytes) {
          const text = bytes ? new TextDecoder().decode(bytes).replace(/\r?\n /g, "") : "";
          const m = /^Implementation-Version:\s*(.+)$/m.exec(text);
          if (!m) return { state: "warn", detail: "présent, mais la version de build n'est pas lisible dans le manifeste" };
          const build = m[1].trim(), maker = /^git-([A-Za-z]+)-/.exec(build);
          if (!maker) return { state: "warn", detail: "build non reconnu : " + build };
          if (maker[1] !== "Spigot") throw new Error("fork détecté (" + maker[1] + ") : il faut Spigot, build " + build);
          return { state: "ok", detail: "build " + build };
        });
      });

    }).then(function () {
      return check("API Spigot utilisée par l'addon", function () {
        const missing = ["org/bukkit/entity/Player$Spigot.class", "org/bukkit/World$Spigot.class"].filter(function (p) { return !zip.file(p); });
        if (missing.length) throw new Error("absent : " + missing.join(", "));
        return { state: "ok", detail: "Player.spigot() et World.spigot() présents" };
      });

    }).then(function () {
      return check("Types Bukkit compatibles avec le jar modèle", function () {
        const wanted = [];
        Object.keys(KINDS).forEach(function (kind) { KINDS[kind].forEach(function (name) { wanted.push({ name: name, kind: kind }); }); });
        return Promise.all(wanted.map(function (w) {
          return readBytes(zip, w.name + ".class").then(function (bytes) {
            const parsed = bytes && parseClass(bytes);
            if (!parsed) return w.name.replace("org/bukkit/", "") + " : introuvable";
            const real = (parsed.flags & ACC_INTERFACE) ? "interface" : (parsed.flags & ACC_ENUM) ? "enum" : "class";
            return real === w.kind ? null : w.name.replace("org/bukkit/", "") + " : attendu " + w.kind + ", trouvé " + real;
          });
        })).then(function (problems) {
          const bad = problems.filter(Boolean);
          if (bad.length) return { state: "warn", detail: bad.length + " écart(s) : " + bad.slice(0, 4).join(" ; ") };
          return { state: "ok", detail: wanted.length + " types vérifiés (interface / classe / enum)" };
        });
      });

    }).then(function () { return result; });
  }

  return { verify: verify };
})();
