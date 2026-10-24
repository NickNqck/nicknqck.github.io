package fr.nicknqck.addonbuilder;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.PluginCommand;
import fr.nicknqck.interfaces.ICommandType;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Addon générique : lit addon-config.json (ajouté dans le jar par le site) et enregistre dans UHC-Meetup
 * les modes de jeu et les équipes décrits. Les appels vers UHC-Meetup passent par la réflexion, ce qui
 * rend ce jar indépendant des signatures exactes de UHC-Meetup.
 */
public class Main extends JavaPlugin {

    /** Enum des équipes, générée par le site et ajoutée au jar (absente s'il n'y a aucune équipe). */
    static final String TEAMS_CLASS = "fr.nicknqck.addonbuilder.AddonTeams";

    /** Enum des rôles, générée par le site (absente s'il n'y a aucun rôle). */
    static final String ROLES_CLASS = "fr.nicknqck.addonbuilder.AddonRoles";

    /** Package des classes de rôles générées (une par rôle, nommée comme la constante de AddonRoles). */
    private static final String ROLE_PACKAGE = "fr.nicknqck.addonbuilder.roles.";

    private static Main instance;

    /** Le plugin de l'addon (sert à planifier les tâches des passifs). */
    static Main getInstance() {
        return instance;
    }

    @Override
    public void onEnable() {
        instance = this;
        try (InputStream in = getResource("addon-config.json")) {
            if (in == null) throw new IllegalStateException("addon-config.json est absent du jar");
            Map<String, Object> root = MiniJson.object(MiniJson.parse(read(in)));
            Map<String, Object> settings = MiniJson.object(root.get("settings"));

            for (Object entry : MiniJson.array(settings.get("modes"))) {
                Map<String, Object> mode = MiniJson.object(entry);
                registerMode(MiniJson.string(mode.get("name")), MiniJson.string(mode.get("item")));
            }
            if (!MiniJson.array(settings.get("teams")).isEmpty()) {
                registerTeams();
            }
            if (!MiniJson.array(settings.get("roles")).isEmpty()) {
                loadRoles();
            }
            registerCommands(MiniJson.array(settings.get("commands")));
            // variables (menu Variables du site) : absentes d'un ancien addon-config.json
            if (settings.get("variables") != null) Variables.load(MiniJson.array(settings.get("variables")));
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Impossible de charger l'addon : " + e);
            Bukkit.getPluginManager().disablePlugin(this);
        }
    }

    private void registerMode(String name, String materialName) throws Exception {
        Material material = Material.matchMaterial(materialName);
        if (material == null) material = Material.STONE;
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName("\u00a7a" + name);
        item.setItemMeta(meta);
        playableMdj().add(new ConfigMDJ(name, item, getClass().getClassLoader()));
    }

    /** fr.nicknqck.Main.getInstance().getGameConfig().getPlayableMdj() */
    @SuppressWarnings("unchecked")
    private Collection<Object> playableMdj() throws Exception {
        Object meetup = Class.forName("fr.nicknqck.Main").getMethod("getInstance").invoke(null);
        Object config = meetup.getClass().getMethod("getGameConfig").invoke(meetup);
        return (Collection<Object>) config.getClass().getMethod("getPlayableMdj").invoke(config);
    }

    /** fr.nicknqck.managers.InfoManager.registerITeamImplementation(AddonTeams.class) */
    private void registerTeams() throws Exception {
        Class<?> teams = Class.forName(TEAMS_CLASS, true, getClass().getClassLoader());
        Class.forName("fr.nicknqck.managers.InfoManager")
                .getMethod("registerITeamImplementation", Class.class)
                .invoke(null, teams);
    }

    /**
     * Enregistre les commandes de l'addon (déclarées dans plugin.yml par le site, alias compris), comme UHC-Meetup :
     * getCommand("nom").setExecutor(...) puis setTabCompleter(...). Chaque commande a son exécuteur et son TabCompleter.
     */
    private void registerCommands(List<Object> commands) {
        for (Object entry : commands) {
            String name = MiniJson.string(MiniJson.object(entry).get("name"));
            PluginCommand command = getCommand(name);
            if (command == null) {
                Bukkit.getLogger().warning("[UHC-Addon] Commande absente de plugin.yml, ignoree : /" + name);
                continue;
            }
            ICommandType type = new AddonCommandType(name);
            command.setExecutor(new AddonCommands(type));
            command.setTabCompleter(new AddonCompleter(type));
            Bukkit.getLogger().info("[UHC-Addon] Commande enregistree : /" + name);
        }
    }

    /** Charge AddonRoles (cela vérifie aussi que chaque équipe et chaque objet se résolvent bien). */
    private void loadRoles() throws Exception {
        Class<?> roles = Class.forName(ROLES_CLASS, true, getClass().getClassLoader());
        // Une classe par rôle (fr.nicknqck.addonbuilder.roles.<constante>) : on vérifie qu'elles se chargent bien
        for (Object role : roles.getEnumConstants()) {
            Class.forName(ROLE_PACKAGE + ((Enum<?>) role).name(), true, getClass().getClassLoader());
        }
        // Enregistrement des rôles dans UHC-Meetup + écoute de l'évènement qui demande leur création
        // (dans une classe à part, pas dans cette Main)
        Bukkit.getPluginManager().registerEvents(new RegisterRoleListener(roles), this);
        // rôles placés dans une équipe sans page dans le menu des rôles d'un mode d'UHC-Meetup : page ajoutée
        MeetupPages.install(roles.getEnumConstants());
        Bukkit.getLogger().info("[UHC-Addon] " + roles.getEnumConstants().length + " role(s) enregistre(s)");
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int n;
        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
