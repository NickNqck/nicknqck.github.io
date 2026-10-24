package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.IRoles;
import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.invs.TeamRoleInventory;
import fr.nicknqck.items.GUIItems;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pages en plus dans le menu des rôles d'un mode d'UHC-Meetup (Demon Slayer, AOT, Naruto). UHC-Meetup n'a une page que pour
 * certaines équipes de chaque mode (Démons, Slayers, Solo...) : un rôle de l'addon placé dans une autre équipe de ce mode
 * (Jigoro, Kyojuro - Shinjuro, Sasuke..., ou une équipe créée dans l'addon pour ce mode) n'y apparaîtrait pas. Pour chacune de
 * ces équipes, un bouton est ajouté au menu du mode ; il ouvre la page de l'équipe (TeamRoleInventory, comme les autres).
 */
final class MeetupPages implements Listener {

    /** Menu des rôles de chaque mode (titres d'UHC-Meetup) et équipes qui y ont déjà une page. */
    private static final Map<String, String> MENUS = new HashMap<>();
    private static final Map<String, List<String>> NATIVE = new HashMap<>();
    private static final Map<String, String> MODE_NAMES = new HashMap<>();
    static {
        MENUS.put("ds", "§fRoles§7 ->§6 DemonSlayer");
        MENUS.put("aot", "§fRoles§7 ->§6 AOT");
        MENUS.put("ns", "§fRoles§7 ->§6 NS");
        NATIVE.put("ds", Arrays.asList("Demon", "Slayer", "Solo"));
        NATIVE.put("aot", Arrays.asList("Mahr", "Titan", "Soldat", "Solo"));
        NATIVE.put("ns", Arrays.asList("Shinobi", "Akatsuki", "Orochimaru", "Solo", "Jubi", "Zabuza_et_Haku", "Kumogakure"));
        MODE_NAMES.put("ds", "DemonSlayer");
        MODE_NAMES.put("aot", "AOT");
        MODE_NAMES.put("ns", "Naruto");
    }
    /** Cases libres du menu d'un mode (27 cases ; UHC-Meetup utilise 10 à 16 et 26). */
    private static final int[] SLOTS = {18, 19, 20, 21, 22, 23, 24, 25, 0, 1, 2, 3, 4, 5, 6, 7, 8};
    private static final String MARK = "§8Ajouté par l'addon";

    /** Équipes à ajouter, par mode. */
    private final Map<String, List<ITeam>> pages = new HashMap<>();

    private MeetupPages() {
    }

    /** Appelée par Main avec les rôles de l'addon : écoute le menu des modes qui en ont besoin. */
    static void install(Object[] roles) {
        MeetupPages listener = new MeetupPages();
        for (Object o : roles) {
            IRoles<?> role = (IRoles<?>) o;
            String mdj = role.getMdj() == null ? "" : role.getMdj().toLowerCase();
            ITeam team = role.getTeam();
            if (!MENUS.containsKey(mdj) || team == null) continue;
            boolean meetupTeam = !team.getClass().getName().startsWith("fr.nicknqck.addonbuilder.");
            if (meetupTeam && NATIVE.get(mdj).contains(team.name())) continue;
            List<ITeam> list = listener.pages.get(mdj);
            if (list == null) listener.pages.put(mdj, list = new ArrayList<>());
            if (!list.contains(team) && list.size() < SLOTS.length) list.add(team);
        }
        if (listener.pages.isEmpty()) return;
        Bukkit.getPluginManager().registerEvents(listener, Main.getInstance());
        Bukkit.getLogger().info("[UHC-Addon] Pages ajoutees aux menus des roles : " + listener.pages.keySet());
    }

    private String modeOf(String title) {
        for (Map.Entry<String, String> e : MENUS.entrySet()) if (e.getValue().equals(title) && pages.containsKey(e.getKey())) return e.getKey();
        return null;
    }

    /** UHC-Meetup remplit (et vide) le menu juste après l'avoir ouvert : les boutons sont posés au tick suivant. */
    @EventHandler
    public void onOpen(InventoryOpenEvent event) {
        final String mdj = modeOf(event.getInventory().getTitle());
        if (mdj != null) addButtons(event.getInventory(), mdj);
    }

    /**
     * Avant UHC-Meetup (LOWEST) : chaque clic dans le menu des rôles lui fait vider et remplir à nouveau ses menus
     * (Inventories.menuUpdater, pour tous les joueurs du lobby). Le bouton cliqué est donc lu ici, et les boutons de tous
     * les menus ouverts sont reposés au tick suivant.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onClick(InventoryClickEvent event) {
        Inventory top = event.getView().getTopInventory();
        final String mdj = top == null ? null : modeOf(top.getTitle());
        if (mdj != null && event.getWhoClicked() instanceof Player) {
            final Player player = (Player) event.getWhoClicked();
            final ITeam team = event.getRawSlot() < top.getSize() ? teamOf(event.getCurrentItem(), mdj) : null;
            if (team != null) {
                event.setCancelled(true);
                // la page s'ouvre au tick suivant (changer d'inventaire pendant un clic est refusé par le serveur)
                Bukkit.getScheduler().runTask(Main.getInstance(), new Runnable() {
                    @Override
                    public void run() {
                        try {
                            open(player, team, mdj);
                        } catch (RuntimeException e) {
                            Bukkit.getLogger().severe("[UHC-Addon] Page de l'equipe impossible a ouvrir : " + e);
                        }
                    }
                });
            }
        }
        for (Player viewer : Bukkit.getOnlinePlayers()) {
            Inventory open = viewer.getOpenInventory() == null ? null : viewer.getOpenInventory().getTopInventory();
            String mode = open == null ? null : modeOf(open.getTitle());
            if (mode != null) addButtons(open, mode);
        }
    }

    private void addButtons(final Inventory inv, final String mdj) {
        Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
            @Override
            public void run() {
                List<ITeam> list = pages.get(mdj);
                int k = 0;
                for (int slot : SLOTS) {
                    if (k >= list.size()) break;
                    if (slot >= inv.getSize()) continue;
                    ItemStack there = inv.getItem(slot);
                    if (there != null && there.getType() != Material.AIR && !isButton(there)) continue;
                    inv.setItem(slot, button(list.get(k++)));
                }
            }
        }, 1L);
    }

    private static ItemStack button(ITeam team) {
        ItemStack item = new ItemStack(Material.WOOL, 1, woolData(team.getColor()));
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName(team.getColor() + team.getName().replaceAll("§.", ""));
        meta.setLore(Collections.singletonList(MARK));
        item.setItemMeta(meta);
        return item;
    }

    private static boolean isButton(ItemStack item) {
        return item != null && item.hasItemMeta() && item.getItemMeta().hasLore() && item.getItemMeta().getLore().contains(MARK);
    }

    private ITeam teamOf(ItemStack item, String mdj) {
        if (!isButton(item)) return null;
        for (ITeam team : pages.get(mdj)) if (button(team).getItemMeta().getDisplayName().equals(item.getItemMeta().getDisplayName())) return team;
        return null;
    }

    /** Page de l'équipe, comme celles d'UHC-Meetup ; Retour revient au menu du mode. */
    private void open(Player player, ITeam team, final String mdj) {
        String title = "§f" + MODE_NAMES.get(mdj) + "§7 -> " + team.getColor() + team.getName().replaceAll("§.", "");
        if (title.length() > 32) title = title.substring(0, 32);
        new TeamRoleInventory(title, team, mdj) {
            @Override
            protected void onBackClick(Player p) {
                if ("ds".equals(mdj)) {
                    p.openInventory(GUIItems.getDemonSlayerInventory());
                    fr.nicknqck.Main.getInstance().getInventories().updateDSInventory(p);
                } else if ("aot".equals(mdj)) {
                    p.openInventory(GUIItems.getSelectAOTInventory());
                    fr.nicknqck.Main.getInstance().getInventories().updateAOTInventory(p);
                } else {
                    p.openInventory(GUIItems.getSelectNSInventory());
                    fr.nicknqck.Main.getInstance().getInventories().updateNSInventory(p);
                }
            }
        }.open(player);
    }

    /** Couleur de laine d'après le code couleur de l'équipe (§c -> rouge...). */
    private static short woolData(String color) {
        char c = color == null || color.length() < 2 ? 'f' : color.charAt(1);
        Map<Character, Short> map = new LinkedHashMap<>();
        map.put('0', (short) 15); map.put('1', (short) 11); map.put('2', (short) 13); map.put('3', (short) 9);
        map.put('4', (short) 14); map.put('5', (short) 10); map.put('6', (short) 1); map.put('7', (short) 8);
        map.put('8', (short) 7); map.put('9', (short) 11); map.put('a', (short) 5); map.put('b', (short) 3);
        map.put('c', (short) 14); map.put('d', (short) 2); map.put('e', (short) 4); map.put('f', (short) 0);
        Short data = map.get(c);
        return data == null ? 0 : data;
    }
}
