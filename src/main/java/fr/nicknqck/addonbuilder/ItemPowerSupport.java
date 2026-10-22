package fr.nicknqck.addonbuilder;

import fr.nicknqck.enums.EffectWhen;
import fr.nicknqck.events.custom.UHCPlayerBattleEvent;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.ItemPower;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Comportement des pouvoirs « objet à activer » générés par le site. Selon le clic (gauche / droit), l'objet fait :
 *  - EFFECT_ONLY : donne des effets (sans téléportation) ;
 *  - TP_BEHIND   : téléporte l'utilisateur derrière le joueur visé ;
 *  - TP_AROUND   : téléporte l'utilisateur autour du joueur visé, à une distance réglable ;
 *  - TP_TO_USER  : téléporte le joueur visé jusqu'à l'utilisateur ;
 *  - AREA        : touche tous les joueurs autour de l'utilisateur (AreaSupport) ;
 *  - LAUNCH      : lance un projectile dont l'impact téléporte l'utilisateur et/ou crée une zone de dégâts (ProjectileSupport).
 * Dans tous les cas, des effets (EffectWhen.NOW) peuvent être donnés à l'utilisateur et/ou à la cible.
 * Retourne true quand l'action a réussi (ce qui déclenche le cooldown et compte l'utilisation), false sinon.
 * Quand chaque clic fait une action différente, chaque clic peut avoir son PROPRE cooldown : il est alors porté par un
 * pouvoir caché (ClickPower) créé pour ce clic ; le cooldown de l'objet lui-même (s'il y en a un) s'applique en plus.
 * « En frappant un joueur » (UHCPlayerBattleEvent d'UHC-Meetup, ItemPower.InteractType.ATTACK_ENTITY) : la cible est le
 * joueur frappé, sans visée ; les actions de la catégorie « Cible » (TargetSupport) s'appliquent à lui.
 */
final class ItemPowerSupport {

    /** Configuration de chaque pouvoir (clé faible : disparaît avec le pouvoir). */
    private static final Map<ItemPower, Config> CONFIGS = Collections.synchronizedMap(new WeakHashMap<ItemPower, Config>());

    private ItemPowerSupport() {
    }

    /** Un effet de potion de l'action, pour l'utilisateur ou pour la cible. */
    static final class Effect {
        final boolean onTarget;
        final String type;
        final int ticks;
        final int amplifier;

        Effect(boolean onTarget, String type, int ticks, int amplifier) {
            this.onTarget = onTarget;
            this.type = type;
            this.ticks = ticks;
            this.amplifier = amplifier;
        }
    }

    /** Conséquences d'un projectile à l'impact. */
    static final class Launch {
        final String projectile;
        final boolean teleport;
        final boolean zone;
        final int radius;
        final int damageHp; // demi-cœurs
        final int seconds;  // 0 = une seule explosion
        final int rgb;      // couleur du cercle de particules de la zone (0xRRGGBB)

        Launch(String projectile, boolean teleport, boolean zone, int radius, int damageHp, int seconds, int rgb) {
            this.projectile = projectile;
            this.teleport = teleport;
            this.zone = zone;
            this.radius = radius;
            this.damageHp = damageHp;
            this.seconds = seconds;
            this.rgb = rgb;
        }
    }

    /** Zone autour de l'utilisateur (AREA) : voir AreaSupport. */
    static final class Area {
        final int radius;
        final boolean enemiesOnly;   // true : les joueurs du camp de l'utilisateur ne sont pas touchés
        final int damageHalfHearts;  // dégâts (demi-cœurs) qui ne tuent jamais
        final boolean lightning;     // éclair (visuel) sur chaque joueur touché
        final int up;                // propulsion vers le haut (blocs)
        final boolean safeFall;      // true : la retombée de la propulsion ne fait pas de dégâts (PotionUtils.addTempNoFall)

        Area(int radius, boolean enemiesOnly, int damageHalfHearts, boolean lightning, int up, boolean safeFall) {
            this.radius = radius;
            this.enemiesOnly = enemiesOnly;
            this.damageHalfHearts = damageHalfHearts;
            this.lightning = lightning;
            this.up = up;
            this.safeFall = safeFall;
        }
    }

    /** Une action de clic. distance = distance maximale de visée (0 = pas de visée). */
    static final class Action {
        final String type;
        final int distance;
        final int radius;
        final List<Effect> effects;
        final Launch launch; // null sauf pour LAUNCH
        final Area area;     // null sauf pour AREA
        final List<TargetSupport.TargetAction> targets; // actions sur le joueur visé ou frappé

        Action(String type, int distance, int radius, List<Effect> effects, Launch launch, Area area, List<TargetSupport.TargetAction> targets) {
            this.type = type;
            this.distance = distance;
            this.radius = radius;
            this.effects = effects;
            this.launch = launch;
            this.area = area;
            this.targets = targets;
        }
    }

    private static final class Config {
        final Action left;  // null = le clic gauche ne fait rien
        final Action right; // null = le clic droit ne fait rien
        final ClickPower leftPower;  // null = pas de cooldown propre au clic gauche
        final ClickPower rightPower; // null = pas de cooldown propre au clic droit
        final Action hit;            // null = frapper un joueur ne fait rien
        final ClickPower hitPower;   // null = pas de cooldown propre à la frappe

        Config(Action left, Action right, ClickPower leftPower, ClickPower rightPower, Action hit, ClickPower hitPower) {
            this.left = left;
            this.right = right;
            this.leftPower = leftPower;
            this.rightPower = rightPower;
            this.hit = hit;
            this.hitPower = hitPower;
        }
    }

    /**
     * config = "action gauche|action droite|cooldownGauche;cooldownDroit" ; action = "TYPE,visée,autour,effets,projectile" ou "-" ;
     * effets = "U|T:EFFET:ticks:amp+..." ; projectile = "TYPE;téléportation;zone;rayon;demi-cœurs;secondes;couleurHex" (LAUNCH) ;
     * cooldowns propres aux clics en secondes (0 = aucun ; le 3e élément peut manquer : anciens addons).
     */
    static void init(ItemPower power, String config) {
        String[] sides = config.split("\\|", -1);
        Action left = parse(sides[0]);
        Action right = parse(sides[1]);
        int leftSeconds = 0, rightSeconds = 0;
        if (sides.length > 2 && !sides[2].isEmpty()) {
            String[] seconds = sides[2].split(";");
            leftSeconds = Integer.parseInt(seconds[0]);
            rightSeconds = Integer.parseInt(seconds[1]);
        }
        // Un pouvoir caché par clic qui a son cooldown ; il doit être dans les pouvoirs du rôle (Power.checkUse l'exige)
        ClickPower leftPower = left != null && leftSeconds > 0 ? new ClickPower(power, "clic gauche", leftSeconds, left) : null;
        ClickPower rightPower = right != null && rightSeconds > 0 ? new ClickPower(power, "clic droit", rightSeconds, right) : null;
        if (leftPower != null) power.getRole().addPower(leftPower);
        if (rightPower != null) power.getRole().addPower(rightPower);
        // « frapper un joueur » : "...|action de la frappe|cooldown de la frappe" (absent des anciens addons)
        Action hit = sides.length > 3 ? parse(sides[3]) : null;
        int hitSeconds = sides.length > 4 && !sides[4].isEmpty() ? Integer.parseInt(sides[4]) : 0;
        ClickPower hitPower = hit != null && hitSeconds > 0 ? new ClickPower(power, "frappe", hitSeconds, hit) : null;
        if (hitPower != null) {
            hitPower.setSendCooldown(false); // en combat : pas de message de cooldown à chaque coup
            power.getRole().addPower(hitPower);
        }
        // UHC-Meetup appelle l'objet deux fois par coup (avant et après les résistances) : sans ce réglage, chaque coup
        // pendant le cooldown enverrait deux messages ; le cooldown reste affiché dans la barre d'action quand on tient l'objet
        if (hit != null) power.setSendCooldown(false);
        Config parsed = new Config(left, right, leftPower, rightPower, hit, hitPower);
        CONFIGS.put(power, parsed);
        if ((parsed.left != null && parsed.left.launch != null) || (parsed.right != null && parsed.right.launch != null)) {
            ProjectileSupport.register(power); // écouteur d'impact (ProjectileHitEvent)
        }
    }

    private static Action parse(String text) {
        if ("-".equals(text)) return null;
        String[] p = text.split(",", -1);
        List<Effect> effects = new ArrayList<>();
        if (!p[3].isEmpty()) {
            for (String entry : p[3].split("\\+")) {
                String[] e = entry.split(":");
                effects.add(new Effect("T".equals(e[0]), e[1], Integer.parseInt(e[2]), Integer.parseInt(e[3])));
            }
        }
        Launch launch = null;
        if ("LAUNCH".equals(p[0])) {
            String[] l = p[4].split(";");
            launch = new Launch(l[0], "1".equals(l[1]), "1".equals(l[2]), Integer.parseInt(l[3]), Integer.parseInt(l[4]), Integer.parseInt(l[5]),
                    l.length > 6 ? Integer.parseInt(l[6], 16) : 0xFF5555);
        }
        Area area = null;
        if ("AREA".equals(p[0])) { // "rayon;ENEMIES|ALL;demi-cœurs;éclair(0|1);hauteur[;sans dégâts de chute(0|1)]"
            String[] a = p[4].split(";");
            area = new Area(Integer.parseInt(a[0]), "ENEMIES".equals(a[1]), Integer.parseInt(a[2]), "1".equals(a[3]), Integer.parseInt(a[4]),
                    a.length > 5 && "1".equals(a[5]));
        }
        return new Action(p[0], Integer.parseInt(p[1]), Integer.parseInt(p[2]), effects, launch, area,
                TargetSupport.parse(p.length > 5 ? p[5] : ""));
    }

    static boolean use(ItemPower power, Player player, Map<String, Object> map) {
        Config config = CONFIGS.get(power);
        if (config == null) return false;
        ItemPower.InteractType type = power.getInteractType();
        Object event = map.get("event");
        if (type != null && "ATTACK_ENTITY".equals(type.name())) { // frapper un joueur avec l'objet
            if (config.hit == null) return false;
            Player victim = victimOf(map);
            if (victim == null) return false;
            if (config.hitPower != null) return config.hitPower.checkUse(player, map);
            return perform(power, power, config.hit, player, victim);
        }
        if (type == null || !"INTERACT".equals(type.name())) return false; // lâcher, casser... : sans effet
        if (!(event instanceof PlayerInteractEvent)) return false;
        String click = ((PlayerInteractEvent) event).getAction().name();
        if ("PHYSICAL".equals(click)) return false;
        boolean isLeft = click.contains("LEFT");
        Action action = isLeft ? config.left : config.right;
        if (action == null) return false;
        // Cooldown propre à ce clic : le pouvoir caché vérifie son cooldown (checkUse) puis exécute l'action (perform)
        ClickPower own = isLeft ? config.leftPower : config.rightPower;
        if (own != null) return own.checkUse(player, map);
        return perform(power, power, action, player);
    }

    /**
     * Exécute l'action d'un clic. item = l'objet tenu (écouteur de projectile, nom dans les messages) ; caller = le pouvoir
     * dont les règles s'appliquent (l'objet, ou le pouvoir caché du clic) et qui sert à viser un joueur.
     */
    static boolean perform(ItemPower item, Power caller, Action action, Player player) {
        return perform(item, caller, action, player, null);
    }

    /**
     * Joueur frappé d'un UHCPlayerBattleEvent, ou null : seulement au 1er appel (avant les résistances, isPatch() faux)
     * et si le coup n'est pas annulé — UHC-Meetup appelle l'objet une 2e fois après les résistances.
     */
    static Player victimOf(Map<String, Object> map) {
        Object event = map.get("event");
        if (!(event instanceof UHCPlayerBattleEvent)) return null;
        UHCPlayerBattleEvent battle = (UHCPlayerBattleEvent) event;
        if (battle.isPatch()) return null;
        EntityDamageByEntityEvent origin = battle.getOriginEvent();
        if (origin == null || origin.isCancelled() || !(origin.getEntity() instanceof Player)) return null;
        return (Player) origin.getEntity();
    }

    /** victim != null : action d'une frappe, la cible est le joueur frappé (pas de visée, pas de message à chaque coup). */
    static boolean perform(ItemPower item, Power caller, Action action, Player player, Player victim) {
        ItemPower power = item;
        if ("AREA".equals(action.type)) return AreaSupport.apply(item, player, action); // zone autour de l'utilisateur
        if ("LAUNCH".equals(action.type)) { // le projectile part tout de suite ; les conséquences arrivent à l'impact
            if (!ProjectileSupport.launch(power, player, action)) return false;
            player.sendMessage("\u00a77Vous avez utilis\u00e9\u00a7r " + power.getName() + "\u00a77.");
            return true;
        }
        // 1. visée
        Player target = victim;
        if (victim == null && action.distance > 0) {
            caller.setTargetDistance(action.distance);
            target = caller.getTarget();
            if (target == null) {
                player.sendMessage("\u00a7cIl faut viser un joueur \u00e0 moins de " + action.distance + " blocs !"); // ni action ni cooldown
                return false;
            }
        }
        // 2. téléportation (avant les effets : si elle échoue, rien n'est consommé)
        if (!teleport(action, player, target)) return false;
        // 3. effets
        for (Effect effect : action.effects) {
            Player receiver = effect.onTarget ? target : player;
            if (receiver != null && !give(power, receiver, effect)) return false;
        }
        // 4. actions sur la cible (catégorie « Cible »)
        if (target != null && !action.targets.isEmpty()) TargetSupport.apply(player, target, action.targets);
        if (victim == null) player.sendMessage("\u00a77Vous avez utilis\u00e9\u00a7r " + power.getName() + "\u00a77.");
        return true;
    }

    private static boolean teleport(Action action, Player user, Player target) {
        switch (action.type) {
            case "TP_BEHIND": {
                Location spot = TeleportSupport.behind(target);
                if (spot == null) {
                    user.sendMessage("\u00a7cImpossible de se t\u00e9l\u00e9porter derri\u00e8re\u00a7b " + target.getName() + "\u00a7c : pas de place s\u00fbre");
                    return false;
                }
                user.teleport(spot);
                return true;
            }
            case "TP_AROUND": {
                Location spot = TeleportSupport.around(target, action.radius);
                if (spot == null) {
                    user.sendMessage("\u00a7cImpossible de se t\u00e9l\u00e9porter autour de\u00a7b " + target.getName() + "\u00a7c : pas de place s\u00fbre");
                    return false;
                }
                user.teleport(spot);
                return true;
            }
            case "TP_TO_USER": {
                target.teleport(TeleportSupport.inFrontOf(user));
                target.sendMessage("\u00a77Vous avez \u00e9t\u00e9 t\u00e9l\u00e9port\u00e9 par\u00a7a " + user.getName());
                return true;
            }
            default:
                return true; // EFFECT_ONLY
        }
    }

    /** Donne un effet avec EffectWhen.NOW via le rôle du joueur (EffectGiveEvent annulable), ou directement sans rôle. */
    static boolean give(Power power, Player receiver, Effect effect) {
        PotionEffectType potion = PotionEffectType.getByName(effect.type);
        if (potion == null) {
            Bukkit.getLogger().severe("[UHC-Addon] Effet inconnu pour " + power.getName() + " : " + effect.type);
            return false;
        }
        PotionEffect potionEffect = new PotionEffect(potion, effect.ticks, effect.amplifier, false, false);
        GamePlayer gamePlayer = GamePlayer.of(receiver.getUniqueId());
        if (gamePlayer != null && gamePlayer.getRole() != null) {
            gamePlayer.getRole().givePotionEffect(potionEffect, EffectWhen.NOW);
        } else {
            receiver.addPotionEffect(potionEffect, true);
        }
        return true;
    }
}
