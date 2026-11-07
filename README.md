# Les Îles Dérivantes

Jeu d'exploration et de cueillette en pixel art 2D (vue de dessus), jouable dans le navigateur.
HTML5 Canvas + JavaScript classique, sans framework ni dépendance. **État : étape 1 + crafting (solo).**

## Lancer le jeu

- **En local** : ouvre `index.html` dans Chrome, Firefox ou Edge (double-clic suffisant), ou lance un petit serveur : `python3 -m http.server 8000` puis http://localhost:8000.
- **Sur GitHub Pages** : pousse le dossier, puis *Settings → Pages → Deploy from a branch → `main` / `/ (root)`*. Aucune configuration serveur.

```bash
git init && git add . && git commit -m "Prototype étape 1"
git branch -M main
git remote add origin https://github.com/<toi>/<depot>.git
git push -u origin main
```

La police pixel (Pixelify Sans) est chargée depuis Google Fonts si le réseau le permet ; sinon une police monospace la remplace. Tout le reste est local.

## Commandes

| Action | Touches |
|---|---|
| Se déplacer | ZQSD, WASD ou flèches |
| Dash | Espace |
| Utiliser l'outil sélectionné | Clic gauche (vise à la souris) ou J (vise devant soi) |
| Interagir / cueillir / récolter / cuisiner | E (près d'un objet ; sans objet à côté, E ouvre l'inventaire) |
| Barre rapide | 1 à 8 ou molette |
| Inventaire | E |
| Artisanat à la main | C |
| Établi (devant lui) | E |
| Poser un objet (barre rapide) | Clic gauche (maintenu = rangée) |
| Retirer une construction | Clic droit |
| Ouvrir coffre / four, dormir | E |
| Manger (aliment en main) | Clic droit |
| Planter (graine en main, sur une parcelle) | Clic gauche |
| Grande carte (plein écran, glisser / ZQSD / molette ; Espace = me centrer) | M |
| Livre de recettes (en main) | Clic droit |
| Pause / retour | Échap |
| Masquer l'aide | H |

## Ce que contient l'étape 1

Île d'une centaine de tuiles de large générée à partir d'une graine (plages, étang, sous-bois, chemins, ponton, maison, portail ancien), eau animée, cycle jour/nuit, ~330 objets (arbres, rochers, minerais, cristaux, buissons, fleurs, champignons), hache et pioche, butin au sol, inventaire de 24 cases avec barre rapide, sauvegarde locale versionnée.

Tous les sprites sont **dessinés par le code** au démarrage (`src/rendering/sprites.js`), pixel par pixel, sans fichier image. C'est du pixel art procédural cohérent, pas des graphismes de studio : chaque fabrique est indépendante et pourra être remplacée par une vraie spritesheet sans toucher au reste.

## Crafting

- **À la main (C)** : planche (1 bois → 2), corde (3 fibres), torche (branche + fibre).
- **À l'établi** (à côté de la maison, E) : hache et pioche en cuivre, sac renforcé (+8 cases, une seule fois), puis **sac de voyageur** (+12 cases, exige le sac renforcé : 5 cordes, 4 planches, 12 fibres, 3 lingots de fer ; 24 → 32 → 44 cases).
- **Découverte** : une recette « à découvrir » s'affiche avec un indice et se débloque dès qu'on possède l'objet clé (minerai de cuivre, corde…). Les recettes débloquées sont sauvegardées.
- **Outils à paliers** : les outils en cuivre font 2 dégâts par coup et sont plus rapides ; les cristaux lunaires exigent la pioche en cuivre.
- **Torche** : tenue en main (barre rapide), elle éclaire autour du joueur, surtout la nuit.
- Fabriquer ne retire jamais d'ingrédients si le résultat ne tient pas dans le sac.
- Les recettes sont des données (`systems/crafting.js`) ; `craft(state, joueur, recette, station)` est une fonction pure qui renvoie des événements, donc validable plus tard côté hôte en coop.

## Construction

