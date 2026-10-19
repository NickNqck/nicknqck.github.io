package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.IMDJ;
import fr.nicknqck.interfaces.IRoles;
import fr.nicknqck.interfaces.ITeam;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Mode de jeu décrit par addon-config.json (nom + objet qui le représente).
 * Un clic dessus ouvre son inventaire de configuration, qui liste les équipes du mode : ModeInventory (FastInv)
 * jusqu'à 4 équipes, PaginatedModeInventory (PaginatedFastInv) au-delà.
 */
public class ConfigMDJ implements IMDJ {

    private final String name;
    private final ItemStack item;
    private final ClassLoader loader;

    public ConfigMDJ(String name, ItemStack item, ClassLoader loader) {
        this.name = name;
        this.item = item;
        this.loader = loader;
    }

    /** Nom du mode (IMDJ.name() : pour les modes d'UHC-Meetup, c'est le nom de la constante d'enum MDJ). */
    @Override
    public String name() {
        return this.name;
    }

    @Override
    public ItemStack getItem() {
        return this.item.clone();
    }

    @Override
    public Consumer<Player> getConsumer() {
        return player -> ModeMenus.show(this.name, findTeams(), player);
    }

    /**
     * Équipes du mode : celles de l'addon qui lui appartiennent, puis celles utilisées par ses rôles
     * (ce qui inclut par exemple TeamList.Solo), sans doublon, dans l'ordre de création.
     */
    private List<ITeam> findTeams() {
        final String mdj = this.name.toLowerCase(Locale.ROOT);
        final List<ITeam> teams = new ArrayList<>();
        try {
            Class<?> teamsEnum = load(Main.TEAMS_CLASS);
            if (teamsEnum != null) {
                for (Object constant : teamsEnum.getEnumConstants()) {
                    ITeam team = (ITeam) constant;
                    if (mdj.equalsIgnoreCase(team.getMdj()) && !teams.contains(team)) teams.add(team);
                }
            }
            Class<?> rolesEnum = load(Main.ROLES_CLASS);
            if (rolesEnum != null) {
                for (Object constant : rolesEnum.getEnumConstants()) {
                    IRoles<?> role = (IRoles<?>) constant;
                    if (mdj.equalsIgnoreCase(role.getMdj()) && !teams.contains(role.getTeam())) teams.add(role.getTeam());
                }
            }
        } catch (Exception e) {
            org.bukkit.Bukkit.getLogger().severe("[UHC-Addon] Equipes du mode " + this.name + " introuvables : " + e);
        }
        return teams;
    }

    private Class<?> load(String className) {
        try {
            return Class.forName(className, true, this.loader);
        } catch (ClassNotFoundException e) {
            return null; // pas d'équipe (ou pas de rôle) dans cet addon
        }
    }
}
