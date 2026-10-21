# Protocole serveur

Ce que l'app attend de tes serveurs privés. Tout est en JSON.

## Confidentialité

- L'app n'envoie **jamais** l'UUID complet : seulement le nom affiché `Pseudo#48F2` et le rôle.
- Les positions envoyées sont arrondies à 3 décimales (~110 m).
- Les signalements de la carte sont envoyés à l'endroit exact choisi sous le viseur.
- Recommandations côté serveur : aucun log d'IP, aucune conservation des messages au-delà de
  quelques heures, TLS obligatoire (`wss://`, `https://`), rate limiting.

## WebSocket — `EXPO_PUBLIC_WS_URL`

### Client → serveur

| `type`     | Champs                                                    | Quand                                                   |
|------------|-----------------------------------------------------------|---------------------------------------------------------|
| `hello`    | `name`, `role`, `radius` (m), `latitude?`, `longitude?`   | à chaque (re)connexion                                  |
| `position` | `latitude`, `longitude` (ou `null` si partage désactivé)  | quand la position arrondie change                       |
| `chat`     | `id`, `author`, `role`, `text`, `ts`, `latitude?`, `longitude?` | envoi d'un message                                |
| `ping`     | —                                                         | toutes les 25 s                                         |

### Serveur → client

| `type`           | Champs                                                            |
|------------------|-------------------------------------------------------------------|
| `chat`           | même forme que l'envoi client                                     |
| `report`         | `report` : objet Signalement (voir ci-dessous)                    |
| `report_removed` | `id`                                                              |
| `pong`           | — (ignoré par l'app)                                              |

Le serveur diffuse un `chat` à tous les clients dont la dernière position connue est dans le
`radius` de l'auteur. Un client sans position ne reçoit que les messages sans position ; c'est
au serveur de décider.

L'app ignore tout message invalide, d'un `type` inconnu ou de plus de 10 000 caractères, et
dédoublonne par `id` : le serveur peut renvoyer son propre message à l'auteur.

`role` ∈ `user` | `medic` | `supply` | `protection`.

## REST — `EXPO_PUBLIC_API_URL`

### `GET /reports?lat=…&lng=…&radius=…`

Renvoie un tableau de Signalements actifs dans le rayon.

### `POST /reports`

Corps : `{ "type", "latitude", "longitude", "author" }`. Renvoie le Signalement créé. Le
serveur doit aussi le diffuser en WebSocket (`type: "report"`) aux clients proches.

### Signalement

```json
{
  "id": "string",
  "type": "danger | kettle | medic | supply",
  "latitude": 48.8674,
  "longitude": 2.3636,
  "author": "Mouette#48F2",
  "createdAt": 1767225600000,
  "expiresAt": 1767229200000
}
```

`expiresAt` est optionnel (par défaut `createdAt` + 1 h). Les dates sont en millisecondes
depuis l'epoch Unix.
