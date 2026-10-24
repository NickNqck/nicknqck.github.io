package fr.nicknqck.addonbuilder;

import fr.nicknqck.GameState;
import fr.nicknqck.enums.EffectWhen;
import fr.nicknqck.events.custom.DayEvent;
import fr.nicknqck.events.custom.GamePlayerEatGappleEvent;
import fr.nicknqck.events.custom.NightEvent;
import fr.nicknqck.events.custom.UHCPlayerBattleEvent;
import fr.nicknqck.events.custom.death.UHCDeathEvent;
import fr.nicknqck.events.custom.roles.PowerActivateEvent;
import fr.nicknqck.events.custom.roles.aot.TitanTransformEvent;
import fr.nicknqck.events.power.PowerTakeInfoEvent;
import fr.nicknqck.events.power.aot.GamePlayerTridimentionnelEvent;
import fr.nicknqck.enums.InfoType;
import fr.nicknqck.enums.TitanForm;
import fr.nicknqck.roles.aot.builders.AotRoles;
import fr.nicknqck.roles.aot.powers.LancePowerManager;
import fr.nicknqck.titans.TitanBase;
import fr.nicknqck.titans.TitanManager;
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

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.WeakHashMap;
import java.util.function.Consumer;

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
    /** Armure et objet en main cachés aux autres joueurs (GEAR) : joueur -> jusqu'à (ms). */
    private static final Map<UUID, Long> HIDDEN = new HashMap<>();
    /** Dernier titan connu de chaque joueur (le TitanManager l'oublie à la mort, avant les règles « quand je tue »). */
    private static final Map<UUID, TitanForm> LAST_TITAN = new HashMap<>();
    /** Titans donnés par une règle (TITAN_GIVE) -> joueur qui l'a reçu : pour lui, ce n'est pas un vol (« quand je récupère un titan »). */
    private static final Map<TitanBase, UUID> GIVEN = new WeakHashMap<>();
    private static long lastGlobalTick;
    /** Joueur dont on lit les variables dans les champs nombre ({ var: "nom" }) : le propriétaire du pouvoir en cours. */
    private static UUID currentOwner;

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
        final UUID subjectId; // joueur concerné (%fleche%, %distance%), ou null
        final long until;     // fin (ms), 0 = jusqu'à ce qu'une règle le retire

        Bar(UUID player, String name, String text, Player subject, long until) {
            this.player = player;
            this.name = name;
            this.text = text;
            this.subject = subject == null ? "" : subject.getName();
            this.subjectId = subject == null ? null : subject.getUniqueId();
            this.until = until;
        }
    }
    private final long[] nextUse;      // cooldown propre à chaque règle (ms)
    private final int[] everyLeft;     // secondes avant la prochaine « toutes les N s »
    private final Map<String, Integer> hitCounts = new HashMap<>(); // « tous les N coups » : règle#joueur -> coups
    private final Deque<Location> positions = new ArrayDeque<>();   // mes positions des 60 dernières secondes (REWIND)
    private boolean ticked;          // première seconde passée
    private TitanBase seenTitan;     // titan possédé à la dernière seconde (« quand je récupère un titan »)
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
        globalTick();
        UUID owner = ownerId();
        Player me = owner == null ? null : Bukkit.getPlayer(owner);
        if (me != null) {
            positions.addFirst(me.getLocation());
            while (positions.size() > 60) positions.removeLast();
        }
        TitanBase titan = owner == null ? null : titans().getTitan(owner);
        if (ticked && titan != null && titan != seenTitan && !owner.equals(GIVEN.get(titan))) fire("TITAN_GOT", null, null);
        seenTitan = titan;
        ticked = true;
        refreshBars();
        currentOwner = owner;
        for (int i = 0; i < rules.size(); i++) {
            if (!"EVERY".equals(rules.get(i).get("on"))) continue;
            if (--everyLeft[i] > 0) continue;
            everyLeft[i] = Math.max(1, num(params(rules.get(i)), "s"));
            run(i, null, null);
        }
    }

    /** Une fois par seconde pour tous les moteurs : titans connus, armures cachées. */
    private static void globalTick() {
        long now = System.currentTimeMillis();
        if (now - lastGlobalTick < 900L) return;
        lastGlobalTick = now;
        TitanManager manager = titans();
        for (GamePlayer gp : GameState.getInstance().getGamePlayer().values()) {
            if (!gp.isAlive()) continue;
            TitanBase titan = manager.getTitan(gp.getUuid());
            if (titan != null) LAST_TITAN.put(gp.getUuid(), titan.getTitanForm());
            else LAST_TITAN.remove(gp.getUuid());
        }
        for (Iterator<Map.Entry<UUID, Long>> it = HIDDEN.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<UUID, Long> e = it.next();
            Player player = Bukkit.getPlayer(e.getKey());
            if (now >= e.getValue()) {
                it.remove();
                if (player != null) sendGear(player, false);
            } else if (player != null) {
                sendGear(player, true);
            }
        }
    }

    private static TitanManager titans() {
        return fr.nicknqck.Main.getInstance().getTitanManager();
    }

    /** Transformé en titan : titan d'UHC-Meetup transformé, ou rôle de l'Attaque des Titans déclaré transformé. */
    private static boolean isTitan(Player player) {
        if (player == null) return false;
        TitanBase titan = titans().getTitan(player.getUniqueId());
        if (titan != null && titan.isTransformed()) return true;
        RoleBase role = roleOf(player);
        return role instanceof AotRoles && ((AotRoles) role).isTransformedinTitan;
    }

    /** Titan d'un joueur (le dernier connu s'il vient de mourir), ou null. */
    private static TitanForm titanFormOf(Player player) {
        if (player == null) return null;
        TitanBase titan = titans().getTitan(player.getUniqueId());
        if (titan != null) return titan.getTitanForm();
        GamePlayer gp = GamePlayer.of(player.getUniqueId());
        return gp != null && !gp.isAlive() ? LAST_TITAN.get(player.getUniqueId()) : null;
    }

    private static final String[][] TITAN_CLASSES = {
            {"ASSAILLANT", "AssaillantV2"}, {"BESTIAL", "BestialV2"}, {"CHARETTE", "CharetteV2"}, {"COLOSSAL", "ColossalV2"},
            {"CUIRASSE", "CuirasseV2"}, {"MACHOIRE", "MachoireV2"}, {"WARHAMMER", "WarhammerV2"}};

    /** Donne au joueur un titan d'UHC-Meetup (RANDOM : un titan que personne n'a). */
    private static void giveTitan(Player player, String form) {
        GamePlayer gp = GamePlayer.of(player.getUniqueId());
        TitanManager manager = titans();
        if (gp == null || gp.getRole() == null || manager.hasTitan(player.getUniqueId())) return;
        String cls = null;
        if ("RANDOM".equals(form)) {
            List<String[]> free = new ArrayList<>();
            for (String[] t : TITAN_CLASSES) if (!manager.isTitanAttributed(TitanForm.valueOf(t[0]))) free.add(t);
            if (free.isEmpty()) return;
            cls = free.get(RANDOM.nextInt(free.size()))[1];
        } else {
            for (String[] t : TITAN_CLASSES) if (t[0].equals(form)) cls = t[1];
        }
        if (cls == null) return;
        try {
            TitanBase titan = (TitanBase) Class.forName("fr.nicknqck.titans.impl." + cls).getConstructor(GamePlayer.class).newInstance(gp);
            GIVEN.put(titan, player.getUniqueId());
            manager.addTitan(player.getUniqueId(), titan);
            LAST_TITAN.put(player.getUniqueId(), titan.getTitanForm());
            player.sendMessage("\u00a77Vous poss\u00e9dez le titan " + titan.getName() + "\u00a77 (\u00a76/aot titan\u00a77).");
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Titan impossible \u00e0 donner : " + e);
        }
    }

    /** Envoie aux autres joueurs l'armure et l'objet en main du joueur, ou rien (caché). */
    private static void sendGear(Player target, boolean hide) {
        try {
            String version = Bukkit.getServer().getClass().getPackage().getName().split("\\.")[3];
            Class<?> nmsItem = Class.forName("net.minecraft.server." + version + ".ItemStack");
            Class<?> packetClass = Class.forName("net.minecraft.server." + version + ".PacketPlayOutEntityEquipment");
            Class<?> packetType = Class.forName("net.minecraft.server." + version + ".Packet");
            java.lang.reflect.Method copy = Class.forName("org.bukkit.craftbukkit." + version + ".inventory.CraftItemStack")
                    .getMethod("asNMSCopy", ItemStack.class);
            java.lang.reflect.Constructor<?> make = packetClass.getConstructor(int.class, int.class, nmsItem);
            ItemStack[] gear = {target.getItemInHand(), target.getInventory().getBoots(), target.getInventory().getLeggings(),
                    target.getInventory().getChestplate(), target.getInventory().getHelmet()};
            List<Object> packets = new ArrayList<>();
            for (int slot = 0; slot < gear.length; slot++) {
                Object item = hide || gear[slot] == null ? null : copy.invoke(null, gear[slot]);
                packets.add(make.newInstance(target.getEntityId(), slot, item));
            }
            for (Player observer : target.getWorld().getPlayers()) {
                if (observer.getUniqueId().equals(target.getUniqueId())) continue;
                Object handle = observer.getClass().getMethod("getHandle").invoke(observer);
                Object connection = handle.getClass().getField("playerConnection").get(handle);
                java.lang.reflect.Method send = connection.getClass().getMethod("sendPacket", packetType);
                for (Object packet : packets) send.invoke(connection, packet);
            }
        } catch (Exception e) {
            Bukkit.getLogger().severe("[UHC-Addon] Armure impossible \u00e0 cacher : " + e);
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
        // partie du corps touchée : hauteur de la flèche par rapport aux pieds de la cible
        double height = event.getDamager().getLocation().getY() - victim.getLocation().getY();
        final String zone = height > 1.5 ? "HEAD" : height < 0.9 ? "LEGS" : "BODY";
        for (int i = 0; i < rules.size(); i++) {
            Map<String, Object> rule = rules.get(i);
            if ("HIT_GIVEN".equals(rule.get("on")) && "ARROW".equals(str(params(rule), "with"))) {
                run(i, victim, victim.getLocation(), new Consumer<Ctx>() {
                    @Override
                    public void accept(Ctx c) {
                        c.zone = zone;
                    }
                });
            }
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
                    run(i, victim, victim.getLocation(), battle(event));
                } else if ("HITS".equals(on)) {
                    Map<String, Object> p = params(rule);
                    String counterKey = i + "#" + ("SAME".equals(str(p, "per")) ? victim.getUniqueId().toString() : "*");
                    int hits = (hitCounts.containsKey(counterKey) ? hitCounts.get(counterKey) : 0) + 1;
                    if (hits >= num(p, "n")) {
                        hits = 0;
                        run(i, victim, victim.getLocation(), battle(event));
                    }
                    hitCounts.put(counterKey, hits);
                }
            }
        }
        if (victim.getUniqueId().equals(owner)) {
            for (int i = 0; i < rules.size(); i++) {
                if ("HIT_TAKEN".equals(rules.get(i).get("on"))) run(i, damager, damager.getLocation(), battle(event));
            }
        }
    }

    private static Consumer<Ctx> battle(final UHCPlayerBattleEvent event) {
        return new Consumer<Ctx>() {
            @Override
            public void accept(Ctx c) {
                c.battle = event;
            }
        };
    }

    /** « quand je me transforme en titan / redeviens humain » (titans d'UHC-Meetup). */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onTransform(TitanTransformEvent event) {
        if (event.getTitan() == null || !event.getTitan().getGamePlayer().getUuid().equals(ownerId())) return;
        transformed(event.isTransforming());
    }

    private void transformed(boolean start) {
        for (int i = 0; i < rules.size(); i++) {
            Map<String, Object> rule = rules.get(i);
            if (!"TRANSFORM".equals(rule.get("on"))) continue;
            String when = str(params(rule), "when");
            if ("ANY".equals(when) || (start ? "START" : "END").equals(when)) run(i, null, null);
        }
    }

    /** « quand je me téléporte avec mon équipement tridimensionnel ». */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onTridi(GamePlayerTridimentionnelEvent event) {
        if (event.getGamePlayer() != null && event.getGamePlayer().getUuid().equals(ownerId())) fire("TRIDI", null, null);
    }

    /** « quand un pouvoir cherche une information sur moi » : le joueur concerné est celui qui la cherche. */
    @EventHandler(priority = EventPriority.LOW)
    public void onInfo(final PowerTakeInfoEvent event) {
        if (event.isCancelled() || event.getGameTarget() == null || !event.getGameTarget().getUuid().equals(ownerId())) return;
        if (event.getPower() == null || event.getPower().getRole() == null || event.getPower().getRole().getPlayer() == null) return;
        Player seeker = Bukkit.getPlayer(event.getPower().getRole().getPlayer());
        if (seeker == null || seeker.getUniqueId().equals(ownerId())) return;
        for (int i = 0; i < rules.size(); i++) {
            if (!"INFO_ON_ME".equals(rules.get(i).get("on"))) continue;
            run(i, seeker, seeker.getLocation(), new Consumer<Ctx>() {
                @Override
                public void accept(Ctx c) {
                    c.info = event;
                }
            });
        }
    }

    /** Armure cachée : l'objet en main change, on le recache tout de suite. */
    @EventHandler
    public void onHeld(final org.bukkit.event.player.PlayerItemHeldEvent event) {
        if (!event.getPlayer().getUniqueId().equals(ownerId()) || !HIDDEN.containsKey(ownerId())) return;
        Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
            @Override
            public void run() {
                if (HIDDEN.containsKey(event.getPlayer().getUniqueId())) sendGear(event.getPlayer(), true);
            }
        }, 1L);
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
        currentOwner = player.getUniqueId();
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
            int number = 0;
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
            } else if ("NUM".equals(target)) {
                int max = Math.max(1, num(p, "max"));
                String hint = "\u00a7cIl faut indiquer un nombre de 1 \u00e0 " + max + " : \u00a76"
                        + (usage != null ? usage : "/... " + (args == null || args.length == 0 ? "" : args[0])) + " <nombre>";
                try {
                    number = args == null || args.length < 2 ? 0 : Integer.parseInt(args[1]);
                } catch (NumberFormatException e) {
                    number = 0;
                }
                if (number < 1 || number > max) {
                    problem = hint;
                    continue;
                }
            }
            final int typed = number;
            if (run(i, subject, subject == null ? null : subject.getLocation(), new Consumer<Ctx>() {
                @Override
                public void accept(Ctx c) {
                    c.number = typed;
                }
            })) ran = true;
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
        return run(index, subject, origin, null);
    }

    /** extra : complète le contexte (coup en cours, flèche, nombre tapé, information cherchée). */
    private boolean run(int index, Player subject, Location origin, Consumer<Ctx> extra) {
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
            Ctx ctx = new Ctx(owner, subject, origin == null ? owner.getLocation() : origin);
            if (extra != null) extra.accept(ctx);
            exec(list(rule, "do"), ctx);
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
        UHCPlayerBattleEvent battle; // coup en cours (HIT_DAMAGE)
        String zone;                 // partie du corps touchée par la flèche (HIT_ZONE)
        int number;                  // nombre tapé dans la commande (REWIND)
        PowerTakeInfoEvent info;     // information cherchée sur moi (REDIRECT)

        Ctx(Player owner, Player subject, Location origin) {
            this.owner = owner;
            this.subject = subject;
            this.origin = origin;
        }

        /** Même contexte avec un autre joueur concerné (« pour chaque joueur »). */
        Ctx with(Player other) {
            Ctx c = new Ctx(owner, other, origin);
            c.battle = battle;
            c.zone = zone;
            c.number = number;
            c.info = info;
            return c;
        }
    }

    private void exec(List<Object> nodes, final Ctx ctx) {
        currentOwner = ctx.owner.getUniqueId();
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
                case "VAR_NUM": { // variable nombre : = + − × ÷ un nombre, une autre variable, un nombre au hasard, une vie
                    UUID who = varOwner(str(p, "of"), ctx);
                    String name = str(p, "var");
                    double value;
                    switch (str(p, "src")) {
                        case "VAR": value = Variables.get(str(p, "var2"), varOwner(str(p, "of2"), ctx)); break;
                        case "RANDOM": {
                            double lo = dbl(p, "lo"), hi = dbl(p, "hi");
                            value = Variables.isBool(name) ? 0 : lo + RANDOM.nextDouble() * (hi - lo);
                            if (Math.rint(lo) == lo && Math.rint(hi) == hi) value = Math.floor(Math.min(lo, hi) + RANDOM.nextInt((int) Math.abs(hi - lo) + 1));
                            break;
                        }
                        case "HP":
                        case "MAXHP": {
                            Player hp = "SUBJECT".equals(str(p, "hpwho")) ? ctx.subject : ctx.owner;
                            if (hp == null) continue;
                            value = ("HP".equals(str(p, "src")) ? hp.getHealth() : hp.getMaxHealth()) / 2.0;
                            break;
                        }
                        default: value = dbl(p, "n");
                    }
                    if (who == null) continue;
                    double current = Variables.get(name, who);
                    switch (str(p, "op")) {
                        case "ADD": value = current + value; break;
                        case "SUB": value = current - value; break;
                        case "MUL": value = current * value; break;
                        case "DIV": if (value == 0.0) continue; value = current / value; break;
                        default: break;
                    }
                    Variables.set(name, who, value);
                    refreshBars(); // les %variable% affichées suivent tout de suite
                    continue;
                }
                case "VAR_BOOL": {
                    UUID who = varOwner(str(p, "of"), ctx);
                    if (who == null) continue;
                    String name = str(p, "var"), state = str(p, "state");
                    boolean value = "TRUE".equals(state) || ("TOGGLE".equals(state) && Variables.get(name, who) == 0.0)
                            || ("COPY".equals(state) && Variables.get(str(p, "var2"), varOwner(str(p, "of2"), ctx)) != 0.0);
                    Variables.set(name, who, value ? 1.0 : 0.0);
                    refreshBars();
                    continue;
                }
                case "EACH": { // chaque joueur visé, dans un ordre au hasard, devient le joueur concerné
                    List<Player> list = targets(p, ctx);
                    Collections.shuffle(list, RANDOM);
                    for (Player target : list) exec(list(node, "do"), ctx.with(target));
                    continue;
                }
                case "KNOW": { // joueurs ajoutés à ma description (RoleBase.addKnowedPlayers)
                    RoleBase mine = roleOf(ctx.owner);
                    if (mine == null) continue;
                    List<GamePlayer> known = new ArrayList<>();
                    for (Player target : targets(p, ctx)) {
                        GamePlayer gp = GamePlayer.of(target.getUniqueId());
                        if (gp != null) known.add(gp);
                    }
                    mine.addKnowedPlayers(color(str(p, "text")), known);
                    continue;
                }
                case "TP_RANDOM": { // moi et les joueurs visés, au même endroit, à N blocs dans une direction au hasard
                    Location to = Loc.getLocationAtDistance(ctx.owner.getLocation(), dbl(p, "d"));
                    if (to == null) continue;
                    List<Player> list = targets(p, ctx);
                    if (!list.contains(ctx.owner)) list.add(0, ctx.owner);
                    for (Player target : list) target.teleport(to);
                    continue;
                }
                case "REWIND": { // retour à ma position d'il y a N s (N = nombre tapé, sinon le paramètre)
                    int seconds = ctx.number > 0 ? ctx.number : num(p, "s");
                    if (positions.isEmpty()) continue;
                    Location back = null;
                    int k = 0;
                    for (Location l : positions) {
                        back = l;
                        if (++k >= seconds) break;
                    }
                    if (back != null && back.getWorld() != null) ctx.owner.teleport(back);
                    continue;
                }
                case "HIT_DAMAGE": // dégâts du coup en cours
                    if (ctx.battle != null) ctx.battle.setDamage(Math.max(0.0, ctx.battle.getDamage() * (1.0 + dbl(p, "pct") / 100.0)));
                    continue;
                case "REDIRECT": { // l'information cherchée sur moi vise un joueur au hasard d'un camp
                    if (ctx.info == null) continue;
                    List<GamePlayer> list = new ArrayList<>();
                    for (GamePlayer gp : GameState.getInstance().getGamePlayer().values()) {
                        if (!gp.isAlive() || gp.getRole() == null || gp.getUuid().equals(ctx.owner.getUniqueId())) continue;
                        if (ctx.subject != null && gp.getUuid().equals(ctx.subject.getUniqueId())) continue;
                        if (teamIs(gp.getRole().getTeam(), str(p, "team"))) list.add(gp);
                    }
                    if (list.isEmpty()) continue;
                    ctx.info.setGameTarget(list.get(RANDOM.nextInt(list.size())));
                    ctx.owner.sendMessage("\u00a77Vous avez \u00e9t\u00e9 cibl\u00e9 par un\u00a7c pouvoir\u00a77 visant \u00e0 conna\u00eetre votre\u00a7a "
                            + ctx.info.getInfoType().getName().toLowerCase() + "\u00a77 : un autre joueur a \u00e9t\u00e9 vis\u00e9 \u00e0 votre place.");
                    continue;
                }
                case "TITAN_GIVE":
                    giveTitan(ctx.owner, str(p, "titan"));
                    continue;
                case "TITAN_FLAG": { // titans permanents (Petit Titan...) : AotRoles.isTransformedinTitan
                    RoleBase mine = roleOf(ctx.owner);
                    boolean on = "ON".equals(str(p, "state"));
                    if (mine instanceof AotRoles && ((AotRoles) mine).isTransformedinTitan != on) {
                        ((AotRoles) mine).isTransformedinTitan = on;
                        for (RuleEngine engine : new ArrayList<>(ENGINES.values())) {
                            if (ctx.owner.getUniqueId().equals(engine.ownerId())) engine.transformed(on);
                        }
                    }
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
        Ctx c = new Ctx(owner == null ? ctx.owner : owner, subject, owner == null ? ctx.origin : owner.getLocation());
        c.number = ctx.number;
        return c;
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
            case "MARK": { // marque le joueur pendant N s, 0 = toujours (condition « le joueur concerné est marqué »)
                Map<UUID, Long> marked = marks.get(str(p, "name"));
                if (marked == null) marks.put(str(p, "name"), marked = new HashMap<>());
                int seconds = num(p, "s");
                marked.put(target.getUniqueId(), seconds == 0 ? Long.MAX_VALUE : System.currentTimeMillis() + seconds * 1000L);
                return;
            }
            case "STEAL": { // vol de titan d'UHC-Meetup (/aot steal) : seulement pour les rôles de l'Attaque des Titans
                if (!(role instanceof AotRoles)) return;
                AotRoles aot = (AotRoles) role;
                int priority = num(p, "n");
                if (priority == 0) {
                    aot.setCanVoleTitan(false);
                } else {
                    aot.setCanVoleTitan(true);
                    aot.setStealPriority(Math.max(aot.getStealPriority(), priority));
                }
                return;
            }
            case "LANCE":
                if (gameTarget != null) LancePowerManager.giveLance(gameTarget, num(p, "n"));
                return;
            case "INFO": { // camp, rôle ou inventaire : passe par PowerTakeInfoEvent (Eren peut détourner)
                if (gameTarget == null || gameTarget.getRole() == null) return;
                String what = str(p, "what");
                PowerTakeInfoEvent info = new PowerTakeInfoEvent(power, gameTarget,
                        "ROLE".equals(what) ? InfoType.ROLE : "INV".equals(what) ? InfoType.INV : InfoType.TEAM);
                Bukkit.getPluginManager().callEvent(info);
                if (info.isCancelled()) {
                    ctx.owner.sendMessage("\u00a7cVotre pouvoir a \u00e9t\u00e9 annul\u00e9.");
                    return;
                }
                GamePlayer seen = info.getGameTarget();
                Player seenPlayer = seen == null ? null : Bukkit.getPlayer(seen.getUuid());
                if (seen == null || seen.getRole() == null || seenPlayer == null) return;
                String name = target.getName(); // le joueur visé : il ne doit pas savoir que l'information vient d'un autre
                if ("TEAM".equals(what)) {
                    ctx.owner.sendMessage("\u00a7a" + name + "\u00a77 est dans le camp :\u00a7c " + seen.getRole().getTeam().getName());
                } else if ("ROLE".equals(what)) {
                    ctx.owner.sendMessage("\u00a7a" + name + "\u00a77 a le r\u00f4le :\u00a7c " + seen.getRole().getName());
                } else {
                    org.bukkit.inventory.Inventory inv = Bukkit.createInventory(null, 54, "\u00a7fInventaire de\u00a7a " + (name.length() > 16 ? name.substring(0, 16) : name));
                    ItemStack[] armor = seenPlayer.getInventory().getArmorContents();
                    for (int k = 0; k < armor.length && k < 4; k++) inv.setItem(3 - k, armor[k]);
                    int slot = 18;
                    for (ItemStack item : seenPlayer.getInventory().getContents()) {
                        if (item == null || item.getType() == org.bukkit.Material.AIR || slot >= 54) continue;
                        inv.setItem(slot++, item.clone());
                    }
                    ctx.owner.openInventory(inv);
                }
                return;
            }
            case "GEAR": {
                if ("HIDE".equals(str(p, "mode"))) {
                    HIDDEN.put(target.getUniqueId(), System.currentTimeMillis() + num(p, "s") * 1000L);
                    sendGear(target, true);
                } else if (HIDDEN.remove(target.getUniqueId()) != null) {
                    sendGear(target, false);
                }
                return;
            }
            case "FIREWORK": {
                final org.bukkit.entity.Firework firework = target.getWorld().spawn(target.getLocation(), org.bukkit.entity.Firework.class);
                org.bukkit.inventory.meta.FireworkMeta meta = firework.getFireworkMeta();
                org.bukkit.Color rgb;
                switch (str(p, "color")) {
                    case "RED": rgb = org.bukkit.Color.RED; break;
                    case "BLUE": rgb = org.bukkit.Color.BLUE; break;
                    case "YELLOW": rgb = org.bukkit.Color.YELLOW; break;
                    case "WHITE": rgb = org.bukkit.Color.WHITE; break;
                    case "ORANGE": rgb = org.bukkit.Color.ORANGE; break;
                    case "PURPLE": rgb = org.bukkit.Color.PURPLE; break;
                    default: rgb = org.bukkit.Color.GREEN;
                }
                meta.addEffect(org.bukkit.FireworkEffect.builder().withColor(rgb).with(org.bukkit.FireworkEffect.Type.BALL).build());
                meta.setPower(1);
                firework.setFireworkMeta(meta);
                Bukkit.getScheduler().runTaskLater(Main.getInstance(), new Runnable() {
                    @Override
                    public void run() {
                        if (firework.isValid()) firework.detonate();
                    }
                }, 20L);
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
                ItemStack stack = new ItemStack(material, Math.max(1, Math.min(64, p.containsKey("qty") ? num(p, "qty") : 1)));
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
                        ctx.subject, seconds == 0 ? 0L : System.currentTimeMillis() + seconds * 1000L);
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
            case "ALL":
            case "TEAM":
            case "RANDOM":
            case "MARKED": { // jamais moi
                Map<UUID, Long> marked = "MARKED".equals(to) ? marks.get(str(p, "mark")) : null;
                long now = System.currentTimeMillis();
                for (GamePlayer gp : GameState.getInstance().getGamePlayer().values()) {
                    if (!gp.isAlive() || gp.getRole() == null || gp.getUuid().equals(ctx.owner.getUniqueId())) continue;
                    if (("TEAM".equals(to) || "RANDOM".equals(to)) && !teamIs(gp.getRole().getTeam(), str(p, "tteam"))) continue;
                    if ("MARKED".equals(to)) {
                        Long until = marked == null ? null : marked.get(gp.getUuid());
                        if (until == null || now > until) continue;
                    }
                    Player player = Bukkit.getPlayer(gp.getUuid());
                    if (player != null) out.add(player);
                }
                if ("RANDOM".equals(to) && out.size() > 1) {
                    Player pick = out.get(RANDOM.nextInt(out.size()));
                    out.clear();
                    out.add(pick);
                }
                break;
            }
            default:
                out.add(ctx.owner);
        }
        return out;
    }

    // ---------------------------------------------------------------- conditions

    /** Joueur dont on lit / modifie la variable : moi ou le joueur concerné (null s'il n'y en a pas). */
    private static UUID varOwner(String of, Ctx ctx) {
        if ("SUBJECT".equals(of)) return ctx.subject == null ? null : ctx.subject.getUniqueId();
        return ctx.owner.getUniqueId();
    }

    private boolean test(Map<String, Object> node, Ctx ctx) {
        currentOwner = ctx.owner.getUniqueId();
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
            case "VAR_CMP": {
                UUID who = varOwner(str(p, "of"), ctx);
                if (who == null) return false;
                double value = Variables.get(str(p, "var"), who);
                double ref = "VAR".equals(str(p, "src")) ? Variables.get(str(p, "var2"), varOwner(str(p, "of2"), ctx)) : dbl(p, "n");
                switch (str(p, "op")) {
                    case "GT": return value > ref + 1.0E-9;
                    case "LT": return value < ref - 1.0E-9;
                    case "NE": return Math.abs(value - ref) >= 1.0E-6;
                    default: return compare(value, str(p, "op"), ref);
                }
            }
            case "VAR_IS": {
                UUID who = varOwner(str(p, "of"), ctx);
                return who != null && (Variables.get(str(p, "var"), who) != 0.0) == "TRUE".equals(str(p, "state"));
            }
            case "ME_MARKED": {
                Map<UUID, Long> marked = marks.get(str(p, "name"));
                Long until = marked == null ? null : marked.get(ctx.owner.getUniqueId());
                return until != null && System.currentTimeMillis() <= until;
            }
            case "S_NEAR": {
                int radius = num(p, "r");
                return ctx.subject != null && ctx.subject.getWorld().equals(ctx.owner.getWorld())
                        && ctx.subject.getLocation().distanceSquared(ctx.owner.getLocation()) <= (double) radius * radius;
            }
            case "HIT_ZONE":
                return ctx.zone != null && ctx.zone.equals(str(p, "zone"));
            case "ME_TITAN":
                return isTitan(ctx.owner);
            case "S_TITAN":
                return isTitan(ctx.subject);
            case "HAS_TITAN": {
                TitanForm form = titanFormOf("SUBJECT".equals(str(p, "who")) ? ctx.subject : ctx.owner);
                String titan = str(p, "titan");
                return form != null && ("ANY".equals(titan) || ("MAHR".equals(titan) && form.isMahr()) || form.name().equals(titan));
            }
            case "TITAN_TAKEN":
                try {
                    return titans().isTitanAttributed(TitanForm.valueOf(str(p, "titan")));
                } catch (IllegalArgumentException e) {
                    return false;
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
        Location at = ctx.subject != null ? ctx.subject.getLocation() : ctx.owner.getLocation(), mine = ctx.owner.getLocation();
        text = text.replace("%x%", String.valueOf(at.getBlockX())).replace("%y%", String.valueOf(at.getBlockY())).replace("%z%", String.valueOf(at.getBlockZ()));
        text = text.replace("%mon_x%", String.valueOf(mine.getBlockX())).replace("%mon_y%", String.valueOf(mine.getBlockY()))
                .replace("%mon_z%", String.valueOf(mine.getBlockZ()));
        text = variables(text, ctx.owner.getUniqueId(), ctx.subject == null ? null : ctx.subject.getUniqueId());
        for (Map.Entry<String, Double> c : counters.entrySet()) text = text.replace("%" + c.getKey() + "%", format(c.getValue()));
        return text.replaceAll("%[a-z][a-z0-9_]{0,15}%", "0");
    }

    /** %nom% = ma variable (ou la valeur partagée), %joueur:nom% = celle du joueur concerné. */
    private static String variables(String text, UUID mine, UUID subject) {
        if (text.indexOf('%') < 0) return text;
        for (String name : Variables.names()) {
            text = text.replace("%joueur:" + name + "%", subject == null ? "?" : Variables.text(name, subject));
            if (mine != null) text = text.replace("%" + name + "%", Variables.text(name, mine));
        }
        return text;
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
        text = variables(text, ownerId(), bar.subjectId);
        if (text.contains("%fleche%") || text.contains("%distance%")) { // direction et distance du joueur concerné
            Player viewer = Bukkit.getPlayer(bar.player), other = bar.subjectId == null ? null : Bukkit.getPlayer(bar.subjectId);
            boolean same = viewer != null && other != null && viewer.getWorld().equals(other.getWorld());
            text = text.replace("%fleche%", same ? fr.nicknqck.utils.ArrowTargetUtils.calculateArrow(viewer, other.getLocation()) : "?")
                    .replace("%distance%", same ? String.valueOf((int) viewer.getLocation().distance(other.getLocation())) : "?");
        }
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
        if (v instanceof Map) { // { var, min, max, step } : valeur d'une variable, bornée et arrondie comme le champ du bloc
            @SuppressWarnings("unchecked") Map<String, Object> ref = (Map<String, Object>) v;
            double value = Variables.get(str(ref, "var"), currentOwner);
            double step = ref.get("step") instanceof Number ? ((Number) ref.get("step")).doubleValue() : 0.0;
            if (step > 0) value = Math.round(value / step) * step;
            if (ref.get("min") instanceof Number) value = Math.max(((Number) ref.get("min")).doubleValue(), value);
            if (ref.get("max") instanceof Number) value = Math.min(((Number) ref.get("max")).doubleValue(), value);
            return value;
        }
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
