package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.roles.PowerActivateEvent;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/**
 * Passif « empêche les joueurs proches d'utiliser un pouvoir » : annule PowerActivateEvent quand le joueur qui
 * veut utiliser son pouvoir se trouve à moins de radius blocs du propriétaire de ce passif (hors propriétaire).
 */
public class PowerBlockListener implements Listener {

    private final Power power;
    private final int radius;

    public PowerBlockListener(Power power, int radius) {
        this.power = power;
        this.radius = radius;
    }

    @EventHandler
    public void onPowerActivate(PowerActivateEvent event) {
        Player user = event.getPlayer();
        if (user == null || event.getPower() == this.power) return;
        if (EffectBlockListener.isNearOwner(this.power, user, this.radius)) {
            event.setCancel(true);
            event.setCancelMessage("\u00a7cUn joueur proche vous emp\u00eache d'utiliser vos pouvoirs.");
        }
    }
}
