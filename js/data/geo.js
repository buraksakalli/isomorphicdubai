// Geographic source data, in [lat, lon]. APPROXIMATE (general knowledge, not surveyed) — this is an
// illustrated map, not a navigational one. Owned by the "world/terrain" agent; other modules import it.
// Shapes and export names are a CONTRACT — keep them stable.

/** Mainland coastline, SW -> NE. Land lies to the SE (right-hand side walking NE). */
export const COAST = [
  [24.935, 54.98], [24.962, 55.005], [24.985, 55.03], [25.008, 55.058], [25.03, 55.085],
  [25.048, 55.105], [25.062, 55.12], [25.072, 55.128], [25.08, 55.134], [25.09, 55.142],
  [25.1, 55.149], [25.11, 55.158], [25.122, 55.168], [25.134, 55.1795], [25.1405, 55.1893], [25.147, 55.1935],
  [25.158, 55.203], [25.172, 55.216], [25.186, 55.228], [25.2, 55.239], [25.214, 55.248],
  [25.228, 55.254], [25.242, 55.261], [25.254, 55.267], [25.262, 55.273], [25.268, 55.282],
  [25.272, 55.291], [25.277, 55.299], [25.282, 55.309], [25.287, 55.321], [25.291, 55.334],
  [25.296, 55.347], [25.304, 55.358], [25.315, 55.368], [25.33, 55.381],
];

/** Dubai Creek centreline from the mouth (Shindagha) inland, width in metres per vertex. */
export const CREEK = [
  [25.2715, 55.2905, 260], [25.2672, 55.2962, 230], [25.2632, 55.3008, 220], [25.2575, 55.3045, 260],
  [25.2515, 55.3115, 300], [25.2455, 55.3185, 330], [25.2395, 55.3245, 360], [25.2325, 55.3295, 420],
  [25.2245, 55.3335, 450], [25.2155, 55.3365, 420], [25.2065, 55.3385, 380], [25.1985, 55.3365, 320],
];

/** Ras Al Khor lagoon / wildlife sanctuary (water + mangrove), polygon. */
export const RAS_AL_KHOR = [
  [25.2005, 55.3315], [25.1992, 55.3372], [25.1958, 55.3418], [25.1912, 55.3446], [25.1868, 55.3452], [25.1832, 55.3428],
  [25.1838, 55.3382], [25.1872, 55.3352], [25.1915, 55.3318], [25.1962, 55.3296],
];

/** Business Bay canal + Dubai Water Canal from the creek end to the sea at Jumeirah, width in metres. */
export const CANAL = [
  [25.1985, 55.3365, 140], [25.1925, 55.3215, 130], [25.1875, 55.3045, 120], [25.1845, 55.2895, 110],
  [25.1855, 55.2745, 100], [25.1885, 55.2615, 90], [25.1915, 55.2515, 85], [25.1955, 55.2435, 85], [25.1995, 55.2385, 90],
];

/**
 * Offshore islands. Each: { id, name:{en,ar}, kind, ...shape }.
 * kind 'palm' is generated procedurally from base (trunk start on the coast), crown (trunk end), fronds, crescent radius.
 * kind 'poly' uses `pts`. kind 'world' is The World archipelago (generated as many small islands in an outline).
 */
