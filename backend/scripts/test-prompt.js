/**
 * Test un prompt spécifique sur DeepSeek
 * Usage: node scripts/test-prompt.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });

const prompt = `Tu reçois ci-dessous le contenu du site web d'un hébergement de voyage (camping, hôtel, etc.).

Analyse ce texte et extrais les équipements mentionnés.
Réponds UNIQUEMENT par un tableau JSON des équipements trouvés parmi cette liste :
- POOL (piscine)
- RESTAURANT (restaurant / snack / café)
- SUPERMARKET (supermarché / épicerie)
- WIFI (WiFi / internet)
- PARKING (parking)
- LAUNDRY (laverie)
- KITCHEN (cuisine / kitchenette)
- BAKERY (boulangerie / dépôt de pain)
- SHOWER (douche / sanitaires)
- ELECTRICITY (électricité / bornes)
- PLAYGROUND (terrain de jeu / aire de jeux)
- DUMPSITE (vidange camping-car / aire de vidange)

Hébergement : "Camping Gletscherdorf, Grindelwald, Suisse"

Informations disponibles :
- Cabines de lavage individuelles
- Machines à laver
- Point de service camping-car
- Sèche-linge
- Wi-Fi
- Borne internet
- Branchements électriques
- Aire de jeux
- Programme d'animation pour enfants
- Épicerie
- Piscine extérieure (1 km)
- Restaurant (1 km)
- Pain vendu sur place (boulangerie)
- Douches et sanitaires
- Buanderie

Réponds uniquement au format JSON, sans texte avant ni après.`;

async function main() {
  console.log('Prompt length:', prompt.length, 'chars');
  const r = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });
  const msg = r.choices[0].message;
  console.log('Content:', msg.content);
  console.log('Has reasoning:', !!msg.reasoning_content);
  console.log('Usage:', JSON.stringify(r.usage));
}
main().catch(e => console.error('ERR:', e.message, e.response?.data));
