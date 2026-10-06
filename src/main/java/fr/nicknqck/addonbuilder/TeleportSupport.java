package fr.nicknqck.addonbuilder;

import fr.nicknqck.utils.Loc;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Player;

import java.util.concurrent.ThreadLocalRandom;

/**
 * Positions de téléportation sûres, construites avec Loc d'UHC-Meetup. Chaque méthode retourne null quand aucune
 * position sûre n'existe (le pouvoir échoue alors, sans cooldown ni utilisation consommée).
 */
final class TeleportSupport {

    private TeleportSupport() {
    }

    /** Derrière la cible (Loc.getLocationBehindPlayer), en essayant 1, puis 2 blocs. */
    static Location behind(Player target) {
        for (double distance = 1.0; distance <= 2.0; distance += 1.0) {
            Location spot = safe(Loc.getLocationBehindPlayer(target, distance));
            if (spot != null) return spot;
        }
        return null;
    }

    /** Autour de la cible, à radius blocs : plusieurs angles aléatoires (Loc.getLocationAtDistance), regard vers la cible. */
    static Location around(Player target, double radius) {
        Location center = target.getLocation();
        for (int attempt = 0; attempt < 16; attempt++) {
            Location raw = Loc.getLocationAtDistance(center, radius, ThreadLocalRandom.current().nextDouble() * 2 * Math.PI);
            // Loc place le point au sol de la surface : on garde seulement X/Z (bordure déjà respectée) et on cherche près de la cible
            Location spot = safe(new Location(center.getWorld(), raw.getX(), center.getY(), raw.getZ()));
            if (spot == null) continue;
            spot.setYaw((float) Math.toDegrees(Math.atan2(-(center.getX() - spot.getX()), center.getZ() - spot.getZ())));
            spot.setPitch(0f);
            return spot;
        }
        return null;
    }

    /** Devant l'utilisateur (1,5 bloc), sinon sur sa propre position : une cible téléportée jusqu'à lui arrive toujours. */
    static Location inFrontOf(Player user) {
        Location origin = user.getLocation();
        double yaw = Math.toRadians(origin.getYaw());
        Location front = new Location(origin.getWorld(), origin.getX() - Math.sin(yaw) * 1.5, origin.getY(), origin.getZ() + Math.cos(yaw) * 1.5);
        Location spot = safe(front);
        return spot != null ? spot : origin;
    }

    /**
     * Cherche à la verticale de la position (de 3 blocs au-dessus à 3 en dessous) un endroit où se tenir : pieds et tête
     * libres, sol plein dessous, rien de dangereux. Retourne null si la position sort de la bordure ou si rien ne convient.
     */
    static Location safe(Location wanted) {
        if (wanted == null || Loc.isOutsideOfBorder(wanted)) return null;
        World world = wanted.getWorld();
        int x = wanted.getBlockX(), z = wanted.getBlockZ(), base = wanted.getBlockY();
        for (int offset : new int[]{0, 1, -1, 2, -2, 3, -3}) {
            int y = base + offset;
            if (y < 1 || y > 250) continue;
            if (free(world, x, y, z) && free(world, x, y + 1, z) && ground(world, x, y - 1, z)) {
                return new Location(world, wanted.getX(), y, wanted.getZ(), wanted.getYaw(), wanted.getPitch());
            }
        }
        return null;
    }

    private static boolean free(World world, int x, int y, int z) {
        Material type = world.getBlockAt(x, y, z).getType();
        return !type.isSolid() && type != Material.LAVA && type != Material.STATIONARY_LAVA && type != Material.FIRE;
    }

    private static boolean ground(World world, int x, int y, int z) {
        Material type = world.getBlockAt(x, y, z).getType();
        return type.isSolid() && type != Material.CACTUS;
    }
}
