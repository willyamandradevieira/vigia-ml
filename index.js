const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function getProdutosDaLoja(nickname) {
  const produtos = [];
  let totalReal = null;
  const maxPaginas = 9; // até 9 páginas = ~432 produtos (cobre os 429 da Samsung)

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const offset = (pagina - 1) * 48;
    const url = offset === 0
      ? `https://lista.mercadolivre.com.br/loja/${nickname}/`
      : `https://lista.mercadolivre.com.br/loja/${nickname}/_Desde_${offset + 1}`;

    console.log(`Página ${pagina}: ${url}`);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    });

    const html = await res.text();

    // Pega o total real de produtos na primeira página
    if (pagina === 1) {
      const totalMatch = html.match(/(\d+)\s*resultados?/i);
      if (totalMatch) totalReal = parseInt(totalMatch[1]);
      console.log(`Total real de produtos: ${totalReal}`);
    }

    const titulos = [...html.matchAll(/class="poly-component__title[^"]*"[^>]*>([^<]{10,150})<\/a>/g)]
      .map(m => m[1].trim());

    const precos = [...html.matchAll(/class="andes-money-amount__fraction"[^>]*>([^<]+)<\/span>/g)]
      .map(m => parseFloat(m[1].replace(/\./g, '')))
      .filter(p => !isNaN(p) && p > 0);

    const links = [...html.matchAll(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+)"/g)]
      .map(m => m[1])
      .filter(l => l.includes('MLB') && !l.includes('classifieds') && !l.includes('loja'));

    const avaliacoes = [...html.matchAll(/class="poly-reviews__rating"[^>]*>([^<]+)<\/span>/g)]
      .map(m => parseFloat(m[1].trim()));

    const vendas = [...html.matchAll(/class="poly-component__sold"[^>]*>([^<]+)<\/span>/g)]
      .map(m => m[1].trim());

    console.log(`Página ${pagina}: ${titulos.length} títulos, ${precos.length} preços`);

    const qtd = Math.max(titulos.length, links.length);
    for (let i = 0; i < qtd; i++) {
      if (!titulos[i] && !links[i]) continue;
      produtos.push({
        titulo: titulos[i] || `Produto ${produtos.length + 1}`,
        preco: precos[i] || null,
        link: links[i] || null,
        avaliacao: avaliacoes[i] || null,
        vendas: vendas[i] || null,
      });
    }

    // Para quando não tem mais produtos
    if (titulos.length < 10) break;
    
    // Para quando já buscou todos
    if (totalReal && produtos.length >= totalReal) break;
  }

  return { produtos, totalReal };
}

app.get('/api/status', (req, res) => {
  res.json({ status: 'VigIA online', versao: '3.1' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    nick = nick.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    console.log(`Escaneando: ${nick}`);
    const { produtos, totalReal } = await getProdutosDaLoja(nick);

    if (produtos.length === 0) {
      return res.status(404).json({ erro: 'Nenhum produto encontrado. Verifique o nome da loja.' });
    }

    res.json({ 
      nickname: nick, 
      total_produtos: produtos.length,
      total_real: totalReal,
      produtos 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v3.1 na porta ${PORT}`));
