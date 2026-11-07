// Radar de Aluguel: site estático, sem build. Dados e lista pessoal vêm das funções alugar_* do Supabase, com o código do link.
const SUPABASE = "https://zfjadvhhpaftlgfxwsww.supabase.co";
const CHAVE_PUBLICA = "sb_publishable_d6f3ffz7O6i6GvikYOOUxQ_qws-2MTb"; // pública por definição: as tabelas só abrem pelas funções

const PADRAO = { orcamento: 4500, quartos: 1, vaga: false, mobilia: "tanto", pet: false };
const ACIMA_DO_TIPICO = 0.05; // "boa" aceita até 5% acima dos parecidos
const NOVO_DIAS = 3;
const COR = { achado: "#d9480f", novo: "#1c6dd0", normal: "#0f6b54" };
const NOME_NIVEL = { muito: "Quero muito", pode: "Pode ser", fora: "Fora" };
const STATUS = {
  favorito: "Favoritos", visitar: "Quero visitar", visitado: "Já visitei", descartado: "Descartados",
};
const NOME_FONTE = { quintoandar: "QuintoAndar", netimoveis: "Netimóveis" };
const ICONE = {
  estrela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.2.9-4.5 4.3 1.1 6.1-5.5-2.9-5.5 2.9 1.1-6.1L3.100 9.500l6.200-.9z"/></svg>',
  pino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.100 7-11.500A7 7 0 0 0 5 9.500C5 14.900 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  voltar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.800-3.800"/></svg>',
  lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  whats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.300-4.200A8 8 0 1 1 8.300 19z"/></svg>',
};

const e = window.radar = { // window.radar: para inspecionar no console
  codigo: null, nome: "", params: null, marcas: new Map(), dados: null, vistoAnterior: null, gerado: null,
  aba: "radar", filtro: "boas", ordem: "melhor", selecionados: new Set(), porId: new Map(), editando: false,
  ficha: null, mapa: null, ativo: null,
};

// ---------- utilidades ----------
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const brl = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function distKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (a.lat - b.lat) * 111.2;
  const dLon = (a.lon - b.lon) * 111.2 * Math.cos(a.lat * rad);
  return Math.hypot(dLat, dLon);
}

// caminhada: 5 km/h e ruas 30% mais longas que a linha reta
const minutosAPe = (km) => Math.max(1, Math.round((km * 1.3 * 60) / 5));

function diasDesde(data) {
  if (!data) return null;
  return Math.floor((Date.now() - new Date(data + "T12:00:00").getTime()) / 864e5);
}

