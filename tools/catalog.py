"""Category + country definitions shared by build_db.py.

Edit this file to rename categories, change emoji, or tune keyword rules.
One-off fixes for individual foods belong in data/category_overrides.json.
"""
import re

# ---------------------------------------------------------------- venues
# (slug, label, emoji, blurb). Every food gets exactly ONE venue.
VENUES = [
    ("football", "Football Grounds", "⚽", "Pies, pints and terrace classics from the beautiful game."),
    ("ballpark", "Ballparks & Beyond", "🏟️", "Baseball, gridiron, hockey, cricket, racing and more."),
    ("international", "International Duty", "🌍", "World Cups, Euros and national-team matchdays."),
    ("gigs", "Gigs & Festivals", "🎸", "Concerts, fairs, markets and festival fields."),
    ("canteen", "Uni Canteens", "🎓", "Student mensa trays, rated by the Scrandle crowd."),
    ("outabout", "Out & About", "🚌", "Ferries, mystery spots and everything in between."),
    # Not in Scrandle (yet): filled by data/custom/manifest.csv
    ("fast_food", "Fast Food Chains", "🍟", "Drive-thrus, value menus and late-night bags."),
    ("diner", "Diners & Restaurants", "🍽️", "Sit-down comfort plates and booth classics."),
    ("fine_dining", "Fine Dining", "🥂", "Tasting menus, foams and tiny portions."),
    ("pub", "Pub Grub", "🍺", "Carveries, Sunday roasts and pub-quiz fuel."),
    ("cafe_bakery", "Cafés & Bakeries", "🥐", "Pastries, brunches and the good coffee."),
    ("street_food", "Street Food & Trucks", "🚚", "Stalls, carts, markets and food trucks."),
    ("takeaway", "Takeaways", "🥡", "Chippies, kebab shops, curry houses, pizza boxes."),
    ("school", "School Dinners", "🏫", "Lunch-lady classics and tray-bake nostalgia."),
    ("hospital", "Hospital Food", "🏥", "Ward trays: comfort or crisis?"),
    ("transport", "Planes & Trains", "✈️", "In-flight trays and buffet-car bargains."),
    ("meal_deal", "Petrol Stations & Meal Deals", "⛽", "Forecourt pasties and the sacred meal deal."),
    ("cinema_park", "Cinemas & Theme Parks", "🎢", "Popcorn buckets and queue-time snacks."),
    ("hotel", "Hotel Breakfasts & Buffets", "🛎️", "All-you-can-eat optimism."),
]

