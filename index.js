const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function getProdutosDaLoja(nickname) {
  const url = `https://www.mercadolivre.com.br/loja/${nickname}/mais-vendidos`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    }
  });
  const html = await res.text();
  console.log(`Status: ${res.status}, HTML: ${html.length} chars`);

  const produtos = [];
  const titulos = [...html.matchAll(/aria-label="([^"]{10,100})"/g)].map(m => m[1]);
  const precos = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*),(\d{2})/g)].map(m =>
    parseFloat(m[1].replace(/\./g,'') + '.' + m[2])
  );
  const links = [...html.matchAll(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+MLB[^"]+)"/g)]
    .map(m => m[1]).filter(l => !l.includes('classifieds'));

  const total = Math.max(links.length, titulos.length, 1);
  for (let i = 0; i < Math.min(total, 50); i++) {
    if (!titulos[i] && !links[i]) continue;
    produtos.push({
      titulo: titulos[i] || `Produto ${i+1}`,
      preco: precos[i] || null,
      link: links[i] || null,
      total_vendas: null,
    });
  }
  return { html_length: html.length, status: res.status, produtos };
}

app.get('/api/status', (req, res) => {
  res.json({ status: 'VigIA online', versao: '2.0' });
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { nickname, url_loja } = req.body;
    let nick = nickname;
    if (!nick && url_loja) {
      const match = url_loja.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?#]+)/i);
      if (match) nick = match[1];
    }
    if (!nick) return res.status(400).json({ erro: 'Informe url_loja ou nickname' });
    console.log(`Escaneando: ${nick}`);
    const resultado = await getProdutosDaLoja(nick);
    res.json({ nickname: nick, total_produtos: resultado.produtos.length, produtos: resultado.produtos });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v2.0 na porta ${PORT}`));