function dataCurta(data) {
  const [a, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}${a === String(new Date().getFullYear()) ? "" : "/" + a}`;
}

function avisar(texto, desfazer) {
  const el = document.getElementById("aviso");
  el.innerHTML = `<span>${esc(texto)}</span>${desfazer ? '<button id="desfazer">Desfazer</button>' : ""}`;
  el.classList.add("ativo");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove("ativo"), desfazer ? 5000 : 2600);
  if (desfazer) document.getElementById("desfazer").onclick = () => { el.classList.remove("ativo"); desfazer(); };
}

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
}

function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento cheio ou bloqueado: segue sem cache */ }
}

// ---------- servidor ----------
async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: CHAVE_PUBLICA, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  return r.json();
}

// marca que não chegou ao servidor fica guardada no aparelho e vai na próxima chance
async function enviarMarca(m) {
  try {
    await rpc("alugar_marcar", {
      p_codigo: e.codigo, p_imovel: m.imovel, p_status: m.status ?? null, p_nota: m.nota ?? null,
      p_visita_em: m.visita_em ?? null, p_copia: m.copia ?? null,
    });
    return true;
  } catch {
    const fila = ler("alugar_fila") ?? [];
    gravar("alugar_fila", [...fila.filter((x) => x.imovel !== m.imovel), m]);
    avisar("Sem conexão: guardei aqui e envio depois.");
    return false;
  }
}

async function esvaziarFila() {
  const fila = ler("alugar_fila") ?? [];
  gravar("alugar_fila", []);
  for (const m of fila) await enviarMarca(m);
}

async function salvarParams() {
  gravar("alugar_params", e.params);
  try {
    await rpc("alugar_salvar_params", { p_codigo: e.codigo, p_params: e.params });
  } catch {
    avisar("Sem conexão: suas escolhas ficam só neste aparelho por enquanto.");
  }
}

// ---------- regras ----------
function ponto() { return e.params.ponto ?? e.dados.ponto; }
function nivelDe(bairro) { return e.params.niveis?.[bairro] ?? "fora"; }
function minutos(im) { return im.lat == null ? null : minutosAPe(distKm(im, ponto())); }
function ehNovo(im) {
  const d = diasDesde(im.novo_em);
  if (d === null) return false;
  if (d <= NOVO_DIAS) return true;
  return Boolean(e.vistoAnterior) && im.novo_em >= e.vistoAnterior.slice(0, 10);
}

function cabe(im, p = e.params) {
  if (nivelDe(im.bairro) === "fora") return false;
  if (im.custo > p.orcamento) return false;
  if ((im.quartos ?? 0) < p.quartos) return false;
  if (p.vaga && !(im.vagas > 0)) return false;
  if (p.mobilia === "sim" && im.mobiliado !== "sim" && im.mobiliado !== "semi") return false;
  if (p.mobilia === "nao" && (im.mobiliado === "sim" || im.mobiliado === "semi")) return false;
  if (p.pet && im.pet === 0) return false; // sem informação continua: o portal costuma não dizer
  return true;
}

function boa(im) {
  if (!cabe(im)) return false;
  return !(im.tipico && im.completo && im.custo > im.tipico * (1 + ACIMA_DO_TIPICO));
}

// menor = melhor: minutos a pé com bônus para achado, novo e bairro preferido
function pontos(im) {
  return (minutos(im) ?? 45) + (nivelDe(im.bairro) === "pode" ? 6 : 0) - (im.achado ? 8 : 0) - (ehNovo(im) ? 3 : 0)
    + (im.completo ? 0 : 4);
}

function visiveis() {
  const lista = e.dados.imoveis.filter((im) => {
    const s = e.marcas.get(im.id)?.status;
    if (s === "descartado") return false;
    if (e.filtro === "boas") return boa(im);
    if (e.filtro === "novos") return ehNovo(im) && cabe(im);
    if (e.filtro === "achados") return im.achado && cabe(im);
    return nivelDe(im.bairro) !== "fora";
  });
  const chave = {
    melhor: pontos, perto: (im) => minutos(im) ?? 999, barato: (im) => im.custo,
    novo: (im) => -(new Date(im.novo_em ?? "2000-01-01").getTime()),
  }[e.ordem];
  return lista.sort((a, b) => chave(a) - chave(b));
}

function categoria(im) { return im.achado ? "achado" : ehNovo(im) ? "novo" : "normal"; }

function rotuloTipo(im) {
  const t = { casa: "Casa", cobertura: "Cobertura", area_privativa: "Área privativa", outro: "Kitnet ou estúdio" };
  return t[im.tipo] ?? "Apartamento";
}

function endereco(im) {
  const rua = im.rua ? im.rua + (im.numero ? `, ${im.numero}` : "") : "";
  return [rua, im.bairro].filter(Boolean).join(" · ");
}

function resumoFisico(im) {
  const q = im.quartos != null ? plural(im.quartos, "quarto", "quartos") : null;
  const a = im.area ? `${Math.round(im.area)} m²` : null;
  const v = im.vagas != null ? (im.vagas ? plural(im.vagas, "vaga", "vagas") : "sem vaga") : null;
  return [q, a, v].filter(Boolean).join(" · ");
}

function comoChegar(im) {
  const m = minutos(im);
  if (m === null) return im.bairro;
  const p = ponto().nome ?? "seu ponto";
  return `${im.bairro} · ${m > 45 ? `${distKm(im, ponto()).toFixed(1).replace(".", ",")} km` : `${m} min a pé`} de ${p}`;
}

function selos(im) {
  const s = [];
  if (im.achado) s.push(`<span class="selo achado">${brl(im.abaixo)} abaixo de parecidos</span>`);
  else if (im.abaixo >= 100) s.push(`<span class="selo bom">${brl(im.abaixo)} abaixo de parecidos</span>`);
  if (ehNovo(im)) s.push('<span class="selo novo">Novo</span>');
  if (im.baixou_de) s.push('<span class="selo bom">Baixou o preço</span>');
  if (im.mobiliado === "sim") s.push('<span class="selo">Mobiliado</span>');
  if (im.pet === 1) s.push('<span class="selo">Aceita pet</span>');
  if (!im.completo) s.push('<span class="selo">Faltam custos</span>');
  return s.join("");
}

// ---------- cartões ----------
function foto(im) {
  const url = im.fotos?.[0] ?? im.foto;
  return url ? `<img class="foto" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="foto"></div>';
}

function cartao(im) {
  const m = e.marcas.get(im.id);
  return `<article class="cartao${e.ativo === im.id ? " ativo" : ""}" id="c-${esc(im.id)}">
    <button data-acao="abrir" data-id="${esc(im.id)}" aria-label="Abrir ${esc(endereco(im))}">${foto(im)}</button>
    <button class="corpo" data-acao="abrir" data-id="${esc(im.id)}" style="text-align:left">
      <span class="preco">${brl(im.custo)}<small> /mês${im.completo ? "" : " ou mais"}</small></span>
      <span class="linha">${esc(resumoFisico(im))}</span>
      <span class="linha">${esc(comoChegar(im))}</span>
      <span class="selos">${selos(im)}</span>
    </button>
    <div class="acoes-cartao">
      ${botaoMarca(im.id, "favorito", "Favorito", ICONE.estrela, m)}
      ${botaoMarca(im.id, "visitar", "Visitar", ICONE.pino, m)}
      <button class="icone-botao" data-acao="descartar" data-id="${esc(im.id)}">${ICONE.fechar}Não quero</button>
    </div>
  </article>`;
}

function botaoMarca(id, status, nome, icone, m) {
  return `<button class="icone-botao ${status}" data-acao="marcar" data-status="${status}" data-id="${esc(id)}"
    aria-pressed="${m?.status === status}">${icone}${nome}</button>`;
}

// ---------- marcas ----------
function copiaDe(im) {
  const { id, bairro, tipo, rua, numero, aluguel, condominio, iptu, custo, completo, area, quartos, vagas, links, lat, lon } = im;
  return { id, bairro, tipo, rua, numero, aluguel, condominio, iptu, custo, completo, area, quartos, vagas, links, lat, lon, foto: im.fotos?.[0] };
}

function imovelDe(id) {
  return e.porId.get(id) ?? e.marcas.get(id)?.copia ?? null;
}

async function mudarMarca(id, mudancas) {
  const atual = e.marcas.get(id) ?? { imovel: id };
  const im = imovelDe(id);
  const nova = { ...atual, ...mudancas, copia: im ? copiaDe({ ...atual.copia, ...im }) : atual.copia, atualizado_em: new Date().toISOString() };
  if (nova.status) e.marcas.set(id, nova);
  else if (nova.nota) { nova.status = "favorito"; e.marcas.set(id, nova); } else e.marcas.delete(id);
  gravar("alugar_marcas", [...e.marcas.values()]);
  await enviarMarca(nova.status ? nova : { imovel: id, status: null });
}

