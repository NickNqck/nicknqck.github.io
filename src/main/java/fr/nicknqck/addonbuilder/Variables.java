package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.GameEndEvent;
import fr.nicknqck.events.custom.GameStartEvent;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Variables de l'addon (menu Variables du site), lues dans addon-config.json : nombre entier (INT), nombre à virgule
 * (DOUBLE) ou vrai / faux (BOOL, rangé comme 0 / 1), avec une valeur par joueur (PLAYER) ou une seule pour toute la partie
 * (GLOBAL). Chaque partie repart des valeurs de départ. Les règles des pouvoirs les lisent et les modifient (RuleEngine).
 */
public final class Variables implements Listener {

    private static final class Decl {
        final String type;
        final boolean global;
        final double initial, min, max;

        Decl(String type, boolean global, double initial, double min, double max) {
            this.type = type;
            this.global = global;
            this.initial = initial;
            this.min = min;
            this.max = max;
        }
    }

    private static final Map<String, Decl> DECLS = new HashMap<>();
    private static final Map<String, Double> GLOBAL = new HashMap<>();
    private static final Map<UUID, Map<String, Double>> PLAYERS = new HashMap<>();

    private Variables() {
    }

    /** Appelée par Main : déclarations des variables (réglage "variables"), et remise à zéro à chaque partie. */
    static void load(List<Object> list) {
        for (Object entry : list) {
            Map<String, Object> v = MiniJson.object(entry);
            String type = MiniJson.string(v.get("vtype"));
            boolean bool = "BOOL".equals(type);
            double initial = bool ? (Boolean.TRUE.equals(v.get("initialBool")) ? 1.0 : 0.0) : number(v.get("initial"), 0.0);
            DECLS.put(MiniJson.string(v.get("name")), new Decl(type, "GLOBAL".equals(MiniJson.string(v.get("scope"))), initial,
                    bool ? 0.0 : number(v.get("min"), -1.0E6), bool ? 1.0 : number(v.get("max"), 1.0E6)));
        }
        if (!DECLS.isEmpty()) org.bukkit.Bukkit.getPluginManager().registerEvents(new Variables(), Main.getInstance());
    }

    private static double number(Object o, double dflt) {
        return o instanceof Number ? ((Number) o).doubleValue() : dflt;
    }

    @EventHandler
    public void onStart(GameStartEvent event) {
        reset();
    }

    @EventHandler
    public void onEnd(GameEndEvent event) {
        reset();
    }

    static void reset() {
        GLOBAL.clear();
        PLAYERS.clear();
    }

    static boolean exists(String name) {
        return DECLS.containsKey(name);
    }

    static boolean isBool(String name) {
        Decl d = DECLS.get(name);
        return d != null && "BOOL".equals(d.type);
    }

    private static Map<String, Double> values(Decl d, UUID player) {
        if (d.global) return GLOBAL;
        Map<String, Double> map = PLAYERS.get(player);
        if (map == null) PLAYERS.put(player, map = new HashMap<>());
        return map;
    }

    /** Valeur de la variable (celle du joueur, ou la valeur partagée) ; 0 si elle n'existe pas. */
    static double get(String name, UUID player) {
        Decl d = DECLS.get(name);
        if (d == null || (!d.global && player == null)) return 0.0;
        Double v = values(d, player).get(name);
        return v == null ? d.initial : v;
    }

    /** Nouvelle valeur : bornée (minimum / maximum), arrondie pour un entier, 0 / 1 pour vrai / faux. */
    static void set(String name, UUID player, double value) {
        Decl d = DECLS.get(name);
        if (d == null || (!d.global && player == null) || Double.isNaN(value) || Double.isInfinite(value)) return;
        if ("INT".equals(d.type)) value = Math.round(value);
        if ("BOOL".equals(d.type)) value = value != 0.0 ? 1.0 : 0.0;
        values(d, player).put(name, Math.max(d.min, Math.min(d.max, value)));
    }

    /** Texte d'une valeur : oui / non, entier, ou nombre à virgule (2 décimales au plus). */
    static String text(String name, UUID player) {
        Decl d = DECLS.get(name);
        double v = get(name, player);
        if (d != null && "BOOL".equals(d.type)) return v != 0.0 ? "oui" : "non";
        if (v == Math.rint(v)) return String.valueOf((long) v);
        return String.valueOf(Math.round(v * 100.0) / 100.0).replace('.', ',');
    }

    static Iterable<String> names() {
        return DECLS.keySet();
    }
}
