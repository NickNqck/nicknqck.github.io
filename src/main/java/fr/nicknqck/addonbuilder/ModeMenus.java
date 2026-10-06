package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.invs.Configuration_RolesInventory;
import fr.nicknqck.invs.TeamRoleInventory;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/** Éléments communs aux inventaires de configuration d'un mode de jeu (ModeInventory et PaginatedModeInventory). */
final class ModeMenus {

    private ModeMenus() {
    }

    /** Jusqu'à 4 équipes : FastInv. Au-delà : PaginatedFastInv. */
    static void show(String modeName, List<ITeam> teams, Player player) {
        if (teams.size() > 4) {
            new PaginatedModeInventory(modeName, teams).open(player);
        } else {
            new ModeInventory(modeName, teams).open(player);
        }
    }

    static String title(String modeName) {
        return "\u00a7fConfiguration\u00a77 ->\u00a7a " + modeName;
    }

    static ItemStack glass() {
        return named(Material.STAINED_GLASS_PANE, 7, " ");
    }

    static ItemStack backItem() {
        return named(Material.ARROW, 0, "\u00a76Retour au menu pr\u00e9c\u00e9dent");
    }

    /** Clic sur la flèche de retour : menu de configuration des rôles d'UHC-Meetup. */
    static void back(InventoryClickEvent event) {
        Player player = (Player) event.getWhoClicked();
        new Configuration_RolesInventory(player).open(player);
    }

    /** Bouton d'une équipe : colorant (INK_SACK) de la couleur de l'équipe, nommé comme elle. */
    static ItemStack teamItem(ITeam team) {
        return named(Material.INK_SACK, dye(team.getColor()), team.getName());
    }

    /** Clic sur une équipe : liste de ses rôles (TeamRoleInventory), avec retour vers cet inventaire. */
    static Consumer<InventoryClickEvent> teamClick(final String modeName, final List<ITeam> teams, final ITeam team) {
        return event -> {
            final Player player = (Player) event.getWhoClicked();
            new TeamRoleInventory("\u00a7a" + modeName + "\u00a77 -> " + team.getName(), team, modeName.toLowerCase(Locale.ROOT)) {
                @Override
                protected void onBackClick(Player p) {
                    show(modeName, teams, player);
                }
            }.open(player);
        };
    }

    static ItemStack named(Material material, int durability, String name) {
        ItemStack item = new ItemStack(material, 1, (short) durability);
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName(name);
        item.setItemMeta(meta);
        return item;
    }

    /** Teinte de colorant (INK_SACK) la plus proche de la couleur Minecraft de l'équipe ("\u00a7a", "\u00a7e\u00a7l"...). */
    static int dye(String color) {
        if (color == null || color.length() < 2) return 15;
        switch (Character.toLowerCase(color.charAt(1))) {
            case '0': return 0;   // noir : encre
            case '1': return 4;   // bleu foncé : lapis
            case '2': return 2;   // vert foncé : cactus
            case '3': return 6;   // cyan foncé
            case '4': return 1;   // rouge foncé : rose
            case '5': return 5;   // violet
            case '6': return 14;  // or : orange
            case '7': return 7;   // gris clair
            case '8': return 8;   // gris
            case '9': return 12;  // bleu : bleu clair
            case 'a': return 10;  // vert clair
            case 'b': return 12;  // aqua : bleu clair
            case 'c': return 1;   // rouge
            case 'd': return 13;  // rose violet : magenta
            case 'e': return 11;  // jaune
            default: return 15;   // blanc : poudre d'os
        }
    }
}