function alternar(id, status) {
  const atual = e.marcas.get(id);
  const era = atual ? { ...atual } : null;
  mudarMarca(id, { status: atual?.status === status ? null : status });
  return era;
}

// ---------- telas ----------
function abas() {
  const n = [...e.marcas.values()].filter((m) => m.status !== "descartado").length;
  const item = (aba, nome, icone) => `<button data-acao="aba" data-aba="${aba}" ${e.aba === aba ? 'aria-current="page"' : ""}>${icone}${nome}</button>`;
  return `<nav class="abas" aria-label="Seções">
    ${item("radar", "Radar", ICONE.radar)}
    ${item("lista", `Minha lista${n ? ` (${n})` : ""}`, ICONE.lista)}
    ${item("ajustes", "Preferências", ICONE.ajustes)}
  </nav>`;
}

function desenhar() {
  const app = document.getElementById("app");
  if (e.aba === "radar") {
    const estavaEm = document.querySelector(".lista")?.scrollTop ?? 0;
    if (!document.querySelector(".radar")) {
      if (e.mapa) { e.mapa.remove(); e.mapa = null; }
      app.innerHTML = `<div class="tela">${abas()}<main class="conteudo"><div class="radar">
        <div class="mapa-caixa"><div id="mapa"></div><div class="legenda">
          <span><i style="background:${COR.achado}"></i>Achado</span><span><i style="background:${COR.novo}"></i>Novo</span><span><i style="background:${COR.normal}"></i>Outros</span>
        </div></div>
        <section class="lista" aria-label="Imóveis"></section></div></main></div>`;
      iniciarMapa();
    }
    document.querySelector(".abas").outerHTML = abas();
    desenharLista();
    document.querySelector(".lista").scrollTop = estavaEm;
    atualizarMapa();
    return;
  }
  if (e.mapa) { e.mapa.remove(); e.mapa = null; }
  const corpo = e.aba === "lista" ? telaLista() : telaPreferencias();
  app.innerHTML = `<div class="tela">${abas()}<main class="conteudo">${corpo}</main></div>`;
  if (e.aba === "ajustes") atualizarResumoVivo();
}

