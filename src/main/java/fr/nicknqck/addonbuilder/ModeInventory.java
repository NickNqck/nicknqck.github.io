package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.utils.fastinv.FastInv;
import org.bukkit.Material;

import java.util.List;

/**
 * Inventaire de configuration d'un mode de jeu de 1 à 4 équipes, construit comme ZeldaBasicInventory :
 * 27 cases, coins en vitre grise, flèche de retour en case 4 et une équipe par bouton, au milieu.
 * (Pour plus de 4 équipes : PaginatedModeInventory.)
 */
public final class ModeInventory extends FastInv {

    /** Cases d'équipes pour 1, 2, 3 et 4 équipes (rangée du milieu). */
    private static final int[][] SLOTS = {{13}, {12, 14}, {11, 13, 15}, {10, 12, 14, 16}};

    public ModeInventory(final String modeName, final List<ITeam> teams) {
        super(27, ModeMenus.title(modeName));
        setItems(getCorners(), ModeMenus.glass());
        setItem(4, ModeMenus.backItem(), ModeMenus::back);
        if (teams.isEmpty()) {
            setItem(13, ModeMenus.named(Material.BARRIER, 0, "\u00a7cAucune \u00e9quipe"), event -> { });
            return;
        }
        final int[] slots = SLOTS[Math.min(teams.size(), SLOTS.length) - 1];
        for (int i = 0; i < teams.size() && i < slots.length; i++) {
            final ITeam team = teams.get(i);
            setItem(slots[i], ModeMenus.teamItem(team), ModeMenus.teamClick(modeName, teams, team));
        }
    }
}
