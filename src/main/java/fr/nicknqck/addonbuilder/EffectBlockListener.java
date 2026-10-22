package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.EffectGiveEvent;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Passif « empêche les joueurs proches d'obtenir des effets de potion » : annule EffectGiveEvent quand le joueur
 * qui allait recevoir l'effet se trouve à moins de radius blocs du propriétaire du pouvoir (hors propriétaire)
 * et que l'effet fait partie de la liste choisie. Absorption et Régénération ne sont JAMAIS empêchés.
 * Le joueur privé de l'effet est prévenu (« Quelque chose vous empêche d'obtenir l'effet … »), au plus une fois toutes
 * les 2 minutes, tous passifs confondus, pour ne pas inonder son chat.
 */
public class EffectBlockListener implements Listener {

    /** Effets qu'aucun passif ne peut empêcher, quelle que soit la configuration. */
    static final Set<String> PROTECTED = new HashSet<>(Arrays.asList("ABSORPTION", "REGENERATION"));

    /** Délai minimum entre deux messages « Quelque chose vous empêche… » pour un même joueur. */
    static final long MESSAGE_DELAY_MS = 2 * 60 * 1000L;
    /** Dernier message envoyé à chaque joueur (partagé par tous les passifs de blocage). */
    static final Map<UUID, Long> LAST_MESSAGE = new HashMap<>();
    /** Noms affichés des effets (mêmes libellés que sur le site). */
    static final Map<String, String> NAMES = new HashMap<>();
    static {
        NAMES.put("SPEED", "Speed");
        NAMES.put("SLOW", "Lenteur");
        NAMES.put("FAST_DIGGING", "Haste");
        NAMES.put("SLOW_DIGGING", "Fatigue de minage");
        NAMES.put("INCREASE_DAMAGE", "Force");
        NAMES.put("JUMP", "Saut");
        NAMES.put("CONFUSION", "Nausée");
        NAMES.put("REGENERATION", "Régénération");
        NAMES.put("DAMAGE_RESISTANCE", "Résistance");
        NAMES.put("FIRE_RESISTANCE", "Résistance au feu");
        NAMES.put("WATER_BREATHING", "Respiration aquatique");
        NAMES.put("INVISIBILITY", "Invisibilité");
        NAMES.put("BLINDNESS", "Cécité");
        NAMES.put("NIGHT_VISION", "Vision nocturne");
        NAMES.put("HUNGER", "Faim");
        NAMES.put("WEAKNESS", "Faiblesse");
        NAMES.put("POISON", "Poison");
        NAMES.put("WITHER", "Wither");
        NAMES.put("HEALTH_BOOST", "Bonus de vie");
        NAMES.put("ABSORPTION", "Absorption");
        NAMES.put("SATURATION", "Saturation");
    }

    private final Power power;
    private final int radius;
    private final Set<String> effects = new HashSet<>(); // noms de PotionEffectType

    public EffectBlockListener(Power power, int radius, Set<String> effects) {
        this.power = power;
        this.radius = radius;
        this.effects.addAll(effects);
        this.effects.removeAll(PROTECTED);
    }

    @EventHandler
    public void onEffectGive(EffectGiveEvent event) {
        Player target = event.getPlayer();
        if (target == null || event.getPotionEffect() == null) return;
        String type = event.getPotionEffect().getType().getName();
        if (PROTECTED.contains(type) || !this.effects.contains(type)) return;
        if (isNearOwner(this.power, target, this.radius)) {
            event.setCancelled(true);
            warn(target, type, System.currentTimeMillis());
        }
    }

    /** Prévient le joueur, sauf s'il a déjà été prévenu il y a moins de 2 minutes. */
    static void warn(Player target, String type, long now) {
        Long last = LAST_MESSAGE.get(target.getUniqueId());
        if (last != null && now - last < MESSAGE_DELAY_MS) return;
        LAST_MESSAGE.put(target.getUniqueId(), now);
        String name = NAMES.containsKey(type) ? NAMES.get(type) : type;
        target.sendMessage("\u00a77Quelque chose vous emp\u00eache d'obtenir l'effet\u00a7c " + name + "\u00a77.");
    }

    /** Vrai si target n'est pas le propriétaire du pouvoir et se trouve à moins de radius blocs de lui. */
    static boolean isNearOwner(Power power, Player target, int radius) {
        UUID ownerId = power.getRole().getPlayer();
        if (ownerId == null || target.getUniqueId().equals(ownerId)) return false;
        Player owner = Bukkit.getPlayer(ownerId);
        if (owner == null || !owner.isOnline()) return false;
        if (!owner.getWorld().equals(target.getWorld())) return false;
        return owner.getLocation().distanceSquared(target.getLocation()) <= (double) radius * radius;
    }
}
