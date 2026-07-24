Tu reçois ci-dessous le contenu du site web d'un hébergement de voyage (camping, hôtel, etc.).

Analyse ce texte et extrais les équipements mentionnés.
Réponds UNIQUEMENT par un tableau JSON des équipements trouvés parmi cette liste :
- POOL (piscine)
- RESTAURANT (restaurant / snack / café)
- SUPERMARKET (supermarché / épicerie à proximité)
- WIFI (WiFi / internet)
- PARKING (parking)
- LAUNDRY (laverie)
- KITCHEN (cuisine / kitchenette)
- BAKERY (boulangerie / dépôt de pain)
- SHOWER (douche / sanitaires)
- ELECTRICITY (électricité / bornes)
- PLAYGROUND (terrain de jeu / aire de jeux)
- DUMPSITE (vidange camping-car / aire de vidange)

Règles IMPORTANTES :
- Cherche dans le texte TOUS les mots qui peuvent correspondre à un équipement de la liste
- Chaque équipement a un identifiant (ex: POOL). Utilise CET identifiant dans ta réponse.
- Exemple : "piscine", "espace aquatique", "piscine chauffée", "jeux d'eau" → POOL
- Exemple : "snack", "restaurant", "bar", "cafétéria", "bistrot" → RESTAURANT
- Exemple : "supermarché", "épicerie", "alimentation", "commerces", "supérette" → SUPERMARKET (l'épicerie du camping et le supermarché sont la même chose)
- Exemple : "wifi", "internet", "connexion" → WIFI
- Exemple : "parking", "stationnement", "garage" → PARKING
- Exemple : "laverie", "linge", "buanderie" → LAUNDRY
- Exemple : "boulangerie", "fournil", "pain", "viennoiseries", "dépôt de pain" → BAKERY
- Exemple : "douche", "sanitaire", "bloc sanitaire" → SHOWER
- Exemple : "électricité", "bornes", "branchement", "raccordement" → ELECTRICITY
- Exemple : "jeux", "enfant", "club enfant", "terrain de jeu", "balançoire", "toboggan", "aire de jeux" → PLAYGROUND
- Exemple : "vidange", "aire de vidange", "camping-car", "cc", "vidange cc", "eaux grises" → DUMPSITE
- Exemple : "cuisine", "kitchenette", "cuisinette" → KITCHEN
- C'est un camping → rajoute TOUJOURS SHOWER et ELECTRICITY
- Pour les équipements personnalisés (identifiants != ceux ci-dessus), cherche dans le texte des mots similaires au NOM de l'équipement
- Exemple : si "Terrain de jeu" est dans la liste, cherche "jeux", "enfant", "club enfant", "terrain", "balançoire", "toboggan"
- Exemple : si "Vidange CC" est dans la liste, cherche "vidange", "aire de vidange", "camping-car"
- Exemple : si "Boulangerie" est dans la liste, cherche "pain", "viennoiserie", "boulangerie"
- Ne retourne QUE les équipements de la liste ci-dessus
- PRIORISE les avis clients : si un visiteur confirme un équipement, inclus-le
- Si un avis dit explicitement qu'un équipement n'est PAS présent, ne l'inclus PAS
- ATTENTION : les données des annuaires (camping.info) listent parfois des équipements à proximité (marqués d'une distance comme "1 km" ou "0,5 km"). Ces équipements ne sont PAS sur le camping, ne les inclus PAS
- N'inclus QUE les équipements explicitement SUR le camping, pas ceux dans les environs
- En l'absence d'avis, utilise les données du site officiel uniquement
- Exemple de réponse : ["POOL", "RESTAURANT", "WIFI", "SHOWER", "ELECTRICITY", "LAUNDRY", "BAKERY"]

Réponds uniquement au format JSON, sans texte avant ni après.
Trouve et scrappe le site de l'hébergement pour trouver les informations et être le plus précis possible

Hébergement : "Camping Gletscherdorf, Locherbodenstrasse 29, 3818 Grindelwald, Suisse"

Avis clients (peuvent mentionner des équipements présents ou absents) :
(extraits) :
- "Beautiful location, and close to Grindelwald - although it is a pretty steep hike/bikeride up there.  The views are amazing, and the campsite is quiet and calm in the evening and at nighttime" (3/5)
- "Quite an astonishing experience. 
When I arrived, there was nobody at reception, no visible pricing information anywhere, and no staff available to answer basic questions" (1/5)
- "I stayed at this campsite for 4 nights and had a wonderful experience.  I was lucky enough to meet the owner, who is a fantastic and very friendly person" (5/5)

Informations sur l'hébergement :
--- Page: https://www.camping.info/fr/emplacement-de-camping/camping-gletscherdorf (camping.info) ---

Site officiel du camping :

Camping Gletscherdorf Grindelwald - Your Mountain Stay! 
 -->
-->
 Jetzt buchen 
 Appartements 
 Mountain Stay Appartement Mettenberg 
 Mountain Stay Appartement Schreckhorn 
 Mountain Stay Appartement Wetterhorn 
 Anfahrt 
 Grindelwald 
 Klettern 
 Wandern 
 Familienabenteuer 
 Essen Geniessen 
 Actionsport 
 Wohlfühlen Wellness 
 Preise 
 Call us (9-19) 
 +41 33 853 14 29 
 Deutsch 
 Français 
 Italiano 
 English 
 Español 
 Nederlands 
 Call us (9-19) 
 +41 33 853 14 29 
 Deutsch 
 Francais 
 Italian 
 English 
 Espagnol 
 Nederlands 
 Contact
 Locherbodenstrasse 29, CH-3818 Grindelwald
 +41 33 853 14 29 
 info@gletscherdorf.ch 
 -->
 Jetzt Sommerferien buchen 
 Camping inmitten mystischer Berge!
 Jetzt buchen 
 Nehmen Sie am Sommerabenteuer teil 
 Abenteuercamping 
in der Jungfrauregion
 Jetzt buchen 
 Follow on social media
 -->
 gletscher
 Unser Campingplatz 
 Willkommen im Camping der Berge
 Der Camping Gletscherdorf liegt idyllisch am Fluss in Grindelwald, am Fusse und mitten von grossen und mystischen Bergen.
 saubere und geheizte Sanitäranlagen
 Warmwasser und Duschen sind frei zur Benützung
 Waschmaschine und Tumbler
 Jetzt buchen 
 Unser Campingplatz 
 Unser Angebot
 Stellplätze 
 Stellplätze für Camper, Wohnwagen und grosse Zelte.
 Jetzt buchen 
 Zeltwiese 
 Freier Stellplatz auf unserer Zeltwiese.
 Jetzt buchen 
 Appartments
 Schöne Appartments auf dem Campingplatz.
 Jetzt buchen 
 Mach Dich bereit für den 
 Sommer deines Lebens!
 Camping am Fusse 
des legendären Eigers.
 Fragen?
 +41 33 853 14 29 
 Holen Sie sich jetzt unvergessliche, wunderbare Outdoor-Momente 
 Jetzt Camping Video ansehen!
 Our Benefits 
 Warum zu uns?
 Erleben Sie die Magie der Berge - Campingplatz Gletscherdorf in Grindelwald, Ihr Tor zur unberührten Natur.
 Einmalige Naturlandschaft
 Sauberkeit und Qualität
 Vielfältige Aktivitäten
 Wochenendausflug in die Berge 
 Eine unvergessliche Erfahrung wartet auf Sie!
 Jetzt buchen 
 Camping Fotos 
 Impressionen
 Der Blick auf das Wetterhorn, den Eiger und die anderen beeindruckenden Berge von Grindelwald ist einfach atemberaubend. Es ist, als ob man in einem lebenden Gemälde wäre, wo die Natur die Hauptrolle spielt.
 Jessica 
 England 
 Es ist auch wichtig zu betonen, dass ein sauberer und gut gepflegter Campingplatz ein entscheidender Faktor für ein angenehmes Camping-Erlebnis ist. Es zeigt die Verpflichtung der Betreiber gegenüber ihren Gästen und der Umwelt.
 Dieter 
 Deutschland 
 Frische Luft, die atemberaubende Aussicht und eine einzigartige Atmosphäre, die nur ein Campingplatz inmitten der Berge bieten kann.
 Le 
 Holland 
 Häufig gestellte Fragen 
 Fragen?
 Welche Einrichtungen bietet der Campingplatz Gletscherdorf in Grindelwald?
 Dusch- und Toilettenanlagen, Stromanschlüsse, Koch- und Grillmöglichkeiten, Aufenthaltsraum, und mehr.
 Welche Aktivitäten können in der Umgebung des Campingplatzes Gletscherdorf unternommen werden?
 Der Campingplatz Gletscherdorf in Grindelwald liegt inmitten der faszinierenden Jungfrauregion, die eine Vielzahl von Aktivitäten für Outdoor-Begeisterte und Naturliebhaber bietet.
In der Jungfrauregion gibt es immer etwas zu entdecken, egal zu welcher Jahreszeit Sie Ihren Besuch planen!
 Wie sind die Öffnungszeiten und die Verfügbarkeit von Stellplätzen auf dem Campingplatz Gletscherdorf?
 Die Rezeption ist täglich von 10-11 Uhr und von 16-17 Uhr bedient. Zu den sonstigen Zeiten erreichen Sie uns unter +41 33 853 14 29.
Die verfügbarkeit von Stell- und Zeltplätzen ist jederzeit über unser Buchungstool einsehbar.
 What’s Happening 
 News & Articles
 20 oct, 2021 
 by Admin 
 2 Comments 
 Get Ready for the Summer Camp 
 19 oct, 2021 
 by Admin 
 5 Comments 
 Duis Laoreet Cursus Justo, sed 
 18 oct, 2021 
 by Admin 
 4 Comments 
 Morbi nec Finibus mi Cras Risus 
 Send Email
 info@gletscherdorf.ch 
 Call us (9-19)
 +41 33 853 14 29 
 Explore
 Jetzt buchen! 
 Anfahrt 
 Impressum 
 AGB's und Datenschutz 
 Print Voucher on Campsite 
 Preise & Angebot 
 Gästeportal 
 Buchung bearbeiten / stornieren 
 Activities
 Tree Climbing 
 Cross the River 
 Mountain Boarding 
 Parachute 
 -->
 Anfahrt
 Adresse: 
Locherbodenstrasse 29, CH-3818 Grindelwald
 Koordinaten: 
46.62159312277746, 8.04631406543009
 Google Maps: 
 J2CW+HG Grindelwald 
 -->
 Newsletter
 Abonnieren Sie unsere neuesten Artikel und Nachrichten
 Copyright 2026 Camping Gletscherdorf - Supported by CampSoft.ch

Camping Gletscherdorf à Espace Mittelland &#x2F; Berne - camping.info Choisir la langue Fermer Deutsch English Nederlands français italiano Español български босански čeština dansk Ελληνικά eesti suomi hrvatski magyar lietuvių latviešu norsk bokmål polski português română русский slovenčina slovenščina српски svenska Türkçe Accueil 
 Recherche 
 Carte 
 Fanclub 
 Destinations de vacances 
 Thèmes de camping 
 Meilleurs campings 
 français Service à la clientèle Favoris Recherche 
 Carte 
 Fanclub 
 Destinations de vacances 
 Thèmes de camping 
 Meilleurs campings 
 Afficher tout À partir de 56 , 00 € Suisse 
 Espace Mittelland / Berne 
 Grindelwald 
 Camping Gletscherdorf 
 — Pas encore d&#39;évaluations Contact Partager Envoyer une demande Heures d&#39;ouverture : 01.05 - 20.10 , 15.12 - 15.04 - actuellement en opération 
 Adresse :  Locherbodenstr.  29 ,  3818  Grindelwald,  Suisse  -  Afficher sur la carte 
 Région :  Oberland bernois Alpes 
 Notes
 — Pas encore d&#39;évaluations Évaluer emplacement de camping Ajouter une vidéo Ajouter des photos Description
 Profil
 Quietly situated camp side in the centre of an unique walking area near the village with view to the Eiger. Clean and modern sanitary facilities, warm water free of charge. Very attractive walking facilities, mountain climbing school in the village. … In the winter (from 20 oktober until 30 april) only seasonal plots for caravans. Lire la suite Catégorie Camping : 
 Nombre total d&#39;emplacements : 92 
 Nombre d&#39;emplacements touristiques : 50 ( Dont colis : 50) 
 Proposer un changement Prix de référence
 Haute saison 65,00 €* Basse saison 56,00 €* * Deux adultes, caravane, voiture, électricité et taxes locales par nuitée. Envoyer une demande Heures d&#39;ouverture
 01. mai - 20. octobre 15. décembre - 15. avril Propriétés
 Installations
 Cabines de lavage individuelles (3) 
 Machines à laver 
 Point de service camping-car 
 Sèche-linge 
 Wi-Fi 
 Borne internet 
 Au parking
 Branchements électriques 
 Ombre sur les emplacements (Peu d&#39;ombre) 
 Espace séparé pour les groupes de jeunes 
 Animaux domestiques
 Chiens admis en basse saison 
 Chiens admis en haute saison 
 Famille Enfants
 Espace à langer pour bébé 
 Aire de jeux 
 Programme d&#39;animation pour enfants 
 Natation Bien-être
 Natation sauvage ( 20  km, Lac ) 
 Piscine extérieure ( 1  km ) 
 Piscine intérieure ( 1  km ) 
 Sauna ( 1  km ) 
 Plage de sable 
 Plage nudiste 
 Possibilités de loisirs
 Golf ( 0,5  km ) 
 Golf miniature ( 1  km ) 
 Location de vélos ( 1  km ) 
 Planche à voile ( 20  km ) 
 Remontée mécanique ( 1  km ) 
 Ski de fond 
 Tennis ( 0,2  km ) 
 Voile ( 20  km ) 
 Tarifs et restauration
 Cafétéria ( 1  km ) 
 Pain vendu sur place (Uniquement en haute saison) 
 Restaurant ( 1  km ) 
 Épicerie 
 Accessibilité
 Installations sanitaires accessibles à tous 
 Hébergements locatifs
 Appartements de vacances 
 Bungalows 
 Cabines 
 Location de caravanes 
 Location de tentes 
 Type de vacances
 Camping d&#39;hiver 
 Camping permanent 
 Mini emplacement de camping 
 Nudisme 
 Proposer un changement Lieu
 — instructions
 Turn right after the village, follow the signs, Gletscherdorf 31. Lire la suite Lac : 20 km 
 Rivière : Sur place 
 Dans les montagnes : Oui 
 Hauteur au-dessus du niveau de la mer) : 1000 m 
 Prochaine ville : 20 km 
 Prochaine ville/village : 0,5 km 
 Gare ferroviaire ou routière : 0,2 km 
 Sortie d&#39;autoroute : 20 km 
 Adresse
 Locherbodenstr. 29
 3818  Grindelwald 
 Suisse Coordonnées GPS Lat 46.62066, Long 8.04405 Obtenir l&#39;itinéraire Proposer un changement Contact
 Camping Gletscherdorf
 Appeler ou télécopier Afficher le numéro gletscherdorf.ch Questions fréquentes
 À quelle distance de la rivière se trouve Camping Gletscherdorf ?
 Camping Gletscherdorf se situe directement au bord de la rivière. En savoir plus sur le site Les chiens sont-ils autorisés au camping Camping Gletscherdorf ?
 Les chiens sont admis en haute et basse saison. Quand Camping Gletsche