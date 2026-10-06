package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.Effect;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Passif d'information (dans l'esprit de PatiencePower d'Asahiro) : le propriétaire compte le temps passé à moins de
 * radius blocs de chaque joueur ; une fois le temps atteint, il voit autour de ce joueur un cercle de particules
 * dont la couleur dépend de son camp (couleur par défaut pour les camps non précisés).
 * param = "secondes|couleurParDéfaut|camp=couleur,camp=couleur" (couleurs en hexadécimal, camp = addon:X ou meetup:Y).
 */
public final class InfoPassive extends BukkitRunnable {

    private static final int DISPLAY_RANGE = 40; // distance maximale à laquelle le cercle reste visible

    private final Power power;
    private final int radius;
    private final int seconds;
    private final int defaultColor;
    private final Map<ITeam, Integer> colors = new HashMap<>();
    private final Map<UUID, Integer> time = new HashMap<>();

    InfoPassive(Power power, int radius, String param) {
        this.power = power;
        this.radius = radius;
        String[] parts = param.split("\\|", -1);
        this.seconds = Integer.parseInt(parts[0]);
        this.defaultColor = Integer.parseInt(parts[1], 16);
        if (parts.length > 2 && !parts[2].isEmpty()) {
            for (String entry : parts[2].split(",")) {
                String[] pair = entry.split("=");
                String[] ref = pair[0].split(":");
                String enumClass = "addon".equals(ref[0]) ? Main.TEAMS_CLASS : "fr.nicknqck.enums.TeamList";
                try {
                    this.colors.put((ITeam) RoleSupport.team(enumClass, ref[1]), Integer.parseInt(pair[1], 16));
                } catch (RuntimeException e) {
                    Bukkit.getLogger().warning("[UHC-Addon] Camp ignore pour l'information : " + pair[0] + " (" + e + ")");
                }
            }
        }
    }

    /** Démarre après 5 secondes (le temps que la partie passe en cours), puis chaque seconde. */
    void start() {
        runTaskTimer(Main.getInstance(), 100L, 20L);
    }

    @Override
    public void run() {
        if (!GameState.inGame()) {
            cancel();
            return;
        }
        UUID ownerId = this.power.getRole().getPlayer();
        Player owner = ownerId == null ? null : Bukkit.getPlayer(ownerId);
        if (owner == null || !owner.isOnline()) return;

        for (Player target : Bukkit.getOnlinePlayers()) {
            if (!isInGame(target) || !EffectBlockListener.isNearOwner(this.power, target, this.radius)) continue;
            int seconds = this.time.merge(target.getUniqueId(), 1, Integer::sum);
            if (seconds == this.seconds) {
                owner.sendMessage("\u00a77Vous avez pass\u00e9 assez de temps pr\u00e8s de\u00a7a " + target.getName()
                        + "\u00a77 : vous voyez d\u00e9sormais son\u00a7a camp\u00a77.");
            }
        }
        for (Player target : Bukkit.getOnlinePlayers()) {
            if (this.time.getOrDefault(target.getUniqueId(), 0) < this.seconds) continue;
            if (!isInGame(target) || !EffectBlockListener.isNearOwner(this.power, target, DISPLAY_RANGE)) continue;
            ITeam team = GamePlayer.of(target.getUniqueId()).getRole().getTeam();
            circle(owner, target.getEyeLocation(), this.colors.containsKey(team) ? this.colors.get(team) : this.defaultColor);
        }
    }

    private static boolean isInGame(Player player) {
        GamePlayer gamePlayer = GamePlayer.of(player.getUniqueId());
        return gamePlayer != null && gamePlayer.getRole() != null && gamePlayer.isAlive() && gamePlayer.isOnline();
    }

    /** Cercle de poussière colorée (visible seulement par viewer) : sur 1.8, la couleur se passe par les décalages RGB. */
    private static void circle(Player viewer, Location center, int rgb) {
        float r = ((rgb >> 16) & 255) / 255f, g = ((rgb >> 8) & 255) / 255f, b = (rgb & 255) / 255f;
        for (int i = 0; i < 16; i++) {
            double angle = 2 * Math.PI * i / 16;
            Location point = new Location(center.getWorld(), center.getX() + Math.cos(angle), center.getY() + 0.5, center.getZ() + Math.sin(angle));
            viewer.spigot().playEffect(point, Effect.COLOURED_DUST, 0, 0, r, g, b, 1f, 0, 64);
        }
    }
}
