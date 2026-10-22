package fr.nicknqck.addonbuilder;

import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.PotionUtils;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.util.Vector;

import java.util.ArrayList;
import java.util.List;

/**
 * Actions de la catégorie « Cible » : elles s'appliquent au joueur frappé (« si frapper un joueur ») ou au joueur visé
 * (« si viser un joueur »). Sur le Player de la cible : dégâts en plus (qui ne tuent jamais), feu, recul, propulsion vers
 * le haut (avec ou sans dégâts de chute, PotionUtils.addTempNoFall), éclair (visuel). Sur son GamePlayer : étourdissement
 * (GamePlayer.stun d'UHC-Meetup, aveuglant ou non).
 * Format : "DAMAGE:demi-cœurs+FIRE:ticks+KNOCKBACK:force+UP:blocs:sansChute+LIGHTNING+STUN:ticks:aveuglé".
 */
final class TargetSupport {

    private TargetSupport() {
    }

    static final class TargetAction {
        final String type;
        final int value;
        final boolean flag;

        TargetAction(String type, int value, boolean flag) {
            this.type = type;
            this.value = value;
            this.flag = flag;
        }
    }

    static List<TargetAction> parse(String text) {
        List<TargetAction> out = new ArrayList<>();
        if (text == null || text.isEmpty()) return out;
        for (String entry : text.split("\\+")) {
            String[] p = entry.split(":");
            out.add(new TargetAction(p[0], p.length > 1 ? Integer.parseInt(p[1]) : 0, p.length > 2 && "1".equals(p[2])));
        }
        return out;
    }

    /** Applique les actions à target, de la part de user. */
    static void apply(final Player user, final Player target, List<TargetAction> actions) {
        for (TargetAction action : actions) {
            switch (action.type) {
                case "DAMAGE":
                    target.setHealth(Math.max(target.getHealth() - action.value, 1.0)); // ne tue jamais
                    break;
                case "FIRE":
                    target.setFireTicks(Math.max(target.getFireTicks(), action.value));
                    break;
                case "KNOCKBACK": {
                    // un tick plus tard : le recul normal du coup est appliqué juste après l'évènement de dégâts
                    final double strength = action.value;
                    Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
                        @Override
                        public void run() {
                            Vector push = target.getLocation().toVector().subtract(user.getLocation().toVector());
                            push.setY(0);
                            if (push.lengthSquared() < 1.0E-4) push = user.getLocation().getDirection().setY(0);
                            if (push.lengthSquared() < 1.0E-4) return;
                            push.normalize().multiply(0.6 * strength).setY(0.25 + 0.1 * strength);
                            target.setVelocity(push);
                        }
                    }, 1L);
                    break;
                }
                case "UP": {
                    if (action.flag) PotionUtils.addTempNoFall(target.getUniqueId(), 1); // prochaine chute sans dégâts
                    Location up = target.getLocation().clone();
                    up.add(0, action.value, 0);
                    target.teleport(up);
                    break;
                }
                case "LIGHTNING":
                    target.getWorld().strikeLightningEffect(target.getLocation());
                    break;
                case "STUN": {
                    GamePlayer gamePlayer = GamePlayer.of(target.getUniqueId());
                    if (gamePlayer != null) gamePlayer.stun(action.value, action.flag);
                    break;
                }
                default:
                    Bukkit.getLogger().severe("[UHC-Addon] Action sur la cible inconnue : " + action.type);
            }
        }
    }
}
