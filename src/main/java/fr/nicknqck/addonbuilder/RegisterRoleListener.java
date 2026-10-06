package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.GiveRoleDeclenchExternalPluginEvent;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.UUID;

/**
 * Enregistre les rôles de l'addon dans UHC-Meetup et les instancie quand le cœur demande un rôle de cet addon.
 * Équivalent du RegisterRoleListener de Zelda-UHC, mais piloté par l'enum AddonRoles générée par le site
 * (volontairement séparé de la classe Main du plugin). Les appels vers UHC-Meetup passent par la réflexion.
 */
public class RegisterRoleListener implements Listener {

    private static final String ROLE_PACKAGE = "fr.nicknqck.addonbuilder.roles.";

    private final Class<?> rolesEnum;

    /** Équivaut à Main.getInstance().getRoleManager().registerRole(X.class) pour chaque rôle. */
    public RegisterRoleListener(Class<?> rolesEnum) throws Exception {
        this.rolesEnum = rolesEnum;
        Object manager = call(Class.forName("fr.nicknqck.Main").getMethod("getInstance").invoke(null), "getRoleManager");
        Method register = method(manager.getClass(), "registerRole");
        for (Object role : rolesEnum.getEnumConstants()) {
            try {
                register.invoke(manager, roleClass(role));
            } catch (InvocationTargetException e) {
                throw new IllegalStateException("registerRole a echoue pour " + role + " : " + e.getCause(), e.getCause());
            }
        }
    }

    /** Quand le cœur demande un rôle de AddonRoles : on crée la classe correspondante pour ce joueur. */
    @EventHandler(priority = EventPriority.HIGH)
    public void onPluginRoleGive(GiveRoleDeclenchExternalPluginEvent event) {
        try {
            Object type = call(event, "getRoleType");
            if (!this.rolesEnum.isInstance(type)) return; // rôle d'un autre plugin
            UUID player = (UUID) call(event, "getPlayerUUID");
            Object role = roleClass(type).getConstructor(UUID.class).newInstance(player);
            method(event.getClass(), "setRoleBase").invoke(event, role);
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Impossible de donner le role : " + e);
        }
    }

    private Class<?> roleClass(Object roleConstant) throws ClassNotFoundException {
        return Class.forName(ROLE_PACKAGE + ((Enum<?>) roleConstant).name(), true, this.rolesEnum.getClassLoader());
    }

    private static Object call(Object target, String name) throws Exception {
        return target.getClass().getMethod(name).invoke(target);
    }

    private static Method method(Class<?> type, String name) {
        for (Method m : type.getMethods()) {
            if (m.getName().equals(name) && m.getParameterTypes().length == 1) return m;
        }
        throw new IllegalStateException("methode " + name + " introuvable dans " + type.getName());
    }
}
