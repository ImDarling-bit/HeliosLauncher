# Rappel — Push & Release du launcher DistrictLife

## 1. Modifier la version du launcher

Avant chaque release, mettre à jour la version dans `package.json` :

```json
"version": "2.2.1"
```

La version doit suivre le format `MAJEUR.MINEUR.PATCH` (ex: `2.2.2`).

---

## 2. Pousser les modifications sur GitHub

```bash
# Vérifier les fichiers modifiés
git status

# Ajouter les fichiers modifiés
git add distribution.districtliferp.fr/distribution.json
git add package.json
# (ajouter les autres fichiers modifiés si besoin)

# Créer le commit
git commit -m "chore: bump version X.X.X / update mods"

# Pousser sur le dépôt
git push origin master
```

> Remote : `https://github.com/ImDarling-bit/HeliosLauncher.git`

---

## 3. Workflow GitHub Actions (build automatique)

Le workflow `.github/workflows/build.yml` se déclenche **uniquement sur un push de tag** `v*` (ex: `v2.2.2`).

Il build le launcher sur les 3 plateformes en parallèle :

| OS | Artefact produit |
|----|-----------------|
| Windows | `DistrictLife Launcher-setup-X.X.X.exe` (NSIS x64) |
| macOS | `DistrictLife Launcher-setup-X.X.X-x64.dmg` + `arm64.dmg` |
| Linux | `DistrictLife Launcher-setup-X.X.X.AppImage` |

Les artefacts sont publiés automatiquement via `GH_TOKEN` sur la page **Releases** du dépôt GitHub.

---

## 4. Créer une release manuellement (si besoin)

Si tu veux créer une release avec un tag :

```bash
# Créer un tag
git tag v2.2.2

# Pousser le tag
git push origin v2.2.2
```

Ou depuis GitHub : **Releases → Draft a new release → choisir le tag**.

---

## 5. Résumé rapide

```bash
# Modifier package.json (version), distribution.json, etc.
git add .
git commit -m "release: vX.X.X"
git push origin master
# → Le build démarre automatiquement sur GitHub Actions
```

Suivre l'avancement sur : `https://github.com/ImDarling-bit/HeliosLauncher/actions`
