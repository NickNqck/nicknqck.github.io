package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.utils.particles.MathUtil;
import fr.nicknqck.utils.powers.ItemPower;
import org.bukkit.Effect;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.entity.Snowball;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Pouvoir « lancer un projectile » (dans l'esprit de MasterSwordPower de Link et de l'Arc Explosif de Deidara) :
 * le clic lance une flèche ou une boule de neige marquée par une métadonnée ; quand elle s'arrête (atterrissage OU joueur
 * touché : ProjectileHitEvent), l'impact peut téléporter l'utilisateur, créer une zone de dégâts et lui donner des effets.
 */
final class ProjectileSupport implements Listener {

    /** Un écouteur par pouvoir (clé faible). */
    private static final Map<ItemPower, ProjectileSupport> LISTENERS =
            Collections.synchronizedMap(new WeakHashMap<ItemPower, ProjectileSupport>());

    private final ItemPower power;
    private final String key = "uhcaddon.projectile." + java.util.UUID.randomUUID();

    private ProjectileSupport(ItemPower power) {
        this.power = power;
    }

    /** Appelée une fois par pouvoir qui lance des projectiles : crée l'écouteur et l'enregistre (EventUtils.registerRoleEvent). */
    static void register(ItemPower power) {
        if (LISTENERS.containsKey(power)) return;
        ProjectileSupport listener = new ProjectileSupport(power);
        LISTENERS.put(power, listener);
        RoleSupport.registerListener(listener);
    }

