package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.interfaces.ICommandType;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.powers.CommandPower;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.List;

/**
 * Exécuteur d'une commande de l'addon (dans l'esprit de NsCommands d'UHC-Meetup). Commandes de base :
 *  - /nom roles : les rôles encore en jeu (GameState.getRolesList) ;
 *  - /nom me    : la description du rôle du joueur (GameState.sendDescription) ;
 * puis les pouvoirs « commande » (CommandPower) du rôle du joueur qui appartiennent à cette commande :
 *  /nom <arg0> [...] déclenche CommandPower.call, qui vérifie le cooldown et appelle le pouvoir.
 */
public final class AddonCommands implements CommandExecutor {

    private final ICommandType type;

    public AddonCommands(ICommandType type) {
        this.type = type;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("§cCette commande est réservée aux joueurs.");
            return true;
        }
        Player player = (Player) sender;
        if (args.length == 0) {
            usage(player);
            return true;
        }
        String sub = args[0];
        if (sub.equalsIgnoreCase("roles")) {
            CommandSupport.sendRoles(player);
            return true;
        }
        if (sub.equalsIgnoreCase("me")) {
            GamePlayer gamePlayer = GamePlayer.of(player.getUniqueId());
            if (!GameState.inGame() || gamePlayer == null || gamePlayer.getRole() == null) {
                player.sendMessage("§cVous n'avez pas de rôle pour le moment.");
            } else {
                GameState.getInstance().sendDescription(player);
            }
            return true;
        }
        boolean handled = false;
        for (CommandPower power : CommandSupport.commandPowers(player, this.type)) {
            if (power.getArg0().equalsIgnoreCase(sub)) {
                power.call(args, this.type, player); // vérifie le cooldown puis appelle onUse du pouvoir
                handled = true;
            }
        }
        if (!handled) usage(player);
        return true;
    }

    private void usage(Player player) {
        StringBuilder text = new StringBuilder("§7Utilisation : §a/").append(this.type.getAlias()).append("§7 [§aroles§7, §ame");
        List<CommandPower> powers = CommandSupport.commandPowers(player, this.type);
        for (CommandPower power : powers) text.append("§7, §a").append(power.getArg0());
        player.sendMessage(text.append("§7]").toString());
    }
}
