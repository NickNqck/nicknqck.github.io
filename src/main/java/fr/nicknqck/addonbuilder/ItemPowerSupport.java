package fr.nicknqck.addonbuilder;

import fr.nicknqck.enums.EffectWhen;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.ItemPower;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
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

        Area(int radius, boolean enemiesOnly, int damageHalfHearts, boolean lightning, int up) {
            this.radius = radius;
            this.enemiesOnly = enemiesOnly;
            this.damageHalfHearts = damageHalfHearts;
            this.lightning = lightning;
            this.up = up;
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

        Action(String type, int distance, int radius, List<Effect> effects, Launch launch, Area area) {
            this.type = type;
            this.distance = distance;
            this.radius = radius;
            this.effects = effects;
            this.launch = launch;
            this.area = area;
        }
    }

    private static final class Config {
        final Action left;  // null = le clic gauche ne fait rien
        final Action right; // null = le clic droit ne fait rien
        final ClickPower leftPower;  // null = pas de cooldown propre au clic gauche
        final ClickPower rightPower; // null = pas de cooldown propre au clic droit

        Config(Action left, Action right, ClickPower leftPower, ClickPower rightPower) {
            this.left = left;
            this.right = right;
            this.leftPower = leftPower;
            this.rightPower = rightPower;
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
        Config parsed = new Config(left, right, leftPower, rightPower);
        CONFIGS.put(power, parsed);
        if ((parsed.left != null && parsed.left.launch != null) || (parsed.right != null && parsed.right.launch != null)) {
            ProjectileSupport.register(power); // écouteur d'impact (ProjectileHitEvent)
        }
    }

    private static Action parse(String text) {
        if ("-".equals(text)) return null;
        String[] p = text.split(",", 5);
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
        if ("AREA".equals(p[0])) { // "rayon;ENEMIES|ALL;demi-cœurs;éclair(0|1);hauteur"
            String[] a = p[4].split(";");
            area = new Area(Integer.parseInt(a[0]), "ENEMIES".equals(a[1]), Integer.parseInt(a[2]), "1".equals(a[3]), Integer.parseInt(a[4]));
        }
        return new Action(p[0], Integer.parseInt(p[1]), Integer.parseInt(p[2]), effects, launch, area);
    }

    static boolean use(ItemPower power, Player player, Map<String, Object> map) {
        Config config = CONFIGS.get(power);
        if (config == null) return false;
        ItemPower.InteractType type = power.getInteractType();
        if (type == null || !"INTERACT".equals(type.name())) return false; // lâcher, casser... : sans effet
        Object event = map.get("event");
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
        ItemPower power = item;
        if ("AREA".equals(action.type)) return AreaSupport.apply(item, player, action); // zone autour de l'utilisateur
        if ("LAUNCH".equals(action.type)) { // le projectile part tout de suite ; les conséquences arrivent à l'impact
            if (!ProjectileSupport.launch(power, player, action)) return false;
            player.sendMessage("\u00a77Vous avez utilis\u00e9\u00a7r " + power.getName() + "\u00a77.");
            return true;
        }
        // 1. visée
        Player target = null;
        if (action.distance > 0) {
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
        player.sendMessage("\u00a77Vous avez utilis\u00e9\u00a7r " + power.getName() + "\u00a77.");
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