function desenharLista() {
  const lista = visiveis();
  const cont = {
    boas: e.dados.imoveis.filter((im) => boa(im) && e.marcas.get(im.id)?.status !== "descartado").length,
    achados: e.dados.imoveis.filter((im) => im.achado && cabe(im)).length,
    novos: e.dados.imoveis.filter((im) => ehNovo(im) && cabe(im)).length,
    todos: e.dados.imoveis.filter((im) => nivelDe(im.bairro) !== "fora").length,
  };
  const seg = (f, nome) => `<button data-acao="filtro" data-filtro="${f}" aria-pressed="${e.filtro === f}">${nome} (${cont[f]})</button>`;
  const quando = new Date(e.dados.gerado_em);
  const hoje = quando.toDateString() === new Date().toDateString();
  const texto = `Até ${brl(e.params.orcamento)} por mês, tudo somado · dados de ${hoje ? "hoje" : quando.toLocaleDateString("pt-BR")}`;
  document.querySelector(".lista").innerHTML = `
    <header class="topo">
      <h1>Oi, ${esc(e.nome.split(" ")[0])}</h1><p>${texto}</p>
      <div class="segmento">${seg("boas", "Boas para você")}${seg("achados", "Achados")}${seg("novos", "Novos")}${seg("todos", "Todos")}</div>
      <div class="ordem"><span>${plural(lista.length, "imóvel", "imóveis")}</span>
        <label>Ordem: <select data-acao="ordem" aria-label="Ordem da lista">
          ${[["melhor", "Melhor para mim"], ["perto", "Mais perto"], ["barato", "Menor custo"], ["novo", "Mais recentes"]]
            .map(([v, t]) => `<option value="${v}" ${e.ordem === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></label></div>
    </header>
    ${lista.length ? lista.slice(0, 120).map(cartao).join("") : `<p class="vazio">Nada por aqui com esses critérios.<br>
      Tente aumentar o valor ou incluir mais bairros em <button data-acao="aba" data-aba="ajustes"><u>Preferências</u></button>.</p>`}
    <p class="rodape">Fontes: QuintoAndar e Netimóveis. Fotos e anúncios são dos portais; confira sempre no anúncio.</p>`;
}

function telaLista() {
  const marcas = [...e.marcas.values()];
  const ativos = marcas.filter((m) => m.status !== "descartado");
  const n = e.selecionados.size;
  const secao = (s) => {
    const ms = marcas.filter((m) => m.status === s);
    if (!ms.length) return "";
    return `<h2>${STATUS[s]} (${ms.length})</h2>${ms.map(cartaoLista).join("")}`;
  };
  return `<section class="minha-lista">
    <div class="barra-lista"><h1>Minha lista</h1>
      <div class="barra-acoes">
        <button class="botao primario" data-acao="mensagem" ${n ? "" : "disabled"}>${ICONE.whats}Mandar${n ? ` (${n})` : ""}</button>
        <button class="botao" data-acao="baixar" ${marcas.length ? "" : "disabled"}>Baixar planilha</button>
      </div>
      ${ativos.length && !n ? '<p class="nota-pe">Marque os imóveis para mandar no WhatsApp.</p>' : ""}
    </div>
    ${marcas.length ? ["visitar", "favorito", "visitado", "descartado"].map(secao).join("")
      : '<p class="vazio">Ainda vazia. No Radar, toque na estrela para guardar um imóvel aqui.</p>'}
  </section>`;
}

function cartaoLista(m) {
  const im = imovelDe(m.imovel);
  if (!im) return "";
  const noAr = e.porId.has(m.imovel);
  const atual = e.porId.get(m.imovel);
  const mudou = atual && m.copia?.custo && atual.custo !== m.copia.custo;
  const detalhe = [
    noAr ? "" : '<span class="saiu">Saiu do ar</span>',
    mudou ? `<span class="${atual.custo < m.copia.custo ? "" : "saiu"}">Era ${brl(m.copia.custo)}</span>` : "",
    m.visita_em ? `Visita: ${esc(new Date(m.visita_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}` : "",
  ].filter(Boolean).join(" · ");
  return `<article class="cartao">
    <label class="marcar"><input type="checkbox" data-acao="selecionar" data-id="${esc(m.imovel)}" ${e.selecionados.has(m.imovel) ? "checked" : ""}>
      Incluir na mensagem</label>
    <button data-acao="abrir" data-id="${esc(m.imovel)}" aria-label="Abrir ${esc(endereco(im))}">${foto(im)}</button>
    <button class="corpo" data-acao="abrir" data-id="${esc(m.imovel)}" style="text-align:left">
      <span class="preco">${brl(im.custo)}<small> /mês</small></span>
      <span class="linha">${esc(resumoFisico(im))}</span>
      <span class="linha">${esc(comoChegar(im))}</span>
      ${detalhe ? `<span class="linha">${detalhe}</span>` : ""}
    </button>
    ${m.nota ? `<p class="anotacao">${esc(m.nota)}</p>` : ""}
  </article>`;
}

// ---------- ficha ----------
function abrirFicha(id, voltar = true) {
  if (!imovelDe(id)) return;
  e.ficha = id;
  e.ativo = id;
  if (voltar) history.pushState({ ficha: id }, "");
  document.getElementById("sobre").innerHTML = htmlFicha(id);
}

function fecharFicha() {
  e.ficha = null;
  document.getElementById("sobre").innerHTML = "";
  desenhar();
}

function htmlFicha(id) {
  const im = imovelDe(id);
  const m = e.marcas.get(id);
  const noAr = e.porId.has(id);
  const fotos = (im.fotos ?? (im.foto ? [im.foto] : []));
  // custo completo = o portal deu o total: o que falta na soma é condomínio ou IPTU que o imóvel não tem
  const custos = [["Aluguel", im.aluguel], ["Condomínio", im.condominio], ["IPTU", im.iptu]];
  const linhasCusto = custos.map(([n, v]) => `<span>${n}</span><span class="v">${v ? brl(v) : im.completo ? "não tem" : "não informado"}</span>`).join("");
  const andar = im.andar_min != null ? `${im.andar_min}º a ${im.andar_max}º` : null;
  const fatos = [
    ["Quartos", im.quartos], ["Suítes", im.suites || null], ["Banheiros", im.banheiros], ["Vagas", im.vagas],
    ["Área", im.area ? `${Math.round(im.area)} m²` : null], ["Andar", andar],
    ["Mobília", { sim: "Mobiliado", semi: "Semi", nao: "Sem móveis" }[im.mobiliado]],
    ["Pet", im.pet === 1 ? "Aceita" : null],
  ].filter(([, v]) => v != null && v !== "");
  const perto = im.perto ?? {};
  const nomes = [["mercado", "mercado ou padaria", "mercados ou padarias"], ["farmacia", "farmácia ou saúde", "farmácias e saúde"],
    ["onibus", "ponto de ônibus ou metrô", "pontos de ônibus ou metrô"], ["praca", "praça ou parque", "praças ou parques"],
    ["comer", "lugar para comer", "lugares para comer"], ["academia", "academia", "academias"]];
  const aPe = nomes.filter(([k]) => perto[k]).map(([k, um, varios]) => plural(perto[k], um, varios));
  const rua = [];
  if (im.ladeira != null) rua.push(im.ladeira >= 15 ? `Rua bem inclinada (${String(im.ladeira).replace(".", ",")}%)` : im.ladeira >= 8 ? "Rua com alguma subida" : "Rua plana ou quase plana");
  if (im.ruido != null) rua.push(`Barulho estimado: ${esc(im.ruido_faixa)}`);
  if (im.favela_m != null) rua.push(`Vila ou favela a cerca de ${im.favela_m} m`);
  const mapsUrl = im.lat != null ? `https://www.google.com/maps/search/?api=1&query=${im.lat},${im.lon}` : null;
  const statusBotoes = [["favorito", "Favorito"], ["visitar", "Visitar"], ["visitado", "Visitei"], ["descartado", "Não quero"]]
    .map(([s, t]) => `<button class="icone-botao" data-acao="marcar-ficha" data-status="${s}" data-id="${esc(id)}" aria-pressed="${m?.status === s}">${t}</button>`).join("");
  return `<aside class="ficha" aria-label="Detalhes do imóvel">
    <div class="ficha-topo"><button data-acao="fechar-ficha" aria-label="Voltar">${ICONE.voltar}</button></div>
    ${fotos.length ? `<div class="galeria">${fotos.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}</div>` : '<div class="sem-foto"></div>'}
    <div class="ficha-corpo">
      <h2>${esc(rotuloTipo(im))}${im.rua ? ` na ${esc(im.rua)}` : ""}</h2>
      <p class="nota-pe">${esc(comoChegar(im))}</p>
      ${noAr ? "" : '<p class="saiu">Este anúncio saiu do ar. Os valores são os da última vez que ele apareceu.</p>'}
      <div class="selos">${noAr ? selos(im) : ""}</div>
      <section class="bloco"><h3>Quanto sai por mês</h3>
        <p class="total">${brl(im.custo)}${im.completo ? "" : " ou mais"}</p>
        <div class="linhas">${linhasCusto}</div>
        ${im.seguro || im.taxa ? `<p class="nota-pe">No QuintoAndar entram ainda ${[im.seguro && `seguro incêndio de ${brl(im.seguro)}`, im.taxa && `taxa de ${brl(im.taxa)}`].filter(Boolean).join(" e ")} por mês.</p>` : ""}
        ${im.tipico ? `<p class="nota-pe">Parecidos ${im.nivel_comp === "bairro" ? "neste bairro" : "na região"} saem por cerca de ${brl(im.tipico)} (${plural(im.n_parecidos, "imóvel comparado", "imóveis comparados")}).</p>` : ""}
        ${im.baixou_de ? `<p class="nota-pe">O aluguel baixou de ${brl(im.baixou_de)} em ${dataCurta(im.baixou_em)}.</p>` : ""}
        ${im.novo_em ? `<p class="nota-pe">Anunciado em ${dataCurta(im.novo_em)}.${diasDesde(im.novo_em) > 45 ? " Está no ar há um tempo: vale tentar negociar." : ""}${im.proposta ? " Aceita proposta pelo portal." : ""}</p>` : ""}
      </section>
      <section class="bloco"><h3>O imóvel</h3><div class="fatos">${fatos.map(([k, v]) => `<div><b>${esc(v)}</b>${k}</div>`).join("")}</div>
        ${im.comodidades?.length ? `<div class="selos">${im.comodidades.map((c) => `<span class="selo">${esc(c)}</span>`).join("")}</div>` : ""}
      </section>
      ${aPe.length || rua.length ? `<section class="bloco"><h3>Em volta</h3>
        ${aPe.length ? `<p>Até 500 m: ${esc(aPe.join(", "))}.</p>` : ""}
        ${rua.map((t) => `<p class="nota-pe">${esc(t)}</p>`).join("")}</section>` : ""}
      <section class="bloco"><h3>Minha lista</h3>
        <div class="status-botoes">${statusBotoes}</div>
        <label class="nota-pe" for="nota">Minhas notas</label>
        <textarea id="nota" data-acao="nota" data-id="${esc(id)}" placeholder="O que achou, o que perguntar…">${esc(m?.nota ?? "")}</textarea>
        <label class="nota-pe" for="visita">Visita marcada</label>
        <input id="visita" class="campo-texto" type="datetime-local" data-acao="visita" data-id="${esc(id)}" value="${esc(m?.visita_em ?? "")}">
      </section>
      <div class="links">
        ${(im.links ?? []).map(([f, u]) => `<a class="botao primario" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Ver no ${esc(NOME_FONTE[f] ?? f)}</a>`).join("")}
        ${mapsUrl ? `<a class="botao" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Ver no mapa</a>` : ""}
        <button class="botao" data-acao="mensagem-um" data-id="${esc(id)}">${ICONE.whats}Mandar</button>
      </div>
    </div>
  </aside>`;
}

// ---------- mensagens ----------
function custosTexto(im) {
  const partes = [`aluguel ${brl(im.aluguel)}`];
  if (im.condominio) partes.push(`cond. ${brl(im.condominio)}`);
  if (im.iptu) partes.push(`IPTU ${brl(im.iptu)}`);
  return partes.join(" + ");
}

function linkPrincipal(im) { return im.links?.[0]?.[1] ?? ""; }

function mensagemCorretor(lista) {
  const blocos = lista.map((im, i) => [`${i + 1}. ${endereco(im)}`, `   ${custosTexto(im)}`, `   ${resumoFisico(im)}`, `   ${linkPrincipal(im)}`].filter((l) => l.trim()).join("\n"));
  return ["Olá! Tenho interesse nestes imóveis para alugar e gostaria de mais informações (e, se possível, agendar uma visita):", "", blocos.join("\n\n"), "", "Agradeço desde já!"].join("\n");
}

function mensagemPessoal(lista) {
  const blocos = lista.map((im, i) => {
    const m = e.marcas.get(im.id);
    return [`${i + 1}. ${endereco(im)}`, `   ${brl(im.custo)} por mês no total (${custosTexto(im)})`, `   ${resumoFisico(im)}`,
      m?.nota ? `   Minha nota: ${m.nota}` : "", `   ${linkPrincipal(im)}`].filter((l) => l.trim()).join("\n");
  });
  return ["Olha os imóveis que separei:", "", blocos.join("\n\n")].join("\n");
}

function abrirMensagem(ids) {
  const lista = ids.map(imovelDe).filter(Boolean);
  const janela = document.createElement("div");
  janela.className = "janela-fundo";
  janela.innerHTML = `<div class="janela" role="dialog" aria-label="Mandar imóveis"><h2>Mandar ${plural(lista.length, "imóvel", "imóveis")}</h2>
    <div class="opcoes"><button data-t="pessoal" aria-pressed="true">Para alguém de confiança</button><button data-t="corretor" aria-pressed="false">Para o corretor</button></div>
    <textarea aria-label="Texto da mensagem"></textarea>
    <div class="barra-acoes"><a class="botao primario" target="_blank" rel="noopener noreferrer">${ICONE.whats}Abrir WhatsApp</a>
      <button class="botao" data-copiar>Copiar</button><button class="botao" data-fechar>Fechar</button></div></div>`;
  const texto = janela.querySelector("textarea");
  const whats = janela.querySelector("a");
  const atualizar = () => { whats.href = `https://wa.me/?text=${encodeURIComponent(texto.value)}`; };
  const preencher = (t) => { texto.value = t === "corretor" ? mensagemCorretor(lista) : mensagemPessoal(lista); atualizar(); };
  preencher("pessoal");
  texto.addEventListener("input", atualizar);
  janela.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (ev.target === janela || b?.hasAttribute("data-fechar")) janela.remove();
    if (b?.dataset.t) {
      janela.querySelectorAll("[data-t]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      preencher(b.dataset.t);
    }
    if (b?.hasAttribute("data-copiar")) {
      try { await navigator.clipboard.writeText(texto.value); avisar("Texto copiado."); } catch { texto.select(); avisar("Selecionei o texto: copie com o menu do aparelho."); }
    }
  });
  document.body.append(janela);
}

function baixarPlanilha() {
  const cols = ["Situação", "Bairro", "Endereço", "Total por mês", "Aluguel", "Condomínio", "IPTU", "Quartos", "Área", "Vagas", "Visita", "Notas", "Link", "No ar"];
  const linhas = [...e.marcas.values()].map((m) => {
    const im = imovelDe(m.imovel) ?? {};
    return [STATUS[m.status], im.bairro, im.rua, im.custo, im.aluguel, im.condominio, im.iptu, im.quartos, im.area, im.vagas, m.visita_em, m.nota, linkPrincipal(im), e.porId.has(m.imovel) ? "sim" : "não"];
  });
  const csv = [cols, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `minha-lista-aluguel-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- preferências ----------
function niveisPadrao() {
  const n = {};
  for (const b of e.dados.niveis.quero_muito) n[b] = "muito";
  for (const b of e.dados.niveis.pode_ser) n[b] = "pode";
  return n;
}

function telaPreferencias() {
  const p = e.params;
  const primeira = !p.pronto;
  const op = (campo, valor, nome) => `<button data-acao="op" data-campo="${campo}" data-valor="${valor}" aria-pressed="${String(p[campo]) === String(valor)}">${nome}</button>`;
  const grupos = ["muito", "pode", "fora"].map((nivel) => {
    const bairros = Object.keys(e.dados.bairros).filter((b) => nivelDe(b) === nivel).sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (!bairros.length) return "";
    const ajuda = { muito: "Aparecem primeiro", pode: "Aparecem depois", fora: "Não aparecem" }[nivel];
    return `<div class="bairro-grupo"><h3>${NOME_NIVEL[nivel]} <span class="nota-pe">· ${ajuda}</span></h3><div class="bairro-lista">
      ${bairros.map((b) => `<button class="bairro ${nivel}" data-acao="bairro" data-bairro="${esc(b)}">${esc(b)} <small>${e.dados.bairros[b]}</small></button>`).join("")}</div></div>`;
  }).join("");
  return `<section class="formulario"><div>
    <header><h1>${primeira ? `Oi, ${esc(e.nome.split(" ")[0])}! Vamos achar seu lugar` : "Preferências"}</h1>
      ${primeira ? '<p class="nota-pe">Leva um minuto, e você pode mudar tudo depois.</p>' : ""}</header>
    <div class="campo"><label for="orcamento">Quanto você topa pagar por mês, tudo somado?</label>
      <span class="ajuda">Aluguel, condomínio e IPTU juntos.</span>
      <span class="valor-grande" id="valor-orcamento">${brl(p.orcamento)}</span>
      <input id="orcamento" type="range" min="1000" max="15000" step="100" value="${p.orcamento}" data-acao="orcamento"></div>
    <div class="campo"><span class="rotulo">Quantos quartos, no mínimo?</span><div class="opcoes">${[1, 2, 3, 4].map((q) => op("quartos", q, q === 4 ? "4 ou mais" : q)).join("")}</div></div>
    <div class="campo"><span class="rotulo">Precisa de vaga de garagem?</span><div class="opcoes">${op("vaga", false, "Tanto faz")}${op("vaga", true, "Preciso")}</div></div>
    <div class="campo"><span class="rotulo">Com móveis?</span><div class="opcoes">${op("mobilia", "tanto", "Tanto faz")}${op("mobilia", "sim", "Quero mobiliado")}${op("mobilia", "nao", "Sem móveis")}</div></div>
    <div class="campo"><span class="rotulo">Tem pet?</span><div class="opcoes">${op("pet", false, "Não")}${op("pet", true, "Tenho")}</div></div>
    <div class="campo"><span class="rotulo">Quer morar perto de onde?</span>
      <span class="ajuda">Quanto mais perto daqui, mais alto o imóvel aparece.</span>
      <div class="opcoes"><button data-acao="ponto" aria-pressed="true">${esc(ponto().nome ?? "Meu ponto")}</button><button data-acao="ponto">Mudar no mapa</button></div></div>
    <div class="campo"><span class="rotulo">Quais bairros?</span>
      <span class="ajuda">Toque num bairro para mudar de grupo. O número mostra quantos imóveis ele tem hoje.</span>
      <div class="bairros">${grupos}</div></div>
    <div class="resumo-vivo" id="resumo-vivo"></div>
  </div></section>`;
}

function atualizarResumoVivo() {
  const el = document.getElementById("resumo-vivo");
  if (!el) return;
  const p = e.params;
  const lista = e.dados.imoveis.filter((im) => cabe(im));
  const achados = lista.filter((im) => im.achado).length;
  const iguais = e.dados.imoveis.filter((im) => nivelDe(im.bairro) === "muito" && im.quartos === p.quartos && im.completo).map((im) => im.custo).sort((a, b) => a - b);
  const mediana = iguais.length >= 5 ? iguais[Math.floor(iguais.length / 2)] : null;
  el.innerHTML = `<p><b>${plural(lista.length, "imóvel", "imóveis")} para você hoje</b>${achados ? `, ${plural(achados, "achado", "achados")}` : ""}</p>
    ${mediana ? `<p class="suave">${plural(p.quartos, "quarto", "quartos")} nos bairros de "Quero muito" costuma sair por ${brl(mediana)} por mês.</p>` : ""}
    <button class="botao primario" data-acao="concluir">${p.pronto ? "Salvar e ver o radar" : "Ver meu radar"}</button>`;
}

function abrirPonto() {
  const janela = document.createElement("div");
  janela.className = "janela-fundo";
  janela.innerHTML = `<div class="janela" role="dialog" aria-label="Escolher ponto"><h2>Toque no mapa para escolher</h2>
    <div class="mapa-ponto" id="mapa-ponto"></div>
    <label class="nota-pe" for="nome-ponto">Nome deste lugar</label>
    <input id="nome-ponto" class="campo-texto" value="${esc(ponto().nome ?? "")}" maxlength="30">
    <div class="barra-acoes"><button class="botao primario" data-ok>Usar este ponto</button><button class="botao" data-fechar>Cancelar</button></div></div>`;
  document.body.append(janela);
  let escolhido = { ...ponto() };
  if (window.maplibregl) {
    const m = new maplibregl.Map({ container: "mapa-ponto", style: estiloMapa(), center: [escolhido.lon, escolhido.lat], zoom: 13 });
    const el = document.createElement("div");
    el.className = "ponto-casa";
    const marcador = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([escolhido.lon, escolhido.lat]).addTo(m);
    const mudar = ({ lng, lat }) => { escolhido = { ...escolhido, lat, lon: lng }; marcador.setLngLat([lng, lat]); };
    m.on("click", (ev) => mudar(ev.lngLat));
    marcador.on("dragend", () => mudar(marcador.getLngLat()));
  }
  janela.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b?.hasAttribute("data-fechar")) janela.remove();
    if (b?.hasAttribute("data-ok")) {
      e.params.ponto = { ...escolhido, nome: janela.querySelector("#nome-ponto").value.trim() || "Meu ponto" };
      janela.remove();
      desenhar();
    }
  });
}

// ---------- mapa ----------
function estiloMapa() {
  const escuro = matchMedia("(prefers-color-scheme: dark)").matches;
  return `https://tiles.openfreemap.org/styles/${escuro ? "dark" : "positron"}`;
}

function iniciarMapa() {
  if (!window.maplibregl) { document.querySelector(".mapa-caixa").style.display = "none"; return; }
  const p = ponto();
  const m = new maplibregl.Map({ container: "mapa", style: estiloMapa(), center: [p.lon, p.lat], zoom: 13.2, attributionControl: { compact: true } });
  e.mapa = m;
  m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  m.on("load", async () => {
    let bairros = { type: "FeatureCollection", features: [] };
    try { bairros = await (await fetch("bairros.geojson")).json(); } catch { /* sem contornos o mapa segue funcionando */ }
    m.addSource("bairros", { type: "geojson", data: bairros });
    m.addLayer({ id: "bairros-fundo", type: "fill", source: "bairros", paint: { "fill-color": "#0f6b54", "fill-opacity": 0.07 }, filter: ["in", ["get", "nome"], ["literal", []]] });
    m.addLayer({ id: "bairros-linha", type: "line", source: "bairros", paint: { "line-color": "#0f6b54", "line-width": 1, "line-opacity": 0.45 }, filter: ["in", ["get", "nome"], ["literal", []]] });
    m.addSource("pontos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({
      id: "pontos", type: "circle", source: "pontos",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 8],
        "circle-color": ["match", ["get", "cat"], "achado", COR.achado, "novo", COR.novo, COR.normal],
        "circle-stroke-color": ["case", ["get", "marcado"], "#e0a800", "#ffffff"],
        "circle-stroke-width": ["case", ["get", "marcado"], 2.5, 1.2],
      },
    });
    const el = document.createElement("div");
    el.className = "ponto-casa";
    el.title = p.nome ?? "";
    e.marcadorPonto = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m);
    e.pilulas = bairros.features.map((f) => {
      const d = document.createElement("div");
      d.className = "pilula";
      d.textContent = f.properties.nome;
      return { nome: f.properties.nome, d, marcador: new maplibregl.Marker({ element: d }).setLngLat([f.properties.lon, f.properties.lat]) };
    });
    m.on("mouseenter", "pontos", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "pontos", () => { m.getCanvas().style.cursor = ""; });
    m.on("click", "pontos", (ev) => clicarPontos(ev));
    atualizarMapa();
  });
}