- Grille de 16 px. Un objet « posable » sélectionné dans la barre rapide affiche un **aperçu** vert (ok) ou rouge (trop loin, occupé, eau, quelqu'un dessus) ; clic gauche pose, clic droit retire et rend l'objet.
- **Établi** (10 planches + 2 pierres, à la main) : se pose où l'on veut. **À l'établi** : coffre (20 cases), four, lit, lampadaire. **À la main** : clôture (se raccorde toute seule), sol en bois, chemin de pierre.
- **Coffre** : clic sur un objet du sac pour le déposer, clic dans le coffre pour le reprendre. Un coffre ou un four non vide ne peut pas être retiré.
- **Four** : 2 minerais de cuivre + combustible (bois, branche, planche) → 1 lingot en 6 s. Il chauffe même quand l'écran est fermé et que le joueur est loin ; le combustible ne brûle que pendant la fonte. Les outils en cuivre demandent maintenant des lingots.
- **Lit** : la nuit seulement (dès 19 h), saute au matin 6 h. **Lampadaire** : éclaire la nuit.
- Les constructions sont des objets du monde ajoutés dynamiquement et sauvegardés en différences (contenu des coffres et des fours compris). `building.place/remove` sont des fonctions pures du type « état + joueur → événements », donc validables par l'hôte en coop.

## Décor et couleurs

- **22 objets de décor** posables (même système que la construction) : table, chaise, banc, bibliothèque, pot de fleurs, bannière, statue, brasero (éclaire la nuit), enseigne, botte de foin, boîte aux lettres, colonne, murs en bois et en pierre (solides), tapis et carrelage (sols praticables), caisse, tonneau, rocher, buisson, jeune pin, cerisier. La plupart se fabriquent à l'établi ; tapis, carrelage, pot et pinceau à la main.
- **Teinture façon armure en cuir** : 16 couleurs (arc-en-ciel + blanc, gris clair, gris, noir). Le recoloriage se fait au dessin (`rendering/tint.js`). **La couleur vient des matériaux** (voir « Matériaux et couleurs » plus bas) : il n'y a plus de touches R / F ni de pinceau.
- Le recoloriage se fait au dessin (`rendering/tint.js`) : la luminosité de chaque pixel est gardée, seule la teinte change, et le résultat est mis en cache. **Aucun sprite en plus** : un seul dessin sert pour les 16 couleurs. Cela marche aussi sur les arbres, rochers et tout objet naturel (`o.c`) : c'est la base prévue pour les **mondes spéciaux** du portail (même objets, autres palettes).
- Les objets de décor sont des données dans `content/decor.js` (nom, recette, collision, sprite dessiné en texte). Ajouter un objet = ajouter une entrée.
- Retirer un objet coloré rend l'objet de la même couleur.

## Matériaux et couleurs

- **Chaque matériau a une couleur** naturelle (bois marron, pierre grise, cuivre orange, fer gris acier, argent argenté, or jaune doré, charbon noir…), écrite dans sa description, et existe en **16 couleurs** : `wood~yellow` = « Bois (jaune) ». Même chose pour toutes les constructions : `table~blue` = « Table (bleu) ». Ce sont des objets d'inventaire normaux (sac, coffre, four, sauvegarde et coop les gèrent sans rien changer). Leurs icônes sont recolorées à la demande : aucun dessin en plus. Code : `content/materials.js` (`I.mat.id`, `I.mat.split`).
- **La couleur d'un objet = celle de ses matériaux.** Table jaune = planches jaunes ; chaise bleue = planches bleues + fibre bleue. Les matériaux d'une même recette doivent tous avoir la même couleur (pas de mélange). Planches jaunes ← bois jaune. Les torches et les outils restent naturels.
- **Artisanat / établi** : écran en deux volets. À gauche, des **onglets** (Tout, Outils, Construction, Décoration, Matériaux, Spécial) et une grille de cartes en pages de 12 (pastille verte = fabricable, étiquette « établi » = pas ici, carte « ? » = recette à découvrir). À droite, la **fiche** de la recette choisie : icône, description, caractéristiques, ingrédients « possédé / nécessaire » (✔ vert, rouge s'il en manque), **quantité** (− / +, limitée par ton sac) et bouton **Fabriquer**. Sous la grille, « Matériaux » propose Naturel + les couleurs que tu possèdes ; les recettes affichent alors leur version colorée. La commande réseau `craft` porte la couleur `c` (validée par l'hôte).
- **D'où viennent les matériaux colorés ?** Un objet naturel coloré (`o.c`) donne des matériaux de sa couleur. L'île de départ n'a plus d'arbres ni de plantes de couleur (les 16 bosquets ont été retirés ; ils reviennent avec `new World(seed, { groves: true })`). Pour les futures dimensions : `new World(seed, { tint: c })` colore tout le monde d'une seule couleur (arbres, rochers, plantes, minerais) et tout le butin suit.
- **Minerais** : fer (pioche en cuivre), argent (pioche en cuivre), or (pioche en fer, rare), plus le cuivre et le charbon. Chaque minerai a son rocher, son objet, son lingot et son icône. Le four fond tout : cuivre/fer/argent 2 → 1, or 3 → 1 ; un minerai coloré donne un lingot de la même couleur. Le combustible coloré marche aussi.
- **Nouveaux objets** : hache et pioche en fer, mur en fer, chandelier d'or (éclaire), miroir d'argent.
- Un bug de collision a été corrigé au passage : le joueur pouvait être poussé dans un second obstacle quand deux objets étaient très proches.

## Architecture

```
index.html, styles.css
src/
  config.js            constantes
  main.js              assemblage, entrées → intentions, boucle
  engine/              rng, loop (pas fixe 60 Hz), input, camera, collision, game (état + step + snapshot)
  world/               tiles, resources (types d'objets), map (génération), world (état modifié, collisions)
  entities/player.js   joueur (état sérialisable + update)
  systems/             items, inventory, harvest (outils, cueillette, butin), crafting (recettes), time
  rendering/           sprites, renderer, effects (particules, papillons, lucioles)
  ui/                  hud, inventory-ui, crafting-ui, menu
  persistence/         save-manager (localStorage, versionné, copie de secours)
tools/                 smoke.js, test.js, test-crafting.js (tests Chromium)
```

Principes tenus pour le futur multijoueur : `engine/game.js` ne touche ni au DOM ni au canvas ; chaque joueur a un identifiant stable et ses propres données (inventaire, position) séparées de celles du monde ; le clavier est traduit en « intentions » (`{mx, my, dash, use, aim, interact, hotbar}`) que la simulation consomme ; la simulation tourne à pas fixe ; l'état est entièrement sérialisable (`snapshot()` / `loadSnapshot()`).

## Sauvegardes

`localStorage`, clé `iles-derivantes:save`, JSON versionné (`version` + table de migrations dans `save-manager.js`). Écriture sécurisée : l'ancienne sauvegarde devient une copie `:bak` avant d'être remplacée, une écriture qui échoue (quota, navigation privée) est signalée au joueur sans détruire l'ancienne, et une sauvegarde illisible bascule sur la copie. Sauvegarde automatique toutes les 45 s, à la fermeture de l'onglet, via la maison (E) et le menu pause. Une sauvegarde locale est propre à un navigateur sur un appareil : ni partagée entre appareils, ni entre joueurs.

## Coop (2 à 4 joueurs) : code court

Fonctionne depuis GitHub Pages (HTTPS) sans serveur à toi : **WebRTC pair à pair**, mis en relation par un **code de 5 caractères** (ex. `K7P2M`).

1. **Hôte** : lance sa partie, *Échap* → **Coop : inviter un joueur** → le code s'affiche tout seul (bouton *Copier le code*). Le code reste valable tant que la partie est ouverte ; même code pour tous les invités.
2. **Invité** : écran titre → **Rejoindre une partie (coop)** → tape le code (majuscules, minuscules, espaces : peu importe) → *Rejoindre*. Il arrive dans la partie de l'hôte.

- La mise en relation passe par le service gratuit **PeerJS** (`0.peerjs.com`) : il ne sert qu'à présenter les deux navigateurs, ensuite tout est direct. Bibliothèque copiée dans `src/vendor/peerjs.min.js` (MIT, licence à côté). Pour un autre serveur : `Iles.Net.peerOptions = { host, port, path, secure }` avant d'ouvrir l'écran de coop.
- **Secours sans internet / si le service est en panne** : *Connexion manuelle (longs codes)* dans le même écran (ancien système, même wifi).
- Partie pleine à 4 joueurs ; un code inconnu, un hôte absent ou un réseau bloqué donnent un message clair.
- L'hôte fait tourner la simulation pour tout le monde (elle ne se met **jamais** en pause pour lui) ; l'invité envoie ses touches et ses actions, et reçoit joueurs, objets au sol, constructions et événements (20 fois par seconde).
- Chaque joueur a son inventaire. Fabrication, coffres, four, pose d'objets : tout est exécuté et vérifié par l'hôte (`systems/commands.js`, `net/net.js`). Recettes découvertes et monde sont partagés.
- Un invité qui se reconnecte (même navigateur) retrouve son personnage et son inventaire ; les invités absents sont enregistrés dans la sauvegarde de l'hôte. L'invité ne sauvegarde rien chez lui.
- Autres joueurs : petite pastille de couleur au-dessus de la tête.

Limites : le code court dépend du service PeerJS public (non garanti, parfois lent) ; l’onglet de l’hôte doit rester **visible** (un onglet en arrière-plan ralentit la partie) ; si la connexion reste bloquée, vérifier que les deux appareils sont sur le même wifi sans « isolation des clients » ; dormir dans un lit fait passer la nuit pour tout le monde ; pas de chat ni de noms ; la position de l'invité est lissée mais pas prédite (léger retard visible sur un wifi chargé).

## Tests

```bash
npm i playwright   # + un Chromium
node tools/test.js           # menus, clavier, collisions, récolte à la souris, sauvegarde/rechargement, erreurs de stockage, tailles d'écran
node tools/test-decor.js     # 25 objets de décor, 16 couleurs, pose d'objets colorés, sauvegarde, souris réelle
node tools/test-materials.js # matériaux colorés, minerais, fonte, craft par couleur, bosquets, monde teinté (41 vérifications)
node tools/test-coop-code.js # coop par code court : 5 navigateurs, code faux, partie pleine, départ/retour (demande un PeerServer local, voir l'en-tête du fichier)
node tools/test-coop.js      # coop manuelle : 2 navigateurs, échange réel des codes, déplacements, inventaire, artisanat, coffre, reconnexion
node tools/test-build.js     # pose/retrait, collisions, coffre, four, lit, sauvegarde des constructions, souris réelle, robustesse (3 000 actions aléatoires)
node tools/test-interactive.js # mini-map, avatars, exploration partagée
node tools/test-house.js     # maison libre : murs, portes, fenêtres, toits, coop
node tools/test-food.js      # cultures, viandes, vie/faim, touches E/X, coop
node tools/test-cooking.js   # cuisine, plats, couleurs, livre de recettes, coop
node tools/test-powers.js   # pouvoirs des pierres : brûlure, gel, poison + nuage, éclairs, pierres doubles (13 vérifications)
node tools/test-enchant.js  # enchantements : pierres, tables, arme enchantée, désenchantement, butin, interface animée (26 vérifications)
node tools/test-armor.js    # armures : données, protection, équipement, dégâts, fabrication, sauvegarde, sprites, interface (20 vérifications)
node tools/test-touch.js    # commandes tactiles : joystick, boutons E / action / dash, mini-carte masquée (13 vérifications)
node tools/test-mobs.js     # monstres : espèces, dessin, apparition, 6 attaques, éléments, évanouissement, combat, réseau (53 vérifications)
node tools/test-music.js     # musique : scènes, fondus, enchaînement, Combat.mp3 facultatif, volume (demande les mp3 dans audio/musique/)
node tools/test-weather.js   # météo, pluie/pousse, option Shaders, rendu WebGL réel (lumières, pluie, brume)
node tools/test-crafting.js  # fabrication, déblocage, paliers d'outils, établi, sac renforcé, torche, anciennes sauvegardes
```

## Limites connues

Pas encore d'effets sonores. Pas de tactile (l'architecture d'intentions le permettra). Commandes non reconfigurables. Pas encore de cultures, cuisine, combats ni créatures. Les constructions ne se déplacent pas (retirer puis reposer). Pas de rotation d'objets. Les cristaux lunaires n'ont pas encore d'usage de fabrication. La graine du monde est fixe.

## Nature (34 types)

Arbres (bouleau, érable, cyprès, acacia, palmier, arbre mort, champignon géant, bambou…), rochers (grès, ardoise, rose, charbon, argile, galets, tronc tombé…) et plantes (fougères, roseaux, cactus, tournesols, citrouilles, blé, champignons, buissons…).
- Définitions + règles d'apparition : `src/content/nature.js` (liste `N`, une ligne par type : `gen` = terrain, probabilité, zone de bruit). Sprites : `src/rendering/sprites.js` (`NATURE_SPRITES`).
- 14 nouveaux objets d'inventaire (charbon, bambou, citrouille, blé…). Le charbon est un bon combustible pour le four.
- Les identifiants des objets d'origine ne changent pas : les anciennes sauvegardes restent valides (`tools/baseline-ids.json`).
- Chaque objet de nature peut être teinté (16 couleurs) comme le reste, utile pour les futures dimensions.
- Test : `node tools/test-nature.js` (12 vérifications).

## Lobby spatial

Le portail de l'île (E) mène au **lobby** : une immense plateforme de quartz blanc dans l'espace (ciel de nébuleuses, galaxies, étoiles, aurores animées), avec le **portail ultime** au centre et un **bouton rouge** devant. Un point de retour (cercle sous la plateforme) ramène sur l'île.

- Le lobby est un second `World` (`new World(seed, {lobby:true})`, généré par `I.generateLobby` dans `src/content/lobby.js`) : collisions, objets et rendu sont ceux du jeu. `state.dim` vaut `'home'` ou `'lobby'` ; `Game.travel(to)` déplace tous les joueurs (fondu blanc 0,7 s). L'île reste intacte et est toujours celle qui est sauvegardée.
- Ciel : `src/rendering/sky.js`. Effets (étincelles, anneaux lumineux, tourbillon et faisceau du portail) : `Renderer.drawLobbyFx`.
- Bouton rouge : `src/systems/dimension.js`. L'appui tire une graine et une teinte (1 à 16), éveille le portail 6 s, puis annonce une dimension **provisoire** (`dimReady`). Ensuite le voyage vers la dimension est automatique (voir « Dimensions infinies »).
- Coop : l'hôte décide ; invités suivent (`d` et `a` dans les messages d'état).
- Test : `node tools/test-lobby.js` (25 vérifications) ; la section lobby de `tools/test-coop.js` vérifie le voyage à deux.

