import { AllergenInfo } from '../types';

// FDA Big 9 allergens with keyword lists
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  milk: [
    'milk', 'cream', 'butter', 'cheese', 'casein', 'caseinate', 'whey', 'lactose',
    'lactulose', 'ghee', 'dairy', 'lactalbumin', 'lactoglobulin', 'yogurt', 'yoghurt',
    'kefir', 'quark', 'custard', 'half-and-half', 'buttermilk', 'nonfat milk',
    'skim milk', 'whole milk', 'low-fat milk', 'evaporated milk', 'condensed milk',
  ],
  eggs: [
    'egg', 'eggs', 'albumin', 'albumen', 'globulin', 'lysozyme', 'mayonnaise',
    'meringue', 'ovalbumin', 'ovomucin', 'ovomucoid', 'ovovitellin', 'silici albuminate',
    'surimi', 'egg white', 'egg yolk', 'dried egg',
  ],
  fish: [
    'fish', 'cod', 'flounder', 'halibut', 'pollock', 'salmon', 'tilapia', 'tuna',
    'catfish', 'bass', 'grouper', 'mahi', 'snapper', 'swordfish', 'trout', 'anchovy',
    'anchovies', 'sardine', 'sardines', 'herring', 'carp', 'mackerel', 'pangasius',
    'barramundi', 'sole', 'haddock', 'perch', 'pike', 'sturgeon',
  ],
  shellfish: [
    'shellfish', 'shrimp', 'crab', 'lobster', 'clam', 'clams', 'scallop', 'scallops',
    'oyster', 'oysters', 'mussel', 'mussels', 'prawn', 'prawns', 'crayfish',
    'crawfish', 'langoustine', 'squid', 'octopus', 'abalone',
  ],
  'tree nuts': [
    'almond', 'almonds', 'cashew', 'cashews', 'pecan', 'pecans', 'pistachio',
    'pistachios', 'walnut', 'walnuts', 'hazelnut', 'hazelnuts', 'filbert', 'filberts',
    'macadamia', 'chestnut', 'chestnuts', 'pine nut', 'pine nuts', 'brazil nut',
    'brazil nuts', 'coconut', 'marzipan', 'praline', 'gianduja', 'nougat',
  ],
  peanuts: [
    'peanut', 'peanuts', 'groundnut', 'groundnuts', 'arachis', 'beer nuts',
    'mixed nuts', 'monkey nuts', 'nut pieces', 'peanut butter', 'peanut flour',
    'peanut oil',
  ],
  wheat: [
    'wheat', 'flour', 'gluten', 'semolina', 'spelt', 'farro', 'durum', 'kamut',
    'emmer', 'einkorn', 'triticale', 'wheat germ', 'wheat bran', 'wheat starch',
    'bread crumb', 'breadcrumb', 'crouton', 'bulgur', 'barley', 'rye', 'oat', 'oats',
    'malt', 'malted', 'soy sauce', 'teriyaki', 'modified food starch',
  ],
  soy: [
    'soy', 'soya', 'edamame', 'tofu', 'miso', 'tempeh', 'tamari', 'soybean',
    'soybeans', 'soy milk', 'soy sauce', 'textured vegetable protein', 'tvp',
    'hydrolyzed soy protein', 'soy lecithin', 'soy flour', 'soy protein',
  ],
  sesame: [
    'sesame', 'tahini', 'sesame oil', 'sesame seed', 'sesame seeds', 'gingelly',
    'til', 'benne', 'sesame flour', 'sesame paste',
  ],
};

const ALL_ALLERGEN_NAMES = Object.keys(ALLERGEN_KEYWORDS);

export function detectAllergens(food: {
  ingredients?: string;
  description?: string;
}): AllergenInfo {
  const ingredients = food.ingredients;

  if (!ingredients || ingredients.trim().length === 0) {
    return {
      detected: [],
      free: [],
      source: 'unavailable',
    };
  }

  const lower = ingredients.toLowerCase();
  const detected: string[] = [];

  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    const found = keywords.some(keyword => {
      // Use word-boundary-aware matching to avoid false positives
      const re = new RegExp(`(?:^|[\\s,.(;/[])${escapeRegex(keyword)}(?:[\\s,.)\\];/]|$)`, 'i');
      return re.test(lower) || lower.includes(keyword);
    });
    if (found) {
      detected.push(allergen);
    }
  }

  const free = ALL_ALLERGEN_NAMES.filter(a => !detected.includes(a));

  return {
    detected,
    free,
    source: 'ingredients',
    rawIngredients: ingredients.substring(0, 500),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatAllergenWarning(allergens: string[]): string {
  if (allergens.length === 0) return 'No major allergens detected';
  return `Contains: ${allergens.join(', ')}`;
}