function clicarPontos(ev) {
  const fs = ev.features;
  const ids = [...new Set(fs.map((f) => f.properties.id))];
  if (ids.length === 1) { abrirFicha(ids[0]); return; }
  const d = document.createElement("div"); // mesmo prédio: vários imóveis no mesmo lugar
  d.innerHTML = ids.slice(0, 8).map((id) => {
    const im = imovelDe(id);
    return `<button data-id="${esc(id)}">${brl(im.custo)} · ${esc(resumoFisico(im))}</button>`;
  }).join("");
  const pop = new maplibregl.Popup({ closeButton: true }).setLngLat(ev.lngLat).setDOMContent(d).addTo(e.mapa);
  d.addEventListener("click", (c) => {
    const id = c.target.closest("button")?.dataset.id;
    if (id) { pop.remove(); abrirFicha(id); }
  });
}

function atualizarMapa() {
  const m = e.mapa;
  if (!m?.getSource?.("pontos")) return;
  const features = visiveis().filter((im) => im.lat != null).map((im) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [im.lon, im.lat] },
    properties: { id: im.id, cat: categoria(im), marcado: e.marcas.has(im.id) },
  }));
  m.getSource("pontos").setData({ type: "FeatureCollection", features });
  const dentro = Object.keys(e.dados.bairros).filter((b) => nivelDe(b) !== "fora");
  const filtro = ["in", ["get", "nome"], ["literal", dentro]];
  m.setFilter("bairros-fundo", filtro);
  m.setFilter("bairros-linha", filtro);
  for (const p of e.pilulas ?? []) {
    const nivel = nivelDe(p.nome);
    p.d.classList.toggle("muito", nivel === "muito"); // só esta classe: o MapLibre usa as dele para posicionar
    if (nivel === "fora") p.marcador.remove(); else p.marcador.addTo(m);
  }
  const pt = ponto();
  e.marcadorPonto?.setLngLat([pt.lon, pt.lat]);
}

