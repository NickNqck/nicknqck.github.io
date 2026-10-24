# Créateur d'addon UHC-Meetup

Site web 100 % statique (aucun serveur, aucune donnée collectée) qui génère le `.jar` d'un addon pour UHC-Meetup.

## Lancer le site

Ouvre `index.html`, ou lance un petit serveur local (recommandé) depuis ce dossier :

    py -m http.server 8000 --bind 127.0.0.1

puis va sur http://localhost:8000 .

## Étape de vérification

Avant de développer, le site demande le `spigot.jar` du serveur 1.8.8 et vérifie qu'il s'agit bien de Spigot 1.8.8. Le fichier est analysé
dans le navigateur : il n'est ni envoyé, ni enregistré, ni copié dans l'addon.

Trois façons de le fournir :

- **Le placer à la racine** (à côté de `index.html`) sous le nom `spigot.jar` : il est détecté et vérifié automatiquement, l'étape n'est
  alors plus demandée. Cela ne marche que si le site est servi (`py -m http.server 8000 --bind 127.0.0.1`) : ouvert en double-clic
  (`file://`), le navigateur interdit de lire un fichier local.
- **Le glisser-déposer** sur la zone prévue (ou n'importe où dans la page pendant cette étape).
- **Le choisir** en cliquant sur la zone.

`spigot.jar` est dans `.gitignore` : il ne doit pas être publié (il contient du code de Mojang).

## Structure (tout doit être présent)

    index.html, style.css
    js/
      app.js            moteur des menus, import/export, compilation
      menu-data.js      les menus (c'est ici qu'on ajoute des boutons)
      blocks.js         éditeur à blocs (façon Scratch) : seule façon de créer un pouvoir (objet, commande, passifs, cooldown)
      rules-data.js     règles « quand … » des pouvoirs : déclencheurs, conditions, actions (exécutées par RuleEngine.java)
      meetup-roles.js   rôles d'UHC-Meetup (enum Roles), pour les conditions « le joueur concerné a le rôle … »
      describe.js       description automatique d'un pouvoir (bouton « Générer automatiquement »)
      items-data.js, colors-data.js, effects-data.js, meetup-modes.js, meetup-teams.js   données
      commands-data.js  règles des commandes personnalisées (format, noms déjà pris par UHC-Meetup / Minecraft)
      variables-data.js règles des variables de l'addon (menu Variables : nom, type, portée, valeurs)
      classgen.js       génère les classes Java (enums d'équipes et de rôles, rôles, pouvoirs)
      javagen.js        même chose en code source Java (bouton « Projet IntelliJ » du récapitulatif)
      jar-builder.js    assemble le .jar dans le navigateur (classes déplacées dans le package fr.<pseudo>.<projet>)
      spigot-check.js   vérifie (dans le navigateur) que le jar fourni est bien un spigot.jar 1.8.8
      template-jar.js   jar modèle précompilé (généré, ne pas modifier à la main)
      template-sources.js   code source du jar modèle (généré avec template-jar.js, ne pas modifier à la main)
      vendor/jszip.min.js   bibliothèque d'écriture de zip (MIT)
    src/main/java/...   code Java du jar modèle
    build.gradle, tools/embed-template.py

## Recompiler le jar modèle avec TES jars (recommandé après chaque modification du code Java)

1. Place `UHC-Meetup snapshot 17.jar` et `spigot.jar` à la racine (à côté de `index.html`) : ils sont ignorés par git.
2. `gradlew shadowJar`
3. `py tools/embed-template.py`

## Rôles du mode « Attaque des Titans » d'UHC-Meetup

Un rôle placé dans le mode `aot` d'UHC-Meetup hérite de la classe des rôles de son camp (`SoldatsRoles`, `MahrRoles`, `TitansRoles`, sinon
`AotRoles`) : il reçoit l'équipement tridimensionnel, apparaît dans les listes des Mahr / des Titans, peut voler un titan, etc. Ses pouvoirs de
commande peuvent utiliser `/aot <argument>` (sauf `me`, `roles`, `titan`, `info` et `steal`, déjà pris par UHC-Meetup).

Blocs des règles pour ce mode : recevoir un titan d'UHC-Meetup (Assaillant, Bestial, Charette, Colossal, Cuirassé, Mâchoire, Warhammer ou
au hasard), se déclarer transformé (titans permanents), « quand je me transforme / redeviens humain », « quand je me téléporte avec mon
équipement tridimensionnel », « quand je récupère un titan », capacité de vol (`/aot steal`), lances explosives, et les conditions « je suis /
le joueur concerné est transformé en titan », « … a un titan », « … appartient à un joueur ».

Blocs généraux ajoutés en même temps : « pour chaque joueur parmi … » (le joueur concerné devient chacun d'eux), destinataires « tous les
joueurs en vie », « les joueurs du camp », « un joueur au hasard du camp », « les joueurs portant la marque », informations (camp, rôle,
inventaire : elles passent par `PowerTakeInfoEvent`, qu'un pouvoir « quand un pouvoir cherche une information sur moi » peut détourner),
dégâts du coup en cours, partie du corps touchée par une flèche, téléportation au loin, retour dans le temps, armure cachée, feu
d'artifice, ajout de joueurs à la description, commande avec un nombre (`/aot fasttimetravel 10`).

## Variables

Le menu **Variables** crée des variables utilisables par tous les pouvoirs : nombre entier (`int`), nombre à virgule (`double`) ou
vrai / faux (`boolean`), avec une valeur par joueur ou une seule valeur partagée par toute la partie, une valeur de départ (remise à chaque
partie) et, pour les nombres, un minimum et un maximum.

Dans les règles des pouvoirs (catégorie « Variables ») :

- **modifier** une variable nombre : `=`, `+=`, `−=`, `×=`, `÷=` un nombre, une autre variable, un nombre au hasard, la vie ou la vie max
  d'un joueur ; une variable vrai / faux : devient vraie, fausse, s'inverse ou copie une autre variable ;
- **tester** une variable : comparer un nombre (≥ ≤ > < = ≠) à un nombre ou à une autre variable, ou savoir si elle est vraie ;
- **utiliser** sa valeur dans n'importe quel champ nombre d'un bloc (petit menu `123` / `𝑥 nom` devant le champ) : niveau d'un effet,
  durée, rayon, dégâts... (la valeur est bornée et arrondie comme le champ) ;
- **l'afficher** dans un message ou la barre d'action : `%nom%` (ma valeur) ou `%joueur:nom%` (celle du joueur concerné).

Une variable « par joueur » se lit et se modifie pour moi ou pour le joueur concerné par la règle. Le .jar les gère dans `Variables.java`.
