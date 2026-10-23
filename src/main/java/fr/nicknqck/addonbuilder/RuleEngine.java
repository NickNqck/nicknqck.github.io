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
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.WeakHashMap;

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
    /** Moteur de chaque pouvoir (pour « quand j'utilise ce pouvoir » : clic sur l'objet ou commande). */
    private static final Map<Power, RuleEngine> ENGINES = new WeakHashMap<>();

    private final Power power;
    private final List<Map<String, Object>> rules = new ArrayList<>();
    private final Map<String, Double> counters = new HashMap<>();
    private final Map<String, String> shownCounters = new HashMap<>(); // compteur -> texte avant la valeur
    /** Joueurs marqués (MARK) : nom de la marque -> joueur -> fin (ms). */
    private final Map<String, Map<UUID, Long>> marks = new HashMap<>();
    /** Affichages de la barre d'action (ActionBarManager du GamePlayer) : "joueur#nom" -> affichage, mis à jour chaque seconde. */
    private final Map<String, Bar> bars = new LinkedHashMap<>();

    private static final class Bar {
        final UUID player;
        final String name;
        final String text;
        final String subject; // nom du joueur concerné au moment de l'affichage (%joueur%)
        final long until;     // fin (ms), 0 = jusqu'à ce qu'une règle le retire

        Bar(UUID player, String name, String text, String subject, long until) {
            this.player = player;
            this.name = name;
            this.text = text;
            this.subject = subject;
            this.until = until;
        }
    }
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
        ENGINES.put(power, engine);
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
        refreshBars();
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
        if (event.getGamePlayer() == null) return;
        if (event.getGamePlayer().getUuid().equals(ownerId())) {
            fire("GAPPLE", null, null);
        } else { // « quand un autre joueur mange une pomme d'or » : ce joueur est le joueur concerné
            Player eater = Bukkit.getPlayer(event.getGamePlayer().getUuid());
            if (eater != null) fire("GAPPLE_OTHER", eater, eater.getLocation());
        }
    }

    /** « quand je frappe un joueur avec une flèche » (ou tout autre projectile que j'ai lancé). */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onProjectile(org.bukkit.event.entity.EntityDamageByEntityEvent event) {
        if (event.isCancelled() || !(event.getEntity() instanceof Player) || !(event.getDamager() instanceof org.bukkit.entity.Projectile)) return;
        Object shooter = ((org.bukkit.entity.Projectile) event.getDamager()).getShooter();
        if (!(shooter instanceof Player) || !((Player) shooter).getUniqueId().equals(ownerId())) return;
        Player victim = (Player) event.getEntity();
        for (int i = 0; i < rules.size(); i++) {
            Map<String, Object> rule = rules.get(i);
            if ("HIT_GIVEN".equals(rule.get("on")) && "ARROW".equals(str(params(rule), "with"))) run(i, victim, victim.getLocation());
        }
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
                    if ("ARROW".equals(with)) continue; // les flèches passent par onProjectile
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

    /**
     * « Quand j'utilise ce pouvoir » : clic avec l'objet (click = LEFT / RIGHT) ou commande tapée (click = null, args = mots
     * de la commande). Le joueur concerné est le joueur visé (cible AIM) ou nommé dans la commande (cible ARG).
     * Retourne true si au moins une règle s'est lancée : le cooldown du pouvoir n'est compté que dans ce cas.
     */
    static boolean use(Power power, Player player, String click, String[] args) {
        return use(power, player, click, args, null);
    }

    /** usage = commande complète pour le message d'erreur (ex. "/zelda verif"), ou null. */
    static boolean use(Power power, Player player, String click, String[] args, String usage) {
        RuleEngine engine = ENGINES.get(power);
        return engine != null && engine.use(player, click, args, usage);
    }

    /** Ce pouvoir a-t-il au moins une règle « quand j'utilise ce pouvoir » ? */
    static boolean hasUse(Power power) {
        RuleEngine engine = ENGINES.get(power);
        if (engine == null) return false;
        for (Map<String, Object> rule : engine.rules) if ("USE".equals(rule.get("on"))) return true;
        return false;
    }

    private boolean use(Player player, String click, String[] args, String usage) {
        boolean ran = false;
        long wait = Long.MAX_VALUE;
        String problem = null;
        for (int i = 0; i < rules.size(); i++) {
            Map<String, Object> rule = rules.get(i);
            if (!"USE".equals(rule.get("on"))) continue;
            Map<String, Object> p = params(rule);
            String side = str(p, "click");
            if (click != null && !"ANY".equals(side) && !side.equals(click)) continue;
            long now = System.currentTimeMillis();
            if (now < nextUse[i]) {
                wait = Math.min(wait, nextUse[i] - now);
                continue;
            }
            Player subject = null;
            String target = str(p, "target");
            if ("AIM".equals(target)) {
                power.setTargetDistance(Math.max(1, num(p, "d")));
                subject = power.getTarget();
                if (subject == null) {
                    problem = "\u00a7cIl faut viser un joueur \u00e0 moins de " + num(p, "d") + " blocs !";
                    continue;
                }
            } else if ("ARG".equals(target)) {
                if (args == null || args.length < 2) {
                    problem = "\u00a7cIl faut indiquer un joueur : \u00a76" + (usage != null ? usage : "/... " + (args == null || args.length == 0 ? "" : args[0])) + " <joueur>";
                    continue;
                }
                subject = Bukkit.getPlayerExact(args[1]);
                GamePlayer gp = subject == null ? null : GamePlayer.of(subject.getUniqueId());
                if (subject == null || gp == null || !gp.isAlive()) {
                    problem = "\u00a7b" + args[1] + "\u00a7c n'est pas connect\u00e9 ou n'est pas en vie.";
                    continue;
                }
                if (subject.getUniqueId().equals(player.getUniqueId())) {
                    problem = "\u00a7cVous ne pouvez pas vous viser vous-m\u00eame.";
                    continue;
                }
            }
            if (run(i, subject, subject == null ? null : subject.getLocation())) ran = true;
        }
        if (!ran) {
            if (problem != null) player.sendMessage(problem);
            else if (wait != Long.MAX_VALUE) player.sendMessage("\u00a7cPouvoir en cooldown : \u00a7b" + ((wait + 999) / 1000) + " s");
        }
        return ran;
    }

    /** Lance toutes les règles du déclencheur. */
    private void fire(String trigger, Player subject, Location origin) {
        for (int i = 0; i < rules.size(); i++) {
            if (trigger.equals(rules.get(i).get("on"))) run(i, subject, origin);
        }
    }

    private boolean run(int index, Player subject, Location origin) {
        Map<String, Object> rule = rules.get(index);
        long now = System.currentTimeMillis();
        if (now < nextUse[index]) return false;
        if (ownerId() == null) return false;
        Player owner = Bukkit.getPlayer(ownerId());
        GamePlayer gameOwner = GamePlayer.of(ownerId());
        if (owner == null || gameOwner == null || !gameOwner.isAlive()) return false;
        int cooldown = num(rule, "cd");
        if (cooldown > 0) nextUse[index] = now + cooldown * 1000L;
        try {
            exec(list(rule, "do"), new Ctx(owner, subject, origin == null ? owner.getLocation() : origin));
        } catch (RuntimeException e) {
            Bukkit.getLogger().severe("[UHC-Addon] Erreur dans une règle de " + power.getName() + " : " + e);
        }
        return true;
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
                case "COUNT": { // nombre de joueurs visés (filtrés par camp) -> compteur
                    int n = 0;
                    String filter = str(p, "filter");
                    for (Player target : targets(p, ctx)) {
                        boolean in = teamIs(teamOf(target), str(p, "team"));
                        if ("ALL".equals(filter) || ("IN".equals(filter) && in) || ("OUT".equals(filter) && !in)) n++;
                    }
                    setCounter(str(p, "name"), n);
                    continue;
                }
                case "TP_TO": { // je me téléporte sur / derrière / à côté du premier joueur visé
                    List<Player> list = targets(p, ctx);
                    if (list.isEmpty()) continue;
                    Player target = list.get(0);
                    String how = str(p, "how");
                    Location to = "BEHIND".equals(how) ? TeleportSupport.behind(target)
                            : "AROUND".equals(how) ? TeleportSupport.around(target, 3) : target.getLocation();
                    if (to != null) ctx.owner.teleport(to);
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
                target.sendMessage(text(str(p, "text"), ctx));
                return;
            case "DASH": {
                Vector v = target.getLocation().getDirection().normalize().multiply(0.6 * dbl(p, "n"));
                v.setY(Math.max(0.3, v.getY()));
                target.setVelocity(v);
                return;
            }
            case "LOOK": { // fait regarder le ciel ou le sol
                Location look = target.getLocation().clone();
                look.setPitch("UP".equals(str(p, "dir")) ? -90f : 90f);
                target.teleport(look);
                return;
            }
            case "MARK": { // marque le joueur pendant N s (condition « le joueur concerné est marqué »)
                Map<UUID, Long> marked = marks.get(str(p, "name"));
                if (marked == null) marks.put(str(p, "name"), marked = new HashMap<>());
                marked.put(target.getUniqueId(), System.currentTimeMillis() + num(p, "s") * 1000L);
                return;
            }
            case "UNMARK": {
                Map<UUID, Long> marked = marks.get(str(p, "name"));
                if (marked != null) marked.remove(target.getUniqueId());
                return;
            }
            case "ABSORB": { // cœurs d'absorption : en ajouter ou les fixer (EntityHuman.setAbsorptionHearts, par réflexion)
                try {
                    Object handle = target.getClass().getMethod("getHandle").invoke(target);
                    float current = (Float) handle.getClass().getMethod("getAbsorptionHearts").invoke(handle);
                    float value = (float) (dbl(p, "hearts") * 2.0);
                    handle.getClass().getMethod("setAbsorptionHearts", float.class).invoke(handle, "SET".equals(str(p, "mode")) ? value : current + value);
                } catch (Exception e) {
                    Bukkit.getLogger().severe("[UHC-Addon] Absorption impossible : " + e);
                }
                return;
            }
            case "GIVE_ITEM": {
                org.bukkit.Material material = org.bukkit.Material.matchMaterial(str(p, "item"));
                if (material == null) return;
                ItemStack stack = new ItemStack(material);
                org.bukkit.inventory.meta.ItemMeta meta = stack.getItemMeta();
                if (meta != null) {
                    meta.setDisplayName(color(str(p, "text")));
                    stack.setItemMeta(meta);
                }
                int sharp = num(p, "sharp");
                if (sharp > 0) stack.addUnsafeEnchantment(org.bukkit.enchantments.Enchantment.DAMAGE_ALL, sharp);
                for (ItemStack rest : target.getInventory().addItem(stack).values()) target.getWorld().dropItem(target.getLocation(), rest);
                return;
            }
            case "BRING": { // téléporte le joueur visé devant / autour de / sur moi
                String how = str(p, "how");
                Location to = "FRONT".equals(how) ? TeleportSupport.inFrontOf(ctx.owner)
                        : "AROUND".equals(how) ? TeleportSupport.around(ctx.owner, 3) : ctx.owner.getLocation();
                if (to != null && !target.getUniqueId().equals(ctx.owner.getUniqueId())) target.teleport(to);
                return;
            }
            case "BAR_SHOW": {
                int seconds = num(p, "s");
                Bar bar = new Bar(target.getUniqueId(), str(p, "name"), color(str(p, "text")),
                        ctx.subject == null ? "" : ctx.subject.getName(), seconds == 0 ? 0L : System.currentTimeMillis() + seconds * 1000L);
                bars.put(bar.player + "#" + bar.name, bar);
                showBar(bar);
                return;
            }
            case "BAR_HIDE": {
                Bar bar = bars.remove(target.getUniqueId() + "#" + str(p, "name"));
                if (bar != null) hideBar(bar);
                return;
            }
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
            case "S_MARKED": {
                Map<UUID, Long> marked = marks.get(str(p, "name"));
                Long until = ctx.subject == null || marked == null ? null : marked.get(ctx.subject.getUniqueId());
                return until != null && System.currentTimeMillis() <= until;
            }
            case "ON_FIRE":
                return ctx.owner.getFireTicks() > 0;
            case "IN_FIRE": {
                String feet = ctx.owner.getLocation().getBlock().getType().name(), eyes = ctx.owner.getEyeLocation().getBlock().getType().name();
                return feet.contains("LAVA") || feet.contains("FIRE") || eyes.contains("LAVA") || eyes.contains("FIRE");
            }
            case "IN_WATER": {
                String block = ctx.owner.getLocation().getBlock().getType().name();
                return block.contains("WATER");
            }
            case "S_EFFECT": {
                PotionEffectType type = PotionEffectType.getByName(str(p, "effect"));
                return ctx.subject != null && type != null && ctx.subject.hasPotionEffect(type);
            }
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
        boolean addon = roles.getClass().getName().startsWith("fr.nicknqck.addonbuilder.");
        return key.equals((addon ? "addon:" : "meetup:") + roles.name());
    }

    static boolean teamIs(ITeam team, String key) {
        if (team == null || key == null) return false;
        boolean addon = team.getClass().getName().startsWith("fr.nicknqck.addonbuilder.");
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
        refreshBars(); // les %compteur% affichés suivent tout de suite
    }

    /** Texte d'un message : couleurs, %joueur% (joueur concerné), %vie% (sa vie en ❤), %nom_du_compteur%. */
    private String text(String raw, Ctx ctx) {
        String text = color(raw);
        text = text.replace("%joueur%", ctx.subject == null ? "" : ctx.subject.getName());
        text = text.replace("%vie%", ctx.subject == null ? "" : format(Math.round(ctx.subject.getHealth()) / 2.0).replace('.', ','));
        for (Map.Entry<String, Double> c : counters.entrySet()) text = text.replace("%" + c.getKey() + "%", format(c.getValue()));
        return text.replaceAll("%[a-z][a-z0-9_]{0,15}%", "0");
    }

    private static String format(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    // ---------------------------------------------------------------- barre d'action (GamePlayer.getActionBarManager())

    /** Clé de l'affichage dans l'ActionBarManager : propre à ce pouvoir et à ce nom. */
    private String barId(Bar bar) {
        return key + ".bar." + bar.name;
    }

    /** Texte affiché : %temps% (temps restant), %joueur% (joueur concerné), %nom_du_compteur% (sa valeur). */
    private String barText(Bar bar) {
        String text = bar.text;
        if (bar.until > 0) {
            long left = Math.max(0L, (bar.until - System.currentTimeMillis() + 999L) / 1000L);
            text = text.replace("%temps%", left >= 60 ? (left / 60) + "m " + String.format("%02d", left % 60) + "s" : left + "s");
        } else {
            text = text.replace("%temps%", "");
        }
        text = text.replace("%joueur%", bar.subject);
        for (Map.Entry<String, Double> c : counters.entrySet()) text = text.replace("%" + c.getKey() + "%", format(c.getValue()));
        return text.replaceAll("%[a-z][a-z0-9_]{0,15}%", "0"); // compteur jamais modifié : 0
    }

    private void showBar(Bar bar) {
        GamePlayer gp = GamePlayer.of(bar.player);
        if (gp != null) gp.getActionBarManager().addToActionBar(barId(bar), barText(bar));
    }

    private void hideBar(Bar bar) {
        GamePlayer gp = GamePlayer.of(bar.player);
        if (gp != null) gp.getActionBarManager().removeInActionBar(barId(bar));
    }

    /** Chaque seconde (et à chaque changement de compteur) : met à jour les affichages, retire ceux qui ont expiré. */
    private void refreshBars() {
        long now = System.currentTimeMillis();
        for (Iterator<Bar> it = bars.values().iterator(); it.hasNext(); ) {
            Bar bar = it.next();
            if (bar.until > 0 && now >= bar.until) {
                it.remove();
                hideBar(bar);
            } else {
                showBar(bar);
            }
        }
    }

    private void showCounter(String name) {
        String text = shownCounters.get(name);
        if (text == null || ownerId() == null) return;
        GamePlayer gp = GamePlayer.of(ownerId());
        if (text == null || gp == null) return;
        String shown = text + " " + format(counter(name));
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
