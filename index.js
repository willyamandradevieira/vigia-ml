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
  const res = await fetch(`https://api.mercadolibre.com/sites/MLB/search?nickname=${nickname}&limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.seller) return data.seller.id;
  throw new Error('Vendedor não encontrado');
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
    if (offset >= 200) break; // limite inicial de 200 produtos
  }
  return allItems;
}

function extractNickname(url) {
  // Suporta: mercadolivre.com.br/loja/NICKNAME ou lista.mercadolivre.com.br/NICKNAME
  const match = url.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?]+)/i);
  if (match) return match[1].toUpperCase();
  throw new Error('URL inválida. Use o link da loja do vendedor no Mercado Livre.');
}

app.get('/', (req, res) => {
  res.json({ status: 'VigIA online', versao: '1.0' });
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { url_loja } = req.body;
    if (!url_loja) return res.status(400).json({ erro: 'Informe a url_loja no body' });

    const nickname = extractNickname(url_loja);
    const sellerId = await getSellerIdFromNickname(nickname);
    const produtos = await getSellerProducts(sellerId);

    res.json({
      vendedor_id: sellerId,
      nickname,
      total_produtos: produtos.length,
      produtos,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA rodando na porta ${PORT}`));
