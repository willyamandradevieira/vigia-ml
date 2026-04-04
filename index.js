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
  if (!data.access_token) throw new Error('Falha ao obter token: ' + JSON.stringify(data));
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
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
    console.log(`Search seller ${sellerId} offset ${offset}:`, JSON.stringify(data).substring(0, 200));
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

app.get('/', (req, res) => {
  res.json({ status: 'VigIA online', versao: '1.4' });
});

app.get('/token-test', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, token_preview: token.substring(0, 20) + '...' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Busca seller_id a partir do ID de um produto (ex: MLB55254425)
app.get('/item/:itemId', async (req, res) => {
  try {
    const token = await getToken();
    const { itemId } = req.params;
    const r = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    console.log('Item response:', JSON.stringify(d).substring(0, 300));
    if (d.seller_id) {
      res.json({ item_id: itemId, seller_id: d.seller_id, titulo: d.title, preco: d.price });
    } else {
      res.status(404).json({ erro: 'Item não encontrado', detalhe: d });
    }
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { seller_id } = req.body;
    if (!seller_id) return res.status(400).json({ erro: 'Informe o seller_id' });
    console.log(`Escaneando seller_id: ${seller_id}`);
    const produtos = await getSellerProducts(seller_id);
    res.json({ vendedor_id: seller_id, total_produtos: produtos.length, produtos });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v1.4 rodando na porta ${PORT}`));
