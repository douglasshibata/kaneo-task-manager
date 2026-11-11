import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

// Segurança rigorosa: Exige JWT_SECRET em produção; lança exceção em tempo de execução caso ausente para evitar vulnerabilidades.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('❌ ERRO CRÍTICO: Variável de ambiente JWT_SECRET não foi configurada em ambiente de produção!');
}

const SECRET_KEY = JWT_SECRET || 'kaneo_fallback_development_secret_only';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  organizationId?: string;
  userRole?: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

/**
 * Middleware para autenticação via JSON Web Token (JWT)
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as { id: string; email: string; name: string };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}

/**
 * Middleware de Multi-Tenancy e Controle de Acesso Baseado em Roles (RBAC)
 * Garante que o usuário pertence ao Tenant (Organização) solicitado e possui o nível de permissão mínimo requerido.
 */
export function requireOrgRole(requiredRole: 'ADMIN' | 'MEMBER' | 'VIEWER') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const orgId = req.params.orgId || req.headers['x-organization-id'] as string || req.query.orgId as string;

    if (!orgId) {
      return res.status(400).json({ error: 'ID da organização (Tenant) não especificado' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Busca a associação do usuário com a organização no banco simulado
    const membership = db.members.find(
      (m) => m.organizationId === orgId && m.userId === req.user?.id
    );

    if (!membership) {
      return res.status(403).json({ error: 'Acesso negado. Você não pertence a esta organização.' });
    }

    // Hierarquia de Roles: ADMIN (3) > MEMBER (2) > VIEWER (1)
    const roleWeights = {
      ADMIN: 3,
      MEMBER: 2,
      VIEWER: 1,
    };

    const userWeight = roleWeights[membership.role];
    const requiredWeight = roleWeights[requiredRole];

    if (userWeight < requiredWeight) {
      return res.status(403).json({
        error: `Acesso negado. Esta operação exige privilégios de ${requiredRole} ou superior.`,
      });
    }

    // Anexa as informações de contexto do tenant à requisição para reuso nos controladores
    req.organizationId = orgId;
    req.userRole = membership.role;

    next();
  };
}
