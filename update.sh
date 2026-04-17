#!/bin/bash
DISTRO_URL="https://distribution.ap-bts.wstr.fr/distribution.json"
MODS_DIR="./mods"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     DistrictLife — Sync des mods         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

mkdir -p "$MODS_DIR"

echo "[1/3] Téléchargement du distribution.json..."
curl -s "$DISTRO_URL" -o /tmp/distribution.json
if [ $? -ne 0 ]; then
    echo "  [ERREUR] Impossible de joindre le serveur de distribution."
    exit 1
fi
echo "  [OK] distribution.json récupéré."
echo ""
echo "[2/3] Vérification des mods..."
echo ""

python3 - <<'EOF'
import json, os, urllib.request, hashlib, sys

MODS_DIR = "./mods"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"

with open("/tmp/distribution.json") as f:
    distro = json.load(f)

modules = distro["servers"][0]["modules"]
mods = [m for m in modules if m.get("type") == "File"]

ok_count = 0
dl_count = 0
err_count = 0

for mod in mods:
    artifact = mod["artifact"]
    filename = os.path.basename(artifact["path"])
    target = os.path.join(MODS_DIR, filename)
    expected_md5 = artifact["MD5"]
    url = artifact["url"]
    name = mod.get("name", filename)

    sys.stdout.write(f"  {CYAN}[CHECK]{RESET} {name} ({filename})... ")
    sys.stdout.flush()

    if os.path.exists(target):
        with open(target, "rb") as f:
            current_md5 = hashlib.md5(f.read()).hexdigest()
        if current_md5 == expected_md5:
            print(f"{GREEN}OK{RESET}")
            ok_count += 1
            continue
        else:
            print(f"{YELLOW}MD5 différent → mise à jour{RESET}")
    else:
        print(f"{YELLOW}Absent → téléchargement{RESET}")

    sys.stdout.write(f"  {CYAN}[DL]{RESET}    {name}... ")
    sys.stdout.flush()
    try:
        urllib.request.urlretrieve(url, target)
        print(f"{GREEN}OK{RESET}")
        dl_count += 1
    except Exception as e:
        print(f"{RED}ERREUR: {e}{RESET}")
        err_count += 1

print("")
print(f"[3/3] Résumé :")
print(f"  {GREEN}✔ À jour    : {ok_count}{RESET}")
print(f"  {YELLOW}↓ Téléchargé : {dl_count}{RESET}")
if err_count > 0:
    print(f"  {RED}✘ Erreurs   : {err_count}{RESET}")
print("")
EOF

echo "══════════════════════════════════════════════"
echo " Démarrage du serveur..."
echo "══════════════════════════════════════════════"
echo ""
