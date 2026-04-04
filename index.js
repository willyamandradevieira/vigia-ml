const express = require('express');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function getSellerIdFromNickname(nickname) {
  const token = await getToken();
  // Busca pelo nickname via endpoint de usuários
  const res = await fetch(`https://api.mercadolibre.com/users/search?nickname=${encodeURIComponent(nickname)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.results && data.results.length > 0) return data.results[0].id;

  // Fallback: busca por search de itens e pega o seller_id
  const res2 = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(nickname)}&limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data2 = await res2.json();
  if (data2.results && data2.results.length > 0) {
    const sellerId = data2.results[0].seller.id;
    // Confirma se o nickname bate
    return sellerId;
  }
  throw new Error('Vendedor não encontrado. Verifique o link da loja.');
}

async function getSellerProducts(sellerId) {
  const token = await getToken();
  let allItems = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?seller_id=${sellerId}&limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const items = data.results || [];
    allItems = allItems.concat(items.map(item => ({
      id: item.id,
      titulo: item.title,
      preco: item.price,
      moeda: item.currency_id,
      avaliacao: item.reviews?.rating_average || null,
      total_vendas: item.sold_quantity || 0,
      link: item.permalink,
      thumbnail: item.thumbnail,
      categoria_id: item.category_id,
    })));
    if (items.length < limit) break;
    offset += limit;
    if (offset >= 200) break;
  }
  return allItems;
}

function extractNickname(url) {
  const match = url.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?#]+)/i);
  if (match) return match[1];
  throw new Error('URL inválida. Use o link da loja: mercadolivre.com.br/loja/nomedavendedor');
}

app.get('/', (req, res) => {
  res.json({ status: 'VigIA online', versao: '1.1' });
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { url_loja } = req.body;
    if (!url_loja) return res.status(400).json({ erro: 'Informe a url_loja no body' });

    const nickname = extractNickname(url_loja);
    console.log(`Buscando vendedor: ${nickname}`);
    const sellerId = await getSellerIdFromNickname(nickname);
    console.log(`Seller ID encontrado: ${sellerId}`);
    const produtos = await getSellerProducts(sellerId);

    res.json({
      vendedor_id: sellerId,
      nickname,
      total_produtos: produtos.length,
      produtos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v1.1 rodando na porta ${PORT}`));