UNI = re.compile(r"\b(uni|universit|universität|hochschule|college|campus|dhbw|mensa|school function)|^(tu|fh|th|hbz|wfi)\b|technische|technical university|akademie|dehoga", re.I)
GIGS = re.compile(r"festival|concert|\btour\b|\bfest\b|fiesta|pride\b(?! park)|christmas market|easter show|\bshow\b|terror in the corn|music of|amphitheat|my chemical romance|\bbts\b|taylor swift|beyonc|coldplay|eras tour|county fair|state fair|\bfair\b", re.I)
INTERNATIONAL = re.compile(r"world cup(?! stadium)|\beuro 20\d\d|womens euro|\bolympics\b|\bfifa\b|asian cup|nations league|copa am[eé]rica|gold cup|afcon|africa cup|\bwcq\b|qualifier", re.I)
OUTABOUT = re.compile(r"unknown location|^somewhere|ferry|scrandle developer|^the pig and bean$|^bites by|dos gringos|frank's alley|^nationwide$|^usa$|footy curry|motorway|services$|airport|train|airline|flight", re.I)
OTHER_SPORT = re.compile(
    r"\b(yankees|mets|red sox|cubs|white sox|mariners|giants|tigers|guardians|pirates|reds|orioles|rockies|diamondbacks|dodgers|padres|astros|braves|phillies|nationals|brewers|twins|royals|athletics|blue jays|marlins|rays|angels"
    r"|cardinals|isotopes|yard goats|pickles|wahoo|missions|riverhawks|sabres|senators|blue jackets|walleye|blaze|clan|canucks|oilers|flames|maple leafs|canadiens|bruins|penguins|kraken|lightning|jazz|lakers|knicks|raiders|quakers|brisbane lions|swans|broncos|packers|chiefs|cowboys|steelers|49ers|seahawks|ravens|bengals|texans|colts|jaguars|buccaneers|vikings|commanders)\b"
    r"|\bfield\b|ball ?park|\bnats park\b|cricket|\brfc\b|rugby|circuit|race ?track|racecourse|raceway|speedway|sumo|kokugikan|aussie open|wimbledon|darts|snooker|\bnfl\b|\bnba\b|\bnhl\b|\bmlb\b|tcu football|college football|beaver stadium|lady raiders|ice hockey|arena, glasgow|barys arena|enterprise center|climate pledge|t-mobile arena|grand casino arena|sap garden|canada 60|belmont park|silverstone|suzuka"
    r"|everbank stadium|raymond james|arrowhead|lambeau|metlife|sofi stadium|lincoln financial|gillette stadium|secu stadium|war memorial stadium|canac stadium",
    re.I,
)
# Unmistakable football (soccer) clubs: checked before gigs/other sports.
SOCCER_STRONG = re.compile(
    r"\b(a\.?f\.?c|f\.?c|s\.?c|c\.?f|cfc|fk|sk|bk|if|il|ik|sv|tsv|vfb|vfl|fsv|vsc|afc|united|utd|athletic|wanderers|rovers|albion|hotspur|orlando pride|red stars|ol reign|futebol|clube|calcio"
    r"|pohang|go ahead eagles|pride park|allianz field|olympic fc|world cup stadium|scottish cup|women's super league|women v)\b",
    re.I,
)
# Words that, on both sides of "X v Y", make it a national-team match.
NATION_WORDS = {
    "england", "scotland", "wales", "ireland", "northern ireland", "usa", "canada", "mexico", "jamaica", "honduras",
    "brazil", "argentina", "ecuador", "australia", "new zealand", "japan", "korea", "dprk", "prc", "china",
    "cambodia", "philippines", "st lucia", "san marino", "norway", "sweden", "denmark", "germany", "france",
    "spain", "italy", "netherlands", "senegal", "morocco", "qatar", "belgium", "egypt", "portugal", "poland",
    "croatia", "serbia", "switzerland", "austria", "tunisia", "curacao", "iceland", "finland", "faroe islands",
}


