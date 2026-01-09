/**
 * Token Replacer FA - Constants and Configuration
 * @module core/Constants
 */

export const MODULE_ID = 'token-replacer-fa';
export const MODULE_TITLE = 'Token Replacer - Forgotten Adventures';
export const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

/**
 * Primary search terms for each creature category
 * Used as fallback when full mappings aren't needed
 */
export const PRIMARY_CATEGORY_TERMS = {
  humanoid: ['human', 'elf', 'dwarf', 'halfling', 'gnome', 'orc', 'goblin', 'hobgoblin', 'kobold', 'tiefling', 'dragonborn'],
  beast: ['wolf', 'bear', 'boar', 'horse', 'lion', 'tiger', 'snake', 'spider', 'rat', 'bat', 'eagle', 'hawk'],
  undead: ['skeleton', 'zombie', 'ghost', 'specter', 'wraith', 'wight', 'vampire', 'lich', 'ghoul', 'mummy'],
  fiend: ['demon', 'devil', 'imp', 'succubus', 'balor', 'pit fiend', 'hell hound'],
  dragon: ['dragon', 'drake', 'wyvern', 'wyrmling', 'dragonborn'],
  elemental: ['elemental', 'fire elemental', 'water elemental', 'earth elemental', 'air elemental', 'mephit'],
  fey: ['fairy', 'pixie', 'sprite', 'dryad', 'satyr', 'hag', 'eladrin'],
  celestial: ['angel', 'deva', 'planetar', 'solar', 'pegasus', 'unicorn', 'couatl'],
  construct: ['golem', 'animated', 'homunculus', 'shield guardian', 'modron'],
  aberration: ['beholder', 'mind flayer', 'aboleth', 'gibbering mouther', 'otyugh', 'slaad'],
  monstrosity: ['owlbear', 'griffon', 'chimera', 'manticore', 'hydra', 'basilisk', 'medusa', 'minotaur'],
  giant: ['giant', 'ogre', 'troll', 'ettin', 'cyclops', 'hill giant', 'frost giant', 'fire giant'],
  plant: ['treant', 'shambling mound', 'blight', 'myconid', 'vegepygmy'],
  ooze: ['ooze', 'slime', 'jelly', 'pudding', 'cube']
};

/**
 * Comprehensive creature type mappings
 * Maps each D&D creature type to all related search terms
 */