export const ISLANDS = [
  { id: 'palm-jumeirah', name: { en: 'Palm Jumeirah', ar: 'نخلة جميرا' }, kind: 'palm',
    base: [25.1035, 55.1515], crown: [25.1205, 55.1305], fronds: 16, frondLen: 1.25, crescentR: 2.65, crescentW: 0.2 },
  { id: 'palm-jebel-ali', name: { en: 'Palm Jebel Ali', ar: 'نخلة جبل علي' }, kind: 'palm',
    base: [24.9845, 55.0295], crown: [25.0035, 55.0065], fronds: 16, frondLen: 1.45, crescentR: 2.95, crescentW: 0.22 },
  { id: 'the-world', name: { en: 'The World Islands', ar: 'جزر العالم' }, kind: 'world',
    center: [25.2245, 55.1705], rx: 4.2, ry: 3.0 },
  { id: 'bluewaters', name: { en: 'Bluewaters Island', ar: 'جزيرة بلوواترز' }, kind: 'poly',
    pts: [[25.0825, 55.1175], [25.0815, 55.1235], [25.0775, 55.1245], [25.0765, 55.1185], [25.0795, 55.1155]] },
  { id: 'burj-al-arab-island', name: { en: 'Burj Al Arab island', ar: 'جزيرة برج العرب' }, kind: 'poly', ground: 'plaza', beach: false,
    pts: [[25.1425, 55.1840], [25.1418, 55.1866], [25.1404, 55.1866], [25.1398, 55.1846], [25.1410, 55.1832]] },
  { id: 'dubai-islands', name: { en: 'Dubai Islands', ar: 'جزر دبي' }, kind: 'poly',
    pts: [[25.2955, 55.2885], [25.3105, 55.2985], [25.3165, 55.3165], [25.3085, 55.3325], [25.2975, 55.3275], [25.2905, 55.3105], [25.2885, 55.2975]] },
  { id: 'la-mer', name: { en: 'La Mer', ar: 'لا مير' }, kind: 'poly',
    pts: [[25.2335, 55.2525], [25.2365, 55.2495], [25.2395, 55.2525], [25.2375, 55.2575], [25.2345, 55.2575]] },
  { id: 'port-rashid', name: { en: 'Mina Rashid', ar: 'ميناء راشد' }, kind: 'poly', beach: false,
    pts: [[25.2585, 55.2665], [25.2665, 55.2625], [25.2725, 55.2705], [25.2705, 55.2815], [25.2635, 55.2785]] },
  { id: 'jebel-ali-port', name: { en: 'Jebel Ali Port', ar: 'ميناء جبل علي' }, kind: 'poly',
    beach: false,
    pts: [[24.9965, 55.0455], [25.0135, 55.0555], [25.0245, 55.0705], [25.0175, 55.0845], [25.0065, 55.0725], [24.9985, 55.0585]] },
];

