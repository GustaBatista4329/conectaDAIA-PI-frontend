/**
 * ============================================================
 * apiClient — Camada de abstração de dados
 * ============================================================
 * Hoje lê e muta um objeto em memória (seed = mockData.json).
 * Futuramente, troque o corpo dos métodos por fetch() contra
 * o backend real (FastAPI ou Spring). A assinatura é estável.
 *
 * Observação de integração futura:
 * - Se backend for FastAPI: serializar em snake_case e converter
 *   via adapter no boundary (sugestão: usar camelcase-keys).
 * - Se backend for Spring: manter camelCase direto.
 *
 * Todas as funções retornam Promises para simular I/O real.
 * ============================================================
 */

import seed from '@/data/mockData.json'
import type {
  Candidato,
  Candidatura,
  Denuncia,
  Empresa,
  MockDatabase,
  StatusCandidatura,
  User,
  Vaga,
} from '@/types'

// Delay artificial para simular rede (ajuste se quiser)
const LATENCY_MS = 120
const delay = <T>(data: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), LATENCY_MS))

// Deep clone para não poluir o seed original
const db: MockDatabase = structuredClone(seed) as MockDatabase

// ============================================================
// AUTH
// ============================================================
export const apiAuth = {
  async login(email: string, senha: string): Promise<User | null> {
    const cred = db.credenciais.find(
      (c) => c.email.toLowerCase() === email.toLowerCase() && c.senha === senha,
    )
    if (!cred) return delay(null)
    const user = db.usuarios.find((u) => u.id === cred.userId) ?? null
    return delay(user)
  },
  async getUserById(id: string): Promise<User | null> {
    return delay(db.usuarios.find((u) => u.id === id) ?? null)
  },
}

// ============================================================
// VAGAS
// ============================================================
export interface VagaFiltros {
  termo?: string
  setor?: string
  distrito?: string
  nivel?: string
  salarioMin?: number
  salarioMax?: number
  apenasAtivas?: boolean
}

export const apiVagas = {
  async listar(filtros: VagaFiltros = {}): Promise<Vaga[]> {
    let result = db.vagas
    if (filtros.apenasAtivas !== false) result = result.filter((v) => v.ativa)
    if (filtros.termo) {
      const t = filtros.termo.toLowerCase()
      result = result.filter(
        (v) =>
          v.titulo.toLowerCase().includes(t) ||
          v.empresaNome.toLowerCase().includes(t) ||
          v.habilidadesRequeridas.some((h) => h.toLowerCase().includes(t)),
      )
    }
    if (filtros.setor) result = result.filter((v) => v.setorAtuacao === filtros.setor)
    if (filtros.distrito) result = result.filter((v) => v.distrito === filtros.distrito)
    if (filtros.nivel) result = result.filter((v) => v.nivel === filtros.nivel)
    if (typeof filtros.salarioMin === 'number')
      result = result.filter((v) => v.salarioMax >= filtros.salarioMin!)
    if (typeof filtros.salarioMax === 'number')
      result = result.filter((v) => v.salarioMin <= filtros.salarioMax!)
    return delay([...result])
  },

  async obter(id: string): Promise<Vaga | null> {
    return delay(db.vagas.find((v) => v.id === id) ?? null)
  },

  async vagasDaEmpresa(empresaId: string): Promise<Vaga[]> {
    return delay(db.vagas.filter((v) => v.empresaId === empresaId))
  },

  async calcularMatch(candidatoId: string, vagaId: string): Promise<number> {
    const c = db.candidatos.find((x) => x.id === candidatoId)
    const v = db.vagas.find((x) => x.id === vagaId)
    if (!c || !v) return delay(0)
    const skillsNames = c.skills.map((s) => s.nome.toLowerCase())
    const match = v.habilidadesRequeridas.filter((h) =>
      skillsNames.some((s) => s.includes(h.toLowerCase()) || h.toLowerCase().includes(s)),
    ).length
    const base = Math.round((match / Math.max(v.habilidadesRequeridas.length, 1)) * 100)
    // soma bônus de 15% se perfil completo > 80%
    return delay(Math.min(100, base + (c.perfilCompleto > 80 ? 15 : 0)))
  },

  async desativar(id: string): Promise<boolean> {
    const v = db.vagas.find((x) => x.id === id)
    if (!v) return delay(false)
    v.ativa = false
    return delay(true)
  },
}

