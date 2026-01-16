/**
 * Token Replacer FA - Constants and Configuration
 * @module core/Constants
 */

export const MODULE_ID = 'token-replacer-fa';
export const MODULE_TITLE = 'Token Replacer - Forgotten Adventures';
export const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

/**
 * Folders to exclude from token search (assets, props, textures, etc.)
 * These contain environment assets, not character tokens
 * Based on Forgotten Adventures library structure
 * All values should be lowercase for case-insensitive matching
 */
export const EXCLUDED_FOLDERS = [
  // ===== GENERIC ASSET FOLDERS =====
  'props', 'prop', 'assets', 'asset', 'items', 'item',
  'objects', 'object', 'furniture', 'decor', 'decoration', 'decorations',
  'scenery', 'overlay', 'overlays', 'effects', 'effect',
  'map_assets', 'map-assets', 'mapassets',
  'tiles', 'tile', 'tilesets', 'tileset',
  'walls', 'floors', 'doors', 'windows',
  'lights', 'lighting', 'ambient', 'lightsources',
  'environment', 'environmental', 'terrain',
  'nature', 'plants', 'vegetation', 'flora',
  'rocks', 'stones', 'boulders', 'crystals',
  'water', 'lava', 'snow', 'fog', 'clouds', 'weather',
  // Note: 'fire', 'ice' removed - conflict with Fire/Ice creatures
  'particles', 'vfx', 'sfx', 'ui', 'icons', 'icon',
  'portraits_items', 'item_portraits',

  // ===== FORGOTTEN ADVENTURES SPECIFIC =====
  // Main FA asset packs
  '_fa_assets', 'fa_assets', 'fa_objects', 'fa_textures',
  '!core', 'core_assets', '!core_settlements', 'core_settlements',
  'dungeon_decor', 'dungeon_of_torment', 'interior_props',
  'magic_&_effects', 'magic_and_effects', 'magic_effects',
  'modular_caves', 'organic_lairs', 'prefabs',
  'table_clutter', 'textures', 'wilderness',
  'wonders_of_underdark', 'underdark',
  'map_making', 'mapmaking', 'battlemap', 'battlemaps', 'battle_map', 'battle_maps',
  'death_&_decay', 'death_and_decay', 'death_decay',
  // FA biome expansions
  'arctic', 'desert', 'woodlands', 'mountains', 'swampland', 'tropical',
  // FA themed packs
  'ceremorph', 'mindflayer', 'dwarven', 'drow', 'flesh',
  'winter', 'holiday', 'seasonal',
  // FA legacy packs
  'legacy', 'legacy_battlemaps', 'legacy_packs',

  // ===== FA COMBAT/WEAPONS (not equipped on creatures) =====
  'combat', 'weapons', 'weapon', 'armor', 'armors', 'armour', 'armours',
  'axes', 'axe', 'blades', 'blade', 'swords', 'sword',
  'bows', 'bow', 'arrows', 'arrow', 'firearms', 'firearm', 'guns', 'gun',
  'shields', 'shield', 'staves', 'staff', 'wands', 'wand',
  'siege', 'siege_weapons', 'catapult', 'ballista', 'cannon',
  'training', 'target', 'targets', 'dummy', 'dummies', 'mannequin',

  // ===== FA DECOR/CLUTTER =====
  'clutter', 'junk', 'debris', 'rubble',
  'books', 'book', 'bookshelf', 'bookshelves', 'bookcase', 'bookcases',
  'cloth', 'clothing', 'clothes', 'fabric', 'textile',
  'food', 'foods', 'drink', 'drinks', 'provisions', 'rations',
  'games', 'game', 'toys', 'toy', 'instruments', 'instrument', 'musical',
  'glassware', 'glass', 'porcelain', 'ceramic', 'pottery',
  'grooming', 'hygiene', 'bathroom',
  'kitchenware', 'kitchen', 'cooking', 'cookware',
  'leather', 'leatherwork', 'leathergoods',
  'locks', 'lock', 'keys', 'key',
  'magic_items', 'magical_items', 'artifacts',
  'paper', 'papers', 'scroll', 'scrolls', 'documents', 'letters',
  'ropes', 'rope',
  // Note: 'chain/chains' removed - conflict with Chain Devil
  'spell_components', 'components', 'reagents',
  'treasure', 'treasures', 'loot', 'hoard', 'gold', 'silver', 'coins', 'gems', 'jewels',
  'writing', 'writing_implements', 'quill', 'ink',

  // ===== FA FLORA =====
  'tree', 'trees', 'bush', 'bushes', 'shrub', 'shrubs',
  'plants', 'plant', 'vines', 'vine', 'ivy',
  'mushrooms', 'mushroom', 'fungi', 'fungus',
  'flowers', 'flower', 'grass', 'grasses',
  'roots', 'root', 'cacti', 'cactus',
  'palm', 'palms', 'palm_trees',
  'water_plants', 'aquatic', 'seaweed', 'kelp', 'lily', 'lilies',

  // ===== FA FURNITURE =====
  'beds', 'bed', 'seating', 'chairs', 'chair', 'benches', 'bench',
  'couches', 'couch', 'sofa', 'sofas', 'thrones', 'throne',
  'tables', 'table', 'desk', 'desks',
  'shelves', 'shelf', 'storage', 'cabinets', 'cabinet', 'wardrobe', 'wardrobes',
  'altars', 'altar', 'shrines', 'shrine',
  'cooking_appliances', 'stove', 'oven', 'fireplace', 'fireplaces', 'hearth',
  'cupboards', 'cupboard', 'pantry',
  'display', 'display_cases', 'showcase',
  'toilets', 'toilet', 'washing', 'bath', 'bathtub', 'sink',

  // ===== FA STRUCTURES =====
  'walls', 'wall', 'brick', 'stone_wall', 'wood_wall', 'metal_wall', 'plaster',
  'doors', 'door', 'doorway', 'doorways', 'gate', 'gates',
  'windows', 'window', 'shutters', 'shutter',
  'bridges', 'bridge', 'walkway', 'walkways',
  'pillars', 'pillar', 'columns', 'column',
  'railings', 'railing', 'balustrade', 'banister',
  'stairs', 'stair', 'staircase', 'staircases', 'steps', 'ladder', 'ladders',
  'fireplaces', 'fireplace', 'chimney', 'chimneys',
  'wells', 'well', 'fountain', 'fountains',
  'roofs', 'roof', 'roofing', 'shingles', 'thatch',
  'tarps', 'tarp', 'awning', 'awnings', 'canopy', 'canopies',
  'mechanical', 'gears', 'gear', 'pulleys', 'pulley', 'levers', 'lever',

  // ===== FA TERRAIN =====
  'cliff', 'cliffs', 'cave', 'caves', 'cavern', 'caverns',
  'entrance', 'entrances', 'portal', 'portals', 'gateway', 'gateways',
  'tunnel', 'tunnels', 'passage', 'passages',
  'path', 'paths', 'road', 'roads', 'trail', 'trails',
  'waterfall', 'waterfalls', 'cascade', 'cascades', 'ripples',
  'mountain', 'mountains', 'hill', 'hills', 'valley', 'valleys',
  'river', 'rivers', 'lake', 'lakes', 'pond', 'ponds', 'stream', 'streams',
  'swamp', 'swamps', 'marsh', 'marshes', 'bog', 'bogs',
  'desert', 'dunes', 'beach', 'beaches', 'shore', 'shores',
  'forest', 'forests', 'jungle', 'jungles', 'woods',

  // ===== FA NATURAL DECOR =====
  'rocks', 'rock', 'boulders', 'boulder', 'pebbles', 'gravel',
  'crystals', 'crystal', 'geodes', 'geode',
  'logs', 'log', 'stumps', 'stump', 'branches', 'branch', 'twigs',
  'hay', 'straw', 'thatch',
  'webs', 'web', 'spider_webs', 'cobwebs', 'cobweb',

  // ===== FA OVERLAYS/EFFECTS =====
  'magic_circles', 'magic_circle', 'runes', 'rune', 'glyphs', 'glyph',
  'lightning', 'electricity', 'sparks',
  'fire_effects', 'flames', 'flame', 'smoke', 'embers',
  'moss', 'lichen', 'mold', 'algae',
  'blood', 'gore', 'corpses', 'corpse', 'remains',
  // Note: 'bone/bones' removed - conflict with Bone Devil
  'blast', 'blast_marks', 'scorch', 'burn_marks', 'impact',
  'dirt', 'mud', 'grime', 'stains', 'splatter',

  // ===== FA LIGHTSOURCES =====
  'torches', 'torch', 'lanterns', 'lantern', 'lamps', 'lamp',
  'candles', 'candle', 'candlestick', 'candelabra',
  'braziers', 'brazier', 'sconces', 'sconce',
  'chandeliers', 'chandelier',
  'campfires', 'campfire', 'bonfire', 'bonfires',
  'glowing', 'luminous', 'radiant',

  // ===== FA VEHICLES =====
  'boats', 'boat', 'ships', 'ship', 'vessel', 'vessels',
  'carts', 'cart', 'wagons', 'wagon', 'carriages', 'carriage',
  'rigging', 'sails', 'sail', 'mast', 'masts',
  'wheels', 'wheel', 'axle', 'axles',

  // ===== FA WORKPLACE/TOOLS =====
  'mining', 'mine', 'mines', 'pickaxe', 'pickaxes',
  'alchemy', 'alchemical', 'potions', 'potion', 'vials', 'vial',
  'tailoring', 'sewing', 'loom', 'looms',
  'farming', 'farm', 'crops', 'harvest', 'plow', 'plows',
  'fishing', 'fish', 'nets', 'net', 'tackle',
  'printing', 'press', 'printing_press',
  'tools', 'tool', 'toolkit', 'toolbox',
  'forge', 'forges', 'anvil', 'anvils', 'bellows', 'smelting', 'furnace',
  'workshop', 'workbench', 'crafting',

  // ===== FA CONTAINERS =====
  'barrel', 'barrels', 'crate', 'crates', 'box', 'boxes',
  'chest', 'chests', 'coffer', 'coffers',
  'sack', 'sacks', 'bag', 'bags', 'pouch', 'pouches',
  'basket', 'baskets', 'bucket', 'buckets', 'pail', 'pails',
  'urn', 'urns', 'vase', 'vases', 'jar', 'jars', 'pot', 'pots',
  'coffin', 'coffins', 'sarcophagus', 'sarcophagi', 'casket', 'caskets',

  // ===== FA SIGNAGE/DECORATION =====
  'signs', 'sign', 'signpost', 'signposts',
  'banners', 'banner', 'flags', 'flag', 'pennant', 'pennants',
  'statues', 'statue', 'sculpture', 'sculptures', 'bust', 'busts',
  'paintings', 'painting', 'portrait', 'portraits', 'artwork',
  'tapestry', 'tapestries', 'curtains', 'curtain', 'drapes', 'drape',
  'rugs', 'rug', 'carpet', 'carpets', 'mat', 'mats',
  'mirror', 'mirrors',

  // ===== BUILDINGS/LOCATIONS (not creatures) =====
  'building', 'buildings', 'structure', 'structures',
  'ruin', 'ruins', 'tower', 'towers', 'keep', 'keeps',
  'camp', 'camps', 'campsite', 'campsites', 'tent', 'tents',
  'house', 'houses', 'hut', 'huts', 'cabin', 'cabins', 'cottage', 'cottages',
  'village', 'town', 'city', 'settlement', 'settlements',
  'castle', 'castles', 'fortress', 'fort', 'forts', 'citadel',
  'dungeon', 'dungeons', 'crypt', 'crypts', 'tomb', 'tombs', 'mausoleum',
  'temple', 'temples', 'church', 'churches', 'cathedral', 'chapel',
  'tavern', 'taverns', 'inn', 'inns', 'pub', 'pubs',
  'shop', 'shops', 'store', 'stores', 'market', 'markets', 'bazaar',
  'arena', 'arenas', 'colosseum', 'stadium', 'amphitheater',
  'laboratory', 'laboratories', 'lab', 'labs',
  'library', 'libraries', 'study', 'archive', 'archives',
  'prison', 'prisons', 'jail', 'jails', 'cell', 'cells', 'dungeon',
  'throne_room', 'hall', 'halls', 'chamber', 'chambers',
  'barracks', 'armory', 'armories', 'stables', 'stable',
  'dock', 'docks', 'pier', 'piers', 'harbor', 'harbour', 'port',
  'sewers', 'sewer', 'drain', 'drains', 'aqueduct',

  // ===== TRAPS/HAZARDS =====
  'trap', 'traps', 'hazard', 'hazards',
  'spike', 'spikes',
  'pressure_plate', 'tripwire', 'trigger'
  // Note: 'pit/pits' removed - conflict with Pit Fiend
];