// ---------- ações ----------
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-acao]");
  if (!b) return;
  const { acao, id } = b.dataset;
  if (acao === "aba") { e.aba = b.dataset.aba; desenhar(); document.querySelector(".formulario,.minha-lista")?.scrollTo(0, 0); }
  if (acao === "filtro") { e.filtro = b.dataset.filtro; desenhar(); document.querySelector(".lista").scrollTop = 0; }
  if (acao === "abrir") abrirFicha(id);
  if (acao === "fechar-ficha") history.back();
  if (acao === "marcar") { alternar(id, b.dataset.status); desenharCartao(id, b); }
  if (acao === "marcar-ficha") { alternar(id, b.dataset.status); document.getElementById("sobre").innerHTML = htmlFicha(id); }
  if (acao === "descartar") {
    const era = alternar(id, "descartado");
    desenhar();
    avisar("Tirei do radar.", () => { mudarMarca(id, { status: era?.status ?? null }); desenhar(); });
  }
  if (acao === "mensagem") abrirMensagem([...e.selecionados]);
  if (acao === "mensagem-um") abrirMensagem([id]);
  if (acao === "baixar") baixarPlanilha();
  if (acao === "op") {
    const v = b.dataset.valor;
    e.params[b.dataset.campo] = v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v;
    manterRolagem();
  }
  if (acao === "bairro") {
    const proximo = { muito: "pode", pode: "fora", fora: "muito" }[nivelDe(b.dataset.bairro)];
    e.params.niveis = { ...e.params.niveis, [b.dataset.bairro]: proximo };
    manterRolagem();
  }
  if (acao === "ponto") abrirPonto();
  if (acao === "concluir") {
    e.params.pronto = true;
    salvarParams();
    e.aba = "radar";
    e.filtro = "boas";
    desenhar();
  }
});