/** Roads. kind: 'highway' (6–8 lanes), 'major' (4–6), 'local'. width in metres. */
export const ROADS = [
  { id: 'e11', name: { en: 'Sheikh Zayed Road', ar: 'شارع الشيخ زايد' }, kind: 'highway', width: 70, pts: [
    [24.875, 54.995], [24.915, 55.035], [24.948, 55.07], [24.9775, 55.0885], [25.0015, 55.0965], [25.0262, 55.1022],
    [25.0448, 55.1172], [25.0575, 55.1265], [25.0705, 55.1378], [25.0805, 55.1468], [25.0892, 55.1578],
    [25.1022, 55.1728], [25.108, 55.183], [25.12, 55.2], [25.14, 55.215], [25.16, 55.232], [25.18, 55.252],
    [25.193, 55.265], [25.205, 55.274], [25.217, 55.28], [25.228, 55.287], [25.236, 55.296]] },
  { id: 'e44', name: { en: 'Al Khail Road', ar: 'شارع الخيل' }, kind: 'highway', width: 55, pts: [
    [25.04, 55.19], [25.07, 55.205], [25.1, 55.225], [25.13, 55.25], [25.155, 55.272], [25.172, 55.29],
    [25.19, 55.312], [25.205, 55.33], [25.22, 55.345], [25.235, 55.36]] },
  { id: 'e311', name: { en: 'Sheikh Mohammed bin Zayed Road', ar: 'شارع الشيخ محمد بن زايد' }, kind: 'highway', width: 60, pts: [
    [24.9, 55.1], [24.96, 55.17], [25.01, 55.22], [25.06, 55.27], [25.1, 55.31], [25.14, 55.35],
    [25.18, 55.39], [25.22, 55.425], [25.26, 55.45]] },
  { id: 'e611', name: { en: 'Emirates Road', ar: 'شارع الإمارات' }, kind: 'highway', width: 55, pts: [
    [24.87, 55.2], [24.93, 55.27], [24.99, 55.33], [25.05, 55.38], [25.1, 55.42], [25.14, 55.45]] },
  { id: 'jbr', name: { en: 'Jumeirah Beach Road', ar: 'شارع جميرا' }, kind: 'major', width: 30, pts: [
    [25.096, 55.155], [25.115, 55.168], [25.13, 55.181], [25.142, 55.195], [25.156, 55.208], [25.17, 55.221],
    [25.185, 55.233], [25.2, 55.244], [25.214, 55.253], [25.228, 55.259], [25.242, 55.266], [25.255, 55.274], [25.262, 55.285]] },
  { id: 'al-wasl', name: { en: 'Al Wasl Road', ar: 'شارع الوصل' }, kind: 'major', width: 25, pts: [
    [25.135, 55.198], [25.155, 55.216], [25.175, 55.232], [25.195, 55.248], [25.215, 55.262], [25.232, 55.272]] },
  { id: 'hessa', name: { en: 'Hessa Street', ar: 'شارع حصة' }, kind: 'major', width: 30, pts: [
    [25.098, 55.158], [25.085, 55.18], [25.07, 55.205], [25.055, 55.23]] },
  { id: 'umm-suqeim', name: { en: 'Umm Suqeim Street', ar: 'شارع أم سقيم' }, kind: 'major', width: 30, pts: [
    [25.145, 55.192], [25.13, 55.21], [25.115, 55.235], [25.1, 55.26], [25.085, 55.285]] },
  { id: 'al-khaleej', name: { en: 'Al Khaleej Road', ar: 'شارع الخليج' }, kind: 'major', width: 30, pts: [
    [25.262, 55.285], [25.27, 55.293], [25.278, 55.303], [25.284, 55.318], [25.289, 55.333], [25.296, 55.35]] },
  { id: 'garhoud', name: { en: 'Al Garhoud Bridge & Airport Road', ar: 'جسر القرهود وشارع المطار' }, kind: 'major', width: 40, pts: [
    [25.228, 55.297], [25.232, 55.312], [25.238, 55.328], [25.243, 55.343],
    // follows the airport's south-west perimeter towards Al Rashidiya (it never crosses the runways)
    [25.2442, 55.353], [25.2375, 55.3666], [25.2319, 55.3783], [25.227, 55.3905]] },
  { id: 'maktoum-bridge', name: { en: 'Al Maktoum Bridge', ar: 'جسر آل مكتوم' }, kind: 'major', width: 35, pts: [
    [25.236, 55.296], [25.243, 55.305], [25.249, 55.313], [25.256, 55.322], [25.264, 55.332]] },
  { id: 'ittihad', name: { en: 'Al Ittihad Road', ar: 'شارع الاتحاد' }, kind: 'highway', width: 55, pts: [
    [25.256, 55.322], [25.268, 55.342], [25.28, 55.36], [25.295, 55.378], [25.31, 55.392], [25.33, 55.405]] },
  { id: 'ras-al-khor', name: { en: 'Ras Al Khor Road', ar: 'شارع رأس الخور' }, kind: 'highway', width: 50, pts: [
    [25.18, 55.3], [25.19, 55.33], [25.198, 55.36], [25.205, 55.39], [25.215, 55.42]] },
  { id: 'mbr-boulevard', name: { en: 'Mohammed Bin Rashid Boulevard', ar: 'بوليفارد محمد بن راشد' }, kind: 'major', width: 22, loop: true, pts: [
    // approximate loop around the Downtown core (Burj Khalifa, Burj Lake, The Dubai Mall + car parks); the
    // north-east arc is kept clear of the mall block modelled in js/world/landmarks/downtown.js
    [25.2008, 55.2705], [25.2016, 55.2755], [25.2015, 55.2805], [25.1995, 55.2842], [25.1958, 55.2843], [25.1926, 55.2812],
    [25.1915, 55.2760], [25.1926, 55.2714], [25.1953, 55.2690], [25.1986, 55.2687], [25.2008, 55.2705]] },
  { id: 'palm-trunk', name: { en: 'Palm Jumeirah Trunk', ar: 'جذع نخلة جميرا' }, kind: 'major', width: 30, pts: [
    [25.0985, 55.1565], [25.1035, 55.1515], [25.1205, 55.1305]] },
];

/**
 * Dubai Metro. Stations approximate. Red Line stations from Max to UAE Exchange sit on the alignment that
 * js/life/metro.js derives from Sheikh Zayed Road (ROADS 'e11', offset beside the carriageway); they are
 * snapped at runtime too, so these coordinates mainly place labels / search results.
 */
