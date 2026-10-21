package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Passif « sans armure » (dans l'esprit de l'invisibilité de Hantengu) : chaque seconde, si le propriétaire ne porte aucune
 * pièce d'armure (GameState.isApoil), il reçoit les effets du passif pour 3 secondes (givePotionEffect, EffectWhen.NOW) et,
 * si demandé, n'a plus de dégâts de chute. Un message prévient quand le passif s'active et quand il s'arrête.
 * param = "nofall(0|1)|EFFET:amplificateur+EFFET:amplificateur..."
 */
public final class NoArmorPassive extends BukkitRunnable implements Listener {

    private static final int HELD_TICKS = 60; // redonné chaque seconde pour 3 secondes : pas de clignotement

    private final Power power;
    private final boolean noFall;
    private final List<ItemPowerSupport.Effect> effects = new ArrayList<>();
    private boolean active;

    NoArmorPassive(Power power, String param) {
        this.power = power;
        String[] parts = param.split("\\|", -1);
        this.noFall = "1".equals(parts[0]);
        if (parts.length > 1 && !parts[1].isEmpty()) {
            for (String entry : parts[1].split("\\+")) {
                String[] e = entry.split(":");
                this.effects.add(new ItemPowerSupport.Effect(false, e[0], HELD_TICKS, Integer.parseInt(e[1])));
            }
        }
    }

    /** Écoute des chutes (EventUtils.registerRoleEvent), puis vérification chaque seconde, après 5 secondes. */
    void start() {
        RoleSupport.registerListener(this);
        runTaskTimer(Main.getInstance(), 100L, 20L);
    }

    @Override
    public void run() {
        if (!GameState.inGame()) {
            cancel();
            return;
        }
        UUID id = this.power.getRole().getPlayer();
        Player owner = id == null ? null : Bukkit.getPlayer(id);
        if (owner == null || !owner.isOnline()) return;
        GamePlayer gamePlayer = GamePlayer.of(id);
        boolean nude = gamePlayer != null && gamePlayer.isAlive() && GameState.getInstance().isApoil(owner);
        if (nude != this.active) {
            this.active = nude;
            owner.sendMessage(nude
                    ? "§7Vous ne portez plus d'armure :§r " + this.power.getName() + "§7 est actif."
                    : "§7Vous portez de nouveau de l'armure :§r " + this.power.getName() + "§7 n'est plus actif.");
        }
        if (!this.active) return;
        for (ItemPowerSupport.Effect effect : this.effects) {
            ItemPowerSupport.give(this.power, owner, effect);
        }
    }

    @EventHandler
    public void onDamage(EntityDamageEvent event) {
        if (!this.noFall || !this.active || event.getCause() != EntityDamageEvent.DamageCause.FALL) return;
        if (!event.getEntity().getUniqueId().equals(this.power.getRole().getPlayer())) return;
        event.setDamage(0.0);
        event.setCancelled(true);
    }
}