# ---------------------------------------------------------------- dishes
# (slug, label, emoji, blurb, regex). Multi-label: a food can sit in several.
DISHES = [
    ("burger", "Burgers", "🍔", "Smashed, stacked and sauced.",
     r"burger|whopper|\bslider|patty|\bsmash"),
    ("hotdog", "Hot Dogs & Sausages", "🌭", "Bangers, brats and the humble dog.",
     r"hot ?dog|\bdogs?\b|sausage|bratwurst|\bbrat\b|wurst|frankfurter|chorizo|kie[lł]basa|banger|\bpolish\b|düsseldorfer|foot ?long|corn ?dog|coney|glizz|wiener|bratwust|dognut|kransky|\bdawg|choripan|pigs in blankets|spanferkel"),
    ("pie", "Pies & Pastries", "🥧", "Golden lids, flaky crusts and gravy floods.",
     r"\bpies?\b|pasty|pasties|sausage roll|pastry|empanada|quiche|bridie|steak bake|b[öo]rek|samosa|pastel\b"),
    ("chips", "Chips & Loaded Fries", "🍟", "Fries, chips, wedges and everything loaded.",
     r"\bchips\b|fries|frites|pommes|wedges|poutine|tater|hash ?browns?|loaded|potato(es)?\b"),
    ("chicken", "Chicken", "🍗", "Wings, tenders, karaage and the parm.",
     r"chicken|\bwings?\b|tenders|nugget|karaage|poultry|yakitori|goujon|\bparmo?\b"),
    ("curry", "Curry & Spice", "🍛", "Tikka, masala, katsu and chip-shop curry sauce.",
     r"curry|tikka|masala|korma|balti|jalfrezi|\bdh?al\b|biryani|aloo|khichdi|vindaloo|rendang|bhaji|madras|tandoori|paneer|katsu"),
    ("pizza_pasta", "Pizza & Pasta", "🍕", "Slices, spaghetti, spätzle and mac.",
     r"pizza|pasta|spaghetti|lasagn|penne|macaroni|mac ?(n'?|and|&) ?cheese|gnocchi|ravioli|tortellini|carbonara|bolognese|sp[äa]tzle|calzone|fusilli|tagliatelle"),
    ("mexican", "Tacos & Tex-Mex", "🌮", "Tacos, nachos, burritos and birria.",
     r"taco|burrito|nacho|quesadilla|enchilada|fajita|tamale|elote|birria|carnitas|asada|chimichanga|tortilla|chalupa|mexican"),
    ("asian", "Noodles, Rice & Asian Plates", "🍜", "Ramen, gyoza, bao and bento.",
     r"ramen|udon|soba|noodle|sushi|gyoza|dumpling|\bbao\b|bibimbap|kimchi|teriyaki|\bpho\b|pad thai|satay|donburi|bulgogi|dim sum|spring roll|takoyaki|okonomiyaki|onigiri|bento|tteok|korean|japanese|\bthai\b|chinese|fried rice|rice bowl|yakisoba|katsu|karaage|\bnasi\b|bakso|banh|yakitori|nigiri|yangnyeom|tongdak|\bmomo"),
    ("kebab_wrap", "Kebabs & Wraps", "🥙", "Doner, gyros, shawarma and the trusty wrap.",
     r"kebab|kebap|gyros?\b|yiros|d[öo]ner|shawarma|\bwraps?\b|\bpitt?a\b|souvlaki|falafel|burek|fatayer"),
    ("sandwich", "Sandwiches & Rolls", "🥪", "Butties, baps, subs and cheesesteaks.",
     r"sandwich|\bsub\b|(?<!spring )(?<!sausage )(?<!egg )\brolls?\b|\bbaps?\b|butty|butties|barm|toastie|panini|baguette|\bcob\b|hoagie|cheesesteak|po'? ?boy|bagel|brötchen|semmel|bread with|\bbuns?\b|grilled cheese|croissant|broodje|zs[ií]ros|sziros|runza|\bmozz\b"),
    ("breakfast", "Breakfast", "🍳", "Fry-ups, rolls and morning-after scran.",
     r"breakfast|bacon|\beggs?\b|full english|fry[ -]?up|pancakes?|waffles?|porridge|black pudding|beans on toast|omelet"),
    ("hearty", "Hearty Plates", "🥘", "Roasts, stews, schnitzels and gravy-heavy mains.",
     r"\broast|dinner|\bstew|goulash|gulasch|schnitzel|\bsteak\b(?! pie| bake)|brisket|\bribs?\b|pulled (pork|beef)|\bmash|meatball|k[öo]tt?bullar|casserole|hotpot|scouse|haggis|chil+i con carne|roulade|platter|\bplate\b|risotto|paella|lamb|pork belly|chicharr|mixed meat|barbecue|\bbbq\b|ragout|stroganoff|skewer|kebab|kef?ta\b|kafta|turkey leg|pierogi|stadionplatte|\bham\b|lunch box|\bbox\b|shortrib|short rib|shredded duck|lentils|feij[aã]o|entrevero|flammkuchen|cannel+oni|smothered|yorkshire pudding"),
    ("seafood", "Fish & Seafood", "🐟", "Fish suppers, scampi, prawns and poke.",
     r"\bfish|\bcod\b|haddock|prawn|shrimp|scampi|calamari|squid|\bcrab|lobster|salmon|tuna|mussel|\bclams?\b|seafood|\bpoke\b|ceviche|plaice|whitebait|octopus|\beel\b|oysters?|scallops?"),
    ("sweet", "Sweet Treats", "🍩", "Doughnuts, sundaes, churros and cake.",
     r"\bcakes?\b|cupcake|donut|doughnut|ice ?cream|churro|brownie|cookie|cr[eê]pe|(?<!black )(?<!yorkshire )pudding|dessert|chocolate|sundae|\btart\b|muffin|\bsweets?\b|candy|cheesecake|flapjack|\bscones?\b|fudge|cinnamon|germkn[öo]del|strudel|biscoff|gelato|sorbet|waffles?|crumble|custard|tiramisu|macaron|apple pie|slushie|milkshake|\bshake\b|soft serve|kaiserschmarrn|kräppel|br[uû]l[ée]e|\bcones?\b|bananas foster|fruit|a[çc]a[ií]|\bmars\b|kit ?kat|m&m|sponge|oreos?|pick and mix|aeros?\b|lolly|cannoli|sticky rice and coconut"),
    ("veggie", "Veggie & Vegan", "🥗", "Plant-based plates and salad-adjacent scran.",
     r"vegan|vegetarian|veggie|\btofu|halloumi|falafel|plant[- ]based|\bsalad|vegetable|quorn|seitan|\bsoy\b|paneer|jackfruit|cauliflower|mushroom|aloo gobi|khichdi"),
    ("drink_combo", "Drinks & Pint Combos", "🍻", "Pints, Bovrils, slushies and anything with a drink on the side.",
     r"\bpints?\b|\bbeers?\b|lager|\bcoke\b|pepsi|coffee|\btea\b|bovril|lemonade|\bdrinks?\b|\bwine\b|cider|cocktail|\bjuice|\bsoda\b|amstel|carlsberg|guinness|heineken|moretti|\bale\b(?! pie)|shandy|irn[- ]bru|fanta|sprite|hot chocolate|shimmer"
     r"|can of|bottle of|michelada|daiquiri|pina colada|margarita|vodka|\bslush|\bpunch\b|\bipa\b|stella|coors|\bwater\b|beverage|broken heels|negra modelo"),
    ("snack", "Snacks & Sides", "🥨", "Pretzels, popcorn, pickles and nibbles.",
     r"pretzel|brezel|popcorn|pickle|peanut|crisps|\bnuts\b|onion rings|mozzarella sticks|\bcorn\b|garlic bread|olives|cheese curds|edamame|nibbles|fried banana|plantain|jerky|pork scratchings|crackers|mushy peas|minty peas|\bpeas in|oatcake|brussels sprouts|garlic toast"),
]
MYSTERY = ("mystery", "Mystery Scran", "❓", "We genuinely couldn't tell you what this is.")


