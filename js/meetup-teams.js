/*
 * Équipes déjà présentes dans UHC-Meetup (enum TeamList, branche main du dépôt UHC_Meetup).
 * id = nom exact de la constante, code = caractère de couleur après le § (bold = suivi de §l),
 * mdj = mode de jeu de l'équipe ("all" = utilisable dans tous les modes).
 * menus = modes d'UHC-Meetup dont le menu des rôles a une page pour cette équipe (TeamRoleInventory dans Inventories.java).
 * Un rôle de l'addon placé dans une autre équipe du mode (Jigoro...) ou dans une équipe de l'addon y reçoit une page ajoutée
 * par le .jar (MeetupPages.java).
 * Cette liste peut différer de la snapshot 17.
 */
const MEETUP_TEAMS = [
  { id: "Demon", name: "Démon", code: "c", mdj: "ds", menus: ["ds"] },
  { id: "Slayer", name: "Slayer", code: "a", mdj: "ds", menus: ["ds"] },
  { id: "Solo", name: "Solo", code: "e", mdj: "all", menus: ["ds", "aot", "ns"] },
  { id: "Jigoro", name: "Jigoro", code: "6", mdj: "ds", menus: [] },
  { id: "Mahr", name: "Mahr", code: "9", mdj: "aot", menus: ["aot"] },
  { id: "Titan", name: "Titan", code: "c", mdj: "aot", menus: ["aot"] },
  { id: "Soldat", name: "Soldat", code: "a", mdj: "aot", menus: ["aot"] },
  { id: "Alliance", name: "Kyojuro - Shinjuro", code: "6", mdj: "ds", menus: [] },
  { id: "Jubi", name: "Jubi", code: "d", mdj: "ns", menus: ["ns"] },
  { id: "Orochimaru", name: "Orochimaru", code: "5", mdj: "ns", menus: ["ns"] },
  { id: "Akatsuki", name: "Akatsuki", code: "c", mdj: "ns", menus: ["ns"] },
  { id: "Sasuke", name: "Sasuke", code: "e", bold: true, mdj: "ns", menus: [] },
  { id: "Zabuza_et_Haku", name: "Zabuza et Haku", code: "b", mdj: "ns", menus: ["ns"] },
  { id: "Shinobi", name: "Shinobi", code: "a", mdj: "ns", menus: ["ns"] },
  { id: "Kabuto", name: "Kabuto", code: "6", bold: true, mdj: "ns", menus: [] },
  { id: "Kumogakure", name: "Kumogakure", code: "6", mdj: "ns", menus: ["ns"] },
  { id: "Shisui", name: "Shisui", code: "e", bold: true, mdj: "ns", menus: [] },
  { id: "Racine", name: "Racine", code: "2", mdj: "ns", menus: [] }
];
