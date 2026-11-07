/*
 * Données du combat. Chaque modèle d'arme a son attaque de base (clic gauche, combo de 3 coups : le 3e est plus large et plus fort)
 * et 3 capacités sur R, F, V (recharge propre). Les dégâts viennent des statistiques de l'arme forgée (matériaux), les couleurs
 * des effets de la couleur de sa partie principale. Le comportement de chaque capacité est dans systems/combat.js (même nom d'indice).
 * Ajouter une capacité : une ligne ici + un cas dans combat.js ABILITY[modèle][indice].
 */
(function (I) {
  I.COMBAT = {
    KEYS: ['R', 'F', 'V'], CODES: ['KeyR', 'KeyF', 'KeyV'],
    HIT_BASE: 3, HIT_SCALE: 1.6,               // dégât d'un coup = BASE + dégâts de l'arme × SCALE
    HP: [14, 26, 45, 80],                      // points de vie des créatures selon leur taille
    SWING: 0.36,                               // durée d'un coup de base (divisée par la vitesse de l'arme)
    MODEL: {                                   // reach : portée (px), arc : ouverture du coup (rad), kb : recul
      sword: { reach: 30, arc: 2.1, kb: 70 },
      dagger: { reach: 21, arc: 1.7, kb: 40 },
      spear: { reach: 48, arc: 0.7, kb: 95 },
      axe: { reach: 31, arc: 2.5, kb: 115 },
      mace: { reach: 28, arc: 1.9, kb: 120, stun: 0.55 },
    },
    AB: {
      sword: [
        { n: 'Taillade tournoyante', d: 'Deux balayages à 360° autour de toi.', cd: 4 },
        { n: 'Estoc éclair', d: 'Fonce droit devant et transperce tout sur ton passage.', cd: 6 },
        { n: 'Onde de lame', d: 'Lance un croissant d’énergie qui traverse les créatures.', cd: 11 },
      ],
      dagger: [
        { n: 'Pas d’ombre', d: 'Bond fulgurant ; ton prochain coup (3 s) est un critique garanti.', cd: 3.5 },
        { n: 'Pluie de lames', d: 'Lance 5 dagues en éventail.', cd: 5 },
        { n: 'Frénésie', d: '5 s : attaques 2 fois plus rapides, déplacement accéléré, critiques fréquents.', cd: 13 },
      ],
      spear: [
        { n: 'Fente', d: 'Un long coup d’estoc qui perce et repousse.', cd: 4.5 },
        { n: 'Javelot', d: 'Lance ta pique : elle traverse jusqu’à 3 créatures.', cd: 7 },
        { n: 'Forêt de piques', d: 'Des pointes jaillissent du sol en ligne et étourdissent.', cd: 12 },
      ],
      axe: [
        { n: 'Fendoir', d: 'Un coup de haut en bas, très lent et dévastateur.', cd: 6 },
        { n: 'Cri de guerre', d: 'Onde qui repousse et effraie ; 5 s : +30 % de dégâts.', cd: 10 },
        { n: 'Tourbillon sanglant', d: '1,6 s de rotation meurtrière tout en avançant.', cd: 15 },
      ],
      mace: [
        { n: 'Séisme', d: 'Frappe le sol : tout autour est étourdi.', cd: 6 },
        { n: 'Charge', d: 'Fonce et projette tout sur ton chemin.', cd: 7 },
        { n: 'Onde de choc', d: 'Trois ondes de plus en plus larges qui étourdissent.', cd: 14 },
      ],
    },
  };
  I.COMBAT.MODEL_KEYS = Object.keys(I.COMBAT.AB);
})((window.Iles = window.Iles || {}));
