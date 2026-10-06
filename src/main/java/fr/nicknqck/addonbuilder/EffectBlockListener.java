package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.EffectGiveEvent;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Passif « empêche les joueurs proches d'obtenir des effets de potion » : annule EffectGiveEvent quand le joueur
 * qui allait recevoir l'effet se trouve à moins de radius blocs du propriétaire du pouvoir (hors propriétaire)
 * et que l'effet fait partie de la liste choisie. Absorption et Régénération ne sont JAMAIS empêchés.
 */
public class EffectBlockListener implements Listener {

    /** Effets qu'aucun passif ne peut empêcher, quelle que soit la configuration. */
    static final Set<String> PROTECTED = new HashSet<>(Arrays.asList("ABSORPTION", "REGENERATION"));

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
        }
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
