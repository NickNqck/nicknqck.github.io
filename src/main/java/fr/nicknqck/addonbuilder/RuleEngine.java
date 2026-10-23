package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.enums.EffectWhen;
import fr.nicknqck.events.custom.DayEvent;
import fr.nicknqck.events.custom.GamePlayerEatGappleEvent;
import fr.nicknqck.events.custom.NightEvent;
import fr.nicknqck.events.custom.UHCPlayerBattleEvent;
import fr.nicknqck.events.custom.death.UHCDeathEvent;
import fr.nicknqck.events.custom.roles.PowerActivateEvent;
import fr.nicknqck.interfaces.IRoles;
import fr.nicknqck.interfaces.ITeam;
import fr.nicknqck.player.GamePlayer;
import fr.nicknqck.roles.builder.RoleBase;
import fr.nicknqck.utils.Loc;
import fr.nicknqck.utils.PotionUtils;
import fr.nicknqck.utils.powers.ItemPower;
import fr.nicknqck.utils.powers.Power;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.Vector;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Règles des pouvoirs générés par le site (blocs « quand … » : voir js/rules-data.js) : « quand <déclencheur> »,
 * des conditions (« si … alors … sinon … »), des durées (« pendant N s »), des délais et des compteurs.
 * Un moteur par pouvoir : il écoute les évènements de la partie (EventUtils.registerRoleEvent, désenregistré par
 * UHC-Meetup à la fin de la partie) et une tâche d'une seconde pour « toutes les N s ».
 *
 * Joueur « concerné » selon le déclencheur : le joueur tué (KILL), mort (DEATH), frappé (HIT_GIVEN, HITS) ou
 * l'attaquant (HIT_TAKEN).
 */
public final class RuleEngine implements Listener {

    private static final Random RANDOM = new Random();
    /** Joueurs qui ne peuvent plus utiliser de pouvoirs jusqu'à (ms) : partagé par tous les moteurs. */
    private static final Map<UUID, Long> BLOCKED = new HashMap<>();
    /** Insensibilités en cours : joueur -> (type -> jusqu'à ms, Long.MAX_VALUE = toujours). */
    private static final Map<UUID, Map<String, Long>> IMMUNE = new HashMap<>();

    private final Power power;
    private final List<Map<String, Object>> rules = new ArrayList<>();
    private final Map<String, Double> counters = new HashMap<>();
    private final Map<String, String> shownCounters = new HashMap<>(); // compteur -> texte avant la valeur
    private final long[] nextUse;      // cooldown propre à chaque règle (ms)
    private final int[] everyLeft;     // secondes avant la prochaine « toutes les N s »
    private final Map<String, Integer> hitCounts = new HashMap<>(); // « tous les N coups » : règle#joueur -> coups
    private final String key;

    @SuppressWarnings("unchecked")
    private RuleEngine(Power power, String json) {
        this.power = power;
        for (Object rule : (List<Object>) MiniJson.parse(json)) this.rules.add((Map<String, Object>) rule);
        this.nextUse = new long[this.rules.size()];
        this.everyLeft = new int[this.rules.size()];
        for (int i = 0; i < this.rules.size(); i++) {
            if ("EVERY".equals(this.rules.get(i).get("on"))) this.everyLeft[i] = num(params(this.rules.get(i)), "s");
        }
        this.key = "addon." + Integer.toHexString(System.identityHashCode(this));
    }

    /** Appelée par le constructeur du pouvoir généré : installe ses règles. */
    static void install(final Power power, String json) {
        final RuleEngine engine;
        try {
            engine = new RuleEngine(power, json);
        } catch (RuntimeException e) {
            Bukkit.getLogger().severe("[UHC-Addon] Règles illisibles pour " + power.getName() + " : " + e);
            return;
        }
        RoleSupport.registerListener(engine);
        new BukkitRunnable() {
            private boolean started;

            @Override
            public void run() {
                if (!GameState.inGame()) {
                    cancel();
                    return;
                }
                if (!started) { // « au début de la partie » : une seconde après la remise des rôles
                    started = true;
                    engine.fire("START", null, null);
                }
                engine.tick();
            }
        }.runTaskTimer(Main.getInstance(), 20L, 20L);
    }

