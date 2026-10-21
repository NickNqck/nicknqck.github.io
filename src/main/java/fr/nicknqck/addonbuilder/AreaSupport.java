package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * Action de clic « zone » (dans l'esprit de Khakkhara, Uchiwa et Affaiblissement de Hantengu) : touche tous les joueurs en
 * jeu à moins de radius blocs de l'utilisateur (sauf, si demandé, ceux de son camp). Pour chacun : dégâts qui ne tuent
 * jamais (il reste au moins un demi-cœur, comme Khakkhara), éclair (visuel), propulsion vers le haut (comme Uchiwa) et
 * effets « à la cible » ; les effets « à moi » sont donnés une fois à l'utilisateur. Le pouvoir réussit toujours (cooldown
 * consommé), même si personne n'est touché.
 */
final class AreaSupport {

    private AreaSupport() {
    }

    /** Joueurs touchés : en jeu, vivants, pas spectateurs, dans le rayon et (enemiesOnly) d'un autre camp que l'utilisateur (sauf camp solo). */
    static List<Player> targets(Player user, ItemPowerSupport.Area area) {
        List<Player> result = new ArrayList<>();
        GamePlayer self = GamePlayer.of(user.getUniqueId());
        ITeam myTeam = self == null || self.getRole() == null ? null : self.getRole().getTeam();
        if (myTeam != null && myTeam.isSolo()) myTeam = null; // en solo, chacun joue pour soi : personne n'est épargné
        Location center = user.getLocation();
        double max = (double) area.radius * area.radius;
        for (Player target : user.getWorld().getPlayers()) {
            if (target.getUniqueId().equals(user.getUniqueId()) || target.getGameMode() == GameMode.SPECTATOR) continue;
            GamePlayer gamePlayer = GamePlayer.of(target.getUniqueId());
            if (gamePlayer == null || gamePlayer.getRole() == null || !gamePlayer.isAlive()) continue;
            if (target.getLocation().distanceSquared(center) > max) continue;
            if (area.enemiesOnly && myTeam != null && myTeam.equals(gamePlayer.getRole().getTeam())) continue;
            result.add(target);
        }
        return result;
    }

    static boolean apply(Power power, Player user, ItemPowerSupport.Action action) {
        ItemPowerSupport.Area area = action.area;
        List<Player> touched = targets(user, area);
        String roleName = power.getRole().getName();
        for (Player target : touched) {
            if (area.damageHalfHearts > 0) {
                target.setHealth(Math.max(target.getHealth() - area.damageHalfHearts, 1.0)); // ne tue jamais
            }
            if (area.lightning) target.getWorld().strikeLightningEffect(target.getLocation());
            if (area.up > 0) {
                Location up = target.getLocation().clone();
                up.add(0, area.up, 0);
                target.teleport(up);
            }
            for (ItemPowerSupport.Effect effect : action.effects) {
                if (effect.onTarget) ItemPowerSupport.give(power, target, effect);
            }
            target.sendMessage("§7Vous avez été touché par§r " + power.getName() + "§7 de§c " + roleName + "§7.");
            user.sendMessage("§c" + target.getName() + "§7 a été touché par votre§r " + power.getName() + "§7.");
        }
        for (ItemPowerSupport.Effect effect : action.effects) {
            if (!effect.onTarget) ItemPowerSupport.give(power, user, effect);
        }
        if (touched.isEmpty()) user.sendMessage("§7Personne n'a été touché par§r " + power.getName() + "§7.");
        return true;
    }
}
