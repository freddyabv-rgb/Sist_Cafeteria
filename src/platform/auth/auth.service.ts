import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { User, UserRole } from './user.entity';

@Injectable()
export class AuthService {
  private users = new Map<string, User>();
  private readonly SALT = 'benevento-coffee-os-salt-2026';

  /**
   * Genera el hash de un PIN de 4 a 6 dígitos con sal.
   */
  public hashPin(pin: string): string {
    return crypto
      .createHash('sha256')
      .update(`${pin}:${this.SALT}`)
      .digest('hex');
  }

  /**
   * Registra un usuario en memoria/repositorio.
   */
  public registerUser(user: User): void {
    this.users.set(user.id, user);
  }

  /**
   * Crea un usuario con PIN en texto plano (lo hashea internamente).
   */
  public createUserWithPin(
    id: string,
    storeId: string,
    name: string,
    role: UserRole,
    rawPin: string,
  ): User {
    const user = new User({
      id,
      storeId,
      name,
      role,
      pinHash: this.hashPin(rawPin),
      isActive: true,
    });
    this.registerUser(user);
    return user;
  }

  /**
   * Valida si el PIN ingresado coincide con el hash del usuario.
   */
  public validateUserPin(userId: string, rawPin: string): boolean {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      return false;
    }
    return user.pinHash === this.hashPin(rawPin);
  }

  /**
   * Autoriza una acción sensible verificando que el PIN pertenezca a un SUPERVISOR o ADMIN de la tienda.
   * Si es válido, retorna el usuario supervisor que autorizó la operación.
   */
  public authorizeSupervisorAction(storeId: string, rawSupervisorPin: string): User {
    const targetHash = this.hashPin(rawSupervisorPin);

    for (const user of this.users.values()) {
      if (
        user.storeId === storeId &&
        user.isActive &&
        user.isSupervisorOrAdmin() &&
        user.pinHash === targetHash
      ) {
        return user;
      }
    }

    throw new UnauthorizedException(
      'PIN de supervisor inválido o no cuenta con permisos para autorizar esta operación.',
    );
  }

  public findUserById(id: string): User | null {
    return this.users.get(id) || null;
  }

  public clear(): void {
    this.users.clear();
  }
}
