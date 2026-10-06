# Studio Vidéo

Un studio web pour transformer des rushs parlés en vidéos montées, avec des cuts automatiques et du motion design synchronisé sur les idées exprimées.

**Application : https://lurnschool.github.io/studio-video/**

## Montage complet en un clic

Dans le studio local configuré, importer les rushs, autoriser l’envoi de l’audio puis cliquer **Créer mon montage complet**. L’export automatique est activé par défaut.

1. Transcription de la voix avec les temps de chaque mot.
2. Décision éditoriale : supprimer les reprises, doublons accidentels et hésitations isolées, conserver les idées et leur ordre.
3. Détection des pauses dans le son, avec vérification qu’aucun mot conservé ne les traverse.
4. Recalcul des temps après les coupes, puis choix des titres, cartons, étapes, comparaisons, cartes d’idées et chiffres selon le discours conservé.
5. Application des animations et de zooms légers aux changements de plan ; export avec le son et le motion design.

Le serveur vérifie les horodatages contre les pauses audio. Un mot qui traverse une longue pause déclenche une nouvelle transcription par portions (quatre points de séparation maximum). Il vérifie aussi que les coupes de reprises conservent les termes principaux dans une autre version et qu’une hésitation ne supprime que des sons de remplissage. Les indices des scènes sont bornés aux mots disponibles. Les plans de coupe et d’animation invalides reçoivent chacun une tentative de correction, puis sont validés à nouveau avant application. Ces contrôles réduisent les erreurs ; ils ne garantissent pas une interprétation parfaite du discours.

Un bilan indique les coupes appliquées et les animations créées. **Annuler ce montage** restaure la version précédente. Les opérations individuelles restent accessibles. Une annulation ou un échec d’analyse conserve le montage précédent ; un échec d’export conserve le nouveau montage pour permettre de réessayer.

## Disponible sans service IA

- Import local de vidéos, aperçu avec son et export MP4 ou WebM selon le navigateur.
- Cuts automatiques sur les pauses audio, rythme naturel ou dynamique, marges autour de la parole et zooms légers facultatifs.
- Réglage manuel, suppression d’un passage, réorganisation, annuler/rétablir.
- Plusieurs animations : mots éditoriaux avec accent violet en italique, cartons dégradés, titres et bandeaux.
- Schémas animés : étapes avec flèches, comparaison, idées reliées, chiffre clé. Chaque bloc a son texte et son instant d’apparition.
- Formats paysage, vertical et carré ; sauvegarde et ouverture du projet JSON. Réimporter les vidéos originales à la réouverture.
- Exemple pré-écrit accessible depuis « Voir un exemple de schéma », sans import et sans API.

## Motion design depuis la voix — connexion requise

Le connecteur est implémenté et testé avec l’API. **La génération réelle nécessite une clé OpenAI et un serveur configuré ; elle n’est pas activée sur GitHub Pages.** Aucun résultat de démonstration n’est présenté comme une analyse réelle.

1. Monter les rushs avec les cuts automatiques.
2. Autoriser l’envoi de la piste audio. En local, la connexion est automatique ; pour un service distant, saisir son adresse et son code d’accès.
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

Avec `STUDIO_LOCAL_SESSION=1`, le studio ouvert sur `http://127.0.0.1:8787` se connecte automatiquement via un cookie HttpOnly, limité au navigateur de même origine sur la boucle locale. Depuis une interface distante, saisir l’adresse du service et le même `STUDIO_ACCESS_TOKEN`. **Ne pas saisir la clé OpenAI dans la page.** Ne pas publier `.env` ni les rushs.

Le serveur ne sert qu’une liste de fichiers publics. Les routes d’analyse exigent un code d’accès et une origine autorisée. Une analyse simultanée maximum, limites de taille et de durée, délai et annulation sont prévus. L’audio et la transcription ne sont pas écrits sur disque par le serveur ; ils sont transmis à OpenAI et soumis à ses règles de traitement. `store: false` est demandé pour le plan visuel. Le code d’accès n’est pas enregistré dans le stockage du navigateur.

## Hébergement et future intégration TrackMillion

GitHub Pages héberge uniquement l’interface statique depuis `main / (root)`. Il ne peut pas exécuter `server.mjs` ni conserver une clé secrète.

Le service Node doit être déployé séparément avec HTTPS, secrets d’environnement et `ALLOWED_ORIGINS` restreint au domaine de l’interface. `HOST=0.0.0.0` est nécessaire sur certains hébergeurs. Pour un usage multi-utilisateur dans TrackMillion, remplacer le code d’accès partagé par l’authentification TrackMillion et ajouter des quotas par utilisateur. Cette version est un prototype individuel, pas un service public multi-utilisateur.

Contrat d’intégration :

- `GET /api/health` → `{ready: boolean, localSession: boolean}`.
- `POST /api/analyze`, `Authorization: Bearer <code privé>`, `Content-Type: audio/wav` → `{words, plan, duration}`.
- `POST /api/montage?pace=natural` (ou `dynamic`), même authentification et WAV → `{sourceDuration, cuts, words, plan, duration}`. Les `cuts` utilisent les temps du montage envoyé ; `words` et `plan` utilisent les temps après les coupes. Le navigateur valide à nouveau le résultat avant de l’appliquer.
- Projet indépendant en JSON v1 (`project.mjs`) ; renderer partagé entre aperçu et export (`render.mjs`).

## Limites et vérification

- Le mode complet analyse les reprises et répétitions avec l’IA. Les erreurs de transcription peuvent affecter les décisions : relire et écouter le résultat. Il préserve l’ordre du discours, ne réécrit pas la voix et refuse un plan qui supprime plus de 65 % des mots ou dont les coupes chevauchent des mots conservés. Le bouton « Retirer uniquement les pauses » reste une analyse locale de l’énergie audio, sans analyse du sens.
- Une musique continue, du bruit ou une voix très faible peuvent limiter la détection des pauses. L’analyse s’appuie sur l’audio ; elle ne juge pas la qualité de la prise à partir des images et les zooms sont centrés.
- Analyse IA : montage de 10 minutes maximum ; sources de moins de 350 Mo et de 30 minutes. Décodage en mémoire.
- Le motion design généré utilise les modèles de schémas fournis ; ce n’est pas encore une génération libre de n’importe quelle animation.
- Export en temps réel, qualité et codecs dépendants du navigateur. Laisser l’onglet actif ; le rendu navigateur n’a pas la précision image par image d’un moteur de rendu serveur.
- Les projets JSON n’incluent pas les vidéos ; conserver les originaux.
- Les tests automatisés simulent les appels OpenAI. Un test réel de 9 secondes en français a aussi validé la transcription horodatée et la création d’un schéma en trois étapes à partir de la voix (5 octobre 2026, audio synthétique).
- Le 6 octobre 2026, un test réel du parcours complet dans le navigateur a retiré une reprise et une pause, conservé l’introduction, composé un schéma en trois étapes et déclenché l’export avec son : 12,97 secondes en entrée, 9,49 secondes dans le montage (voix synthétique de démonstration). Les 39 tests automatisés passent.

```sh
npm test
```

Tests : pauses et marges, cuts et suppression, reprises, recalage des mots et schémas après montage, montage à plusieurs sources, conservation du projet en cas de plan invalide, fichiers de projet, WAV, authentification, origines autorisées, requêtes IA et rejet des plans invalides.

Documentation utilisée : [transcription et horodatages](https://developers.openai.com/api/docs/guides/speech-to-text), [sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs).