export const METRO = [
  { id: 'red', name: { en: 'Red Line', ar: 'الخط الأحمر' }, color: '#d62d3a', stations: [
    ['Centrepoint', 'سنتربوينت', 25.2303, 55.3907], ['Emirates', 'طيران الإمارات', 25.2415, 55.3651],
    ['Airport Terminal 3', 'مبنى المطار 3', 25.2486, 55.353], ['Airport Terminal 1', 'مبنى المطار 1', 25.2497, 55.3449],
    ['GGICO', 'جي جي كو', 25.2527, 55.3398], ['Deira City Centre', 'ديرة سيتي سنتر', 25.2547, 55.3301],
    ['Union', 'الاتحاد', 25.2665, 55.3143], ['BurJuman', 'برجمان', 25.2546, 55.3047],
    ['ADCB', 'بنك أبوظبي التجاري', 25.2448, 55.2985], ['Max', 'ماكس', 25.2335, 55.2922],
    ['World Trade Centre', 'المركز التجاري العالمي', 25.2257, 55.2846], ['Emirates Towers', 'أبراج الإمارات', 25.2175, 55.2797],
    ['Financial Centre', 'المركز المالي', 25.2107, 55.2764], ['Burj Khalifa / Dubai Mall', 'برج خليفة / دبي مول', 25.2006, 55.2704],
    ['Business Bay', 'الخليج التجاري', 25.1902, 55.2617], ['Noor Bank', 'نور بنك', 25.1559, 55.2277],
    ['FGB', 'بنك الخليج الأول', 25.1454, 55.2187], ['Mall of the Emirates', 'مول الإمارات', 25.1214, 55.2006],
    ['Sharaf DG', 'شرف دي جي', 25.1094, 55.1843], ['Dubai Internet City', 'مدينة دبي للإنترنت', 25.1028, 55.1729],
    ['Al Khail', 'الخيل', 25.0897, 55.1577], ['Sobha Realty', 'شوبا العقارية', 25.0811, 55.1468],
    ['DMCC', 'مركز دبي للسلع المتعددة', 25.071, 55.1376], ['Jebel Ali', 'جبل علي', 25.058, 55.1263],
    ['Ibn Battuta', 'ابن بطوطة', 25.0452, 55.1169], ['Energy', 'الطاقة', 25.0261, 55.1016],
    ['Danube', 'دانوب', 25.0012, 55.0959], ['UAE Exchange', 'الإمارات للصرافة', 24.9789, 55.0886],
  ] },
  { id: 'green', name: { en: 'Green Line', ar: 'الخط الأخضر' }, color: '#2e9e4f', stations: [
    ['Etisalat', 'اتصالات', 25.2865, 55.4005], ['Al Qusais', 'القصيص', 25.2735, 55.3875],
    ['Dubai Airport Free Zone', 'المنطقة الحرة بمطار دبي', 25.2655, 55.3745], ['Al Nahda', 'النهدة', 25.2745, 55.3685],
    ['Stadium', 'الاستاد', 25.2775, 55.3615], ['Al Qiyadah', 'القيادة', 25.2775, 55.3505],
    ['Abu Hail', 'أبو هيل', 25.2755, 55.3415], ['Abu Baker Al Siddique', 'أبو بكر الصديق', 25.2705, 55.3335],
    ['Salah Al Din', 'صلاح الدين', 25.2695, 55.3245], ['Union', 'الاتحاد', 25.2665, 55.3143],
    ['Baniyas Square', 'ساحة بني ياس', 25.2691, 55.3075], ['Gold Souq', 'سوق الذهب', 25.2745, 55.3005],
    ['Al Ras', 'الراس', 25.2683, 55.2944], ['Al Ghubaiba', 'الغبيبة', 25.2617, 55.2894],
    ['Sharaf DG (Al Fahidi)', 'الفهيدي', 25.2589, 55.2976], ['BurJuman', 'برجمان', 25.2546, 55.3047],
    ['Oud Metha', 'عود ميثاء', 25.2427, 55.3164], ['Dubai Healthcare City', 'مدينة دبي الطبية', 25.231, 55.3224],
    ['Al Jadaf', 'الجداف', 25.2252, 55.333], ['Creek', 'الخور', 25.2193, 55.3389],
  ] },
  // Route 2020: Red Line branch from the Jebel Ali interchange to Expo 2020 (opened 2021). Drawn as its own shuttle
  // with a separate platform beside the Red Line station. All coordinates APPROXIMATE. Intermediate stations whose
  // names / Arabic spellings could not be confirmed (The Gardens, Discovery Gardens, Jumeirah Golf Estates) are omitted.
  { id: 'route2020', name: { en: 'Red Line (Route 2020)', ar: 'الخط الأحمر (مسار 2020)' }, color: '#d62d3a', stations: [
    ['Jebel Ali', 'جبل علي', 25.0572, 55.1275],
    ['Al Furjan', 'الفرجان', 25.030, 55.145],
    ['Dubai Investments Park', 'مجمع دبي للاستثمار', 24.987, 55.163],
    ['Expo 2020', 'إكسبو 2020', 24.963, 55.146],
  ] },
];

/**
 * Districts: circles (centre, radius km). zoneAt() returns the FIRST match in this order, so specific
 * districts come before broad ones. kind drives procedural building generation:
 *   supertall | highrise | midrise | villa | oldtown | heritage | industrial | port | airport | park | golf | mixed | expo | wetland
 */
