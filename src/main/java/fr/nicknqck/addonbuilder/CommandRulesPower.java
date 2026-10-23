package fr.nicknqck.addonbuilder;

import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.powers.CommandPower;
import fr.nicknqck.utils.powers.Cooldown;
import org.bukkit.entity.Player;

import java.util.Map;

/**
 * Pouvoir de commande sans effets : /nom argument [joueur] lance les règles « quand j'utilise ce pouvoir » du pouvoir
 * (voir RuleEngine.use). Le cooldown et le nombre d'utilisations maximum (Power.checkUse) ne comptent que si au moins
 * une règle s'est lancée. Les classes de pouvoirs générées par le site héritent de celle-ci (même constructeur que
 * CommandEffectsPower ; param est ignoré).
 */
public class CommandRulesPower extends CommandPower {

    public CommandRulesPower(String name, String command, String arg0, Cooldown cooldown, RoleBase role, String param, String... descriptions) {
        super(name, arg0, cooldown, role, new AddonCommandType(command), descriptions);
    }

    @Override
    public boolean onUse(Player player, Map<String, Object> map) {
        Object args = map.get("args");
        return RuleEngine.use(this, player, null, args instanceof String[] ? (String[]) args : new String[0],
                "/" + getCommandType().getAlias() + " " + getArg0());
    }
}
