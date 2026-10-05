# Studio Vidéo

Un studio web pour transformer des rushs parlés en vidéos montées, avec des cuts automatiques et du motion design synchronisé sur les idées exprimées.

**Application : https://lurnschool.github.io/studio-video/**

## Disponible sans service IA

- Import local de vidéos, aperçu avec son et export MP4 ou WebM selon le navigateur.
- Cuts automatiques sur les pauses audio, rythme naturel ou dynamique, marges autour de la parole et zooms légers facultatifs.
- Réglage manuel, suppression d’un passage, réorganisation, annuler/rétablir.
- Plusieurs animations : mots éditoriaux avec accent violet en italique, cartons dégradés, titres et bandeaux.
- Schémas animés : étapes avec flèches, comparaison, idées reliées, chiffre clé. Chaque bloc a son texte et son instant d’apparition.
- Formats paysage, vertical et carré ; sauvegarde et ouverture du projet JSON. Réimporter les vidéos originales à la réouverture.
- Exemple pré-écrit accessible depuis « Voir un exemple de schéma », sans import et sans API.

## Motion design depuis la voix — connexion requise

Le connecteur est implémenté. **La génération réelle nécessite une clé OpenAI et un serveur configuré ; elle n’est pas activée sur GitHub Pages.** Aucun résultat de démonstration n’est présenté comme une analyse réelle.

1. Monter les rushs avec les cuts automatiques.
2. Connecter le service IA, saisir son code d’accès et autoriser l’envoi de la piste audio.
3. Cliquer « Créer les visuels depuis ma voix ».
4. Le navigateur reconstitue uniquement l’audio conservé dans le montage, en WAV mono 16 kHz.
5. Le serveur transcrit les mots avec leurs temps, puis demande un plan visuel structuré basé sur le sens du discours.
6. Les schémas sont placés sur ces temps ; les blocs apparaissent au mot concerné. Les titres et blocs restent modifiables. Une nouvelle génération remplace les anciens visuels IA et préserve les animations manuelles.

Choix visuels : une séquence pour des étapes ou causes explicites, une comparaison pour deux approches, une carte d’idées pour des liens, un chiffre clé seulement si la valeur est prononcée. Les réponses sont validées avant toute modification du projet. Les faits, libellés et timings doivent être relus : une IA peut mal transcrire ou mal résumer.

## Démarrage local

Node.js 22.9+ ; aucune dépendance npm.

```sh
cp .env.example .env
npm start
```

Ouvrir `http://127.0.0.1:8787`. L’éditeur fonctionne même sans clé.

Pour activer la génération, renseigner **localement** dans `.env` :

- `OPENAI_API_KEY` : clé du compte API OpenAI avec facturation disponible.
- `STUDIO_ACCESS_TOKEN` : code privé long et aléatoire (32 caractères minimum recommandé).
- `OPENAI_MOTION_MODEL` : `gpt-4o-mini` par défaut, configurable.

Dans l’application, connecter `http://127.0.0.1:8787` et saisir le même `STUDIO_ACCESS_TOKEN`. **Ne pas saisir la clé OpenAI dans la page.** Ne pas publier `.env` ni les rushs.

Le serveur ne sert qu’une liste de fichiers publics. Les routes d’analyse exigent un code d’accès et une origine autorisée. Une analyse simultanée maximum, limites de taille et de durée, délai et annulation sont prévus. L’audio et la transcription ne sont pas écrits sur disque par le serveur ; ils sont transmis à OpenAI et soumis à ses règles de traitement. `store: false` est demandé pour le plan visuel. Le code d’accès n’est pas enregistré dans le stockage du navigateur.

## Hébergement et future intégration TrackMillion

GitHub Pages héberge uniquement l’interface statique depuis `main / (root)`. Il ne peut pas exécuter `server.mjs` ni conserver une clé secrète.

Le service Node doit être déployé séparément avec HTTPS, secrets d’environnement et `ALLOWED_ORIGINS` restreint au domaine de l’interface. `HOST=0.0.0.0` est nécessaire sur certains hébergeurs. Pour un usage multi-utilisateur dans TrackMillion, remplacer le code d’accès partagé par l’authentification TrackMillion et ajouter des quotas par utilisateur. Cette version est un prototype individuel, pas un service public multi-utilisateur.

Contrat d’intégration :

- `GET /api/health` → `{ready: boolean}`.
- `POST /api/analyze`, `Authorization: Bearer <code privé>`, `Content-Type: audio/wav` → `{words, plan, duration}`.
- Projet indépendant en JSON v1 (`project.mjs`) ; renderer partagé entre aperçu et export (`render.mjs`).

## Limites et vérification

- Les cuts utilisent l’énergie audio : une musique continue, du bruit ou une voix très faible peuvent limiter leur pertinence. Les répétitions, hésitations et phrases ratées ne sont pas encore supprimées par analyse sémantique.
- Analyse IA : montage de 10 minutes maximum ; sources de moins de 350 Mo et de 30 minutes. Décodage en mémoire.
- Le motion design généré utilise les modèles de schémas fournis ; ce n’est pas encore une génération libre de n’importe quelle animation.
- Export en temps réel, qualité et codecs dépendants du navigateur. Laisser l’onglet actif ; le rendu navigateur n’a pas la précision image par image d’un moteur de rendu serveur.
- Les projets JSON n’incluent pas les vidéos ; conserver les originaux.
- Les appels OpenAI sont couverts par des tests simulés. Aucun appel réel n’a été validé sans clé API.

```sh
npm test
```

Tests : pauses et marges, cuts et suppression, synchronisation des schémas, fichiers de projet, WAV, authentification, origines autorisées, requêtes IA et rejet des plans invalides.

Documentation utilisée : [transcription et horodatages](https://developers.openai.com/api/docs/guides/speech-to-text), [sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs).
