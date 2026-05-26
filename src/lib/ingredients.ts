// OM12 — canonical-key normaliser for ingredient strings.
// Both pantry entries and recipe ingredients run through this so matching is a
// straight equality check on the canonical key. No fuzzy matching for v1.

const PREP_WORDS = new Set([
  'diced', 'chopped', 'minced', 'sliced', 'crushed', 'grated', 'shredded',
  'peeled', 'cubed', 'cut', 'halved', 'quartered', 'mashed', 'cooked',
  'fresh', 'dried', 'frozen', 'canned', 'jarred', 'roasted', 'toasted',
  'fine', 'finely', 'coarse', 'coarsely', 'thin', 'thinly', 'thick', 'thickly',
  'large', 'small', 'medium', 'big', 'extra', 'whole',
  'ripe', 'unripe', 'raw', 'boneless', 'skinless',
  'organic', 'free-range', 'free', 'range',
  'optional', 'taste', 'to', 'for', 'of', 'or',
  'and', 'a', 'an', 'the',
  'good', 'quality', 'best',
  'room', 'temperature',
  'softened', 'melted',
  'plain', 'natural',
  'unsalted', 'salted', 'low-fat', 'low', 'fat',
]);

const UNIT_WORDS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilo', 'kilos',
  'ml', 'l', 'litre', 'liter', 'litres', 'liters',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'tsp', 'teaspoon', 'teaspoons',
  'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups',
  'pinch', 'pinches', 'dash', 'splash', 'handful', 'handfuls',
  'clove', 'cloves', 'sprig', 'sprigs', 'bunch', 'bunches',
  'can', 'cans', 'tin', 'tins', 'packet', 'packets', 'jar', 'jars',
  'slice', 'slices', 'piece', 'pieces',
]);

const ALIASES: Record<string, string> = {
  // singular alignments not handled by the generic stripper
  'tomatoes':  'tomato',
  'potatoes':  'potato',
  'leaves':    'leaf',
  'chillies':  'chilli',
  'chilies':   'chili',
  // common compound trims
  'chicken breast':  'chicken',
  'chicken breasts': 'chicken',
  'chicken thigh':   'chicken',
  'chicken thighs':  'chicken',
  'chicken stock':   'chicken stock',  // keep as-is so it doesn't collapse to "chicken"
  'olive oil':       'olive oil',      // keep — distinct from generic "oil"
  'sea salt':        'salt',
  'kosher salt':     'salt',
  'black pepper':    'pepper',
  'white pepper':    'pepper',
  'spring onion':    'spring onion',
  'spring onions':   'spring onion',
  'red onion':       'onion',
  'white onion':     'onion',
  'yellow onion':    'onion',
  'brown onion':     'onion',
};

// Words where -oes → -o (potato, tomato, mango, etc.) rather than -oe → -o.
const OES_WORDS = new Set([
  'tomato', 'potato', 'mango', 'volcano', 'echo', 'hero',
]);

function singularise(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith('ies'))  return word.slice(0, -3) + 'y';
  if (word.endsWith('ses'))  return word.slice(0, -2);   // boxes → box, glasses → glass-y but acceptable
  if (word.endsWith('xes'))  return word.slice(0, -2);
  if (word.endsWith('oes')) {
    const stem = word.slice(0, -2);  // tomatoes → tomato
    if (OES_WORDS.has(stem)) return stem;
    // Fall through to the generic -s rule (e.g. "shoes" → "shoe")
  }
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Convert any ingredient string to its canonical key.
 * Strategy: lowercase → strip leading qty/unit → strip parenthetical notes →
 * strip prep adjectives → drop trailing modifiers after comma → singularise
 * each remaining word → check alias table for the full result.
 */
export function canonicaliseIngredient(input: string): string {
  if (!input) return '';
  let s = input.toLowerCase().trim();

  // Strip leading quantity tokens like "1.5", "1/2", "200g", "2"
  s = s.replace(/^(\d+(?:[.\/]\d+)?)\s*/, '');

  // Strip parenthetical aside ("(optional)", "(about 2 tbsp)")
  s = s.replace(/\([^)]*\)/g, ' ');

  // Drop everything after the first comma — that's a prep note (", diced")
  const commaIdx = s.indexOf(',');
  if (commaIdx !== -1) s = s.slice(0, commaIdx);

  // Tokenise, drop unit + prep words, keep the rest
  const tokens = s.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const raw of tokens) {
    const t = raw.replace(/[^a-z\-]/g, '');
    if (!t) continue;
    if (UNIT_WORDS.has(t)) continue;
    if (PREP_WORDS.has(t)) continue;
    kept.push(t);
  }

  // Singularise each word, then re-join
  const joined = kept.map(singularise).join(' ').trim();
  if (!joined) return '';

  // Alias lookup (full-string only, no partial)
  if (ALIASES[joined]) return ALIASES[joined];

  // Final pass: collapse double spaces
  return joined.replace(/\s+/g, ' ');
}

/** True if two ingredient strings map to the same canonical key. */
export function ingredientsMatch(a: string, b: string): boolean {
  const ka = canonicaliseIngredient(a);
  const kb = canonicaliseIngredient(b);
  return ka !== '' && ka === kb;
}
