/**
 * Script de test pour l'API DeepSeek
 * Utilise la même config que le service openai.js
 * 
 * Usage: node scripts/test-deepseek.js [model-name]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const OpenAI = require('openai');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY non définie dans .env');
  process.exit(1);
}

const client = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const MODEL = process.argv[2] || 'deepseek-v4-flash';
const PROMPT = `Tu reçois ci-dessous le contenu du site web d'un hébergement de voyage (camping, hôtel, etc.).

Analyse ce texte et extrais les équipements mentionnés.
Réponds UNIQUEMENT par un tableau JSON des équipements trouvés parmi cette liste :
- POOL (piscine)
- RESTAURANT (restaurant / snack / café)
- SUPERMARKET (supermarché / épicerie)
- WIFI (WiFi / internet)
- PARKING (parking)
- LAUNDRY (laverie)
- BAKERY (boulangerie / dépôt de pain)
- SHOWER (douche / sanitaires)
- ELECTRICITY (électricité / bornes)
- PLAYGROUND (terrain de jeu)
- DUMPSITE (vidange camping-car)

Hébergement : "Camping des Bords de Loue, Rue du Camping, 39100 Parcey, France"

Contenu du site web :
Dépôt de pain, viennoiseries et petit déjeuner : laverie, Aire de vidange, vente de draps jetables.
La piscine est ouverte et chauffée. Espace aquatique avec toboggans.
Le snack et le bar sont ouverts en juillet/août. L'épicerie du camping propose des produits variés.
Club enfant pour les 5-12 ans.
C'est un camping.

Réponds uniquement au format JSON, sans texte avant ni après.`;

async function test() {
  console.log(`🔍 Test DeepSeek API avec modèle: "${MODEL}"`);
  console.log(`📤 Prompt (${PROMPT.length} chars):`);
  console.log(PROMPT);
  console.log('---');

  try {
    const start = Date.now();
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT }],
      temperature: 0.3,
      max_tokens: 500,
    });
    const duration = Date.now() - start;

    console.log(`\n✅ Réponse reçue en ${duration}ms`);
    console.log('📥 Réponse brute:', JSON.stringify(resp.choices?.[0]?.message, null, 2));
    
    const content = resp.choices?.[0]?.message?.content?.trim() || '(vide)';
    console.log('\n📝 Contenu:', content);
    
    // Tester le parse JSON
    try {
      const clean = content.replace(/^```(?:json)?\s*|\s*```$/gi, '');
      const parsed = JSON.parse(clean);
      console.log('✅ JSON valide:', JSON.stringify(parsed));
    } catch (e) {
      console.error('❌ Erreur parse JSON:', e.message);
    }

    // Afficher les infos d'utilisation
    console.log('\n📊 Usage:', JSON.stringify(resp.usage, null, 2));

  } catch (err) {
    console.error(`\n❌ Erreur API DeepSeek:`);
    console.error('  Message:', err.message);
    if (err.response) {
      console.error('  Status:', err.response.status);
      console.error('  Data:', JSON.stringify(err.response.data, null, 2));
    }
    if (err.status) console.error('  Status code:', err.status);
  }
}

test();
