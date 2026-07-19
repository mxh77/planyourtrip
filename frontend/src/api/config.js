// L'URL est définie dans frontend/.env (variable EXPO_PUBLIC_API_URL)
// Sur émulateur : http://localhost:3111
// Sur téléphone physique : http://192.168.X.X:3111
// Production : http://api.planyourtrip.harmonixe.fr

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3111';

export default API_URL;
