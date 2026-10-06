package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.utils.fastinv.PaginatedFastInv;
import org.bukkit.Material;

import java.util.Arrays;
import java.util.List;

/**
 * Inventaire de configuration d'un mode de jeu de plus de 4 équipes : même présentation que ModeInventory, mais
 * paginé (PaginatedFastInv) : 7 équipes par page sur la rangée du milieu, flèches de page en cases 21 et 23.
 */
public final class PaginatedModeInventory extends PaginatedFastInv {

    /** Rangée du milieu : le contenu paginé ne doit pas recouvrir les bordures ni les flèches. */
    private static final List<Integer> CONTENT_SLOTS = Arrays.asList(10, 11, 12, 13, 14, 15, 16);

    public PaginatedModeInventory(final String modeName, final List<ITeam> teams) {
        super(27, ModeMenus.title(modeName));
        setContentSlots(CONTENT_SLOTS);
        setItems(getCorners(), ModeMenus.glass());
        setItem(4, ModeMenus.backItem(), ModeMenus::back);
        previousPageItem(21, page -> ModeMenus.named(Material.ARROW, 0, "\u00a7ePage pr\u00e9c\u00e9dente \u00a77(" + page + ")"));
        nextPageItem(23, page -> ModeMenus.named(Material.ARROW, 0, "\u00a7ePage suivante \u00a77(" + page + ")"));
        for (final ITeam team : teams) {
            addContent(ModeMenus.teamItem(team), ModeMenus.teamClick(modeName, teams, team));
        }
    }
}