function manterRolagem() {
  const y = document.querySelector(".formulario")?.scrollTop ?? 0;
  desenhar();
  const f = document.querySelector(".formulario");
  if (f) f.scrollTop = y;
}

function desenharCartao(id, botao) {
  botao.closest(".acoes-cartao").querySelectorAll("[data-status]").forEach((x) => {
    x.setAttribute("aria-pressed", e.marcas.get(id)?.status === x.dataset.status);
  });
  document.querySelector('.abas [data-aba="lista"]').outerHTML = abas().match(/<button data-acao="aba" data-aba="lista"[\s\S]*?<\/button>/)[0];
  atualizarMapa();
}

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.acao === "orcamento") {
    e.params.orcamento = Number(t.value);
    document.getElementById("valor-orcamento").textContent = brl(t.value);
    atualizarResumoVivo();
  }
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  const { acao, id } = t.dataset;
  if (acao === "ordem") { e.ordem = t.value; desenhar(); document.querySelector(".lista").scrollTop = 0; }
  if (acao === "nota") { mudarMarca(id, { nota: t.value.trim() || null, status: e.marcas.get(id)?.status ?? (t.value.trim() ? "favorito" : null) }); }
  if (acao === "visita") { mudarMarca(id, { visita_em: t.value || null, status: t.value ? "visitar" : e.marcas.get(id)?.status ?? null }); document.getElementById("sobre").innerHTML = htmlFicha(id); }
  if (acao === "selecionar") {
    if (t.checked) e.selecionados.add(id); else e.selecionados.delete(id);
    const y = document.querySelector(".minha-lista").scrollTop;
    desenhar();
    document.querySelector(".minha-lista").scrollTop = y;
  }
});