export const DISTRICTS = [
  { id: 'al-fahidi', name: { en: 'Al Fahidi Historical District', ar: 'حي الفهيدي التاريخي' }, kind: 'heritage', c: [25.2635, 55.2995], r: 0.28 },
  { id: 'jbr', name: { en: 'Jumeirah Beach Residence', ar: 'جميرا بيتش ريزيدنس' }, kind: 'highrise', c: [25.0785, 55.1325], r: 0.42 },
  { id: 'downtown', name: { en: 'Downtown Dubai', ar: 'وسط مدينة دبي' }, kind: 'supertall', c: [25.1965, 55.2765], r: 0.95 },
  { id: 'difc', name: { en: 'DIFC', ar: 'مركز دبي المالي العالمي' }, kind: 'highrise', c: [25.2115, 55.2815], r: 0.55 },
  { id: 'szr', name: { en: 'Sheikh Zayed Road Towers', ar: 'أبراج شارع الشيخ زايد' }, kind: 'highrise', c: [25.2215, 55.2825], r: 0.65 },
  { id: 'business-bay', name: { en: 'Business Bay', ar: 'الخليج التجاري' }, kind: 'highrise', c: [25.1855, 55.2735], r: 1.05 },
  { id: 'marina', name: { en: 'Dubai Marina', ar: 'دبي مارينا' }, kind: 'supertall', c: [25.0815, 55.1415], r: 0.95 },
  { id: 'jlt', name: { en: 'Jumeirah Lakes Towers', ar: 'أبراج بحيرات جميرا' }, kind: 'highrise', c: [25.0705, 55.1455], r: 0.75 },
  { id: 'creek-harbour', name: { en: 'Dubai Creek Harbour', ar: 'مرسى خور دبي' }, kind: 'highrise', c: [25.2045, 55.3495], r: 0.75 },
  { id: 'port-rashid-d', name: { en: 'Mina Rashid', ar: 'ميناء راشد' }, kind: 'port', c: [25.2665, 55.2735], r: 0.55 },
  { id: 'bur-dubai', name: { en: 'Bur Dubai', ar: 'بر دبي' }, kind: 'oldtown', c: [25.2555, 55.2925], r: 1.0 },
  { id: 'deira', name: { en: 'Deira', ar: 'ديرة' }, kind: 'oldtown', c: [25.2705, 55.3155], r: 1.5 },
  { id: 'karama', name: { en: 'Al Karama', ar: 'الكرامة' }, kind: 'midrise', c: [25.2455, 55.3025], r: 0.75 },
  { id: 'satwa', name: { en: 'Al Satwa', ar: 'السطوة' }, kind: 'midrise', c: [25.2305, 55.2735], r: 0.75 },
  { id: 'zabeel', name: { en: 'Zabeel Park', ar: 'حديقة زعبيل' }, kind: 'park', c: [25.2325, 55.2975], r: 0.4 },
  { id: 'safa', name: { en: 'Safa Park', ar: 'حديقة الصفا' }, kind: 'park', c: [25.1855, 55.2505], r: 0.4 },
  { id: 'creek-park', name: { en: 'Creek Park', ar: 'حديقة الخور' }, kind: 'park', c: [25.2355, 55.3315], r: 0.45 },
  { id: 'jadaf', name: { en: 'Al Jaddaf & Healthcare City', ar: 'الجداف ومدينة دبي الطبية' }, kind: 'midrise', c: [25.2255, 55.3255], r: 0.7 },
  { id: 'garhoud', name: { en: 'Al Garhoud', ar: 'القرهود' }, kind: 'midrise', c: [25.2425, 55.3445], r: 0.7 },
  { id: 'festival-city', name: { en: 'Dubai Festival City', ar: 'دبي فستيفال سيتي' }, kind: 'mixed', c: [25.2205, 55.3545], r: 0.8 },
  { id: 'dxb', name: { en: 'Dubai International Airport', ar: 'مطار دبي الدولي' }, kind: 'airport', c: [25.2525, 55.3665], r: 2.1 },
  { id: 'ras-al-khor-ws', name: { en: 'Ras Al Khor Wildlife Sanctuary', ar: 'محمية رأس الخور للحياة الفطرية' }, kind: 'wetland', c: [25.1905, 55.3365], r: 1.0 },
  { id: 'qusais', name: { en: 'Al Qusais', ar: 'القصيص' }, kind: 'midrise', c: [25.2805, 55.3855], r: 1.5 },
  { id: 'mamzar', name: { en: 'Al Mamzar', ar: 'الممزر' }, kind: 'villa', c: [25.2995, 55.3555], r: 0.7 },
  { id: 'rashidiya', name: { en: 'Al Rashidiya', ar: 'الراشدية' }, kind: 'villa', c: [25.2255, 55.3955], r: 1.1 },
  { id: 'mirdif', name: { en: 'Mirdif', ar: 'مردف' }, kind: 'villa', c: [25.2205, 55.4255], r: 1.6 },
  { id: 'meydan', name: { en: 'Meydan', ar: 'ميدان' }, kind: 'mixed', c: [25.1605, 55.3005], r: 1.3 },
  { id: 'nad-al-sheba', name: { en: 'Nad Al Sheba', ar: 'ند الشبا' }, kind: 'villa', c: [25.1555, 55.3355], r: 1.4 },
  { id: 'al-quoz', name: { en: 'Al Quoz', ar: 'القوز' }, kind: 'industrial', c: [25.1405, 55.2355], r: 1.9 },
  { id: 'jumeirah-1', name: { en: 'Jumeirah', ar: 'جميرا' }, kind: 'villa', c: [25.2105, 55.2555], r: 1.3 },
  { id: 'jumeirah-2', name: { en: 'Jumeirah & Al Wasl', ar: 'جميرا والوصل' }, kind: 'villa', c: [25.1755, 55.2255], r: 1.6 },
  { id: 'umm-suqeim', name: { en: 'Umm Suqeim', ar: 'أم سقيم' }, kind: 'villa', c: [25.1435, 55.2005], r: 1.3 },
  { id: 'barsha', name: { en: 'Al Barsha', ar: 'البرشاء' }, kind: 'midrise', c: [25.1055, 55.2005], r: 1.4 },
  { id: 'tecom', name: { en: 'Media City & Internet City', ar: 'مدينة دبي للإعلام ومدينة دبي للإنترنت' }, kind: 'midrise', c: [25.0965, 55.1625], r: 0.9 },
  { id: 'emirates-hills', name: { en: 'Emirates Hills & The Springs', ar: 'تلال الإمارات والينابيع' }, kind: 'villa', c: [25.0605, 55.1705], r: 1.5 },
  { id: 'dubai-hills', name: { en: 'Dubai Hills Estate', ar: 'دبي هيلز استيت' }, kind: 'mixed', c: [25.1055, 55.2455], r: 1.4 },
  { id: 'jvc', name: { en: 'Jumeirah Village Circle', ar: 'قرية جميرا الدائرية' }, kind: 'midrise', c: [25.0605, 55.2105], r: 1.3 },
  { id: 'sports-city', name: { en: 'Sports City & Motor City', ar: 'المدينة الرياضية وموتور سيتي' }, kind: 'midrise', c: [25.0405, 55.2305], r: 1.4 },
  { id: 'arabian-ranches', name: { en: 'Arabian Ranches', ar: 'المرابع العربية' }, kind: 'villa', c: [25.0505, 55.2705], r: 1.8 },
  { id: 'silicon-oasis', name: { en: 'Dubai Silicon Oasis', ar: 'واحة دبي للسيليكون' }, kind: 'midrise', c: [25.1205, 55.3805], r: 1.2 },
  { id: 'international-city', name: { en: 'International City', ar: 'المدينة العالمية' }, kind: 'midrise', c: [25.1655, 55.4105], r: 1.1 },
  { id: 'ras-al-khor-ind', name: { en: 'Ras Al Khor Industrial', ar: 'رأس الخور الصناعية' }, kind: 'industrial', c: [25.1805, 55.3755], r: 1.4 },
  { id: 'discovery', name: { en: 'Discovery Gardens & Gardens', ar: 'ديسكفري جاردنز' }, kind: 'midrise', c: [25.0405, 55.1405], r: 1.0 },
  { id: 'jebel-ali-ind', name: { en: 'Jebel Ali Industrial', ar: 'جبل علي الصناعية' }, kind: 'industrial', c: [24.9955, 55.1105], r: 2.6 },
  { id: 'jafza', name: { en: 'Jebel Ali Free Zone', ar: 'المنطقة الحرة لجبل علي' }, kind: 'port', c: [24.9905, 55.0605], r: 2.0 },
  { id: 'expo', name: { en: 'Expo City Dubai', ar: 'مدينة إكسبو دبي' }, kind: 'expo', c: [24.9625, 55.1485], r: 1.1 },
  { id: 'dwc', name: { en: 'Al Maktoum International Airport', ar: 'مطار آل مكتوم الدولي' }, kind: 'airport', c: [24.8955, 55.1615], r: 2.6 },
  { id: 'golf-jge', name: { en: 'Jumeirah Golf Estates', ar: 'عقارات جميرا للجولف' }, kind: 'golf', c: [25.0255, 55.2005], r: 1.2 },
  { id: 'mushrif', name: { en: 'Mushrif Park', ar: 'حديقة مشرف' }, kind: 'park', c: [25.2155, 55.4555], r: 1.0 },
  // Fill-in neighbourhoods (approximate centres) so the urban fabric reads as continuous.
  { id: 'al-sufouh', name: { en: 'Al Sufouh', ar: 'الصفوح' }, kind: 'villa', c: [25.1165, 55.1765], r: 1.0 },
  { id: 'hor-al-anz', name: { en: 'Hor Al Anz', ar: 'هور العنز' }, kind: 'midrise', c: [25.2785, 55.3445], r: 0.8 },
  { id: 'oud-metha', name: { en: 'Oud Metha', ar: 'عود ميثاء' }, kind: 'midrise', c: [25.2375, 55.3135], r: 0.55 },
  { id: 'zaabeel', name: { en: "Za'abeel", ar: 'زعبيل' }, kind: 'villa', c: [25.2165, 55.3005], r: 0.75 },
  { id: 'jumeirah-park', name: { en: 'Jumeirah Park & Jumeirah Islands', ar: 'جميرا بارك وجزر جميرا' }, kind: 'villa', c: [25.0485, 55.1585], r: 1.0 },
  { id: 'al-furjan', name: { en: 'Al Furjan', ar: 'الفرجان' }, kind: 'villa', c: [25.0255, 55.1455], r: 1.0 },
  { id: 'jvt', name: { en: 'Jumeirah Village Triangle', ar: 'مثلث قرية جميرا' }, kind: 'villa', c: [25.0435, 55.1895], r: 0.75 },
  { id: 'production-city', name: { en: 'Dubai Production City', ar: 'مدينة دبي للإنتاج' }, kind: 'midrise', c: [25.0335, 55.1795], r: 0.6 },
  { id: 'dip', name: { en: 'Dubai Investments Park', ar: 'مجمع دبي للاستثمار' }, kind: 'industrial', c: [24.9885, 55.1755], r: 1.4 },
  { id: 'damac-hills', name: { en: 'DAMAC Hills', ar: 'داماك هيلز' }, kind: 'villa', c: [25.0255, 55.2455], r: 1.2 },
  { id: 'al-barari', name: { en: 'Al Barari', ar: 'البراري' }, kind: 'villa', c: [25.0985, 55.3155], r: 0.8 },
  { id: 'nad-al-hamar', name: { en: 'Nad Al Hamar', ar: 'ند الحمر' }, kind: 'villa', c: [25.2015, 55.3775], r: 0.8 },
  { id: 'al-warqa', name: { en: 'Al Warqa', ar: 'الورقاء' }, kind: 'villa', c: [25.1905, 55.4155], r: 1.3 },
  { id: 'al-twar', name: { en: 'Al Twar', ar: 'الطوار' }, kind: 'villa', c: [25.2615, 55.3935], r: 0.9 },
  { id: 'muhaisnah', name: { en: 'Muhaisnah', ar: 'محيصنة' }, kind: 'midrise', c: [25.2625, 55.4205], r: 1.1 },
  { id: 'al-quoz-res', name: { en: 'Al Quoz Residential', ar: 'القوز السكنية' }, kind: 'villa', c: [25.1555, 55.2455], r: 0.7 },
  { id: 'al-safa', name: { en: 'Al Safa', ar: 'الصفا' }, kind: 'villa', c: [25.1655, 55.2455], r: 0.9 },
  // Island districts: `island` = ISLANDS id. They only match tiles that lie on that island (checked before the circles).
  { id: 'palm-jumeirah', name: { en: 'Palm Jumeirah', ar: 'نخلة جميرا' }, kind: 'villa', island: 'palm-jumeirah', c: [25.1155, 55.1385], r: 2.6 },
  { id: 'palm-jebel-ali', name: { en: 'Palm Jebel Ali', ar: 'نخلة جبل علي' }, kind: 'villa', island: 'palm-jebel-ali', c: [24.9975, 55.0145], r: 3.0 },
  { id: 'bluewaters-d', name: { en: 'Bluewaters Island', ar: 'جزيرة بلوواترز' }, kind: 'mixed', island: 'bluewaters', c: [25.0795, 55.1205], r: 0.4 },
  { id: 'dubai-islands-d', name: { en: 'Dubai Islands', ar: 'جزر دبي' }, kind: 'mixed', island: 'dubai-islands', c: [25.3025, 55.3105], r: 1.6 },
  { id: 'la-mer-d', name: { en: 'La Mer', ar: 'لا مير' }, kind: 'villa', island: 'la-mer', c: [25.2365, 55.2535], r: 0.4 },
];