    // ---------------------------------------------------------------- évènements

    private void tick() {
        for (int i = 0; i < rules.size(); i++) {
            if (!"EVERY".equals(rules.get(i).get("on"))) continue;
            if (--everyLeft[i] > 0) continue;
            everyLeft[i] = Math.max(1, num(params(rules.get(i)), "s"));
            run(i, null, null);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(UHCDeathEvent event) {
        if (event.isCancelled() || event.getPlayer() == null) return;
        Player dead = event.getPlayer();
        if (event.getGamePlayerKiller() != null && event.getGamePlayerKiller().getUuid().equals(ownerId())) fire("KILL", dead, null);
        if (!dead.getUniqueId().equals(ownerId())) fire("DEATH", dead, null);
    }

    @EventHandler
    public void onDay(DayEvent event) {
        fire("DAY", null, null);
    }

    @EventHandler
    public void onNight(NightEvent event) {
        fire("NIGHT", null, null);
    }

    @EventHandler
    public void onGapple(GamePlayerEatGappleEvent event) {
        if (event.getGamePlayer() != null && event.getGamePlayer().getUuid().equals(ownerId())) fire("GAPPLE", null, null);
    }

    @EventHandler
    public void onBattle(UHCPlayerBattleEvent event) {
        if (event.isPatch() || event.getOriginEvent() == null || event.getOriginEvent().isCancelled()) return;
        if (!(event.getOriginEvent().getEntity() instanceof Player) || !(event.getOriginEvent().getDamager() instanceof Player)) return;
        Player victim = (Player) event.getOriginEvent().getEntity();
        Player damager = (Player) event.getOriginEvent().getDamager();
        UUID owner = ownerId();
        if (damager.getUniqueId().equals(owner)) {
            ItemStack hand = damager.getItemInHand();
            for (int i = 0; i < rules.size(); i++) {
                Map<String, Object> rule = rules.get(i);
                Object on = rule.get("on");
                if ("HIT_GIVEN".equals(on)) {
                    String with = str(params(rule), "with");
                    if ("SWORD".equals(with) && (hand == null || !hand.getType().name().contains("SWORD"))) continue;
                    if ("ITEM".equals(with) && (!(power instanceof ItemPower) || hand == null || !hand.isSimilar(((ItemPower) power).getItem()))) continue;
                    run(i, victim, victim.getLocation());
                } else if ("HITS".equals(on)) {
                    Map<String, Object> p = params(rule);
                    String counterKey = i + "#" + ("SAME".equals(str(p, "per")) ? victim.getUniqueId().toString() : "*");
                    int hits = (hitCounts.containsKey(counterKey) ? hitCounts.get(counterKey) : 0) + 1;
                    if (hits >= num(p, "n")) {
                        hits = 0;
                        run(i, victim, victim.getLocation());
                    }
                    hitCounts.put(counterKey, hits);
                }
            }
        }
        if (victim.getUniqueId().equals(owner)) fire("HIT_TAKEN", damager, damager.getLocation());
    }

    @EventHandler
    public void onPowerUse(PowerActivateEvent event) {
        Long until = BLOCKED.get(event.getPlayer().getUniqueId());
        if (until == null) return;
        if (System.currentTimeMillis() > until) {
            BLOCKED.remove(event.getPlayer().getUniqueId());
            return;
        }
        event.setCancel(true);
        event.setCancelMessage("§cQuelque chose vous empêche d'utiliser vos pouvoirs pour le moment.");
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onDamage(EntityDamageEvent event) {
        Map<String, Long> immune = IMMUNE.get(event.getEntity().getUniqueId());
        if (immune == null) return;
        String cause = event.getCause().name();
        String type = cause.equals("FALL") ? "FALL" : cause.startsWith("FIRE") || cause.equals("LAVA") ? "FIRE" : null;
        if (type == null) return;
        Long until = immune.get(type);
        if (until != null && System.currentTimeMillis() <= until) event.setCancelled(true);
    }

    /** Lance toutes les règles du déclencheur. */
    private void fire(String trigger, Player subject, Location origin) {
        for (int i = 0; i < rules.size(); i++) {
            if (trigger.equals(rules.get(i).get("on"))) run(i, subject, origin);
        }
    }

    private void run(int index, Player subject, Location origin) {
        Map<String, Object> rule = rules.get(index);
        long now = System.currentTimeMillis();
        if (now < nextUse[index]) return;
        if (ownerId() == null) return;
        Player owner = Bukkit.getPlayer(ownerId());
        GamePlayer gameOwner = GamePlayer.of(ownerId());
        if (owner == null || gameOwner == null || !gameOwner.isAlive()) return;
        int cooldown = num(rule, "cd");
        if (cooldown > 0) nextUse[index] = now + cooldown * 1000L;
        try {
            exec(list(rule, "do"), new Ctx(owner, subject, origin == null ? owner.getLocation() : origin));
        } catch (RuntimeException e) {
            Bukkit.getLogger().severe("[UHC-Addon] Erreur dans une règle de " + power.getName() + " : " + e);
        }
    }

    // ---------------------------------------------------------------- exécution

    private static final class Ctx {
        final Player owner;
        final Player subject;
        final Location origin;

        Ctx(Player owner, Player subject, Location origin) {
            this.owner = owner;
            this.subject = subject;
            this.origin = origin;
        }
    }

    private void exec(List<Object> nodes, final Ctx ctx) {
        for (Object o : nodes) {
            @SuppressWarnings("unchecked") final Map<String, Object> node = (Map<String, Object>) o;
            final String a = str(node, "a");
            final Map<String, Object> p = params(node);
            switch (a) {
                case "IF":
                    exec(test(node, ctx) ? list(node, "do") : list(node, "else"), ctx);
                    continue;
                case "WAIT":
                    Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
                        @Override
                        public void run() {
                            if (GameState.inGame()) exec(list(node, "do"), refresh(ctx));
                        }
                    }, num(p, "s") * 20L);
                    continue;
                case "DURING": {
                    final int seconds = num(p, "s");
                    new BukkitRunnable() {
                        private int done;

                        @Override
                        public void run() {
                            if (!GameState.inGame()) {
                                cancel();
                                return;
                            }
                            Ctx now = refresh(ctx);
                            if (done >= seconds) {
                                exec(list(node, "end"), now);
                                cancel();
                                return;
                            }
                            done++;
                            exec(list(node, "do"), now);
                        }
                    }.runTaskTimer(Main.getInstance(), 0L, 20L);
                    continue;
                }
                case "COUNTER_ADD": {
                    String name = str(p, "name");
                    double value = counter(name) + dbl(p, "n");
                    setCounter(name, Math.max(dbl(p, "min"), Math.min(dbl(p, "max"), value)));
                    continue;
                }
                case "COUNTER_SET":
                    setCounter(str(p, "name"), dbl(p, "n"));
                    continue;
                case "SHOW_COUNTER": {
                    String name = str(p, "name");
                    shownCounters.put(name, color(str(p, "text")));
                    showCounter(name);
                    continue;
                }
                default:
                    for (Player target : targets(p, ctx)) act(a, p, ctx, target);
            }
        }
    }

    /** Remet à jour les joueurs d'un contexte différé (déconnexion / reconnexion entre-temps). */
    private Ctx refresh(Ctx ctx) {
        Player owner = Bukkit.getPlayer(ctx.owner.getUniqueId());
        Player subject = ctx.subject == null ? null : Bukkit.getPlayer(ctx.subject.getUniqueId());
        return new Ctx(owner == null ? ctx.owner : owner, subject, owner == null ? ctx.origin : owner.getLocation());
    }

    private void act(String a, Map<String, Object> p, Ctx ctx, final Player target) {
        final GamePlayer gameTarget = GamePlayer.of(target.getUniqueId());
        final RoleBase role = gameTarget == null ? null : gameTarget.getRole();
        switch (a) {
            case "EFFECT": {
                PotionEffectType type = PotionEffectType.getByName(str(p, "effect"));
                if (type == null) return;
                PotionEffect effect = new PotionEffect(type, num(p, "s") * 20, num(p, "level") - 1, false, false);
                if (role != null) role.givePotionEffect(effect, EffectWhen.NOW);
                else target.addPotionEffect(effect, true);
                return;
            }
            case "CLEAR_EFFECT": {
                PotionEffectType type = PotionEffectType.getByName(str(p, "effect"));
                if (type != null) target.removePotionEffect(type);
                return;
            }
            case "FORCE":
            case "RESI":
            case "SPEED": {
                if (role == null) return;
                final double pct = dbl(p, "pct");
                bonus(a, role, target, pct);
                int seconds = num(p, "s");
                if (seconds > 0) {
                    Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
                        @Override
                        public void run() {
                            Player now = Bukkit.getPlayer(target.getUniqueId());
                            bonus(a, role, now == null ? target : now, -pct);
                        }
                    }, seconds * 20L);
                }
                return;
            }
            case "MAXHP": {
                double delta = dbl(p, "hearts") * 2.0;
                double max = Math.max(2.0, (role != null ? role.getMaxHealth() : target.getMaxHealth()) + delta);
                if (role != null) role.setMaxHealth(max);
                target.setMaxHealth(max);
                target.setHealth(Math.min(max, Math.max(1.0, target.getHealth() + Math.max(0.0, delta))));
                return;
            }
            case "HEAL":
                target.setHealth(Math.min(target.getMaxHealth(), target.getHealth() + dbl(p, "hearts") * 2.0));
                return;
            case "DAMAGE":
                target.setHealth(Math.max(1.0, target.getHealth() - dbl(p, "hearts") * 2.0));
                return;
            case "STUN":
                if (gameTarget != null) gameTarget.stun(num(p, "s") * 20, bool(p, "blind"));
                return;
            case "BLOCK_POWERS":
                BLOCKED.put(target.getUniqueId(), System.currentTimeMillis() + num(p, "s") * 1000L);
                return;
            case "IMMUNE": {
                int seconds = num(p, "s");
                long until = seconds == 0 ? Long.MAX_VALUE : System.currentTimeMillis() + seconds * 1000L;
                Map<String, Long> immune = IMMUNE.get(target.getUniqueId());
                if (immune == null) IMMUNE.put(target.getUniqueId(), immune = new HashMap<>());
                String dmg = str(p, "dmg");
                if (dmg.contains("FALL")) immune.put("FALL", until);
                if (dmg.contains("FIRE")) immune.put("FIRE", until);
                return;
            }
            case "FIRE":
                target.setFireTicks(Math.max(target.getFireTicks(), num(p, "s") * 20));
                return;
            case "KNOCKBACK":
            case "PULL": {
                final boolean pull = "PULL".equals(a);
                final double strength = dbl(p, "n");
                final Location from = ctx.owner.getLocation();
                Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
                    @Override
                    public void run() {
                        Vector v = target.getLocation().toVector().subtract(from.toVector());
                        v.setY(0);
                        if (v.lengthSquared() < 1.0E-4) return;
                        v.normalize().multiply((pull ? -0.9 : 0.6) * strength).setY(pull ? 0.35 : 0.25 + 0.1 * strength);
                        target.setVelocity(v);
                    }
                }, 1L);
                return;
            }
            case "UP": {
                if (bool(p, "safe")) PotionUtils.addTempNoFall(target.getUniqueId(), 1);
                Location up = target.getLocation().clone();
                up.add(0, num(p, "n"), 0);
                target.teleport(up);
                return;
            }
            case "LIGHTNING":
                target.getWorld().strikeLightningEffect(target.getLocation());
                return;
            case "INVERT":
                Loc.inverserDirectionJoueur(target);
                return;
            case "MESSAGE":
                target.sendMessage(color(str(p, "text")));
                return;
            case "TEAM": {
                ITeam team = team(str(p, "team"));
                if (role != null && team != null) role.setTeam(team);
                return;
            }
            default:
                Bukkit.getLogger().severe("[UHC-Addon] Action inconnue : " + a);
        }
    }

    private static void bonus(String type, RoleBase role, Player player, double pct) {
        if ("FORCE".equals(type)) role.addBonusforce(pct);
        else if ("RESI".equals(type)) role.addBonusResi(pct);
        else role.addSpeedAtInt(player, (float) pct);
    }

    /** Joueurs visés par une action (paramètre "to"). */
    private List<Player> targets(Map<String, Object> p, Ctx ctx) {
        String to = p.containsKey("to") ? str(p, "to") : "ME";
        List<Player> out = new ArrayList<>();
        switch (to) {
            case "SUBJECT":
                if (ctx.subject != null && ctx.subject.isOnline()) out.add(ctx.subject);
                break;
            case "AROUND":
            case "AROUND_E": {
                int radius = num(p, "r");
                ITeam mine = teamOf(ctx.owner);
                for (Player player : ctx.owner.getWorld().getPlayers()) {
                    if (player.getUniqueId().equals(ctx.owner.getUniqueId())) continue;
                    GamePlayer gp = GamePlayer.of(player.getUniqueId());
                    if (gp == null || gp.getRole() == null || !gp.isAlive()) continue;
                    if (player.getLocation().distanceSquared(ctx.origin) > (double) radius * radius) continue;
                    if ("AROUND_E".equals(to) && mine != null && !mine.isSolo() && mine.equals(gp.getRole().getTeam())) continue;
                    out.add(player);
                }
                break;
            }
            case "ROLE": {
                Player player = playerWithRole(str(p, "role"));
                if (player != null) out.add(player);
                break;
            }
            default:
                out.add(ctx.owner);
        }
        return out;
    }

    // ---------------------------------------------------------------- conditions

    private boolean test(Map<String, Object> node, Ctx ctx) {
        @SuppressWarnings("unchecked") Map<String, Object> c = (Map<String, Object>) node.get("c");
        if (c == null) return false;
        Map<String, Object> p = params(c);
        switch (str(c, "k")) {
            case "S_ROLE":
                return ctx.subject != null && roleIs(roleOf(ctx.subject), str(p, "role"));
            case "S_TEAM":
                return ctx.subject != null && teamIs(teamOf(ctx.subject), str(p, "team"));
            case "MY_TEAM":
                return teamIs(teamOf(ctx.owner), str(p, "team"));
            case "NIGHT":
                return GameState.getInstance().isNightTime();
            case "DAY":
                return !GameState.getInstance().isNightTime();
            case "CHANCE":
                return RANDOM.nextInt(100) < num(p, "pct");
            case "COUNTER":
                return compare(counter(str(p, "name")), str(p, "op"), dbl(p, "v"));
            case "NEAR_ROLE": {
                Player player = playerWithRole(str(p, "role"));
                int radius = num(p, "r");
                return player != null && player.getWorld().equals(ctx.owner.getWorld())
                        && player.getLocation().distanceSquared(ctx.owner.getLocation()) <= (double) radius * radius;
            }
            case "ROLE_DEAD":
                return playerWithRole(str(p, "role")) == null;
            case "ROLE_ALIVE":
                return playerWithRole(str(p, "role")) != null;
            case "HP": {
                Player who = "SUBJECT".equals(str(p, "who")) ? ctx.subject : ctx.owner;
                return who != null && compare(who.getHealth(), str(p, "op"), dbl(p, "hearts") * 2.0);
            }
            case "MAXHP":
                return compare(ctx.owner.getMaxHealth(), str(p, "op"), dbl(p, "hearts") * 2.0);
            case "SNEAK":
                return ctx.owner.isSneaking();
            case "NO_ARMOR":
                return GameState.getInstance().isApoil(ctx.owner);
            default:
                return false;
        }
    }

    private static boolean compare(double value, String op, double ref) {
        if ("LE".equals(op)) return value <= ref;
        if ("EQ".equals(op)) return Math.abs(value - ref) < 1.0E-6;
        return value >= ref;
    }

    // ---------------------------------------------------------------- rôles et camps

    private UUID ownerId() {
        return power.getRole() == null ? null : power.getRole().getPlayer();
    }

    private static RoleBase roleOf(Player player) {
        GamePlayer gp = GamePlayer.of(player.getUniqueId());
        return gp == null ? null : gp.getRole();
    }

    private static ITeam teamOf(Player player) {
        RoleBase role = roleOf(player);
        return role == null ? null : role.getTeam();
    }

    /** "meetup:Nezuko" (enum Roles d'UHC-Meetup) ou "addon:Link" (enum AddonRoles de l'addon). */
    static boolean roleIs(RoleBase role, String key) {
        if (role == null || key == null) return false;
        IRoles<?> roles = role.getRoles();
        if (roles == null) return false;
        boolean addon = roles.getClass().getName().startsWith("fr.nicknqck.addonbuilder");
        return key.equals((addon ? "addon:" : "meetup:") + roles.name());
    }

    static boolean teamIs(ITeam team, String key) {
        if (team == null || key == null) return false;
        boolean addon = team.getClass().getName().startsWith("fr.nicknqck.addonbuilder");
        return key.equals((addon ? "addon:" : "meetup:") + team.name());
    }

    /** Camp d'après sa clé : constante de TeamList (UHC-Meetup) ou d'AddonTeams (addon). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    static ITeam team(String key) {
        try {
            String[] parts = key.split(":", 2);
            Class<?> type = "addon".equals(parts[0]) ? Class.forName("fr.nicknqck.addonbuilder.AddonTeams")
                    : Class.forName("fr.nicknqck.enums.TeamList");
            return (ITeam) Enum.valueOf((Class<Enum>) type, parts[1]);
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Camp inconnu : " + key);
            return null;
        }
    }

    /** Joueur en vie qui a ce rôle, ou null. */
    static Player playerWithRole(String key) {
        for (GamePlayer gp : GameState.getInstance().getGamePlayer().values()) {
            if (!gp.isAlive() || !roleIs(gp.getRole(), key)) continue;
            Player player = Bukkit.getPlayer(gp.getUuid());
            if (player != null) return player;
        }
        return null;
    }

    // ---------------------------------------------------------------- compteurs

    private double counter(String name) {
        Double value = counters.get(name);
        return value == null ? 0.0 : value;
    }

    private void setCounter(String name, double value) {
        counters.put(name, value);
        showCounter(name);
    }

    private void showCounter(String name) {
        String text = shownCounters.get(name);
        if (text == null || ownerId() == null) return;
        GamePlayer gp = GamePlayer.of(ownerId());
        if (text == null || gp == null) return;
        double value = counter(name);
        String shown = text + " " + (value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value));
        String id = key + "." + name;
        if (gp.getActionBarManager().containsKey(id)) gp.getActionBarManager().updateActionBar(id, shown);
        else gp.getActionBarManager().addToActionBar(id, shown);
    }

    // ---------------------------------------------------------------- lecture du JSON

    @SuppressWarnings("unchecked")
    private static Map<String, Object> params(Map<String, Object> node) {
        Object p = node.get("p");
        return p instanceof Map ? (Map<String, Object>) p : Collections.<String, Object>emptyMap();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Map<String, Object> node, String key) {
        Object v = node.get(key);
        return v instanceof List ? (List<Object>) v : Collections.emptyList();
    }

    private static String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    private static double dbl(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof Number ? ((Number) v).doubleValue() : 0.0;
    }

    private static int num(Map<String, Object> map, String key) {
        return (int) Math.round(dbl(map, key));
    }

    private static boolean bool(Map<String, Object> map, String key) {
        return Boolean.TRUE.equals(map.get(key));
    }

    private static String color(String text) {
        return text.replaceAll("&([0-9a-fk-or])", "§$1");
    }
}