    /** Lance le projectile du clic (équivalent de launchProjectile + setMetadata de Link). true = lancé. */
    static boolean launch(ItemPower power, Player player, ItemPowerSupport.Action action) {
        ProjectileSupport listener = LISTENERS.get(power);
        if (listener == null || action.launch == null) return false;
        Class<? extends Projectile> type = "SNOWBALL".equals(action.launch.projectile) ? Snowball.class : Arrow.class;
        Projectile projectile = player.launchProjectile(type);
        projectile.setMetadata(listener.key, new FixedMetadataValue(Main.getInstance(), action));
        return true;
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onHit(ProjectileHitEvent event) {
        Projectile projectile = event.getEntity();
        if (!projectile.hasMetadata(this.key)) return;
        Object value = projectile.getMetadata(this.key).get(0).value();
        projectile.removeMetadata(this.key, Main.getInstance()); // un seul impact par projectile
        ProjectileSource shooter = projectile.getShooter();
        if (!(shooter instanceof Player) || !(value instanceof ItemPowerSupport.Action)) return;
        Player owner = (Player) shooter;
        if (!owner.getUniqueId().equals(this.power.getRole().getPlayer())) return;
        impact(owner, projectile.getLocation(), (ItemPowerSupport.Action) value);
    }

    private void impact(Player owner, Location impact, ItemPowerSupport.Action action) {
        ItemPowerSupport.Launch launch = action.launch;
        if (launch.zone) zone(owner, impact, launch);
        if (launch.teleport) teleportOwner(owner, impact);
        for (ItemPowerSupport.Effect effect : action.effects) {
            ItemPowerSupport.give(this.power, owner, effect);
        }
    }

    // ---------- zone de dégâts (comme le C1 et le C4 de Deidara), dessinée avec MathUtil ----------

    /**
     * Crée la zone : explosion, premier coup immédiat, puis cercle de particules (MathUtil) montré aux joueurs à la création
     * et redessiné toutes les 5 ticks tant que la zone est active. Une zone instantanée (0 s) reste visible 1 seconde ;
     * une zone qui dure fait des dégâts chaque seconde puis prévient l'utilisateur quand elle se termine.
     */
    private void zone(final Player owner, final Location center, final ItemPowerSupport.Launch launch) {
        center.getWorld().playEffect(center, Effect.EXPLOSION_LARGE, 0);
        hurt(owner, center, launch);
        draw(center, launch);
        final int duration = Math.max(launch.seconds, 1) * 20; // en ticks
        new BukkitRunnable() {
            int tick = 0;

            @Override
            public void run() {
                if (!GameState.inGame()) {
                    cancel();
                    return;
                }
                tick += 5;
                if (tick >= duration) {
                    if (launch.seconds > 0) owner.sendMessage("\u00a77Votre zone ne fait plus d'effet");
                    cancel();
                    return;
                }
                if (launch.seconds > 0 && tick % 20 == 0) hurt(owner, center, launch);
                draw(center, launch);
            }
        }.runTaskTimer(Main.getInstance(), 5L, 5L);
    }

    /** Dessine la limite de la zone pour tous les joueurs proches : deux cercles RGB superposés (MathUtil.spawnRGBCircleParticle). */
    private static void draw(Location center, ItemPowerSupport.Launch launch) {
        float red = (launch.rgb >> 16) & 255, green = (launch.rgb >> 8) & 255, blue = launch.rgb & 255;
        int amount = Math.max(24, Math.min(120, launch.radius * 6));
        MathUtil.spawnRGBCircleParticle(red, green, blue, center, launch.radius, amount);
        MathUtil.spawnRGBCircleParticle(red, green, blue, center.clone().add(0, 1.0, 0), launch.radius, amount);
    }

    /** Blesse les joueurs en jeu dans le rayon (sauf l'utilisateur) ; le coup fatal est attribué à l'utilisateur. */
    private void hurt(Player owner, Location center, ItemPowerSupport.Launch launch) {
        World world = center.getWorld();
        double radius = launch.radius;
        for (Player victim : world.getPlayers()) {
            if (victim.getUniqueId().equals(owner.getUniqueId()) || victim.getGameMode() == GameMode.SPECTATOR) continue;
            GamePlayer gamePlayer = GamePlayer.of(victim.getUniqueId());
            if (gamePlayer == null || gamePlayer.getRole() == null || !gamePlayer.isAlive()) continue;
            if (victim.getLocation().distanceSquared(center) > radius * radius) continue;
            double damage = launch.damageHp;
            if (victim.getHealth() - damage <= 0.0) {
                victim.damage(800.0, owner);
            } else {
                victim.damage(0.0, owner);
                victim.setHealth(victim.getHealth() - damage);
            }
            victim.playSound(victim.getLocation(), Sound.EXPLODE, 1f, 8f);
            victim.sendMessage("\u00a77Vous avez \u00e9t\u00e9 touch\u00e9 par\u00a7r " + this.power.getName() + "\u00a77 de\u00a7c " + this.power.getRole().getName());
            owner.sendMessage("\u00a7c" + victim.getDisplayName() + "\u00a77 a subi les d\u00e9g\u00e2ts de votre\u00a7r " + this.power.getName());
        }
    }

    // ---------- téléportation de l'utilisateur au point d'impact ----------

    /**
     * Téléporte l'utilisateur à l'impact : une flèche plantée dans un mur est à l'intérieur d'un bloc, on recule donc de
     * 0,5 en 0,5 bloc (jusqu'à 2) vers l'utilisateur pour trouver un endroit où se tenir.
     */
    private static void teleportOwner(Player owner, Location impact) {
        Location from = owner.getLocation();
        double dx = impact.getX() - from.getX(), dy = impact.getY() - from.getY(), dz = impact.getZ() - from.getZ();
        double length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        for (double back = 0.0; back <= 2.0; back += 0.5) {
            Location candidate = impact.clone();
            if (length > 0) candidate.add(-dx / length * back, -dy / length * back, -dz / length * back);
            Location spot = TeleportSupport.safe(candidate);
            if (spot != null) {
                spot.setYaw(from.getYaw());
                spot.setPitch(from.getPitch());
                owner.teleport(spot);
                return;
            }
        }
        owner.sendMessage("\u00a7cImpossible de vous t\u00e9l\u00e9porter au point d'impact : pas de place s\u00fbre");
    }
}