/** Runways (centreline ends a→b, width m). Used by terrain (painting) and life (planes). */
export const RUNWAYS = [
  { id: 'dxb-12l', airport: 'dxb', a: [25.2672, 55.3446], b: [25.2470, 55.3828], width: 60 },
  { id: 'dxb-12r', airport: 'dxb', a: [25.2615, 55.3410], b: [25.2413, 55.3792], width: 60 },
  { id: 'dwc-12', airport: 'dwc', a: [24.9105, 55.1355], b: [24.8895, 55.1755], width: 60 },
];

/**
 * Dubai Marina canal centreline (SW inland end -> NE), width in metres per vertex, plus its sea entrance
 * (from a canal vertex out to the Gulf). Approximate.
 */
export const MARINA_CANAL = [
  [25.0668, 55.1291, 90], [25.0702, 55.1318, 120], [25.0742, 55.1342, 150], [25.0782, 55.1366, 140],
  [25.0822, 55.1396, 160], [25.0858, 55.1430, 150], [25.0884, 55.1462, 110],
];
export const MARINA_ENTRANCE = [[25.0866, 55.1438, 110], [25.0884, 55.1416, 120], [25.0912, 55.1392, 130]];

const ellipse = (lat, lon, aM, bM, rotDeg, n = 14) => {
  const out = [], c = Math.cos(rotDeg * Math.PI / 180), s = Math.sin(rotDeg * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, ex = Math.cos(t) * aM, ny = Math.sin(t) * bM * (1 + 0.12 * Math.sin(3 * t));
    const e = ex * c - ny * s, nn = ex * s + ny * c; // metres east / north
    out.push([+(lat + nn / 110800).toFixed(5), +(lon + e / 100900).toFixed(5)]);
  }
  return out;
};