// ============================================================
// CANDIDATOS
// ============================================================
export const apiCandidatos = {
  async obter(id: string): Promise<Candidato | null> {
    return delay(db.candidatos.find((c) => c.id === id) ?? null)
  },
  async atualizar(id: string, patch: Partial<Candidato>): Promise<Candidato | null> {
    const idx = db.candidatos.findIndex((c) => c.id === id)
    if (idx < 0) return delay(null)
    db.candidatos[idx] = { ...db.candidatos[idx], ...patch }
    return delay(db.candidatos[idx])
  },
  async adicionarSkill(candidatoId: string, nome: string, categoria: string): Promise<Candidato | null> {
    const c = db.candidatos.find((x) => x.id === candidatoId)
    if (!c) return delay(null)
    if (c.skills.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) return delay(c)
    c.skills.push({
      id: `s-${Date.now()}`,
      nome,
      categoria: categoria as any,
    })
    // recalcula progresso (simplificado)
    c.perfilCompleto = Math.min(100, c.perfilCompleto + 2)
    return delay({ ...c })
  },
  async removerSkill(candidatoId: string, skillId: string): Promise<Candidato | null> {
    const c = db.candidatos.find((x) => x.id === candidatoId)
    if (!c) return delay(null)
    c.skills = c.skills.filter((s) => s.id !== skillId)
    return delay({ ...c })
  },
}

// ============================================================
// EMPRESAS
// ============================================================
export const apiEmpresas = {
  async listar(): Promise<Empresa[]> {
    return delay([...db.empresas])
  },
  async validar(id: string): Promise<Empresa | null> {
    const e = db.empresas.find((x) => x.id === id)
    if (!e) return delay(null)
    e.statusValidacao = 'validada'
    db.logsAuditoria.unshift({
      id: `log-${Date.now()}`,
      tipo: 'EMPRESA_APROVADA',
      descricao: `Empresa ${e.nome} validada manualmente`,
      alvoId: e.id,
      criadoEm: new Date().toISOString(),
    })
    db.metricas.empresasValidadas += 1
    return delay({ ...e })
  },
  async suspender(id: string): Promise<Empresa | null> {
    const e = db.empresas.find((x) => x.id === id)
    if (!e) return delay(null)
    e.statusValidacao = 'suspensa'
    return delay({ ...e })
  },
}

// ============================================================
// CANDIDATURAS
// ============================================================
export const apiCandidaturas = {
  async listarPorVaga(vagaId: string): Promise<Candidatura[]> {
    return delay(db.candidaturas.filter((c) => c.vagaId === vagaId))
  },
  async listarPorCandidato(candidatoId: string): Promise<Candidatura[]> {
    return delay(db.candidaturas.filter((c) => c.candidatoId === candidatoId))
  },
  async candidatar(candidatoId: string, vagaId: string): Promise<Candidatura | null> {
    const existe = db.candidaturas.find(
      (c) => c.candidatoId === candidatoId && c.vagaId === vagaId,
    )
    if (existe) return delay(existe)
    const nova: Candidatura = {
      id: `cand-${Date.now()}`,
      candidatoId,
      vagaId,
      status: 'triagem',
      dataAplicacao: new Date().toISOString(),
    }
    db.candidaturas.push(nova)
    const cand = db.candidatos.find((c) => c.id === candidatoId)
    if (cand) cand.candidaturas.push(nova.id)
    const vaga = db.vagas.find((v) => v.id === vagaId)
    if (vaga) vaga.totalCandidatos += 1
    return delay(nova)
  },
  async moverStatus(id: string, status: StatusCandidatura): Promise<Candidatura | null> {
    const c = db.candidaturas.find((x) => x.id === id)
    if (!c) return delay(null)
    c.status = status
    return delay({ ...c })
  },
  async adicionarParecer(id: string, tipo: 'rh' | 'tecnico', texto: string): Promise<Candidatura | null> {
    const c = db.candidaturas.find((x) => x.id === id)
    if (!c) return delay(null)
    if (tipo === 'rh') c.parecerRh = texto
    else c.parecerTecnico = texto
    return delay({ ...c })
  },
}

// ============================================================
// ADMIN / MÉTRICAS / DENÚNCIAS
// ============================================================
export const apiAdmin = {
  async metricas() {
    return delay({ ...db.metricas })
  },
  async listarDenuncias(): Promise<Denuncia[]> {
    return delay([...db.denuncias])
  },
  async resolverDenuncia(id: string, acao: 'investigar' | 'ignorar' | 'suspender'): Promise<Denuncia | null> {
    const d = db.denuncias.find((x) => x.id === id)
    if (!d) return delay(null)
    d.status = acao === 'investigar' ? 'em_investigacao' : acao === 'ignorar' ? 'ignorada' : 'resolvida'
    db.metricas.denunciasPendentes = db.denuncias.filter((x) => x.status === 'pendente').length
    return delay({ ...d })
  },
  async logsAuditoria() {
    return delay([...db.logsAuditoria].slice(0, 20))
  },
}

// Para debug no console
if (typeof window !== 'undefined') {
  ;(window as any).__DAIA_DB__ = db
}