addEventListener("popstate", () => { if (e.ficha) fecharFicha(); });
addEventListener("online", esvaziarFila);

// ---------- início ----------
function erro(texto) {
  document.getElementById("app").innerHTML = `<p class="vazio">${esc(texto)}</p>`;
}

async function dadosDoDia(gerado) {
  const guardado = ler("alugar_dados");
  if (guardado?.quando === gerado && guardado.dados) return guardado.dados;
  const dados = await rpc("alugar_carregar", { p_codigo: e.codigo });
  gravar("alugar_dados", { quando: gerado, dados });
  return dados;
}

async function iniciar() {
  const url = new URLSearchParams(location.search).get("k");
  e.codigo = url ?? ler("alugar_codigo");
  if (!e.codigo) { erro("Este endereço precisa do seu link pessoal. Peça o link a quem te convidou."); return; }
  let perfil;
  try {
    perfil = await rpc("alugar_entrar", { p_codigo: e.codigo });
  } catch {
    erro("Não consegui abrir agora. Veja sua internet e tente de novo.");
    return;
  }
  if (!perfil) { erro("Este link não é válido. Peça um novo a quem te convidou."); return; }
  gravar("alugar_codigo", e.codigo);
  e.nome = perfil.nome;
  e.vistoAnterior = perfil.visto_anterior;
  e.dados = await dadosDoDia(perfil.gerado_em);
  if (!e.dados) { erro("Os dados ainda não foram publicados. Tente mais tarde."); return; }
  e.porId = new Map(e.dados.imoveis.map((im) => [im.id, im]));
  e.marcas = new Map(perfil.marcas.map((m) => [m.imovel, m]));
  e.params = { ...PADRAO, ...perfil.params };
  if (!e.params.niveis) e.params.niveis = niveisPadrao();
  if (!e.params.pronto) e.aba = "ajustes";
  await esvaziarFila();
  desenhar();
}

iniciar();
