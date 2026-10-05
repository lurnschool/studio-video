# Studio Vidéo

Éditeur vidéo web statique, conçu pour être publié sur GitHub Pages. Les fichiers restent dans le navigateur : aucune vidéo n’est envoyée à un serveur.

## Fonctions

- Import de plusieurs vidéos et création d’une timeline
- Découpe du début et de la fin de chaque clip, réorganisation et suppression
- Aperçu du montage avec son, texte et choix du format 16:9, 9:16 ou 1:1
- Export local de la vidéo avec le son d’origine, dans le format pris en charge par le navigateur (WebM ou MP4)

## Lancer localement

Depuis ce dossier : `python3 -m http.server 8000`, puis ouvrir `http://localhost:8000`.

## Publication GitHub Pages

Publier les fichiers de ce dossier à la racine d’un dépôt GitHub et activer **Settings → Pages → Deploy from a branch → main / (root)**. L’application fonctionne aussi depuis un sous-chemin GitHub Pages grâce aux chemins relatifs.

## Limites de cette première version

L’export est réalisé en temps réel : une vidéo de 2 minutes demande environ 2 minutes d’export. Les fichiers et le montage ne sont pas conservés après fermeture de l’onglet. La compatibilité des formats d’entrée et de sortie dépend du navigateur. L’import et l’export de projets, les pistes de musique et les transitions pourront être ajoutés ensuite.
