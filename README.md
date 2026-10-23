# eBay Radar 2026 — site prototype

Site web en français, responsive, sans dépendance npm. Il permet d'explorer des idées de revente, comparer les prix **d'annonces actives** sur eBay France, enregistrer ses favoris et estimer sa marge. Il ne prétend pas mesurer les recherches des acheteurs ni les ventes effectives.

## 1. Ouvrir immédiatement la démonstration

Ouvre `apercu-ebay-radar-2026.html` dans un navigateur : le tableau de bord et le calculateur fonctionnent avec des **exemples fictifs**. Aucune connexion eBay n'est effectuée en démonstration.

Pour lancer la version serveur :

```bash
# Installer Node.js 20 ou plus récent
cd ebay-radar-2026
node server.js
# Ouvrir http://localhost:3000
```

Aucun `npm install` nécessaire.

## 2. Activer les annonces réelles eBay

1. Crée gratuitement un compte développeur sur https://developer.ebay.com/ (distinct du compte vendeur ordinaire).
2. Récupère ta **Client ID** et ta **Client Secret** dans les clés d'application Production.
3. Dans le dossier du projet, copie `.env.example` en `.env`, puis renseigne `EBAY_CLIENT_ID` et `EBAY_CLIENT_SECRET`.
4. Redémarre `node server.js`. La recherche par mot-clé pourra exploiter `GET /buy/browse/v1/item_summary/search` sur `EBAY_FR` **si ton application dispose bien de l'accès Production eBay**.
5. Dans les paramètres eBay **User Tokens**, crée/configure ton **RuName** avec comme **Accept URL** `http://localhost:3000/auth/callback` si eBay accepte cette URL pour le développement, sinon utilise une adresse HTTPS publique (voir étape 3). Renseigne la valeur *RuName* (et non l'URL) dans `EBAY_RUNAME`.
6. Clique sur **Connecter eBay**. Le site ouvre la page officielle d'autorisation eBay OAuth et récupère uniquement le profil public de ton compte. Tu ne saisis jamais de mot de passe eBay dans le site.

**Important :** eBay peut exiger une URL HTTPS pour les redirections et une validation de l'accès API Production. Ces autorisations sont décidées par eBay, pas par ce prototype.

## 3. Publier le site sur Internet

Déploie ce projet sur un hébergeur Node.js (Render, Railway, VPS ou équivalent) :

- Commande de démarrage : `node server.js`.
- Variables d'environnement : `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`, `BASE_URL=https://ton-domaine.fr`, `PORT` selon l'hébergeur.
- Déclare `https://ton-domaine.fr/auth/callback` comme **Accept URL** de ton RuName eBay.
- Force HTTPS, et ne publie **jamais** `.env` ni la Client Secret dans le navigateur ou un dépôt public.

Le prototype utilise des sessions **en mémoire** : elles sont effacées à chaque redémarrage du serveur. Pour un vrai site commercial multi-utilisateurs, ajouter une base de données chiffrée, une persistance de session, la révocation des tokens, une politique de confidentialité, des protections contre les abus et un suivi de sécurité.

## Ce qui est vraiment mesuré

| Élément | Source | Interprétation |
|---|---|---|
| Annonces et prix | API eBay Browse | Prix demandés actuellement, **pas les prix de ventes conclues** |
| Nombre d'annonces | API eBay Browse `total` | Offre visible pour le mot-clé, **pas volume de recherches** |
| Prix médian | Calcul sur les résultats affichés | Indication indicative : vérifier la comparabilité des modèles et des états |
| Profit estimé | Saisie manuelle | Scénario, pas une promesse de gains |
| Idées à tester | Liste éditoriale | **Aucune tendance 2026 affirmée ou validée** |
| Demande et ventes | Recherche de produits eBay, hors du prototype | Consultation manuelle dans le Hub vendeur |

Pour voir les **produits réellement vendus**, les prix de vente, les tendances et le taux de vente, ouvre : https://www.ebay.fr/espacevendeurs/developper-ventes/recherche-produits

eBay précise que son API **Marketplace Insights** est restreinte et non ouverte aux nouveaux utilisateurs. L'accès Production des APIs Buy est soumis aux règles et approbations eBay : https://developer.ebay.com/api-docs/buy/buy-requirements.html

## Sécurité / limites

- OAuth 2.0 côté serveur, cookie de session HttpOnly + SameSite, paramètre `state` anti-CSRF, jetons jamais envoyés au navigateur.
- Accès profil public via le scope `commerce.identity.readonly` ; **le site ne publie pas d'annonce et ne commande rien**.
- Pas de mot de passe eBay stocké. Les jetons temporaires sont en mémoire seulement, perdus au redémarrage.
- Les favoris sont stockés **dans le navigateur de l'utilisateur** (localStorage), pas dans eBay.
- La déconnexion locale efface les jetons de la session du prototype, mais **ne révoque pas** l'autorisation eBay : la révoquer dans les paramètres du compte eBay si nécessaire.
- La calculatrice est uniquement indicative ; le taux initial de 12 % est une hypothèse modifiable et n'est pas un tarif eBay officiel. Le calcul n'intègre pas automatiquement les cotisations, taxes, retours ni les autres frais.
- Pour faire de la revente professionnelle, respecter les obligations applicables (commerciales, fiscales, consommateurs, propriété intellectuelle et conformité produit).

## Fichiers

- `server.js` : serveur Node.js, API Browse et autorisation OAuth.
- `lib.js` : fonctions métiers testables.
- `public/` : HTML/CSS/JavaScript de l'interface.
- `.env.example` : modèle de configuration.
- `tests/` : tests Node.js (`npm test`).

© 2026 — Prototype indépendant, non affilié à eBay.
