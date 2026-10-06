package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.interfaces.ICommandType;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.powers.CommandPower;
import fr.nicknqck.utils.powers.Cooldown;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Pouvoir à base de commande qui active / désactive des effets : /nom argument.
 *  - 1re saisie (CommandPower.call -> checkUse -> onUse) : ACTIVE le pouvoir. Le cooldown et le nombre d'utilisations
 *    maximum (Power.checkUse) ne comptent que pour l'activation ;
 *  - saisie suivante (override de call) : DÉSACTIVE le pouvoir tout de suite, sans cooldown.
 * Chaque effet est soit maintenu tant que le pouvoir est activé (durée 0 : redonné chaque seconde), soit donné une fois
 * pour sa durée. Quand il n'y a que des effets limités dans le temps, le pouvoir s'éteint tout seul à la fin du dernier.
 * Les effets passent par RoleBase.givePotionEffect(..., EffectWhen.NOW) : EffectGiveEvent (blocages) reste respecté.
 * Les classes de pouvoirs générées par le site héritent de celle-ci et ne font qu'appeler ce constructeur.
 */
public class CommandEffectsPower extends CommandPower implements NoArguments {

    private static final int REFRESH_TICKS = 20;  // un effet maintenu est redonné chaque seconde...
    private static final int HELD_TICKS = 40;     // ...pour 2 secondes : il ne clignote pas et s'éteint vite après la désactivation

    private final List<ItemPowerSupport.Effect> effects = new ArrayList<>();
    private final boolean hasHeldEffect;
    private final int longestTimedTicks;
    private boolean active;
    private int elapsedTicks;
    private BukkitRunnable task;

    /** param = "EFFET:ticks:amplificateur+..." (ticks 0 = maintenu tant que le pouvoir est activé). */
    public CommandEffectsPower(String name, String command, String arg0, Cooldown cooldown, RoleBase role, String param, String... descriptions) {
        super(name, arg0, cooldown, role, new AddonCommandType(command), descriptions);
        boolean held = false;
        int longest = 0;
        for (String entry : param.split("\\+")) {
            String[] e = entry.split(":");
            ItemPowerSupport.Effect effect = new ItemPowerSupport.Effect(false, e[0], Integer.parseInt(e[1]), Integer.parseInt(e[2]));
            this.effects.add(effect);
            if (effect.ticks == 0) held = true; else longest = Math.max(longest, effect.ticks);
        }
        this.hasHeldEffect = held;
        this.longestTimedTicks = longest;
    }

    /** Saisie de la commande : si le pouvoir est actif, la même commande le désactive (sans cooldown) ; sinon activation normale. */
    @Override
    public void call(String[] strings, ICommandType type, Player player) {
        if (this.active && strings.length > 0 && strings[0].equalsIgnoreCase(getArg0())
                && getCommandType().getAlias().equals(type.getAlias())) {
            stop(player, "§7Vous avez§c désactivé§r ");
            return;
        }
        super.call(strings, type, player);
    }

    /** Activation (appelée par checkUse une fois le cooldown et le nombre d'utilisations vérifiés). */
    @Override
    public boolean onUse(Player player, Map<String, Object> map) {
        if (this.active) return false;
        this.active = true;
        this.elapsedTicks = 0;
        this.task = new BukkitRunnable() {
            @Override
            public void run() {
                tick();
            }
        };
        this.task.runTaskTimer(Main.getInstance(), 0L, REFRESH_TICKS); // premier passage tout de suite : les effets arrivent à l'activation
        player.sendMessage("§7Vous avez§a activé§r " + getName() + (this.hasHeldEffect ? "§7 (retapez la commande pour le désactiver)." : "§7."));
        return true;
    }

    private void tick() {
        if (!this.active) {
            cancelTask();
            return;
        }
        UUID id = getRole().getPlayer();
        GamePlayer gamePlayer = id == null ? null : GamePlayer.of(id);
        // partie finie, joueur mort ou sans rôle : tout s'arrête sans bruit
        if (!GameState.inGame() || gamePlayer == null || gamePlayer.getRole() == null || !gamePlayer.isAlive()) {
            this.active = false;
            cancelTask();
            return;
        }
        Player player = Bukkit.getPlayer(id);
        if (player != null && player.isOnline()) {
            for (ItemPowerSupport.Effect effect : this.effects) {
                if (effect.ticks == 0) {
                    ItemPowerSupport.give(this, player, new ItemPowerSupport.Effect(false, effect.type, HELD_TICKS, effect.amplifier));
                } else if (this.elapsedTicks == 0) {
                    ItemPowerSupport.give(this, player, effect); // effet limité : donné une seule fois, pour sa durée
                }
            }
        }
        this.elapsedTicks += REFRESH_TICKS;
        if (!this.hasHeldEffect && this.elapsedTicks >= this.longestTimedTicks) {
            stop(player, "§7Les effets de§r ");
        }
    }

    /** Éteint le pouvoir : arrête la tâche, retire les effets encore actifs et prévient le joueur (message + nom du pouvoir). */
    private void stop(Player player, String messageStart) {
        this.active = false;
        cancelTask();
        if (player == null) return;
        removeEffects(player);
        player.sendMessage(messageStart + getName() + (messageStart.contains("effets") ? "§7 sont terminés." : "§7."));
    }

    private void cancelTask() {
        if (this.task != null) this.task.cancel();
        this.task = null;
    }

    /**
     * Retire les effets de ce pouvoir qui courent encore : même type, même niveau et une durée restante qui ne dépasse pas ce
     * que le pouvoir a donné (un effet plus long vient d'une autre source et reste).
     */
    private void removeEffects(Player player) {
        for (ItemPowerSupport.Effect effect : this.effects) {
            int maxTicks = effect.ticks == 0 ? HELD_TICKS : effect.ticks;
            for (PotionEffect current : new ArrayList<>(player.getActivePotionEffects())) {
                if (current.getType().getName().equals(effect.type) && current.getAmplifier() == effect.amplifier && current.getDuration() <= maxTicks) {
                    player.removePotionEffect(current.getType());
                }
            }
        }
    }
}