/**
 * Terms that indicate environmental/prop assets when found in filenames
 * Used as additional filter beyond folder exclusion
 * Based on Forgotten Adventures naming conventions
 * These terms strongly suggest non-creature assets
 */
export const EXCLUDED_FILENAME_TERMS = [
  // ===== TERRAIN/LANDSCAPE =====
  'cliff', 'cave', 'cavern', 'entrance', 'portal', 'gateway',
  'tunnel', 'bridge', 'road', 'path', 'terrain', 'landscape',
  'mountain', 'hill', 'valley', 'canyon', 'ravine', 'gorge',
  'waterfall', 'cascade', 'stream', 'river', 'lake', 'pond', 'shore',
  'beach', 'dune', 'desert', 'oasis',
  'swamp', 'marsh', 'bog', 'wetland',
  'forest', 'jungle', 'woods', 'grove', 'thicket',

  // ===== STRUCTURES =====
  'ruin', 'tower', 'wall', 'fence', 'gate', 'door', 'doorway',
  'building', 'structure', 'house', 'hut', 'tent', 'cabin', 'cottage',
  'camp', 'campsite', 'campfire', 'bonfire',
  'castle', 'fortress', 'keep', 'citadel', 'fort',
  'temple', 'shrine', 'altar', 'church', 'chapel', 'cathedral',
  'tavern', 'inn', 'pub', 'shop', 'market', 'bazaar',
  'dungeon', 'crypt', 'tomb', 'mausoleum', 'catacomb',
  'prison', 'jail', 'cell', 'cage',
  'arena', 'colosseum', 'amphitheater', 'stadium',
  'dock', 'pier', 'harbor', 'port', 'wharf',
  'sewer', 'drain', 'aqueduct', 'canal',
  'well', 'fountain', 'cistern',
  'stairs', 'staircase', 'ladder', 'ramp', 'platform',
  'pillar', 'column', 'arch', 'archway',
  'roof', 'chimney', 'window', 'shutter',
  'fireplace', 'hearth', 'brazier',

  // ===== VEGETATION/FLORA =====
  'tree', 'bush', 'shrub', 'hedge',
  'grass', 'flower', 'plant', 'vine', 'ivy', 'fern',
  'mushroom', 'fungi', 'fungus', 'toadstool',
  'root', 'branch', 'twig', 'leaf', 'leaves',
  'log', 'stump', 'trunk',
  'cactus', 'cacti', 'palm',
  'seaweed', 'kelp', 'algae', 'lily', 'lotus',
  'moss', 'lichen', 'mold',

  // ===== ROCKS/MINERALS =====
  'rock', 'boulder', 'stone', 'pebble', 'gravel',
  'crystal', 'geode', 'gem', 'mineral',
  'stalactite', 'stalagmite',

  // ===== FURNITURE =====
  'bed', 'chair', 'table', 'desk', 'bench', 'stool',
  'couch', 'sofa', 'throne', 'seat',
  'bookshelf', 'bookcase', 'shelf', 'cabinet', 'wardrobe', 'dresser',
  'cupboard', 'pantry', 'closet',
  'rug', 'carpet', 'mat',
  'curtain', 'drape', 'tapestry',
  'mirror', 'painting', 'portrait', 'artwork',

  // ===== LIGHTING =====
  'torch', 'lantern', 'lamp', 'candle', 'candlestick', 'candelabra',
  'chandelier', 'sconce', 'brazier',

  // ===== CONTAINERS =====
  'barrel', 'crate', 'box', 'chest', 'coffer',
  'sack', 'bag', 'pouch', 'basket', 'bucket', 'pail',
  'urn', 'vase', 'jar', 'pot', 'jug', 'pitcher',
  'coffin', 'sarcophagus', 'casket',

  // ===== KITCHEN/FOOD =====
  'plate', 'bowl', 'cup', 'mug', 'goblet', 'tankard', 'stein',
  'bottle', 'flask', 'vial', 'cauldron', 'kettle', 'pitcher', 'jug',
  'food', 'bread', 'meat', 'fruit', 'vegetable', 'cheese',
  'wine', 'ale', 'beer', 'mead', 'drinking horn',
  'stove', 'oven', 'cookware', 'kitchenware',
  'cutting board', 'rolling pin', 'cutlery', 'fork', 'spoon', 'spatula',
  'scissors', 'ladle', 'waterskin', 'platter', 'pan',

  // ===== MATERIALS =====
  'porcelain', 'ceramic', 'pottery', 'clay',
  'glass', 'crystal', 'metal', 'wood', 'stone', 'brick',
  'gold', 'silver', 'bronze', 'copper', 'iron', 'steel',
  'leather', 'cloth', 'fabric', 'silk', 'wool', 'linen',

  // ===== TOOLS/EQUIPMENT =====
  'target', 'dummy', 'mannequin', 'scarecrow', 'training dummy',
  'tool', 'hammer', 'anvil', 'forge', 'bellows', 'furnace',
  'pickaxe', 'shovel', 'hoe', 'rake', 'scythe', 'sickle',
  'saw', 'chisel', 'pliers', 'wrench', 'tongs', 'pincers',
  'rope', 'hook', 'pulley', 'lever', 'wheel', 'gear', 'cog',
  // Note: 'chain' removed - conflict with Chain Devil
  // Note: 'axe' removed - conflict with creature weapons
  'loom', 'spindle', 'needle', 'thread',
  'fishing rod', 'net', 'tackle',
  'broom', 'poker', 'mallet', 'pitchfork', 'spade',

  // ===== WEAPONS/ARMOR (as props) =====
  'weapon rack', 'armor stand', 'shield display', 'trophy',
  'sword display', 'axe display', 'spear rack',
  'weapon', 'sword', 'axe', 'spear', 'bow', 'arrow', 'shield',

  // ===== SIGNS/DECOR =====
  'sign', 'signpost', 'banner', 'flag', 'pennant',
  'statue', 'sculpture', 'bust', 'monument', 'obelisk',

  // ===== DOCUMENTS/WRITING =====
  'book', 'scroll', 'map', 'letter', 'document', 'note', 'paper',
  'quill', 'ink', 'parchment',
  'newspaper', 'poster', 'printing', 'journal', 'tome',

  // ===== VALUABLES =====
  'coin', 'gem', 'jewel', 'treasure', 'gold pile', 'hoard',
  'key', 'lock', 'padlock',

  // ===== GORE/REMAINS =====
  'skull', 'skeleton prop', 'remains', 'corpse',
  // Note: 'bone' removed - conflict with Bone Devil
  'blood', 'gore', 'splatter', 'stain',

  // ===== NATURE EFFECTS =====
  'web', 'cobweb', 'spiderweb',
  'debris', 'rubble', 'wreckage',
  'dirt', 'mud', 'dust', 'ash', 'soot',

  // ===== VEHICLES =====
  'cart', 'wagon', 'carriage', 'chariot',
  'boat', 'ship', 'raft', 'canoe', 'rowboat',
  'wheel', 'sail', 'mast', 'anchor',

  // ===== TRAPS/HAZARDS =====
  'trap', 'snare', 'spike',
  // Note: 'pit' removed - conflict with Pit Fiend
  'pressure plate', 'tripwire', 'trigger',

  // ===== MAP ELEMENTS =====
  'tile', 'tileset', 'overlay', 'border', 'frame', 'grid',
  'background', 'foreground', 'scenic', 'scene', 'decor',
  'prop', 'asset', 'clutter', 'scatter',

  // ===== FA DUNGEON DECOR ITEMS =====
  'manhole', 'cellar door', 'trap door', 'trapdoor', 'basin',
  'wheelbarrow', 'billiard', 'pool table', 'bunting',
  'clothesline', 'clothes line', 'vanity', 'archery target',
  'art tool', 'sleeping bag', 'bedroll', 'restraint', 'restraints',
  'magic circle', 'candelabra', 'room divider', 'trough',
  'weapon rack', 'canon', 'cannon',

  // ===== FA TABLE CLUTTER ITEMS =====
  'spell component', 'reagent', 'alchemy', 'alchemical',
  'tarot', 'wizard hat', 'witch hat', 'diadem', 'orb',
  'pentacle', 'magic lamp', 'mage light', 'amulet',
  'adventuring gear', 'napkin', 'cloth',

  // ===== FA SPECIFIC TERMS =====
  'prefab', 'modular', 'variant', 'alternate',
  'damaged', 'broken', 'ruined', 'destroyed',
  'open', 'closed', 'empty', 'full',
  'small', 'medium', 'large', 'huge', 'tiny'
];

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
