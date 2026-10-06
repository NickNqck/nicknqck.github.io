package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.interfaces.ICommandType;
import fr.nicknqck.utils.powers.CommandPower;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Complétion (Tab) d'une commande de l'addon, dans l'esprit de NSCompleter :
 *  - 1er argument : roles, puis (en partie) me et les arguments des pouvoirs « commande » du rôle du joueur ;
 *  - ensuite : la complétion propre au pouvoir (CommandPower.getCompletor), sinon les joueurs en ligne.
 */
public final class AddonCompleter implements TabCompleter {

    private final ICommandType type;

    public AddonCompleter(ICommandType type) {
        this.type = type;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length <= 1) {
            String start = args.length == 1 ? args[0].toLowerCase(Locale.ROOT) : "";
            List<String> all = new ArrayList<>();
            all.add("roles");
            if (sender instanceof Player && GameState.inGame()) {
                all.add("me");
                for (CommandPower power : CommandSupport.commandPowers((Player) sender, this.type)) {
                    if (!all.contains(power.getArg0())) all.add(power.getArg0());
                }
            }
            for (String entry : all) {
                if (entry.toLowerCase(Locale.ROOT).startsWith(start)) result.add(entry);
            }
            return result;
        }
        // après le 1er argument : la complétion du pouvoir demandé, sinon les noms des joueurs en ligne
        if (sender instanceof Player) {
            for (CommandPower power : CommandSupport.commandPowers((Player) sender, this.type)) {
                if (!power.getArg0().equalsIgnoreCase(args[0])) continue;
                if (power instanceof NoArguments) return result; // ce pouvoir n'attend rien après son mot
                List<String> completion = power.getCompletor(args);
                if (completion != null && !completion.isEmpty()) return completion;
            }
        }
        String last = args[args.length - 1].toLowerCase(Locale.ROOT);
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.getName().toLowerCase(Locale.ROOT).startsWith(last)) result.add(online.getName());
        }
        return result;
    }
}
