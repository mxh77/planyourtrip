/**
 * Test un prompt stocké dans un fichier .md
 * Usage: node scripts/test-prompt-file.js <fichier.md>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const filePath = process.argv[2] || 'prompt-gletscherdorf.md';
const fullPath = path.join(__dirname, '..', filePath);

if (!fs.existsSync(fullPath)) {
  console.error('Fichier introuvable:', fullPath);
  process.exit(1);
}

const prompt = fs.readFileSync(fullPath, 'utf8');
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

async function main() {
  console.log('Fichier:', filePath);
  console.log('Prompt length:', prompt.length, 'chars');
  console.log('---');

  const start = Date.now();
  const resp = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });
  const duration = Date.now() - start;

  const msg = resp.choices[0].message;
  console.log('Duration:', duration, 'ms');
  console.log('Content:', msg.content || '(empty)');
  console.log('Has reasoning:', !!msg.reasoning_content);
  if (msg.reasoning_content) {
    console.log('Reasoning (début):', msg.reasoning_content.slice(0, 200));
  }
  console.log('Usage:', JSON.stringify(resp.usage));
}

main().catch(e => {
  console.error('ERR:', e.message);
  if (e.response?.data) console.error('Data:', JSON.stringify(e.response.data));
});
