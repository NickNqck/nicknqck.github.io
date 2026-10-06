package fr.nicknqck.addonbuilder;

import fr.nicknqck.events.custom.DayEvent;
import fr.nicknqck.events.custom.NightEvent;
import fr.nicknqck.roles.builder.RoleBase;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/**
 * NoFall qui suit le cycle jour / nuit : DayEvent est lancé à chaque début de jour, NightEvent à chaque début de nuit.
 * Mode « jour » : NoFall actif de jour seulement ; mode « nuit » : actif de nuit seulement.
 */
public class NoFallCycleListener implements Listener {

    private final RoleBase role;
    private final boolean dayMode;

    public NoFallCycleListener(RoleBase role, boolean dayMode) {
        this.role = role;
        this.dayMode = dayMode;
    }

    @EventHandler
    public void onDay(DayEvent event) {
        this.role.setNoFall(this.dayMode);
    }

    @EventHandler
    public void onNight(NightEvent event) {
        this.role.setNoFall(!this.dayMode);
    }
}