export const CREATURE_TYPE_MAPPINGS = {
  humanoid: [
    'human', 'elf', 'half-elf', 'dwarf', 'halfling', 'gnome', 'half-orc', 'orc', 'goblin', 'hobgoblin',
    'bugbear', 'kobold', 'tiefling', 'dragonborn', 'aasimar', 'genasi', 'goliath', 'firbolg', 'tabaxi',
    'kenku', 'lizardfolk', 'yuan-ti', 'triton', 'aarakocra', 'tortle', 'warforged', 'changeling',
    'shifter', 'kalashtar', 'gith', 'githyanki', 'githzerai', 'drow', 'duergar', 'svirfneblin',
    'bandit', 'guard', 'knight', 'mage', 'priest', 'thug', 'assassin', 'spy', 'noble', 'commoner',
    'soldier', 'veteran', 'berserker', 'gladiator', 'scout', 'cultist', 'acolyte', 'druid', 'archer',
    'wizard', 'sorcerer', 'warlock', 'cleric', 'paladin', 'ranger', 'rogue', 'fighter', 'barbarian',
    'bard', 'monk', 'pirate', 'captain', 'sailor', 'merchant', 'farmer', 'blacksmith', 'innkeeper'
  ],
  beast: [
    'wolf', 'dire wolf', 'bear', 'brown bear', 'black bear', 'polar bear', 'boar', 'giant boar',
    'horse', 'warhorse', 'pony', 'lion', 'tiger', 'panther', 'leopard', 'snake', 'giant snake',
    'constrictor', 'viper', 'spider', 'giant spider', 'rat', 'giant rat', 'bat', 'giant bat',
    'eagle', 'giant eagle', 'hawk', 'owl', 'giant owl', 'vulture', 'raven', 'crow', 'elk', 'giant elk',
    'deer', 'ape', 'giant ape', 'baboon', 'badger', 'giant badger', 'crocodile', 'giant crocodile',
    'frog', 'giant frog', 'toad', 'giant toad', 'scorpion', 'giant scorpion', 'crab', 'giant crab',
    'octopus', 'giant octopus', 'shark', 'hunter shark', 'reef shark', 'whale', 'dolphin', 'seal',
    'weasel', 'giant weasel', 'hyena', 'giant hyena', 'jackal', 'mastiff', 'dog', 'cat', 'goat',
    'giant goat', 'ox', 'mule', 'camel', 'elephant', 'mammoth', 'rhinoceros', 'hippopotamus'
  ],
  undead: [
    'skeleton', 'zombie', 'ghost', 'specter', 'wraith', 'wight', 'vampire', 'vampire spawn',
    'lich', 'demilich', 'ghoul', 'ghast', 'mummy', 'mummy lord', 'banshee', 'shadow', 'poltergeist',
    'revenant', 'death knight', 'bodak', 'bone devil', 'crawling claw', 'flameskull', 'will-o-wisp',
    'allip', 'nightwalker', 'sword wraith', 'boneclaw', 'deathlock', 'spawn', 'necromancer',
    'skeletal', 'zombified', 'undying', 'risen', 'corpse', 'cadaver'
  ],
  fiend: [
    'demon', 'devil', 'imp', 'quasit', 'succubus', 'incubus', 'balor', 'pit fiend', 'hell hound',
    'nightmare', 'barbed devil', 'bearded devil', 'bone devil', 'chain devil', 'erinyes', 'horned devil',
    'ice devil', 'lemure', 'spined devil', 'dretch', 'manes', 'shadow demon', 'vrock', 'hezrou',
    'glabrezu', 'nalfeshnee', 'marilith', 'goristro', 'barlgura', 'chasme', 'yochlol', 'bebilith',
    'cambion', 'rakshasa', 'yugoloth', 'mezzoloth', 'nycaloth', 'arcanaloth', 'ultroloth', 'night hag'
  ],
  dragon: [
    'dragon', 'drake', 'wyvern', 'wyrmling', 'young dragon', 'adult dragon', 'ancient dragon',
    'red dragon', 'blue dragon', 'green dragon', 'black dragon', 'white dragon', 'gold dragon',
    'silver dragon', 'bronze dragon', 'brass dragon', 'copper dragon', 'shadow dragon', 'dracolich',
    'dragon turtle', 'pseudodragon', 'faerie dragon', 'guard drake', 'ambush drake'
  ],
  elemental: [
    'elemental', 'fire elemental', 'water elemental', 'earth elemental', 'air elemental',
    'mephit', 'magma mephit', 'ice mephit', 'dust mephit', 'mud mephit', 'smoke mephit', 'steam mephit',
    'galeb duhr', 'gargoyle', 'invisible stalker', 'salamander', 'fire snake', 'azer', 'efreeti',
    'djinni', 'marid', 'dao', 'xorn', 'phoenix', 'water weird', 'flail snail'
  ],
  fey: [
    'fairy', 'pixie', 'sprite', 'dryad', 'satyr', 'hag', 'green hag', 'sea hag', 'night hag',
    'annis hag', 'bheur hag', 'eladrin', 'blink dog', 'displacer beast', 'quickling', 'redcap',
    'meenlock', 'yeth hound', 'darkling', 'korred', 'nereid', 'sea hag'
  ],
  celestial: [
    'angel', 'deva', 'planetar', 'solar', 'pegasus', 'unicorn', 'couatl', 'empyrean', 'ki-rin',
    'hollyphant', 'light', 'radiant'
  ],
  construct: [
    'golem', 'flesh golem', 'clay golem', 'stone golem', 'iron golem', 'animated armor',
    'animated object', 'flying sword', 'rug of smothering', 'homunculus', 'shield guardian',
    'modron', 'monodrone', 'duodrone', 'tridrone', 'quadrone', 'pentadrone', 'scarecrow',
    'helmed horror', 'clockwork', 'inevitable', 'retriever'
  ],
  aberration: [
    'beholder', 'spectator', 'gazer', 'death tyrant', 'mind flayer', 'illithid', 'elder brain',
    'aboleth', 'gibbering mouther', 'otyugh', 'slaad', 'red slaad', 'blue slaad', 'green slaad',
    'gray slaad', 'death slaad', 'cloaker', 'darkmantle', 'grell', 'intellect devourer', 'nothic',
    'chuul', 'star spawn', 'neogi', 'umber hulk', 'hook horror'
  ],
  monstrosity: [
    'owlbear', 'griffon', 'hippogriff', 'chimera', 'manticore', 'hydra', 'basilisk', 'cockatrice',
    'medusa', 'minotaur', 'centaur', 'harpy', 'lamia', 'sphinx', 'androsphinx', 'gynosphinx',
    'criosphinx', 'hieracosphinx', 'bulette', 'carrion crawler', 'catoblepas', 'death dog',
    'displacer beast', 'ettercap', 'grick', 'kraken', 'phase spider', 'purple worm', 'remorhaz',
    'roper', 'rust monster', 'worg', 'winter wolf', 'yeti', 'yuan-ti', 'ankheg', 'behir',
    'peryton', 'stirge', 'tarrasque', 'leucrotta', 'gorgon'
  ],
  giant: [
    'giant', 'ogre', 'troll', 'ettin', 'cyclops', 'hill giant', 'stone giant', 'frost giant',
    'fire giant', 'cloud giant', 'storm giant', 'fomorian', 'firbolg', 'oni', 'half-ogre',
    'verbeeg', 'mouth of grolantor'
  ],
  plant: [
    'treant', 'awakened tree', 'awakened shrub', 'shambling mound', 'blight', 'twig blight',
    'needle blight', 'vine blight', 'myconid', 'myconid adult', 'myconid sovereign', 'myconid sprout',
    'vegepygmy', 'thorny', 'wood woad', 'corpse flower', 'assassin vine', 'yellow musk creeper'
  ],
  ooze: [
    'ooze', 'slime', 'jelly', 'pudding', 'cube', 'gelatinous cube', 'black pudding', 'gray ooze',
    'ochre jelly', 'oblex', 'slithering tracker'
  ]
};

/**
 * Generic subtype indicators that mean "show all"
 */
export const GENERIC_SUBTYPE_INDICATORS = [
  'any', 'any race', 'any type', 'various', 'mixed', 'all'
];

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS = {
  fuzzyThreshold: 0.1,
  searchPriority: 'both',
  autoReplace: false,
  confirmReplace: true,
  fallbackFullSearch: false,
  useTVACache: true,
  refreshTVACache: false,
  additionalPaths: ''
};
