package fr.nicknqck.addonbuilder;

import fr.nicknqck.utils.powers.Cooldown;
import fr.nicknqck.utils.powers.ItemPower;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.entity.Player;

import java.util.Map;

/**
 * Pouvoir caché d'un clic (même principe que FracasPower / SuperGrabPower de GyomeiV2) : il porte le cooldown PROPRE d'un
 * clic de l'objet, ce qui permet d'utiliser le clic droit pendant que le clic gauche récupère (et inversement).
 * L'objet (ItemPower) reste celui que le joueur tient ; au clic, il passe la main à ce pouvoir avec checkUse, qui vérifie
 * le cooldown du clic, puis appelle onUse et déclenche le cooldown si l'action a réussi.
 */
final class ClickPower extends Power {

    private final ItemPower item;
    private final ItemPowerSupport.Action action;

    ClickPower(ItemPower item, String click, int seconds, ItemPowerSupport.Action action) {
        super(item.getName() + "§7 (" + click + ")§r", new Cooldown(seconds), item.getRole());
        this.item = item;
        this.action = action;
        setShowInDesc(false); // la description du rôle ne liste que l'objet, pas ses clics
    }

    @Override
    public boolean onUse(Player player, Map<String, Object> map) {
        return ItemPowerSupport.perform(this.item, this, this.action, player);
    }
}
