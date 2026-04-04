# Ajouter des mods et fichiers au launcher DistrictLife

Tout le contenu distribué aux joueurs est déclaré dans `distribution.json`, dans le tableau `modules` du serveur. Le launcher télécharge et vérifie l'intégrité (MD5) de chaque fichier au lancement.

---

## Structure de base d'un module

```json
{
    "id": "<groupe>:<artefact>:<version>",
    "name": "Nom affiché dans les logs",
    "type": "<type>",
    "artifact": {
        "size": 123456,
        "MD5": "abcdef1234567890abcdef1234567890",
        "url": "https://distribution.ap-bts.wstr.fr/chemin/vers/fichier.jar"
    }
}
```

| Champ | Description |
|-------|-------------|
| `id` | Identifiant unique au format Maven `groupe:artefact:version` |
| `name` | Nom lisible (logs uniquement) |
| `type` | Type du module (voir tableau ci-dessous) |
| `artifact.size` | Taille exacte en octets |
| `artifact.MD5` | Hash MD5 du fichier |
| `artifact.url` | URL de téléchargement publique |
| `artifact.path` | *(optionnel)* Chemin de destination relatif au gameDir |

---

## Types de modules

| Type | Destination | Usage |
|------|-------------|-------|
| `ForgeMod` | `mods/` | Mods Forge |
| `File` | `path` défini dans artifact | Configs, layouts, resource packs, etc. |
| `Library` | `libraries/` | JARs ajoutés au classpath |
| `ForgeHosted` | Géré par le launcher | Le mod loader Forge lui-même |

---

## Ajouter un mod Forge

```json
{
    "id": "curse:fancymenu:2.14.9",
    "name": "FancyMenu",
    "type": "ForgeMod",
    "artifact": {
        "size": 1547832,
        "MD5": "d41d8cd98f00b204e9800998ecf8427e",
        "url": "https://distribution.ap-bts.wstr.fr/mods/fancymenu-2.14.9.jar"
    }
}
```

Le fichier sera placé dans `.DistrictLife-launcheur/instances/DistrictLife/mods/fancymenu-2.14.9.jar`.

---

## Ajouter un fichier custom (config, layout, resource pack...)

Le type `File` permet de placer n'importe quel fichier dans le gameDir du joueur. Le champ `path` est **relatif au gameDir**.

```json
{
    "id": "districtlife:fancymenu-layout:1.0.0",
    "name": "FancyMenu - Layout Menu Principal",
    "type": "File",
    "artifact": {
        "size": 3072,
        "MD5": "d41d8cd98f00b204e9800998ecf8427e",
        "path": "config/fancymenu/layouts/mainmenu.txt",
        "url": "https://distribution.ap-bts.wstr.fr/config/fancymenu/layouts/mainmenu.txt"
    }
}
```

### Exemples de `path` courants

| Contenu | `path` |
|---------|--------|
| Mod | `mods/monmod-1.0.jar` *(préférer ForgeMod)* |
| Config mod | `config/monmod/config.toml` |
| Layout FancyMenu | `config/fancymenu/layouts/mainmenu.txt` |
| Resource pack (zip) | `resourcepacks/monpack.zip` |
| Shader | `shaderpacks/monshader.zip` |
| Options Minecraft | `options.txt` |

---

## Exemple complet : FancyMenu avec interface custom

FancyMenu nécessite **Konkrete** comme dépendance.

```json
"modules": [
    {
        "id": "net.minecraftforge:forge:1.16.5-36.2.39",
        "name": "Minecraft Forge 36.2.39",
        "type": "ForgeHosted",
        ...
    },
    {
        "id": "curse:fancymenu:2.14.9",
        "name": "FancyMenu",
        "type": "ForgeMod",
        "artifact": {
            "size": 1547832,
            "MD5": "REMPLACER_PAR_MD5_REEL",
            "url": "https://distribution.ap-bts.wstr.fr/mods/fancymenu-2.14.9.jar"
        }
    },
    {
        "id": "curse:konkrete:1.3.3",
        "name": "Konkrete (dépendance FancyMenu)",
        "type": "ForgeMod",
        "artifact": {
            "size": 98304,
            "MD5": "REMPLACER_PAR_MD5_REEL",
            "url": "https://distribution.ap-bts.wstr.fr/mods/konkrete-1.3.3.jar"
        }
    },
    {
        "id": "districtlife:layout-mainmenu:1.0.0",
        "name": "Interface - Menu Principal",
        "type": "File",
        "artifact": {
            "size": 4096,
            "MD5": "REMPLACER_PAR_MD5_REEL",
            "path": "config/fancymenu/layouts/mainmenu.txt",
            "url": "https://distribution.ap-bts.wstr.fr/layouts/mainmenu.txt"
        }
    }
]
```

---

## Calculer size et MD5

### Windows (PowerShell)
```powershell
# Taille en octets
(Get-Item "monfichier.jar").length

# MD5
Get-FileHash "monfichier.jar" -Algorithm MD5
```

### Linux / macOS
```bash
# Taille
wc -c < monfichier.jar

# MD5
md5sum monfichier.jar
```

---

## Workflow de déploiement

1. **Prépare le fichier** (JAR, config, layout...)
2. **Calcule** `size` et `MD5`
3. **Uploade** le fichier sur `https://distribution.ap-bts.wstr.fr/`
4. **Ajoute** l'entrée dans `modules` de `distribution.json`
5. **Déploie** le `distribution.json` mis à jour sur `https://distribution.ap-bts.wstr.fr/distribution.json`
6. Au prochain lancement, le launcher détecte le fichier manquant et le télécharge automatiquement

---

## Modules optionnels (choix du joueur)

Un module peut être rendu optionnel via `required.value = false`. Il apparaîtra dans l'interface de gestion des mods du launcher.

```json
{
    "id": "curse:optifine:1.16.5_HD_U_G8",
    "name": "OptiFine",
    "type": "ForgeMod",
    "required": {
        "value": false,
        "def": false
    },
    "artifact": {
        "size": 3145728,
        "MD5": "REMPLACER_PAR_MD5_REEL",
        "url": "https://distribution.ap-bts.wstr.fr/mods/optifine-G8.jar"
    }
}
```

| `required.value` | `required.def` | Comportement |
|-----------------|----------------|--------------|
| `true` | — | Toujours téléchargé, non désactivable |
| `false` | `true` | Optionnel, activé par défaut |
| `false` | `false` | Optionnel, désactivé par défaut |

---

## Référence

- Schema complet de distribution.json : `docs/distro.md`
- Exemple de distribution.json : `docs/sample_distribution.json`
