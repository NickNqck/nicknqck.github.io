#!/usr/bin/env python3
"""
Intègre le .jar compilé de l'addon générique dans le site (js/template-jar.js), ainsi que son code source
(js/template-sources.js, utilisé par le bouton « Projet IntelliJ »).

À relancer chaque fois que tu modifies le code Java de src/ :
  1. gradlew shadowJar            (compile avec TES vrais jars UHC-Meetup et spigot)
  2. py tools/embed-template.py   (prend le .jar le plus récent de build/libs, ou le chemin donné en argument)
"""
import base64, glob, json, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) > 1:
    path = sys.argv[1]
else:
    jars = glob.glob(os.path.join(root, "build", "libs", "*.jar"))
    if not jars:
        sys.exit("Aucun .jar trouvé dans build/libs : lance d'abord gradlew shadowJar.")
    path = max(jars, key=os.path.getmtime)

with open(path, "rb") as f:
    encoded = base64.b64encode(f.read()).decode("ascii")

out = os.path.join(root, "js", "template-jar.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("/* Généré par tools/embed-template.py à partir de " + os.path.basename(path) + " : ne pas modifier à la main. */\n")
    f.write('const TEMPLATE_JAR_B64 = "' + encoded + '";\n')
print("OK :", os.path.basename(path), "->", out, "(" + str(len(encoded)) + " caractères)")

# Code source du modèle : le projet exporté pour l'IDE contient exactement le code du jar modèle
sources = {}
java_dir = os.path.join(root, "src", "main", "java", "fr", "nicknqck", "addonbuilder")
for name in sorted(os.listdir(java_dir)):
    if name.endswith(".java"):
        with open(os.path.join(java_dir, name), encoding="utf-8") as f:
            sources["src/main/java/fr/nicknqck/addonbuilder/" + name] = f.read().replace("\r\n", "\n")
with open(os.path.join(root, "src", "main", "resources", "plugin.yml"), encoding="utf-8") as f:
    sources["src/main/resources/plugin.yml"] = f.read().replace("\r\n", "\n")
out = os.path.join(root, "js", "template-sources.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("/* Généré par tools/embed-template.py à partir de src/ : ne pas modifier à la main. */\n")
    f.write("const TEMPLATE_SOURCES = " + json.dumps(sources, ensure_ascii=True, indent=0) + ";\n")
print("OK :", len(sources), "fichiers sources ->", out)