## Dimensions infinies

Le bouton rouge du lobby éveille le portail 6 s puis envoie **tous les joueurs** dans une dimension générée depuis une graine aléatoire. Le portail de la dimension (le portail ultime, teinté) ramène au lobby ; le portail ultime du lobby rouvre la **dernière dimension** visitée.

- **Identité** (`I.dimgen.describe(seed)`, `src/world/dimgen.js`) : 1 type de monde (+ 45 % d'un second, mélangé par grandes zones), 1 à 3 couleurs harmonieuses tirées des 16 de `I.COLORS`, un nom. 10 types dans la table `ARCH` (rocheux, forestier, aquatique, montagneux, de plaines, cristallin, souterrain, fantastique, désertique, marécageux) : un nouveau type = une ligne.
- **Terrain** : `I.dimgen.tile(D, x, y)` est une fonction pure de (graine, x, y) : élévation, eau profonde / peu profonde, rivières, crêtes et falaises (`WALL`, avec passes), cavernes, sable / dunes, sol lumineux, pierre, sous-bois, terre. Rien n'est stocké : le monde est infini et identique à chaque visite.
- **Morceaux** (`I.ChunkWorld`, sous-classe de `World`) : morceaux de 32×32 cases générés autour des joueurs (5×5), déchargés au-delà de 7×7. Objets à identifiants stables (`x,y`) : les modifications (`state`), constructions et objets au sol restent en mémoire et sont **sauvegardés** (12 dimensions récentes au plus, seulement les modifications).
- **Couleurs** : chaque zone du monde a une couleur de la palette ; sol, eau, murs et objets (arbres, rochers, minerais, cristaux, plantes) sont teintés selon leur rôle (`ROLE`) ; les matériaux récoltés ont la couleur de leur objet (`bois~violet`…).
- **Mobile / tactile** (`src/ui/touch.js`) : sur un écran tactile (ou avec `?touch=1` dans l'adresse), joystick à gauche, boutons à droite : **E** (action : interagir, ramasser, ouvrir ; sans cible : sac), **⚔** (maintenu : utiliser l'outil / frapper), **»** (dash), **R F V** (capacités) ; en haut à droite : artisanat, carte, pause. La mini-carte et l'aide clavier sont masquées. Les boutons fabriquent de fausses touches (ZQSD, E, J, Espace…), les règles du jeu ne changent pas. Taper sur la scène vise / utilise à cet endroit ; la barre rapide se touche. Test : `node tools/test-touch.js`.
- **Eau en dégradé** : la couleur de l'eau change d'une zone à l'autre, mais sans marche d'escalier : `Renderer.waterField` prend la couleur d'eau de chaque case visible, la floute (3×3 deux fois) puis l'agrandit en lissant ; le résultat est multiplié sur l'eau rendue en gris.
- **Ombres** : le canal vert de la carte d'obstacles marque les pixels des objets hauts (silhouette des arbres, rochers, joueurs) ; le shader n'y projette plus l'ombre du soleil ni des lampes (plus de losanges sombres sur les feuillages).
- **Nage** : l'eau profonde fait nager (`p.sw` de 0 à 1, transition douce, vitesse ×0,6, pas de dash ni d'outil ni de construction), l'eau peu profonde ralentit un peu. Valable sur l'île et dans toutes les dimensions, pas dans le vide du lobby. Vue de dessus : « monter / descendre » = haut / bas de l'écran.
- **Coop** : même graine chez l'invité, qui génère lui-même ses morceaux ; l'hôte garde l'autorité.
- Test : `node tools/test-dimensions.js` (34 vérifications).

