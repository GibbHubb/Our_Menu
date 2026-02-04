import { Recipe } from "./types";

const getImg = (title: string) => `https://image.pollinations.ai/prompt/delicious%20${encodeURIComponent(title)}%20food%20photography?width=800&height=600&nologo=true`;

export const INITIAL_RECIPES: Partial<Recipe>[] = [
    // --- USER UPLOADED / SPECIFIC RECIPES ---

    // [Mains] Matches "Butterfly prawn with French butter sauce"
    {
        title: "Leader Prawns w Nahm Jim Beurre Blanc",
        category: "Mains",
        image_url: getImg("Grilled prawn nahm jim beurre blanc"),
        ingredients: `• 6 Leader prawns, cut in half lengthways
• 125g cold diced unsalted butter
• 20ml lime juice
• 1 Tbs chopped coriander
• 2 Tbs fish sauce
• 2 Tbs ginger, peeled & finely julienned
• 1 stick lemongrass, finely sliced
• 1 large red chilli, finely sliced
• 1/2 cup coriander leaves
• 2 kaffir lime leaves, finely julienned

Nahm Jim Beurre Blanc:
• 2 large green chillies, chopped
• 1 clove garlic
• 3 coriander roots
• 1 Tbs light palm sugar
• 2 Tbs fish sauce
• 100ml light flavoured wine
• 1 Tbs golden shallots, diced
• 1 Tbs cream`,
        instructions: `1. Paste: Pound chillies, garlic & coriander roots. Add sugar & fish sauce.
2. Reduce: Simmer wine, lime, shallots & fish sauce. Reduce by half. Add cream.
3. Emulsify: Whisk in cold butter piece by piece over low heat.
4. Finish: Stir in chilli paste, lime & coriander.
5. Grill: BBQ prawns shell-side down (covered) 3-4 mins.
6. Serve: Spoon sauce over prawns, top with fresh aromatics.`
    },
    // [Snacks] Matches "Asian greens"
    {
        title: "Steamed Chinese Broccoli (Gai Lan)",
        category: "Snacks",
        image_url: getImg("Steamed Chinese Broccoli Ginger Sesame"),
        ingredients: `• 2 bunches Gai Lan, washed & cut
• 2 Tbs toasted sesame seeds
• Sauce:
• 1/2 cup oyster sauce
• 1/2 cup light soy sauce
• 1 clove garlic, crushed
• 1 Tbs ginger, grated
• 1 tsp sesame oil`,
        instructions: `1. Mix sauce ingredients in a bowl.
2. Steam broccoli stems 3 mins, then leaves 3 mins.
3. Drizzle with sauce and seeds.`
    },
    // [Snacks] Matches "Coconut and chilli kingfish sashimi" (Modified from Scallop Gohu image)
    {
        title: "Coconut & Chilli Kingfish Sashimi (Gohu)",
        category: "Snacks",
        image_url: getImg("Kingfish sashimi coconut chilli"),
        ingredients: `• 500g Kingfish, sashimi grade, diced
• 1/2 cup fresh grated coconut
• 8 bird's eye chillies, sliced
• 1/4 cup coconut oil (warm)
• 1/3 cup lime juice
• 1/4 cup roasted peanuts
• Thai basil & Kaffir lime leaves`,
        instructions: `1. Cure: Toss fish in lime juice and salt. Fridge for 10 mins.
2. Infuse: Pour warm coconut oil over chillies, coconut & aromatics. Cool.
3. Mix: Combine fish with the coconut mixture.
4. Serve: Top with peanuts, basil and extra coconut cream.`
    },
    // [Mains] - Image Upload
    {
        title: "Kao Ka Ped (Slow Braised Duck)",
        category: "Mains",
        image_url: getImg("Thai slow braised duck"),
        ingredients: `• 6 Duck legs
• 700ml Chicken stock
• Aromats: Galangal (10 slices), Garlic (5), Coriander roots (3)
• Sauce: 4 tbsp Light Soy, 2 tbsp Dark Soy, 4 tbsp Oyster Sauce
• Spices: Cinnamon, Star Anise, Szechuan pepper
• 1/3 cup Palm Sugar`,
        instructions: `1. Braise all ingredients in oven at 180°C for 2 hours.
2. Strain stock and reduce to a glaze.
3. Crisp duck skin in oven/pan.
4. Serve with steamed greens and rice.`
    },
    // [Sweets] - Image Upload
    {
        title: "Tamarind Panna Cotta w Honeycomb",
        category: "Sweets",
        image_url: getImg("Tamarind Panna Cotta"),
        ingredients: `• 200ml Tamarind sauce
• 300ml Cream/Milk mix
• 1 sheet Gelatine
• Honeycomb: Sugar, Honey, Glucose, Bicarb soda
• Burnt Orange segments`,
        instructions: `1. Heat liquid, dissolve gelatine. Set in moulds.
2. Make honeycomb (boil sugar to 150°C, whisk in bicarb).
3. Torch orange segments.
4. Serve panna cotta with crushed honeycomb.`
    },

    // --- WANT TO COOK ---
    {
        title: "Oxtail Stew",
        category: "Want to Cook",
        image_url: getImg("Oxtail Stew"),
        ingredients: `• 1.5kg Oxtail pieces
• 2 Onions, 2 Carrots, 2 Celery
• 4 Garlic cloves
• 2 cups Beef Stock
• 1 cup Red Wine`,
        instructions: `1. Brown oxtail well.
2. Sauté veggies.
3. Braise in liquid for 3.5 hours until falling off bone.`
    },
    {
        title: "Filipino Pork Adobo",
        category: "Want to Cook",
        link: "https://www.recipetineats.com/filipino-pork-adobo/",
        image_url: getImg("Filipino Pork Adobo"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Vindaloo",
        category: "Want to Cook",
        link: "https://www.recipetineats.com/vindaloo/",
        image_url: getImg("Lamb Vindaloo"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Rogan Josh",
        category: "Want to Cook",
        link: "https://www.recipetineats.com/rogan-josh/",
        image_url: getImg("Rogan Josh"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Japchae (Korean Noodles)",
        category: "Want to Cook",
        link: "https://www.recipetineats.com/japchae-korean-noodles/",
        image_url: getImg("Japchae"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Tom Yum Soup",
        category: "Want to Cook",
        link: "https://www.recipetineats.com/tom-yum-soup-thai/",
        image_url: getImg("Tom Yum Soup"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Pork and Fennel Sausage Roll",
        category: "Want to Cook",
        link: "https://www.maggiebeer.com.au/pages/recipes/pork-and-fennel-sausage-rolls-with-cabernet-barbecue-sauce",
        image_url: getImg("Sausage Roll"),
        ingredients: "See full recipe at Maggie Beer.",
        instructions: "Click card to view recipe."
    },

    // --- MAINS ---
    {
        title: "Beef Ragu",
        category: "Mains",
        link: "https://www.recipetineats.com/slow-cooked-shredded-beef-ragu-pasta/",
        image_url: getImg("Beef Ragu Pappardelle"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Dan Dan Noodles",
        category: "Mains",
        link: "https://www.recipetineats.com/dan-dan-noodles-spicy-sichuan-noodles/",
        image_url: getImg("Dan Dan Noodles"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Pad See Ew",
        category: "Mains",
        link: "https://www.recipetineats.com/thai-stir-fried-noodles-pad-see-ew/",
        image_url: getImg("Pad See Ew"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    { title: "Couscous Salad", category: "Mains", image_url: getImg("Couscous Salad"), ingredients: "• Couscous\n• Roasted Veg\n• Feta\n• Lemon dressing", instructions: "Soak couscous. Toss with ingredients." },
    { title: "Okonomiyaki", category: "Mains", image_url: getImg("Okonomiyaki"), ingredients: "• Cabbage (finely shredded)\n• Flour/Dashi batter\n• Pork belly slices\n• Mayo/Okonomi sauce", instructions: "Mix cabbage & batter. Fry pancake. Top with pork. Flip. Sauce heavily." },
    { title: "Chicken Schnitzel", category: "Mains", image_url: getImg("Chicken Schnitzel"), ingredients: "• Chicken breast\n• Panko crumbs\n• Parmesan/Parsley", instructions: "Crumb and shallow fry." },
    { title: "Beef Stew + Mash", category: "Mains", image_url: getImg("Beef Stew Mash"), ingredients: "• Beef chunks\n• Red wine gravy\n• Mashed potato", instructions: "Slow cook beef. Serve over creamy mash." },
    { title: "Fried Chicken Burger", category: "Mains", image_url: getImg("Fried Chicken Burger"), ingredients: "• Thigh fillet\n• Buttermilk\n• Spiced Flour\n• Brioche Bun", instructions: "Marinate, flour, fry. Serve with slaw." },
    { title: "Smash Burger", category: "Mains", image_url: getImg("Smash Burger"), ingredients: "• Beef mince\n• American cheese\n• Pickles\n• Burger sauce", instructions: "Smash patty largely on hot plate. Crust essence. Melt cheese." },
    { title: "Rice Paper Rolls", category: "Mains", image_url: getImg("Rice Paper Rolls"), ingredients: "• Rice paper\n• Prawns\n• Vermicelli\n• Herbs", instructions: "Wet paper. Roll tight with fillings. Peanut hoisin dip." },
    { title: "Fish Green Curry", category: "Mains", image_url: getImg("Green Fish Curry"), ingredients: "• White fish\n• Green curry paste\n• Coconut milk\n• Bamboo shoots", instructions: "Fry paste. Add liquid. Poach fish gently." },
    { title: "Beef Massaman", category: "Mains", image_url: getImg("Beef Massaman"), ingredients: "• Beef Chuck\n• Massaman paste\n• Potato\n• Peanuts", instructions: "Slow cook until beef falls apart. Thick rich sauce." },
    { title: "Chicken & Pumpkin Red Curry", category: "Mains", image_url: getImg("Chicken Pumpkin Curry"), ingredients: "• Chicken\n• Pumpkin\n• Red Curry paste", instructions: "Simmer in coconut milk until pumpkin tender." },
    { title: "Lemongrass Chicken Vermicelli", category: "Mains", image_url: getImg("Lemongrass Chicken Salad"), ingredients: "• Chicken thigh (Lemongrass marinade)\n• Vermicelli\n• Nuoc Cham", instructions: "Grill chicken. Assemble bowl with noodles and salad." },
    {
        title: "Chicken Gyros",
        category: "Mains",
        link: "https://www.recipetineats.com/chicken-gyros-recipe/",
        image_url: getImg("Chicken Gyros"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    { title: "Tacos (Pulled Pork/Beef)", category: "Mains", image_url: getImg("Mexican Tacos"), ingredients: "• Shoulder meat\n• Mexican spices\n• Corn tortillas\n• Salsa", instructions: "Slow cook meat. Shred. Serve on warm tortillas." },
    { title: "Burrito Bowl", category: "Mains", image_url: getImg("Burrito Bowl"), ingredients: "• Rice\n• Beans\n• Meat\n• Guacamole", instructions: "Layer ingredients in bowl. Chipotle dressing." },
    { title: "Salmon Poke Bowl", category: "Mains", image_url: getImg("Salmon Poke Bowl"), ingredients: "• Raw Salmon\n• Sushi Rice\n• Edamame\n• Pickled Ginger", instructions: "Dice salmon. Dress with soy/sesame. Arrange on rice." },
    { title: "Miso Eggplant Bowl", category: "Mains", image_url: getImg("Miso Eggplant"), ingredients: "• Eggplant\n• Miso glaze (Miso/Sugar/Sake)", instructions: "Score eggplant. Pan fry. Glaze and grill." },
    { title: "Chicken and Leek Pie", category: "Mains", image_url: getImg("Chicken Leek Pie"), ingredients: "• Chicken\n• Leeks\n• Creamy sauce\n• Puff pastry", instructions: "Make filling. Top with pastry. Bake." },
    { title: "Bibimbap", category: "Mains", image_url: getImg("Bibimbap"), ingredients: "• Rice\n• Spinach/Bean Sprouts/Carrots\n• Beef\n• Gochujang", instructions: "Sauté veg separately. Top rice. Mix with spicy sauce." },
    { title: "Beef & Green Bean Stir Fry", category: "Mains", image_url: getImg("Beef Green Bean Stir Fry"), ingredients: "• Beef strips\n• Green beans\n• Soy/Garlic sauce", instructions: "High heat stir fry." },
    { title: "Chorizo Chicken Pasta", category: "Mains", image_url: getImg("Chorizo Chicken Pasta"), ingredients: "• Chicken\n• Chorizo\n• Cream\n• Tomato paste", instructions: "Fry chorizo/chicken. Make rose sauce. Toss pasta." },
    { title: "Pumpkin Burnt Butter Pasta", category: "Mains", image_url: getImg("Pumpkin Sage Pasta"), ingredients: "• Pumpkin\n• Sage\n• Butter\n• Pine nuts", instructions: "Roast pumpkin. Brown butter with sage. Toss." },
    { title: "Pumpkin & Sausage Pasta", category: "Mains", image_url: getImg("Pumpkin Sausage Pasta"), ingredients: "• Italian Sausage\n• Pumpkin puree\n• Pasta shells", instructions: "Brown sausage. Add puree and cream. Mix." },
    { title: "Roasted Butterfly Chicken + Beans", category: "Mains", image_url: getImg("Roast Chicken Beans"), ingredients: "• Spatchcock Chicken\n• Canned Butter beans\n• Tomato", instructions: "Roast chicken over the beans so juices soak in." },
    { title: "Chicken Pot Pie", category: "Mains", image_url: getImg("Chicken Pot Pie"), ingredients: "• Chicken/Veg stew\n• Shortcrust base\n• Puff lid", instructions: "Double crust pie." },
    { title: "Lamb and Rosemary Pie", category: "Mains", image_url: getImg("Lamb Rosemary Pie"), ingredients: "• Lamb chunks\n• Rosemary gravy", instructions: "Slow cook filling. Bake in pastry." },
    {
        title: "Beef and Mushroom Pie",
        category: "Mains",
        link: "https://www.recipetineats.com/slow-cooked-beef-pie/",
        image_url: getImg("Beef Mushroom Pie"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    { title: "Chicken Biryani (Andy Eats)", category: "Mains", image_url: getImg("Chicken Biryani"), ingredients: "• Chicken (Yoghurt marinade)\n• Basmati Rice\n• Saffron\n• Fried Onions", instructions: "Parboil rice. Layer over raw chicken. Steam (dum) for 20 mins." },
    { title: "Steak & Chimichurri", category: "Mains", image_url: getImg("Steak Chimichurri"), ingredients: "• Steak\n• Polenta chips\n• Herb/Vinegar salsa", instructions: "Grill steak. Serve with fresh green sauce." },
    { title: "Thai Beef Salad", category: "Mains", image_url: getImg("Thai Beef Salad"), ingredients: "• Grilled Steak slices\n• Herbs (Mint/Coriander)\n• Lime/Fish sauce dressing", instructions: "Toss hot beef with cool salad and dressing." },
    { title: "Fried Rice", category: "Mains", image_url: getImg("Fried Rice"), ingredients: "• Old rice\n• Egg\n• Bacon/Pork\n• Peas", instructions: "Wok toss high heat." },
    { title: "Pea and Ham Soup", category: "Mains", image_url: getImg("Pea and Ham Soup"), ingredients: "• Split peas\n• Ham hock", instructions: "Boil until peas dissolve and ham falls off bone." },
    { title: "Chicken Feta Bean Bake", category: "Mains", image_url: getImg("Chicken Feta Bake"), ingredients: "• Chicken thighs\n• Feta block\n• Butter beans\n• Tomatoes", instructions: "One pan tray bake. 40 mins oven." },
    { title: "Bao Buns", category: "Mains", image_url: getImg("Pork Bao Buns"), ingredients: "• Frozen buns\n• Braised pork belly\n• Hoisin\n• Pickle", instructions: "Steam buns. Stuff with pork." },
    { title: "Homemade Pizza", category: "Mains", image_url: getImg("Homemade Pizza"), ingredients: "• Dough\n• Mozzarella\n• Basil", instructions: "High heat oven." },
    { title: "Moroccan Eggplant Pumpkin Salad", category: "Mains", image_url: getImg("Moroccan Salad"), ingredients: "• Roast Veg\n• Spices\n• Yoghurt dressing", instructions: "Warm salad platter." },
    { title: "Falafel & Hummus", category: "Mains", image_url: getImg("Falafel Plate"), ingredients: "• Chickpeas (soaked)\n• Herbs\n• Pita", instructions: "Fry falafel. Serve with hummus." },
    { title: "Moroccan Chicken Bake", category: "Mains", image_url: getImg("Moroccan Chicken Bake"), ingredients: "• Chicken\n• Chickpeas\n• Tomato\n• Fennel", instructions: "Tray bake with spices." },
    {
        title: "Pasta alla Norma",
        category: "Mains",
        link: "https://www.recipetineats.com/pasta-alla-norma-eggplant-pasta/",
        image_url: getImg("Pasta alla Norma"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },

    // --- SOUP ---
    {
        title: "Red Curry Pumpkin Soup",
        category: "Soup",
        link: "https://www.recipetineats.com/thai-coconut-pumpkin-soup/",
        image_url: getImg("Thai Pumpkin Soup"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    {
        title: "Chicken Pho",
        category: "Soup",
        link: "https://www.recipetineats.com/vietnamese-chicken-pho-soup-pho-ga/",
        image_url: getImg("Chicken Pho"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },
    { title: "Creamy Tuscan Chicken Soup", category: "Soup", link: "https://www.recipetineats.com/creamy-tuscan-chicken-soup/", image_url: getImg("Tuscan Chicken Soup"), ingredients: "See full recipe at RecipeTin Eats.", instructions: "Click card to view recipe." },
    { title: "Avgolemono", category: "Soup", image_url: getImg("Avgolemono"), ingredients: "• Chicken stock\n• Rice\n• Egg\n• Lemon", instructions: "Thicken soup with tempered egg/lemon mix." },
    { title: "Minestrone", category: "Soup", image_url: getImg("Minestrone"), ingredients: "• Veggies\n• Beans\n• Pasta\n• Tomato broth", instructions: "Hearty veg soup." },
    { title: "Green Goddess Soup", category: "Soup", image_url: getImg("Green Goddess Soup"), ingredients: "• Green veg (Broccoli/Peas)\n• Herbs\n• Yoghurt", instructions: "Boil and blend green." },
    { title: "Chinese Noodle Soup", category: "Soup", image_url: getImg("Chinese Noodle Soup"), ingredients: "• Broth\n• Noodles\n• Bok choy", instructions: "Simple comfort soup." },
    { title: "Wonton Noodle Soup", category: "Soup", image_url: getImg("Wonton Soup"), ingredients: "• Wontons\n• Noodles\n• Clear broth", instructions: "Boil wontons. Serve in broth." },
    {
        title: "Laksa",
        category: "Soup",
        link: "https://www.recipetineats.com/laksa-soup/",
        image_url: getImg("Laksa"),
        ingredients: "See full recipe at RecipeTin Eats.",
        instructions: "Click card to view recipe."
    },

    // --- SNACKS ---
    { title: "Edamame", category: "Snacks", image_url: getImg("Edamame"), ingredients: "• Soy beans\n• Salt", instructions: "Steam." },
    { title: "Bruschetta", category: "Snacks", image_url: getImg("Bruschetta"), ingredients: "• Tomato\n• Basil\n• Toast", instructions: "Dice tomato. Pile on garlic toast." },
    { title: "Dumplings", category: "Snacks", image_url: getImg("Dumplings"), ingredients: "• Dumplings\n• Soy dip", instructions: "Steam or Fry." },
    { title: "Korean Chicken Wings", category: "Snacks", image_url: getImg("Korean Wings"), ingredients: "• Wings\n• Gochujang glaze", instructions: "Double fry. Glaze." },
    { title: "Pumpkin Pine Nut Yoghurt", category: "Snacks", image_url: getImg("Pumpkin Dip"), ingredients: "• Roast pumpkin\n• Yoghurt\n• Nuts", instructions: "Dip." },

    // --- BREAKFAST ---
    { title: "Salmon Bagel", category: "Breakfast", image_url: getImg("Salmon Bagel"), ingredients: "• Bagel\n• Cream cheese\n• Salmon", instructions: "Toast and spread." },
    { title: "Turkish Eggs", category: "Breakfast", image_url: getImg("Cilbir"), ingredients: "• Yoghurt\n• Poached eggs\n• Chilli butter", instructions: "Eggs on garlic yoghurt." },
    { title: "Chilli Crisp Sandwich", category: "Breakfast", image_url: getImg("Chilli Crisp Sandwich"), ingredients: "• Bread\n• Egg\n• Chilli crisp", instructions: "Fry egg in chilli oil." },
    { title: "Shakshuka", category: "Breakfast", image_url: getImg("Shakshuka"), ingredients: "• Tomato sauce\n• Eggs\n• Spices", instructions: "Poach eggs in sauce." },

    // --- SWEETS ---
    { title: "Carrot Cake", category: "Sweets", image_url: getImg("Carrot Cake"), ingredients: "• Carrots\n• Walnuts\n• Cream cheese icing", instructions: "Moist spiced cake." },
    { title: "Peanut Butter Cups", category: "Sweets", image_url: getImg("Peanut Butter Cups"), ingredients: "• Chocolate\n• Peanut butter", instructions: "Layer and freeze." },
    { title: "Lemon Poppy Seed Cake", category: "Sweets", image_url: getImg("Lemon Poppy Seed Cake"), ingredients: "• Lemon\n• Poppy seeds\n• Curd", instructions: "Tea cake." },
    { title: "Pumpkin Cheesecake", category: "Sweets", image_url: getImg("Pumpkin Cheesecake"), ingredients: "• Pumpkin\n• Cream cheese\n• Biscuit base", instructions: "Baked cheesecake." },
    { title: "Banana Bread", category: "Sweets", image_url: getImg("Banana Bread"), ingredients: "• Bananas\n• Raspberries\n• White choc", instructions: "Loaf cake." },
    { title: "Sticky Date Pudding", category: "Sweets", image_url: getImg("Sticky Date Pudding"), ingredients: "• Dates\n• Caramel sauce", instructions: "Warm pudding." },
    { title: "Lemon Yoghurt Blueberry Cake", category: "Sweets", image_url: getImg("Blueberry Cake"), ingredients: "• Yoghurt\n• Blueberries", instructions: "Simple cake." },
    { title: "Blueberry Crumble", category: "Sweets", image_url: getImg("Blueberry Crumble"), ingredients: "• Berries\n• Oat crumble", instructions: "Bake until bubbly." },
    { title: "Tiramisu", category: "Sweets", link: "https://www.gourmettraveller.com.au/recipe/dessert/tiramisu-11058/", image_url: getImg("Tiramisu"), ingredients: "• Mascarpone\n• Coffee\n• Savoiardi", instructions: "Classic Italian." },
    { title: "Limoncello Tiramisu", category: "Sweets", image_url: getImg("Lemon Tiramisu"), ingredients: "• Lemon curd\n• Limoncello\n• Mascarpone", instructions: "Citrus twist on classic." },
    { title: "Coconut Cake", category: "Sweets", link: "https://sallysbakingaddiction.com/coconut-cake/", image_url: getImg("Coconut Cake"), ingredients: "• Coconut milk\n• Shredded coconut", instructions: "White fluffy cake." },
];
