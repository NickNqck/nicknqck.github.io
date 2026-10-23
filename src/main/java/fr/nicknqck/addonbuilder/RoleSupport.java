package fr.nicknqck.addonbuilder;

import fr.nicknqck.interfaces.IRole;
import fr.nicknqck.roles.builder.AutomaticDesc;
import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.itembuilder.ItemBuilder;
import fr.nicknqck.utils.powers.ItemPower;
import fr.nicknqck.utils.powers.Power;
import net.md_5.bungee.api.chat.TextComponent;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.event.Listener;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;

/**
 * Aides appelées par l'enum AddonRoles générée par le site : elles retrouvent l'équipe d'un rôle (enum de l'addon
 * ou TeamList d'UHC-Meetup) et fabriquent l'objet qui le représente dans les menus.
 */
public final class RoleSupport {

    private RoleSupport() {
    }

    /** Retourne la constante d'enum nommée constant dans la classe enumClass (un ITeam). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static Object team(String enumClass, String constant) {
        try {
            Class<?> type = Class.forName(enumClass, true, RoleSupport.class.getClassLoader());
            return Enum.valueOf((Class) type, constant);
        } catch (ClassNotFoundException e) {
            throw new IllegalStateException("Classe d'equipes introuvable : " + enumClass, e);
        }
    }

    public static ItemStack item(String materialName, String displayName) {
        Material material = Material.matchMaterial(materialName);
        if (material == null) material = Material.STONE;
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName(displayName);
        item.setItemMeta(meta);
        return item;
    }

    /**
     * Appelée par RoleGiven des classes de rôles générées : équivaut à
     * givePotionEffect(new PotionEffect(type, ticks, amplifier, false, false), EffectWhen.when) de RoleBase.
     * Passe par la réflexion pour ne pas dépendre de la visibilité exacte de cette méthode.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void effect(Object role, String type, int ticks, int amplifier, String when) {
        try {
            PotionEffectType potion = PotionEffectType.getByName(type);
            if (potion == null) throw new IllegalArgumentException("effet inconnu : " + type);
            Class<?> whenClass = Class.forName("fr.nicknqck.enums.EffectWhen", true, RoleSupport.class.getClassLoader());
            Object moment = Enum.valueOf((Class) whenClass, when);
            PotionEffect effect = new PotionEffect(potion, ticks, amplifier, false, false);
            for (Class<?> c = role.getClass(); c != null; c = c.getSuperclass()) {
                for (Method m : c.getDeclaredMethods()) {
                    Class<?>[] p = m.getParameterTypes();
                    if (m.getName().equals("givePotionEffect") && p.length == 2
                            && p[0].isAssignableFrom(PotionEffect.class) && p[1] == whenClass) {
                        m.setAccessible(true);
                        m.invoke(role, effect, moment);
                        return;
                    }
                }
            }
            throw new IllegalStateException("methode givePotionEffect(PotionEffect, EffectWhen) introuvable");
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Effet " + type + " impossible : " + e);
        }
    }

    /**
     * Appelée par RoleGiven des classes de rôles générées : NoFall via setNoFall de RoleBase.
     * PERMANENT : actif tout le temps. DAY / NIGHT : l'état de départ suit le moment actuel (isNightTime), puis un écouteur
     * (DayEvent / NightEvent, enregistré par EventUtils.registerRoleEvent) le met à jour à chaque début de jour et de nuit.
     */
    public static void noFall(Object role, String mode) {
        try {
            RoleBase base = (RoleBase) role;
            if ("PERMANENT".equals(mode)) {
                base.setNoFall(true);
                return;
            }
            boolean dayMode = "DAY".equals(mode);
            boolean night = base.getGameState().isNightTime();
            base.setNoFall(dayMode ? !night : night);
            registerListener(new NoFallCycleListener(base, dayMode));
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] NoFall impossible : " + e);
        }
    }

    /**
     * Description d'un rôle dont le NoFall ne vaut que le jour ou que la nuit. AutomaticDesc.getText() écrit « No Fall de manière
     * permanente » dès que RoleBase.isNoFall() est vrai (donc, ici, pendant le moment concerné) : on construit le texte avec un
     * mandataire (Proxy) de IRole qui n'est pas un RoleBase, ce qui évite cette ligne, puis on ajoute la bonne précision.
     * Les effets et les pouvoirs sont repris exactement comme dans AutomaticDesc.createFullAutomaticDesc.
     */
    public static TextComponent description(final Object role, String mode) {
        return component(role, mode, "");
    }

    /**
     * Description d'un rôle : comme AutomaticDesc.createFullAutomaticDesc (effets, pouvoirs, NoFall permanent), plus les
     * lignes en plus (extra, séparées par \n : résurrection...) et, pour un NoFall limité au jour / à la nuit, la bonne
     * précision à la place de « de manière permanente » (mandataire IRole qui n'est pas un RoleBase, voir plus haut).
     */
    public static TextComponent component(final Object role, String noFall, String extra) {
        final IRole real = (IRole) role;
        final boolean timed = "DAY".equals(noFall) || "NIGHT".equals(noFall);
        IRole view = !timed ? real : (IRole) Proxy.newProxyInstance(IRole.class.getClassLoader(), new Class<?>[]{IRole.class}, new InvocationHandler() {
            @Override
            public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                try {
                    return method.invoke(real, args);
                } catch (InvocationTargetException e) {
                    throw e.getCause();
                }
            }
        });
        AutomaticDesc desc = new AutomaticDesc(view).addEffects(view.getEffects()).setPowers(view.getPowers());
        if (timed) desc.addCustomLine("\u00a77Vous poss\u00e9dez\u00a7a No Fall\u00a77 " + ("DAY".equals(noFall) ? "le\u00a7c jour" : "la\u00a7c nuit"));
        if (extra != null && !extra.isEmpty()) {
            for (String line : extra.split("\n")) desc.addCustomLine(line);
        }
        return desc.getText();
    }

    /** Résurrection une fois par partie (option du rôle) : voir ReviveListener. */
    public static void revive(Object role, int heartsLost, int radius) {
        registerListener(new ReviveListener((RoleBase) role, heartsLost, radius));
    }

    /** Crée le pouvoir (classe générée, constructeur Power(RoleBase)) puis l'ajoute au rôle avec addPower(Power). */
    public static void addPower(Object role, String powerClass) {
        attach(role, powerClass, false);
    }

    /** Pouvoir objet : addPower(ItemPower, true) donne aussi l'objet au joueur (comme addPower(..., true) de Gyomei). */
    public static void addItemPower(Object role, String powerClass) {
        attach(role, powerClass, true);
    }

    @SuppressWarnings("unchecked")
    private static void attach(Object role, String powerClass, boolean give) {
        try {
            Class<?> type = Class.forName(powerClass, true, RoleSupport.class.getClassLoader());
            Object power = null;
            for (Constructor<?> c : type.getConstructors()) {
                if (c.getParameterTypes().length == 1 && c.getParameterTypes()[0].isInstance(role)) {
                    power = c.newInstance(role);
                    break;
                }
            }
            if (power == null) throw new IllegalStateException("constructeur (RoleBase) introuvable dans " + powerClass);
            for (Class<?> c = role.getClass(); c != null; c = c.getSuperclass()) {
                for (Method m : c.getDeclaredMethods()) {
                    Class<?>[] p = m.getParameterTypes();
                    if (!m.getName().equals("addPower") || !p[0].isInstance(power)) continue;
                    if (give && p.length == 2 && p[1] == boolean.class) {
                        m.setAccessible(true);
                        m.invoke(role, power, true);
                        return;
                    }
                    if (!give && p.length == 1) {
                        m.setAccessible(true);
                        m.invoke(role, power);
                        return;
                    }
                }
            }
            Object powers = role.getClass().getMethod("getPowers").invoke(role);
            ((Collection<Object>) powers).add(power);
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Pouvoir " + powerClass + " impossible : " + e);
        }
    }

    /** ItemBuilder de l'objet d'un pouvoir : new ItemBuilder(matériau).setName(nom). */
    public static ItemBuilder itemBuilder(String materialName, String displayName) {
        Material material = Material.matchMaterial(materialName);
        if (material == null) material = Material.STONE;
        return new ItemBuilder(material).setName(displayName);
    }

    /**
     * Objet d'un pouvoir avec une apparence, look = "brillant;cachés;incassable;ENCHANT:niveau,ENCHANT:niveau"
     * (1 = oui). Les vrais enchantements passent par ItemBuilder.addEnchant (niveaux au-delà du maximum acceptés).
     * Brillant sans vrai enchantement : un enchantement sans effet sur l'objet (Appât, ou Infinité pour une canne à
     * pêche) est ajouté puis caché, l'objet scintille comme s'il était enchanté. Cachés : HIDE_ENCHANTS.
     */
    public static ItemBuilder itemBuilder(String materialName, String displayName, String look) {
        ItemBuilder builder = itemBuilder(materialName, displayName);
        String[] parts = look.split(";", -1);
        if (parts.length < 4) return builder;
        boolean enchanted = false;
        for (String entry : parts[3].split(",")) {
            int colon = entry.indexOf(':');
            if (colon <= 0) continue;
            Enchantment enchantment = Enchantment.getByName(entry.substring(0, colon));
            if (enchantment == null) {
                Bukkit.getLogger().severe("[UHC-Addon] Enchantement inconnu : " + entry);
                continue;
            }
            builder.addEnchant(enchantment, Integer.parseInt(entry.substring(colon + 1)));
            enchanted = true;
        }
        boolean hide = "1".equals(parts[1]);
        if ("1".equals(parts[0]) && !enchanted) {
            Material material = Material.matchMaterial(materialName);
            Enchantment glint = Enchantment.getByName(material == Material.FISHING_ROD ? "ARROW_INFINITE" : "LURE");
            if (glint != null) builder.addEnchant(glint, 1);
            hide = true;
        }
        if (hide) builder.hideEnchantAttributes();
        if ("1".equals(parts[2])) builder.setUnbreakable(true);
        return builder;
    }

    /** Appelée par le constructeur d'un pouvoir objet : enregistre ses actions de clic (voir ItemPowerSupport). */
    public static void itemInit(ItemPower power, String config) {
        ItemPowerSupport.init(power, config);
    }

    /** Appelée par onUse d'un pouvoir objet : true si l'action a réussi. */
    public static boolean itemUse(ItemPower power, Player player, Map<String, Object> map) {
        boolean done = ItemPowerSupport.use(power, player, map);
        // règles « quand j'utilise ce pouvoir » : un clic (pas une frappe) avec l'objet
        Object event = map.get("event");
        ItemPower.InteractType type = power.getInteractType();
        if (type != null && "INTERACT".equals(type.name()) && event instanceof org.bukkit.event.player.PlayerInteractEvent) {
            String click = ((org.bukkit.event.player.PlayerInteractEvent) event).getAction().name();
            if (!"PHYSICAL".equals(click) && RuleEngine.hasUse(power)) {
                done |= RuleEngine.use(power, player, click.contains("LEFT") ? "LEFT" : "RIGHT", null);
            }
        }
        return done;
    }

    /**
     * Appelée par le constructeur des pouvoirs générés qui réagissent à la partie : crée le comportement du type
     * demandé. Les écouteurs sont enregistrés avec EventUtils.registerRoleEvent (désenregistrés par UHC-Meetup en fin
     * de partie) ; l'information est une tâche qui s'arrête d'elle-même quand la partie se termine.
     * kind : BLOCK_EFFECT (param = effets séparés par des virgules), BLOCK_POWER, INFO (voir InfoPassive) ou NO_ARMOR
     * (voir NoArmorPassive).
     */
    public static void passive(Object power, String kind, int radius, String param) {
        try {
            Listener listener;
            if ("BLOCK_EFFECT".equals(kind)) {
                listener = new EffectBlockListener((Power) power, radius, new HashSet<>(Arrays.asList(param.split(","))));
            } else if ("BLOCK_POWER".equals(kind)) {
                listener = new PowerBlockListener((Power) power, radius);
            } else if ("INFO".equals(kind)) {
                new InfoPassive((Power) power, radius, param).start();
                return;
            } else if ("NO_ARMOR".equals(kind)) {
                new NoArmorPassive((Power) power, param).start();
                return;
            } else {
                throw new IllegalArgumentException("type de passif inconnu : " + kind);
            }
            registerListener(listener);
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Passif " + kind + " impossible : " + e);
        }
    }

    /** Appelée par le constructeur d'un pouvoir généré qui a des règles « quand … » (voir RuleEngine). */
    public static void rules(Object power, String json) {
        RuleEngine.install((Power) power, json);
    }

    /** EventUtils.registerRoleEvent(listener) : l'écouteur est désenregistré par UHC-Meetup en fin de partie. */
    static void registerListener(Listener listener) {
        try {
            Class.forName("fr.nicknqck.utils.event.EventUtils", true, RoleSupport.class.getClassLoader())
                    .getMethod("registerRoleEvent", Listener.class).invoke(null, listener);
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Enregistrement de l'ecouteur impossible : " + e);
        }
    }
}
