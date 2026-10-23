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