# ---------------------------------------------------------------- regions
REGIONS = [
    ("uk_ire", "UK & Ireland", "🇬🇧", "From the Football League to the Irish Sea."),
    ("europe", "Europe", "🇪🇺", "Bratwurst to bifanas."),
    ("americas", "The Americas", "🌎", "Ballpark franks, birria and Brazilian churrasco."),
    ("asia_pacific", "Asia & Pacific", "🌏", "Bento, meat pies and stadium satay."),
    ("africa_me", "Africa & Middle East", "🌍", "Matchday scran from Cairo to Doha."),
]
WORLD = ("world", "Somewhere on Earth", "🧭", "Location unknown. Vibes known.")

# FIFA-style codes used by Scrandle -> (name, region, ISO-3166 alpha-2 for flag emoji or None)
COUNTRIES = {
    "ENG": ("England", "uk_ire", None), "SCO": ("Scotland", "uk_ire", None), "WAL": ("Wales", "uk_ire", None),
    "NIR": ("Northern Ireland", "uk_ire", None), "IRL": ("Ireland", "uk_ire", "IE"), "IOM": ("Isle of Man", "uk_ire", "IM"),
    "GER": ("Germany", "europe", "DE"), "AUT": ("Austria", "europe", "AT"), "BEL": ("Belgium", "europe", "BE"),
    "BUL": ("Bulgaria", "europe", "BG"), "CRO": ("Croatia", "europe", "HR"), "CYP": ("Cyprus", "europe", "CY"),
    "CZE": ("Czechia", "europe", "CZ"), "DEN": ("Denmark", "europe", "DK"), "ESP": ("Spain", "europe", "ES"),
    "SPA": ("Spain", "europe", "ES"), "EST": ("Estonia", "europe", "EE"), "FIN": ("Finland", "europe", "FI"),
    "FRA": ("France", "europe", "FR"), "FRO": ("Faroe Islands", "europe", "FO"), "GRE": ("Greece", "europe", "GR"),
    "GRL": ("Greenland", "americas", "GL"), "HUN": ("Hungary", "europe", "HU"), "ISL": ("Iceland", "europe", "IS"),
    "ITA": ("Italy", "europe", "IT"), "LIE": ("Liechtenstein", "europe", "LI"), "LVA": ("Latvia", "europe", "LV"),
    "MKD": ("North Macedonia", "europe", "MK"), "MLT": ("Malta", "europe", "MT"), "NED": ("Netherlands", "europe", "NL"),
    "NOR": ("Norway", "europe", "NO"), "POL": ("Poland", "europe", "PL"), "POR": ("Portugal", "europe", "PT"),
    "ROU": ("Romania", "europe", "RO"), "RUS": ("Russia", "europe", "RU"), "SMR": ("San Marino", "europe", "SM"),
    "SRB": ("Serbia", "europe", "RS"), "SUI": ("Switzerland", "europe", "CH"), "SVK": ("Slovakia", "europe", "SK"),
    "SWE": ("Sweden", "europe", "SE"), "TUR": ("Türkiye", "europe", "TR"), "KAZ": ("Kazakhstan", "asia_pacific", "KZ"),
    "TKM": ("Turkmenistan", "asia_pacific", "TM"),
    "USA": ("USA", "americas", "US"), "CAN": ("Canada", "americas", "CA"), "MEX": ("Mexico", "americas", "MX"),
    "BRA": ("Brazil", "americas", "BR"), "ARG": ("Argentina", "americas", "AR"), "BOL": ("Bolivia", "americas", "BO"),
    "BLZ": ("Belize", "americas", "BZ"), "BRB": ("Barbados", "americas", "BB"), "CHI": ("Chile", "americas", "CL"),
    "COL": ("Colombia", "americas", "CO"), "CRC": ("Costa Rica", "americas", "CR"), "GUA": ("Guatemala", "americas", "GT"),
    "HON": ("Honduras", "americas", "HN"), "JAM": ("Jamaica", "americas", "JM"), "PAR": ("Paraguay", "americas", "PY"),
    "PER": ("Peru", "americas", "PE"), "SLV": ("El Salvador", "americas", "SV"), "URU": ("Uruguay", "americas", "UY"),
    "VEN": ("Venezuela", "americas", "VE"),
    "AUS": ("Australia", "asia_pacific", "AU"), "NZL": ("New Zealand", "asia_pacific", "NZ"), "JPN": ("Japan", "asia_pacific", "JP"),
    "KOR": ("South Korea", "asia_pacific", "KR"), "CHN": ("China", "asia_pacific", "CN"), "TAI": ("Taiwan", "asia_pacific", "TW"),
    "IDN": ("Indonesia", "asia_pacific", "ID"), "MAS": ("Malaysia", "asia_pacific", "MY"), "SGP": ("Singapore", "asia_pacific", "SG"),
    "SIN": ("Singapore", "asia_pacific", "SG"), "THA": ("Thailand", "asia_pacific", "TH"), "VIE": ("Vietnam", "asia_pacific", "VN"),
    "CAM": ("Cambodia", "asia_pacific", "KH"), "IND": ("India", "asia_pacific", "IN"),
    "EGY": ("Egypt", "africa_me", "EG"), "QAT": ("Qatar", "africa_me", "QA"), "RSA": ("South Africa", "africa_me", "ZA"),
    "TAN": ("Tanzania", "africa_me", "TZ"),
}
SUBDIVISION_FLAGS = {"ENG": "gbeng", "SCO": "gbsct", "WAL": "gbwls"}


def flag_emoji(code: str) -> str:
    """Emoji flag for a Scrandle country code ("" if unknown)."""
    if code in SUBDIVISION_FLAGS:  # 🏴 + tag sequence
        tag = SUBDIVISION_FLAGS[code]
        return "\U0001F3F4" + "".join(chr(0xE0000 + ord(c)) for c in tag) + "\U000E007F"
    if code == "NIR":
        return "\U0001F1EC\U0001F1E7"  # no official NI emoji; use GB
    info = COUNTRIES.get(code)
    if not info or not info[2]:
        return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in info[2])


# ---------------------------------------------------------------- price tiers (GBP, Scrandle's base currency)
PRICE_TIERS = [
    ("bargain", "Bargain Bites", "🪙", "Under £4. Change from a fiver.", 0.01, 4.0),
    ("standard", "Matchday Standard", "💷", "£4–£9. The usual damage.", 4.0, 9.0),
    ("splurge", "Splurge Scran", "💎", "£9 and up. Worth it?", 9.0, 10_000.0),
    ("free", "On The House", "🎁", "Free, included or comped.", 0.0, 0.0),
]

