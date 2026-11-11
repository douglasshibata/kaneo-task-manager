import request from 'supertest';
import { app } from '../src/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'kaneo_fallback_development_secret_only';

describe('Suíte de Testes: Autenticação JWT e Middleware RBAC', () => {
  let validToken: string;

  beforeAll(() => {
    // Gera tokens JWT válidos para teste correspondentes aos dados semeados no banco simulado
    validToken = jwt.sign(
      { id: 'usr-default-id-999', email: 'admin@kaneo.io', name: 'Arquiteto Kaneo' },
      JWT_SECRET
    );
  });

  test('Deve rejeitar requisição sem token com status 401', async () => {
    const res = await request(app)
      .get('/api/organizations/org-kaneo-default/projects')
      .send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('Deve rejeitar token inválido com status 403', async () => {
    const res = await request(app)
      .get('/api/organizations/org-kaneo-default/projects')
      .set('Authorization', 'Bearer token_absolutamente_invalido_123')
      .send();

    expect(res.status).toBe(403);
  });

  test('Deve permitir acesso a rotas de visualizador (VIEWER) com token de membro válido', async () => {
    const res = await request(app)
      .get('/api/organizations/org-kaneo-default/projects')
      .set('Authorization', `Bearer ${validToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Deve rejeitar requisição para organizações às quais o usuário não pertence', async () => {
    const res = await request(app)
      .get('/api/organizations/organizacao-inexistente-ou-sem-acesso/projects')
      .set('Authorization', `Bearer ${validToken}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Acesso negado');
  });
});