## Minerais des dimensions

`src/content/ores.js` : une ligne par minerai, tout le reste est déduit (objet du monde, minerai, lingot, hache, pioche, recettes, fonte, icônes, sprites, génération).

- **5 nouveaux métaux** : cobalt (bleu), mithril (turquoise), orichalque (rose cuivré), adamantite (vert sombre), titane (gris violet). Il faut une pioche en fer pour les extraire. Ils existent dans les 16 couleurs comme les autres matériaux (minerai rouge → lingot rouge).
- **Obscurium** : toujours noir, jamais dans le monde ni récoltable. Il se fabrique **à l'établi** (2 cobalt + 2 mithril + 2 adamantite, de n'importe quelles couleurs), puis se fond au four (3 minerais → 1 lingot).
- **Usage pour l'instant** : une pioche et une hache par métal (plus puissantes que le fer). Les recettes sont secrètes (`hidden`) jusqu'à la première trouvaille ; elles acceptent les lingots de n'importe quelle couleur (`any`).
- **Génération** (`world/dimgen.js`) : chaque dimension tire 2 ou 3 minerais parmi les 10 (cuivre, charbon, fer, argent, or + les 5 nouveaux), jamais tous. Ils sont rares (moins de 1 % du terrain en moyenne) et groupés en veines, plus fréquents sur la pierre et au pied des falaises, et prennent la couleur de la zone.
- Test : `node tools/test-ores.js` (15 vérifications).

