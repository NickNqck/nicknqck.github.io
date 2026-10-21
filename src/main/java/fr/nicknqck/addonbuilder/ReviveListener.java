package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.death.UHCDeathEvent;
import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.Loc;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.inventory.ItemStack;

/**
 * Résurrection à la mort (dans l'esprit de la forme Urami de Hantengu) : une fois par partie, la mort du joueur est annulée
 * (UHCDeathEvent), il réapparaît une seconde plus tard avec son inventaire et son armure, au hasard à moins de radius blocs
 * (ou sur place si radius = 0), soigné, mais avec heartsLost cœurs maximum en moins (setMaxHealth de RoleBase).
 */
public class ReviveListener implements Listener {

    private static final double MIN_MAX_HEALTH = 2.0; // jamais moins d'un cœur maximum

    private final RoleBase role;
    private final int heartsLost;
    private final int radius;
    private boolean used;

    public ReviveListener(RoleBase role, int heartsLost, int radius) {
        this.role = role;
        this.heartsLost = heartsLost;
        this.radius = radius;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onDeath(UHCDeathEvent event) {
        if (this.used || event.isCancelled()) return;
        final Player dead = event.getPlayer();
        if (dead == null || !dead.getUniqueId().equals(this.role.getPlayer())) return;
        this.used = true;
        final ItemStack[] contents = dead.getInventory().getContents();
        final ItemStack[] armor = dead.getInventory().getArmorContents();
        final Location spot = this.radius > 0 ? Loc.getRandomLocationAroundPlayer(dead, this.radius) : dead.getLocation();
        event.setCancelled(true);
        Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
            @Override
            public void run() {
                Player player = Bukkit.getPlayer(role.getPlayer());
                if (player == null) return;
                player.spigot().respawn();
                player.getInventory().setArmorContents(armor);
                player.getInventory().setContents(contents);
                if (spot != null) player.teleport(spot);
                if (heartsLost > 0) {
                    role.setMaxHealth(Math.max(MIN_MAX_HEALTH, role.getMaxHealth() - heartsLost * 2.0));
                    player.setMaxHealth(role.getMaxHealth());
                }
                player.setHealth(player.getMaxHealth());
                player.sendMessage("§7Vous avez été§a ressuscité§7" + (heartsLost > 0
                        ? " en perdant§c " + heartsLost + "❤ permanent" + (heartsLost > 1 ? "s" : "") + "§7." : "."));
            }
        }, 20L);
    }
}
