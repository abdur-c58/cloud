/** Lightweight query expansion — no AI, used at search time only. */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "me",
  "all",
  "any",
  "some",
  "show",
  "find",
  "get",
  "list",
  "give",
  "see",
  "display",
  "search",
  "for",
  "of",
  "with",
  "in",
  "from",
  "that",
  "have",
  "has",
  "are",
  "is",
  "do",
  "i",
  "you",
  "please",
  "pic",
  "pics",
  "picture",
  "pictures",
  "photo",
  "photos",
  "image",
  "images",
  "video",
  "videos",
  "file",
  "files",
  "media",
  "library",
  "folder",
  "folders",
  "stuff",
  "things",
  "what",
  "where",
  "which",
]);

/** Common object synonyms aligned with ImageNet / everyday search terms. */
const SYNONYMS: Record<string, string[]> = {
  car: ["car", "automobile", "vehicle", "sedan", "sports car", "sports_car", "convertible", "limousine", "jeep", "taxi", "cab", "minivan", "racer", "race car"],
  cars: ["car", "automobile", "vehicle", "sports car", "sports_car", "convertible"],
  truck: ["truck", "pickup", "lorry", "fire engine", "fire_engine"],
  bus: ["bus", "minibus", "school bus", "school_bus", "trolleybus"],
  bike: ["bicycle", "bike", "mountain bike", "mountain_bike"],
  motorcycle: ["motorcycle", "motorbike", "moped", "scooter"],
  dog: ["dog", "puppy", "hound", "retriever", "terrier", "shepherd", "poodle", "beagle"],
  cat: ["cat", "kitten", "tabby", "persian cat", "siamese cat", "siamese_cat"],
  bird: ["bird", "parrot", "eagle", "owl", "sparrow", "finch", "hummingbird", "penguin"],
  horse: ["horse", "pony", "zebra", "colt"],
  person: ["person", "people", "man", "woman", "boy", "girl", "face", "portrait", "selfie"],
  people: ["person", "people", "crowd", "group"],
  food: ["food", "meal", "dish", "plate", "restaurant"],
  pizza: ["pizza", "pie"],
  cake: ["cake", "dessert", "birthday cake", "cupcake"],
  fruit: ["fruit", "apple", "banana", "orange", "grape", "strawberry", "pineapple"],
  beach: ["beach", "seashore", "coast", "ocean", "sea", "sand", "shore"],
  mountain: ["mountain", "hill", "peak", "alps", "volcano"],
  sunset: ["sunset", "sunrise", "dusk", "dawn", "sky"],
  flower: ["flower", "flowers", "bloom", "rose", "tulip", "daisy", "orchid"],
  tree: ["tree", "forest", "woods", "palm", "oak", "pine"],
  building: ["building", "house", "home", "architecture", "church", "castle", "skyscraper"],
  phone: ["phone", "cellphone", "mobile", "smartphone", "iphone"],
  computer: ["computer", "laptop", "notebook", "desktop", "monitor", "keyboard"],
  book: ["book", "books", "library", "novel"],
  water: ["water", "lake", "river", "pool", "waterfall", "fountain"],
  snow: ["snow", "snowy", "winter", "ski", "snowboard"],
  wedding: ["wedding", "bride", "groom", "marriage"],
  baby: ["baby", "infant", "toddler", "newborn"],
  sport: ["sport", "sports", "ball", "soccer", "football", "basketball", "tennis", "golf"],
  airplane: ["airplane", "plane", "aircraft", "jet", "airliner"],
  boat: ["boat", "ship", "yacht", "sailboat", "canoe"],
  spoon: ["spoon", "cutlery", "silverware"],
};

function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Turn a natural-language query into searchable terms (synonyms included). */
export function expandSearchTerms(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_-]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  const terms = new Set<string>();

  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    terms.add(word);
    terms.add(singularize(word));
    const syns = SYNONYMS[word] || SYNONYMS[singularize(word)];
    if (syns) syns.forEach((s) => terms.add(s.toLowerCase()));
  }

  // Two-word phrases from consecutive non-stopword tokens
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  for (let i = 0; i < meaningful.length - 1; i++) {
    terms.add(`${meaningful[i]} ${meaningful[i + 1]}`);
  }

  return [...terms].filter((t) => t.length >= 2).slice(0, 24);
}

/** Primary keyword for display / simple fallback search. */
export function primarySearchTerm(query: string): string {
  const terms = expandSearchTerms(query);
  return terms[0] || query.trim().toLowerCase();
}