## Vision et feuille de route

Ordre prévu : **construction** (fait) → **coop locale** (fait) → **décor et couleurs** (fait, d'autres objets suivront) → **mondes infinis et armes procédurales**.

- **Portail** : ce n'est pas un donjon, c'est une porte vers des **mondes générés aléatoirement à l'infini**, avec à chaque fois d'autres palettes de couleurs, d'autres objets et une autre génération.
- **Armes procédurales** : on les assemble à une **enclume** avec un **manche** (fabriqué ou trouvé), un **métal ou matériau**, et des **artefacts** trouvés dans ces mondes qui donnent des capacités (enflammer les ennemis, grands dashs avec l'arme…).
- **Ce que l'architecture prépare déjà** : un monde se décrit par une graine + des paramètres (le monde de départ n'est que le cas particulier de la graine fixe) ; les objets et recettes sont des données ; une arme sera une donnée `{ manche, matériau, artefacts[] }` sans code propre à chaque arme. Rien de cela n'est implémenté.

## Table du Forgeron

Un objet posable (recette à l'établi : 10 planches, 8 pierres, 2 cordes ; colorable comme les autres constructions). `E` devant elle ouvre l'écran :

1. **Choisis le modèle** : épée, dague, lance, hache ou masse (5 armes connues, `MODELS` dans `content/forge-data.js`).
2. **Place un matériau dans chacun des 3 emplacements** (alignés `[1] → [2] → [3]`, du bas de l'arme vers le bout). Chaque emplacement est une partie du modèle (ex. épée : poignée / garde et base de lame / lame et pointe). L'aperçu se met à jour en direct : silhouette fantôme tant qu'un emplacement est vide, puis l'arme avec la **couleur** et la **texture** de chaque matériau (veines du bois, grain de la pierre, métal brossé, éclats du minerai, facettes du cristal…).
3. **Fabriquer** : l'arme arrive dans le sac, les matériaux sont consommés à ce moment seulement.

- **Matériaux** : seuls ceux listés dans `MAT` fonctionnent : bois, bâtons, planches, bambou, cordes, pierre, cristal, lingots, minerais (toutes couleurs). Plantes, fleurs, nourriture, charbon, outils… sont refusés (« Cet objet ne peut pas être utilisé pour fabriquer une arme. ») et ne sont jamais touchés. Les familles refusées sont des interrupteurs (`CATEGORIES`).
- **Parties** : certaines matières ne conviennent qu'à certaines parties (`PARTS`) : un minerai brut ne fait pas une lame (il faut le fondre), une corde ne fait ni lame ni tête, un cristal ne se tient pas en main.
- **Statistiques** : dégâts, durabilité, poids, vitesse d'attaque, rareté, calculés par pièce (surface de chaque partie × poids de sa station) : un matériau pèse comme sa part de l'arme, et l'ordre compte. Propriétés spéciales (mithril léger, adamantite solide, orichalque tranchant…) proportionnelles à cette part. Matériau physique et couleur sont indépendants.
- **Identité** : l'objet d'inventaire s'appelle `wp:<modèle>:<matériaux dans l'ordre>` (ex. `wp:spear:stick,stick,iron_bar~blue`) : sac, coffre, sauvegarde, coop et sol la gèrent sans stockage en plus. Les armes de la première version (`wp:a,b,c`) sont rattachées au premier modèle qui les accepte.
- **Fabrication** : validée par `commands.js` (distance, modèle, parties, matériaux possédés, place dans le sac) ; rien n'est retiré si quelque chose échoue.
- **Dessin** : chaque modèle a sa silhouette propre (épée longue à garde en croix, dague courte en feuille, lance verticale à tête en losange, hache à grosse tête arrondie, masse à boule hérissée) tracée sur une grille 14×14 (`forge-geometry.js`) ; chaque famille de matériau a sa texture contrastée (veines du bois, joints de planche, nœuds du bâton, torsade de corde, grain de pierre, éclats de minerai, bandes et rivets du métal, facettes du cristal). Les anciennes armes sans modèle (`wp:a,b,c`) ne sont plus reconnues : créer un nouveau monde.
- **Ajouter** un matériau : une ligne dans `MAT` ; un modèle d'arme : `MODELS` + un gabarit du même nom dans `systems/forge-geometry.js` ; une texture : `texture()` dans `rendering/forge-art.js`.
- Test : `node tools/test-forge.js`.

## Créatures passives (dimensions)
- Chaque dimension a **4 à 6 espèces** générées depuis sa graine (`content/creature-gen.js`) : plan de corps (quadrupède, bipède, blob, serpent, insecte), taille (4 classes), tête, oreilles, cornes, queue, motif, extras (piques, coque, crinière), yeux, **couleurs prises dans la palette de la dimension**, vitesse, craintive ou non, habitat (herbe, sable, pierre ou partout), taille de troupeau, nom.
- Dessin 100 % procédural (`rendering/creature-art.js`) : grille de pixels, ombrage, contour, 3 images de marche, version gauche retournée, 4 variantes d'individu par espèce.
- **Troupeaux** (`systems/creatures.js`) : déterministes par morceau de 32×32 cases (≈ 1 troupeau sur 3 morceaux), 2 à 11 individus d'une seule espèce selon sa taille, jamais près du portail d'arrivée. Ils errent autour d'un centre qui dérive lentement, restent sur la terre ferme, évitent les objets ; les espèces craintives s'enfuient quand le joueur s'approche. Aucun combat, aucun butin.
- Seul l'hôte (ou le solo) simule, seulement autour des joueurs ; les invités reçoivent les positions (~35 octets par créature proche). Rien n'est sauvegardé : un morceau rechargé refait les mêmes troupeaux. Ni l'île ni le lobby n'en ont.
- Ajouter un plan de corps : `PLANS` (creature-gen.js) + une fonction de dessin dans creature-art.js. Test : `node tools/test-creatures.js`.

## Combat (armes forgées)
- **Clic gauche** avec une arme forgée en main : combo de 3 coups (×1, ×1,1, **×1,7** : plus large, avec recul ; la masse étourdit). Vitesse, dégâts et couleur des effets viennent de l'arme (matériaux). Les outils (hache, pioche) ne combattent pas.
- **3 capacités par modèle, touches R, F, V** (recharge propre, barre au-dessus de la barre rapide) :
  - Épée : Taillade tournoyante (2 balayages à 360°) · Estoc éclair (élan transperçant) · Onde de lame (croissant qui traverse).
  - Dague : Pas d'ombre (bond + prochain coup critique garanti) · Pluie de lames (5 dagues en éventail) · Frénésie (5 s : attaques ×2, déplacement ×1,25, critiques fréquents).
  - Lance : Fente (long estoc) · Javelot (traverse 3 créatures) · Forêt de piques (6 pointes en ligne qui étourdissent).
  - Hache : Fendoir (coup lent dévastateur) · Cri de guerre (onde qui repousse + 5 s de +30 % de dégâts) · Tourbillon sanglant (1,6 s de rotation en avançant).
  - Masse : Séisme (impact qui étourdit) · Charge (élan qui projette) · Onde de choc (3 ondes de plus en plus larges).
- Dégâts d'un coup = 3 + dégâts de l'arme × 1,6, × le multiplicateur du coup ou de la capacité ; 12 % de critiques (×1,8).
- Créatures : 14 à 80 PV selon la taille, barre de vie quand elles sont blessées, éclair blanc, chiffres de dégâts, recul, étourdissement, panique ; à 0 PV elles laissent de la **viande crue** (inutilisable pour l'instant). Elles n'attaquent jamais.
- Effets : arcs de coup, anneaux, projectiles, pointes, fissures, tremblement d'écran, particules de la couleur de l'arme. En coop, l'hôte calcule tout, les invités envoient leurs touches (R/F/V) et reçoivent les effets par événements.
- Ajouter une capacité : une ligne dans `content/combat-data.js` + une fonction dans `systems/combat.js` (`ABILITY[modèle][indice]`). Test : `node tools/test-combat.js`.
- Pas encore : durabilité des armes (la statistique existe mais n'est pas consommée), ennemis qui attaquent, vie du joueur.

## Interactive & Food Update

- **Mini-map (M)** : monde réel, zones explorées (partagées en coop), autres joueurs avec leur avatar. **Avatar** : créateur dans les options, sauvegardé par joueur et vu par tous.
- **Maison libre** : murs (bois, pierre, fer) dans toutes les directions, portes, fenêtres, toit qui couvre la pièce fermée ; murs de devant transparents à l'intérieur ; démolition sans toit flottant. Test : `node tools/test-house.js`.
- **Agriculture** : « Parcelle labourée » (2 bâtons + 2 fibres, à la main) ; graine en main + clic gauche = planter ; 4 stades ; `E` pour récolter. 11 plantes (carotte, chou, tomate, fraise, raisin, melon, blé, citrouille, sauge, tournesol, lavande) ; graines en cueillant les plantes sauvages. Code : `content/food.js`, `systems/farming.js`.
- **Viandes** : une par plan de corps (gigot, cuisse, chair gélatineuse, filet de serpent, chair d'insecte) + butin (os, gelée, écaille, carapace, cristal lunaire parfois). Chaque ingrédient a des propriétés (soin, faim, régénération, vitesse).
- **Vie et faim** : barres dans le HUD ; la faim baisse, la vie remonte si on est nourri ; la famine fait baisser la vie jusqu'à 10 (jamais mortel). Clic droit sur un aliment pour manger. Code : `systems/vitals.js`. Test : `node tools/test-food.js`.
- **Cuisine** : table de cuisine (mortier, mixeur, poêle, marmite, table à pâte) et four (pain). Les plats sont des objets dont l'identifiant porte tout (`fd:…`, comme les armes) : nom, couleur (moyenne pondérée des couleurs des ingrédients), effets, parts. Tarte (4 parts), pain (cuit au four, mangé part par part), spaghetti (pâtes fraîches + jus dans la marmite), soupes, jus, poudres, grillades ; nom personnalisable. Recettes connues : Tarte au tournesol (+10 PV par part), Jus énergisant, Soupe forestière, Spaghetti lunaires, Pain de cristal. Écran de cuisine « Table de cuisine alchimique » (4 stations illustrées, comptoir 2×10, table à pâte, résultat, livre de recettes en page parchemin, fiche d’ingrédient au survol). Code : `systems/cooking.js`, `rendering/food-art.js`, `ui/cook-ui.js`.
- **Livre de recettes** (2 planches + 3 fibres) : tant qu'il est dans le sac, chaque préparation est notée (par joueur, sauvegardée). « Reproduire » refait un plat en un clic, y compris les étapes intermédiaires (farine, jus…), ou affiche ce qui manque. Test : `node tools/test-cooking.js`.
- **Shaders et météo** : réglage « Shaders » dans les options (Complets / Légers / Désactivés, sauvegardé). Le renderer dessine la scène 2D sans ambiance, puis `rendering/shader.js` (WebGL) la relit et calcule : soleil et lune avec **ombres portées** (lancer de rayons dans une carte de hauteurs des arbres, murs, toits, rochers, joueurs), **lumières dynamiques** colorées (torche, foyers, lampes, cristaux, portail, lucioles ; les 4 plus importantes font des ombres), **PBR approximé** (normales déduites des textures, rugosité / métal / eau déduits de la couleur et du type de tuile, spéculaire GGX simplifié, AO de contact, sol mouillé, flaques et rides), ombres de nuages, brume volumétrique, éclairs, bloom, étalonnage, vignette, aberration chromatique, grain. « Légers » : sans bloom, ombres des lumières ni AO. « Désactivés » (ou WebGL absent / planté) : rendu 2D d'origine, météo comprise. Météo : `systems/weather.js`, calculée **uniquement** à partir de l'heure du jeu (hôte et invités identiques, rien à synchroniser) : clair, nuageux, brume (le matin surtout), pluie et orage, **courts** (45 à 100 min de jeu) ; la pluie multiplie par 5 la vitesse de pousse des cultures (`growthMinutes`). Effets 2D : `rendering/weather-fx.js` (pluie, éclaboussures, éclairs, brume et ombres de nuages 2D, feuilles, grains de lumière, braises). Les tests lancent Chromium avec `--disable-3d-apis` (repli 2D, plus rapide en logiciel) sauf `test-weather.js` qui teste le vrai WebGL.

## Musique

Les mp3 vont dans `audio/musique/` (noms EXACTS, majuscules comprises : GitHub Pages les distingue). Le zip du jeu ne les contient pas : copie-les dans ce dossier.

| Fichier | Quand |
|---|---|
| `Intro_du_jeu.mp3` | écran titre |
| `Music_Jour_1.mp3`, `Music_Jour_2.mp3` | sur l'île (les deux s'enchaînent en fondu) |
| `Dimension_music_1.mp3`, `Dimension_music_2.mp3` | dans une dimension |
| `Portail.mp3` | lobby et éveil du portail |
| `Combat_Instrumental.mp3`, `Combat_Paroles.mp3`, `Combat.mp3` | **facultatifs** : pendant un combat (reste ~9 s après le dernier coup). Avec plusieurs, chaque combat joue la suivante (sans paroles, puis avec paroles…) |

- **Ajouter la musique de combat** : copie ton fichier dans `audio/musique/` et nomme-le `Combat_Instrumental.mp3` (sans paroles) et/ou `Combat_Paroles.mp3` (avec paroles) ; `Combat.mp3` marche aussi. Rien d'autre à modifier ; sur GitHub Pages, ajoute-le au dépôt (Add file > Upload files, dossier `audio/musique`). Sans ce fichier, le jeu ne change rien.
- Le son démarre au premier clic ou à la première touche (règle des navigateurs). Volume : Options > Volume de la musique.
- Code : `src/audio/music.js` (liste des pistes en haut du fichier).

## Monstres hostiles (dimensions)

Seulement dans les dimensions (l'île et le lobby restent sûrs). Chaque dimension a 4 à 6 espèces de monstres, générées depuis sa graine (rien à fournir : dessin, couleurs, nom, stats). Trois axes de variété :

- **7 plans de corps** : araignée, golem, spectre, bête, œil flottant, diablotin ailé, scorpion.
- **6 façons d'attaquer** : *stalker* (poursuit et mord), *charger* (charge en ligne droite puis souffle), *spitter* (crache de loin, garde ses distances), *brute* (frappe le sol en zone), *swarmer* (meute rapide, coups faibles), *bomber* (court vers toi et explose).
- **5 éléments** : aucun, venin (poison), flamme (brûlure), givre (ralentit), foudre (étourdit un instant). La couleur des yeux / noyau / fissures montre l'élément.

Chaque attaque est **annoncée** (un « ! » au-dessus du monstre et une zone rouge au sol qui se remplit) : tu as le temps de l'esquiver. Le **dash (Espace)** rend invulnérable. Après une charge, le charger souffle (c'est le moment de le frapper) ; contre un obstacle, il s'assomme.
Les **élites** (couronne dorée, halo) ont 2,4× la vie, frappent plus fort et donnent un butin garanti. Le **danger monte avec la distance** au point d'arrivée (5 paliers, +30 % de vie et de dégâts chacun) ; rien n'apparaît à moins de 230 px de l'arrivée.
À 0 de vie, tu t'évanouis et te réveilles au point d'arrivée avec 50 % de vie (3 s de protection, un peu de faim en moins) : on ne perd rien. Poison et brûlure ne tuent jamais. Butin : os, carapace, gelée, écaille, charbon, pierre, cristal selon le monstre.
Code : `src/content/mob-gen.js` (espèces), `src/rendering/mob-art.js` (dessin), `src/systems/mobs.js` (IA, attaques, apparition).

## Armures
- **44 pièces** : casque, plastron, jambières, bottes × 11 matériaux (fibre, cuivre, fer, argent, or, cobalt, mithril, orichalque, adamantite, titane, obscurium). Fabrication à l'établi (onglet **Armures**) : 3 / 6 / 4 / 3 lingots + 1 corde (fibre : corde et fibre). Cuivre et fer se découvrent comme les outils, fibre avec la corde ; argent, or et métaux des dimensions sont des recettes secrètes, révélées à la première trouvaille.
- **Protection** : ensemble complet de fibre 4, cuivre 4, fer 6, or 6, argent 7, … obscurium 14-15 (à peu près, les pièces arrondissent). Réduction des dégâts subis = total / (total + 15), plafonnée à 75 % (fer complet ≈ −29 %, obscurium ≈ −48 %), toujours 1 dégât minimum.
- **Équiper** : dans le sac, choisir la pièce puis « Équiper » (échange avec celle déjà portée) ; cliquer un emplacement d'armure la remet dans le sac (refusé si le sac est plein). La protection totale s'affiche au-dessus du sac.
- Les pièces sont **dessinées sur le personnage** (face, dos, profil), visibles par les autres joueurs en coop. Sauvegardées avec le joueur (anciennes sauvegardes acceptées).
- Code : `src/content/armor.js` (tout est déduit d'une table de matériaux), `src/rendering/armor-art.js` (icônes et sprites portés), commandes `equip` / `unequip` dans `systems/commands.js`, réduction dans `mobs.hurtPlayer`. Test : `node tools/test-armor.js`.

## Enchantements
- **6 pierres magiques** : foudre, givre, venin, flamme (simples, ~12 % de chance sur les **élites** de l'élément correspondant) et 2 doubles (flamme + givre, venin + foudre) qui existent comme objets mais **ne tombent encore nulle part** (réservées aux futurs boss de donjon).
- **Table d'enchantement** (établi : 12 planches, 8 lingots de fer, 4 d'or, 10 cristaux) : une arme forgée au centre, jusqu'à **2 pierres** au total sur l'arme. Résultat : arme « enchantée de flamme et foudre », **dégâts +12 % par pierre simple, +35 % par pierre double**, icône avec halo et contour aux couleurs des pierres. L'enchantement est dans l'identifiant de l'arme (`wp:sword:a,b,c@fl.sh`) : sac, coffre, sauvegarde et coop le gèrent sans rien de plus.
- **Table de désenchantement** (10 planches, 6 lingots de fer, 4 d'argent, 6 cristaux) : rend l'arme de base et ses pierres (refusé si le sac est plein).
- **Écran animé** : cercles de runes qui tournent, pierres qui volent vers l'arme, colonne de lumière, flash et onde de choc ; couleurs = celles des pierres (violet par défaut). La commande part au moment du flash : rien n'est consommé avant. La table brille ensuite dans la couleur des pierres (~20 s), pour tous les joueurs.
- **Pouvoirs des pierres** : voir la section suivante.
- Code : `content/enchant-data.js`, `systems/enchant.js` (commandes `enchant` / `disenchant`), `ui/enchant-ui.js`, `rendering/enchant-art.js`, halo d'arme dans `forge-art.js`, lueur dans `renderer.tableGlow`. Test : `node tools/test-enchant.js`.

## Pouvoirs des pierres (nouvelles attaques)
Une arme enchantée déclenche les pouvoirs de ses pierres à **chaque coup porté** (combo, capacités R/F/V, projectiles). Niveau d'un élément : 1 par pierre simple, 1,6 par pierre double ; deux pierres du même élément s'additionnent (plus de dégâts, de durée, de portée).
- **Flamme** : brûlure (dégâts dans le temps) ; tous les 3 coups, **explosion ardente** qui blesse et enflamme les ennemis voisins.
- **Givre** : ralentit (vitesse ×0,62) ; tous les 4 coups, la cible est **gelée sur place** et un éclat de glace ralentit son entourage.
- **Venin** : poison cumulable (charges) ; un ennemi qui **meurt empoisonné** libère un **nuage toxique** (4 s) qui empoisonne ceux qui y entrent.
- **Foudre** : 35 % de chance par coup (+10 % par niveau) : **éclair en chaîne** vers 3 ennemis proches (rayon 82).
- **Choc thermique** (flamme + givre) : tous les 3 coups, **explosion de vapeur** qui étourdit, brûle et ralentit.
- **Tempête toxique** (venin + foudre) : les éclairs empoisonnent ; tous les 5 coups, **la foudre s'abat du ciel** (gros dégâts de zone, étourdissement, poison).
- Calculé par l'hôte (comme les capacités) ; les invités voient les effets par événements `cfx` (`ebolt`, `eboom`, `esteam`, `eice`, `esky`, `cloud`, `estat`). États sur la cible : `cr.sx` (non sauvegardé). Code : `systems/powers.js`, crochet dans `combat.strike`, vitesse dans `mobs.js` / `creatures.js`, dessin dans `renderer.drawCombatFx` et `effects.js`. Test : `node tools/test-powers.js`.
- Limites : aucun boss ni donjon ne les utilise encore ; les pouvoirs agissent sur les animaux et les monstres, pas (encore) sur les autres joueurs.
