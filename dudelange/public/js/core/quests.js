/** Quest definitions — shared by the game and the systems/QA agents. */
export const QUESTS = [
  { id: 'welcome', title: 'Wëllkomm zu Diddeleng', desc: 'Talk to the tourist desk inside the Hôtel de Ville.', money: 20, xp: 30, hint: 'The town hall is on Place de l’Hôtel de Ville, south of the church.' },
  { id: 'stations', title: 'Four stops on line 60a', desc: 'Visit all four CFL stops: Burange, Ville, Centre and Usines.', money: 40, xp: 60, hint: 'The line runs north–south through the valley; follow the platforms.' },
  { id: 'groceries', title: 'The shopping list', desc: 'Buy bread, milk and Kachkéis at Proxy Delhaize on Route de Zoufftgen.', money: 25, xp: 40, hint: '59A Route de Zoufftgen, in the Italien quarter.' },
  { id: 'steel', title: 'Steel and memory', desc: 'Walk the old rolling mill and visit the CNA gallery on the works site.', money: 35, xp: 55, hint: 'Nei Schmelz, south of the centre along Rue du Centenaire.' },
  { id: 'summit', title: 'Gehaansbierg', desc: 'Climb Mont Saint-Jean and find the castle ruins at 417 m.', money: 30, xp: 50, hint: 'West of town, up Chemin du Mont Saint-Jean, or through Budersberg.' },
  { id: 'dinner', title: 'Dinner in town', desc: 'Order a proper dish in any Dudelange restaurant.', money: 20, xp: 35, hint: 'Mamma Mia on the town-hall square is a good start.' },
  { id: 'parc', title: 'The forest table', desc: 'Find the restaurant inside Parc Le’h, above Burange.', money: 25, xp: 40, hint: 'Rue de la Forêt leads east into the woods.' },
  { id: 'ride', title: 'Ride the 60a', desc: 'Board the train at any stop and travel at least 500 m with it.', money: 50, xp: 80, hint: 'Wait for the doors to open at a platform, then press E.' }
];

export const QUEST_ITEM_MAP = {
  groceries: ['bread', 'milk', 'kachkeis']
};
