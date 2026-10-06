package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.interfaces.ICommandType;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.powers.CommandPower;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Outils communs à l'exécuteur (AddonCommands) et à la complétion (AddonCompleter) d'une commande de l'addon. */
final class CommandSupport {

    private CommandSupport() {
    }

    /** Le rôle du joueur s'il est en jeu et vivant, sinon null. */
    static RoleBase aliveRole(Player player) {
        if (!GameState.inGame()) return null;
        GamePlayer gamePlayer = GamePlayer.of(player.getUniqueId());
        if (gamePlayer == null || gamePlayer.getRole() == null || !gamePlayer.isAlive()) return null;
        return gamePlayer.getRole();
    }

    /** Les pouvoirs « commande » du rôle du joueur qui appartiennent à cette commande (même alias). */
    static List<CommandPower> commandPowers(Player player, ICommandType type) {
        List<CommandPower> result = new ArrayList<>();
        RoleBase role = aliveRole(player);
        if (role == null) return result;
        for (Power power : new ArrayList<>(role.getPowers())) {
            if (!(power instanceof CommandPower)) continue;
            CommandPower commandPower = (CommandPower) power;
            if (commandPower.getCommandType() == null || commandPower.getArg0() == null) continue;
            if (commandPower.getCommandType().getAlias().equals(type.getAlias())) result.add(commandPower);
        }
        return result;
    }

    /**
     * Envoie la liste des rôles encore en jeu : GameState.getRolesList(), comme /ns roles. Appelée par réflexion car son type
     * de retour (texte, tableau, liste) peut varier d'une version d'UHC-Meetup à l'autre : on envoie ligne par ligne.
     */
    static void sendRoles(Player player) {
        try {
            GameState gameState = GameState.getInstance();
            Object result = gameState.getClass().getMethod("getRolesList").invoke(gameState);
            if (result instanceof String) {
                player.sendMessage((String) result);
            } else if (result instanceof String[]) {
                for (String line : (String[]) result) player.sendMessage(line);
            } else if (result instanceof Collection) {
                for (Object line : (Collection<?>) result) player.sendMessage(String.valueOf(line));
            } else {
                player.sendMessage("§cAucune liste de rôles disponible pour le moment.");
            }
        } catch (ReflectiveOperationException | RuntimeException e) {
            player.sendMessage("§cImpossible d'afficher la liste des rôles.");
        }
    }
}
