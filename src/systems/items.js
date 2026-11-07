/*
 * Définitions des objets d'inventaire. L'ordre sert aussi au tri du sac.
 * Outils : tool = type d'outil, power = dégâts par coup, tier = palier (une ressource peut exiger un palier),
 *          dur = durée d'un coup en secondes. light = éclaire quand il est tenu en main.
 */
(function (I) {
  I.ITEMS = {
    axe: { name: 'Hache', desc: 'Pour abattre les arbres. Équipe-la dans la barre rapide, puis clic gauche.', stack: 1, tool: 'axe', power: 1, tier: 0, dur: 0.34 },
    pickaxe: { name: 'Pioche', desc: 'Pour briser rochers et minerais. Clic gauche.', stack: 1, tool: 'pickaxe', power: 1, tier: 0, dur: 0.34 },
    axe_copper: { name: 'Hache en cuivre', desc: 'Deux fois plus efficace, et plus rapide à manier.', stack: 1, tool: 'axe', power: 2, tier: 1, dur: 0.28 },
    pickaxe_copper: { name: 'Pioche en cuivre', desc: 'Casse deux fois plus vite, et attaque même les cristaux lunaires.', stack: 1, tool: 'pickaxe', power: 2, tier: 1, dur: 0.28 },
    chest: { name: 'Coffre', desc: 'Range tes affaires (20 cases). Pose-le puis ouvre-le avec X.', stack: 10, place: 'chest' },
    furnace: { name: 'Four', desc: 'Fond les minerais en lingots. Il lui faut du combustible (bois, branches, planches, charbon).', stack: 10, place: 'furnace' },
    workbench: { name: 'Établi', desc: 'Un établi de plus, où tu veux.', stack: 10, place: 'workbench' },
    bed: { name: 'Lit', desc: 'Dors la nuit (dès 19 h) pour passer directement au matin.', stack: 10, place: 'bed' },
    lamp: { name: 'Lampadaire', desc: 'Éclaire la nuit autour de lui.', stack: 20, place: 'lamp' },
    fence: { name: 'Clôture', desc: 'Se raccorde aux clôtures voisines. Bloque le passage.', stack: 99, place: 'fence' },
    floor_wood: { name: 'Plancher', desc: 'Un sol en bois, praticable.', stack: 99, place: 'floor_wood' },
    path_stone: { name: 'Pavés', desc: 'Un chemin de pierre, praticable.', stack: 99, place: 'path_stone' },
    torch: { name: 'Torche', desc: 'Tenue en main (barre rapide), elle éclaire autour de toi.', stack: 20, light: true },
    wood: { name: 'Bois', desc: 'Du bon bois solide, tiré d’un tronc.', stack: 99 },
    plank: { name: 'Planche', desc: 'Du bois scié, prêt à être assemblé.', stack: 99 },
    stick: { name: 'Branche', desc: 'Une branche tombée au sol.', stack: 99 },
    stone: { name: 'Pierre', desc: 'Une pierre lourde et bien taillée par la nature.', stack: 99 },
    fiber: { name: 'Fibre végétale', desc: 'Des brins d’herbe longs et résistants.', stack: 99 },
    rope: { name: 'Corde', desc: 'Des fibres tressées, solides et souples.', stack: 99 },
    berries: { name: 'Baies sauvages', desc: 'Sucrées et juteuses.', stack: 99 },
    flower_red: { name: 'Coquelicot', desc: 'Une fleur rouge éclatante.', stack: 99 },
    flower_blue: { name: 'Bleuet', desc: 'Une petite fleur bleue.', stack: 99 },
    flower_yellow: { name: 'Pissenlit', desc: 'Une fleur jaune comme un petit soleil.', stack: 99 },
    mushroom: { name: 'Champignon des bois', desc: 'Trouvé à l’ombre des grands arbres.', stack: 99 },
    shell: { name: 'Coquillage', desc: 'Poli par les vagues de la plage.', stack: 99 },
    pinecone: { name: 'Pomme de pin', desc: 'Tombée d’un pin.', stack: 99 },
    petal: { name: 'Pétales de cerisier', desc: 'Doux et parfumés.', stack: 99 },
    axe_iron: { name: 'Hache en fer', desc: 'Trois fois plus efficace qu\u2019une hache de pierre.', stack: 1, tool: 'axe', power: 3, tier: 2, dur: 0.24 },
    pickaxe_iron: { name: 'Pioche en fer', desc: 'Brise tout, même le minerai d\u2019or.', stack: 1, tool: 'pickaxe', power: 3, tier: 2, dur: 0.24 },
    iron_ore: { name: 'Minerai de fer', desc: 'Une roche rouillée, riche en fer. Se fond au four.', stack: 99 },
    iron_bar: { name: 'Lingot de fer', desc: 'Du fer fondu, gris acier.', stack: 99 },
    silver_ore: { name: 'Minerai d\u2019argent', desc: 'Une roche pâle, veinée de blanc. Se fond au four.', stack: 99 },
    silver_bar: { name: 'Lingot d\u2019argent', desc: 'De l\u2019argent fondu, brillant comme un miroir.', stack: 99 },
    gold_ore: { name: 'Minerai d\u2019or', desc: 'Une roche semée de pépites jaunes. Il faut une pioche en fer. Se fond au four.', stack: 99 },
    gold_bar: { name: 'Lingot d\u2019or', desc: 'De l\u2019or fondu, lourd et doré.', stack: 99 },
    copper_bar: { name: 'Lingot de cuivre', desc: 'Du cuivre fondu, prêt à être forgé.', stack: 99 },
    copper_ore: { name: 'Minerai de cuivre', desc: 'Un caillou veiné d’orange.', stack: 99 },
    meat: { name: 'Viande crue', desc: 'Dépouille d’une créature des dimensions.', stack: 99 },
    crystal: { name: 'Cristal lunaire', desc: 'Il luit faiblement, même en plein jour.', stack: 99 },
  };
  I.ITEM_ORDER = Object.keys(I.ITEMS);
})((window.Iles = window.Iles || {}));