/** Inland lakes (polygons, [lat, lon]). Approximate shapes. kind: 'lake'. */
export const LAKES = [
  { id: 'burj-lake', name: { en: 'Burj Lake (Dubai Fountain)', ar: 'بحيرة برج خليفة' }, kind: 'lake',
    pts: [[25.19715, 55.27545], [25.19785, 55.2768], [25.19775, 55.2788], [25.19715, 55.2799], [25.19625, 55.27985],
      [25.19545, 55.27885], [25.19555, 55.2772], [25.1962, 55.2762], [25.19655, 55.2755]] },
  // Jumeirah Lakes Towers: three lakes in a row parallel to Sheikh Zayed Road (rotated ~ along SZR, NE).
  { id: 'jlt-lake-1', name: { en: 'JLT Lake', ar: 'بحيرة أبراج بحيرات جميرا' }, kind: 'lake', pts: ellipse(25.0636, 55.1368, 230, 85, 42) },
  { id: 'jlt-lake-2', name: { en: 'JLT Lake', ar: 'بحيرة أبراج بحيرات جميرا' }, kind: 'lake', pts: ellipse(25.0682, 55.1416, 260, 95, 42) },
  { id: 'jlt-lake-3', name: { en: 'JLT Lake', ar: 'بحيرة أبراج بحيرات جميرا' }, kind: 'lake', pts: ellipse(25.0730, 55.1465, 230, 85, 42) },
  { id: 'safa-lake', name: { en: 'Safa Park lake', ar: 'بحيرة حديقة الصفا' }, kind: 'lake', pts: ellipse(25.1862, 55.2512, 120, 60, 30, 10) },
  { id: 'zabeel-lake', name: { en: 'Zabeel Park lake', ar: 'بحيرة حديقة زعبيل' }, kind: 'lake', pts: ellipse(25.2318, 55.2988, 90, 45, 50, 10) },
];

/**
 * Continuous built-up area (approximate): between the coast and Sheikh Mohammed bin Zayed Road (E311).
 * Inside it every land tile belongs to its nearest district (first-match circles still win), with a few vacant lots.
 */
export const URBAN_ENVELOPE = [
  [24.975, 55.022], [24.962, 55.08], [24.958, 55.165], [25.01, 55.222], [25.06, 55.272], [25.1, 55.312],
  [25.14, 55.352], [25.18, 55.392], [25.22, 55.428], [25.255, 55.455], [25.34, 55.455], [25.34, 55.37],
  // back along the sea (well offshore; only land tiles are affected)
  [25.25, 55.2], [25.1, 55.08], [24.99, 54.99],
];
